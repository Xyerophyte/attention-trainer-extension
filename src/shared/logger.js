/**
 * Advanced Logger System
 * Provides configurable logging with levels, circular buffer, and performance metrics
 * Designed for Chrome extension environments with memory constraints
 */

class Logger {
  constructor(options = {}) {
    this.options = {
      // Log level configuration
      level: options.level || 'info', // debug, info, warn, error
      enableConsole: options.enableConsole !== false,
      enableBuffer: options.enableBuffer !== false,
      enablePerformance: options.enablePerformance !== false,
      
      // Buffer configuration
      bufferSize: options.bufferSize || 100,
      persistBuffer: options.persistBuffer || false,
      
      // Format options
      enableTimestamp: options.enableTimestamp !== false,
      enableContext: options.enableContext !== false,
      colorEnabled: options.colorEnabled !== false,
      
      // Component identification
      component: options.component || 'Unknown',
      prefix: options.prefix || '',
      
      // Performance tracking
      performanceThresholds: {
        slow: options.slowThreshold || 100, // ms
        warning: options.warningThreshold || 500, // ms
        critical: options.criticalThreshold || 1000, // ms
        ...options.performanceThresholds
      },
      
      // Storage options
      storageKey: options.storageKey || 'logger_buffer',
      maxStorageSize: options.maxStorageSize || 1024 * 1024, // 1MB
      
      ...options
    }

    // Log levels
    this.levels = {
      debug: 0,
      info: 1,
      warn: 2,
      error: 3
    }

    // Console colors
    this.colors = {
      debug: '#8B949E',  // Gray
      info: '#0969DA',   // Blue
      warn: '#FB8500',   // Orange
      error: '#DA3633',  // Red
      performance: '#8250DF', // Purple
      success: '#1A7F37'  // Green
    }

    // Circular buffer for log entries
    this.logBuffer = []
    this.bufferIndex = 0
    
    // Performance metrics
    this.performanceMetrics = new Map()
    this.activeTimers = new Map()
    
    // Statistics
    this.stats = {
      totalLogs: 0,
      logsByLevel: { debug: 0, info: 0, warn: 0, error: 0 },
      bufferOverflows: 0,
      startTime: Date.now()
    }
    
    // Listeners for log events
    this.listeners = new Set()
    
    this.initialized = false
    this.init()
  }

  async init() {
    if (this.initialized) return

    try {
      // Load persisted buffer if enabled
      if (this.options.persistBuffer) {
        await this.loadPersistedBuffer()
      }
      
      // Set up performance monitoring
      if (this.options.enablePerformance) {
        this.initPerformanceMonitoring()
      }
      
      this.initialized = true
      this.info('Logger initialized', {
        component: this.options.component,
        level: this.options.level,
        bufferSize: this.options.bufferSize
      })
    } catch (error) {
      console.error('Failed to initialize logger:', error)
      // Continue without advanced features
      this.initialized = true
    }
  }

  /**
   * Initialize performance monitoring
   */
  initPerformanceMonitoring() {
    // Monitor page load performance
    if (typeof window !== 'undefined' && window.addEventListener) {
      window.addEventListener('load', () => {
        if (performance && performance.timing) {
          const timing = performance.timing
          const loadTime = timing.loadEventEnd - timing.navigationStart
          this.performance('page_load', loadTime, { timing })
        }
      })
    }
  }

  /**
   * Main logging method
   */
  log(level, message, data = null, context = null) {
    if (!this.shouldLog(level)) {
      return
    }

    const timestamp = Date.now()
    const logEntry = this.createLogEntry(level, message, data, context, timestamp)
    
    // Add to buffer
    if (this.options.enableBuffer) {
      this.addToBuffer(logEntry)
    }
    
    // Console output
    if (this.options.enableConsole) {
      this.outputToConsole(logEntry)
    }
    
    // Notify listeners
    this.notifyListeners(logEntry)
    
    // Update statistics
    this.updateStats(level)
    
    // Persist if enabled
    if (this.options.persistBuffer) {
      this.persistBufferDebounced()
    }
  }

  /**
   * Debug level logging
   */
  debug(message, data = null, context = null) {
    this.log('debug', message, data, context)
  }

  /**
   * Info level logging
   */
  info(message, data = null, context = null) {
    this.log('info', message, data, context)
  }

  /**
   * Warning level logging
   */
  warn(message, data = null, context = null) {
    this.log('warn', message, data, context)
  }

  /**
   * Error level logging
   */
  error(message, data = null, context = null) {
    this.log('error', message, data, context)
  }

  /**
   * Success logging (special info)
   */
  success(message, data = null, context = null) {
    this.log('info', message, data, { ...context, type: 'success' })
  }

  /**
   * Performance logging
   */
  performance(operation, duration, data = null) {
    const thresholds = this.options.performanceThresholds
    let level = 'debug'
    let severity = 'normal'
    
    if (duration > thresholds.critical) {
      level = 'error'
      severity = 'critical'
    } else if (duration > thresholds.warning) {
      level = 'warn'
      severity = 'warning'
    } else if (duration > thresholds.slow) {
      level = 'info'
      severity = 'slow'
    }

    // Update performance metrics
    this.updatePerformanceMetrics(operation, duration, severity)
    
    this.log(level, `Performance: ${operation}`, {
      duration: Math.round(duration * 100) / 100,
      severity,
      ...data
    }, { type: 'performance' })
  }

  /**
   * Start performance timer
   */
  time(label) {
    this.activeTimers.set(label, {
      startTime: performance.now(),
      startTimestamp: Date.now()
    })
    this.debug(`Timer started: ${label}`)
  }

  /**
   * End performance timer
   */
  timeEnd(label, data = null) {
    const timer = this.activeTimers.get(label)
    if (!timer) {
      this.warn(`Timer not found: ${label}`)
      return
    }

    const duration = performance.now() - timer.startTime
    this.activeTimers.delete(label)
    
    this.performance(label, duration, data)
    return duration
  }

  /**
   * Log function execution time
   */
  timeFunction(label, fn) {
    return async (...args) => {
      this.time(label)
      try {
        const result = await fn(...args)
        this.timeEnd(label, { success: true })
        return result
      } catch (error) {
        this.timeEnd(label, { success: false, error: error.message })
        throw error
      }
    }
  }

  /**
   * Create structured log entry
   */
  createLogEntry(level, message, data, context, timestamp) {
    const entry = {
      id: this.generateLogId(),
      level,
      message,
      timestamp,
      component: this.options.component
    }

    if (data !== null) {
      entry.data = this.sanitizeData(data)
    }

    if (context || this.options.enableContext) {
      entry.context = {
        ...context,
        url: typeof window !== 'undefined' ? window.location?.href : null,
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : null
      }
    }

    return entry
  }

  /**
   * Sanitize data for logging (prevent circular references)
   */
  sanitizeData(data) {
    try {
      return JSON.parse(JSON.stringify(data))
    } catch (error) {
      // Handle circular references or other issues
      return { 
        error: 'Failed to serialize data',
        type: typeof data,
        keys: typeof data === 'object' && data ? Object.keys(data) : null
      }
    }
  }

  /**
   * Check if should log at given level
   */
  shouldLog(level) {
    return this.levels[level] >= this.levels[this.options.level]
  }

  /**
   * Add entry to circular buffer
   */
  addToBuffer(entry) {
    if (this.logBuffer.length < this.options.bufferSize) {
      this.logBuffer.push(entry)
    } else {
      // Circular buffer behavior
      this.logBuffer[this.bufferIndex] = entry
      this.bufferIndex = (this.bufferIndex + 1) % this.options.bufferSize
      this.stats.bufferOverflows++
    }
  }

  /**
   * Output to console with formatting
   */
  outputToConsole(entry) {
    const { level, message, data, timestamp, context } = entry
    
    // Format timestamp
    const timeStr = this.options.enableTimestamp 
      ? new Date(timestamp).toISOString().substr(11, 12)
      : ''
    
    // Format prefix
    const prefix = this.options.prefix 
      ? `[${this.options.prefix}] `
      : ''
    
    // Format component
    const component = this.options.component !== 'Unknown'
      ? `[${this.options.component}] `
      : ''
    
    // Choose console method
    const consoleMethod = level === 'debug' ? 'debug' :
                         level === 'info' ? 'info' :
                         level === 'warn' ? 'warn' : 'error'
    
    // Format message
    const formattedMessage = `${timeStr} ${prefix}${component}${message}`
    
    // Color styling for browser console
    if (this.options.colorEnabled && typeof window !== 'undefined') {
      const color = this.getLogColor(entry)
      if (data) {
        console[consoleMethod](`%c${formattedMessage}`, `color: ${color}`, data)
      } else {
        console[consoleMethod](`%c${formattedMessage}`, `color: ${color}`)
      }
    } else {
      if (data) {
        console[consoleMethod](formattedMessage, data)
      } else {
        console[consoleMethod](formattedMessage)
      }
    }
    
    // Log context separately if available
    if (context && this.options.enableContext) {
      console.groupCollapsed(`Context for: ${message}`)
      console.log(context)
      console.groupEnd()
    }
  }

  /**
   * Get color for log entry
   */
  getLogColor(entry) {
    if (entry.context?.type === 'success') {
      return this.colors.success
    } else if (entry.context?.type === 'performance') {
      return this.colors.performance
    }
    return this.colors[entry.level] || this.colors.info
  }

  /**
   * Update performance metrics
   */
  updatePerformanceMetrics(operation, duration, severity) {
    const existing = this.performanceMetrics.get(operation) || {
      count: 0,
      totalDuration: 0,
      avgDuration: 0,
      minDuration: Infinity,
      maxDuration: 0,
      severityCounts: { normal: 0, slow: 0, warning: 0, critical: 0 }
    }

    existing.count++
    existing.totalDuration += duration
    existing.avgDuration = existing.totalDuration / existing.count
    existing.minDuration = Math.min(existing.minDuration, duration)
    existing.maxDuration = Math.max(existing.maxDuration, duration)
    existing.severityCounts[severity]++

    this.performanceMetrics.set(operation, existing)
  }

  /**
   * Update statistics
   */
  updateStats(level) {
    this.stats.totalLogs++
    this.stats.logsByLevel[level]++
  }

  /**
   * Notify listeners
   */
  notifyListeners(entry) {
    for (const listener of this.listeners) {
      try {
        listener(entry)
      } catch (error) {
        console.error('Error in log listener:', error)
      }
    }
  }

  /**
   * Add log listener
   */
  addListener(listener) {
    if (typeof listener !== 'function') {
      throw new Error('Listener must be a function')
    }
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /**
   * Load persisted buffer from storage
   */
  async loadPersistedBuffer() {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage) {
        const result = await new Promise(resolve => {
          chrome.storage.local.get(this.options.storageKey, resolve)
        })
        
        const stored = result[this.options.storageKey]
        if (stored && Array.isArray(stored.buffer)) {
          this.logBuffer = stored.buffer.slice(-this.options.bufferSize)
          this.bufferIndex = this.logBuffer.length % this.options.bufferSize
        }
      }
    } catch (error) {
      console.warn('Failed to load persisted log buffer:', error)
    }
  }

  /**
   * Persist buffer to storage (debounced)
   */
  persistBufferDebounced() {
    if (this.persistTimeout) {
      clearTimeout(this.persistTimeout)
    }
    
    this.persistTimeout = setTimeout(() => {
      this.persistBuffer()
    }, 5000) // 5 second debounce
  }

  /**
   * Persist buffer to storage
   */
  async persistBuffer() {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage) {
        const data = {
          buffer: this.logBuffer,
          timestamp: Date.now(),
          stats: this.stats
        }
        
        // Check size limit
        const serialized = JSON.stringify(data)
        if (serialized.length > this.options.maxStorageSize) {
          // Trim buffer to fit
          const trimmedBuffer = this.logBuffer.slice(-Math.floor(this.options.bufferSize / 2))
          data.buffer = trimmedBuffer
        }
        
        await new Promise((resolve, reject) => {
          chrome.storage.local.set({
            [this.options.storageKey]: data
          }, () => {
            if (chrome.runtime.lastError) {
              reject(chrome.runtime.lastError)
            } else {
              resolve()
            }
          })
        })
      }
    } catch (error) {
      console.warn('Failed to persist log buffer:', error)
    }
  }

  /**
   * Get log buffer
   */
  getBuffer() {
    return [...this.logBuffer]
  }

  /**
   * Get logs by level
   */
  getLogsByLevel(level) {
    return this.logBuffer.filter(entry => entry.level === level)
  }

  /**
   * Get recent logs
   */
  getRecentLogs(count = 10) {
    return this.logBuffer.slice(-count)
  }

  /**
   * Search logs
   */
  searchLogs(query, options = {}) {
    const { level, startTime, endTime, component } = options
    
    return this.logBuffer.filter(entry => {
      // Text search
      if (query) {
        const searchText = `${entry.message} ${JSON.stringify(entry.data || {})}`.toLowerCase()
        if (!searchText.includes(query.toLowerCase())) {
          return false
        }
      }
      
      // Level filter
      if (level && entry.level !== level) {
        return false
      }
      
      // Time range filter
      if (startTime && entry.timestamp < startTime) {
        return false
      }
      if (endTime && entry.timestamp > endTime) {
        return false
      }
      
      // Component filter
      if (component && entry.component !== component) {
        return false
      }
      
      return true
    })
  }

  /**
   * Get performance metrics
   */
  getPerformanceMetrics() {
    return Object.fromEntries(this.performanceMetrics)
  }

  /**
   * Get statistics
   */
  getStats() {
    return {
      ...this.stats,
      uptime: Date.now() - this.stats.startTime,
      bufferUtilization: (this.logBuffer.length / this.options.bufferSize * 100).toFixed(1) + '%',
      performanceMetricsCount: this.performanceMetrics.size
    }
  }

  /**
   * Clear logs
   */
  clear() {
    this.logBuffer = []
    this.bufferIndex = 0
    this.performanceMetrics.clear()
    this.activeTimers.clear()
    
    // Reset stats but keep start time
    this.stats = {
      ...this.stats,
      totalLogs: 0,
      logsByLevel: { debug: 0, info: 0, warn: 0, error: 0 },
      bufferOverflows: 0
    }
    
    this.info('Logger cleared')
  }

  /**
   * Export logs
   */
  exportLogs(format = 'json') {
    const exportData = {
      metadata: {
        component: this.options.component,
        exportTime: new Date().toISOString(),
        stats: this.getStats(),
        performanceMetrics: this.getPerformanceMetrics()
      },
      logs: this.logBuffer
    }
    
    if (format === 'json') {
      return JSON.stringify(exportData, null, 2)
    } else if (format === 'csv') {
      return this.exportToCSV(this.logBuffer)
    }
    
    return exportData
  }

  /**
   * Export logs to CSV format
   */
  exportToCSV(logs) {
    const headers = ['Timestamp', 'Level', 'Component', 'Message', 'Data']
    const rows = logs.map(entry => [
      new Date(entry.timestamp).toISOString(),
      entry.level,
      entry.component,
      entry.message,
      entry.data ? JSON.stringify(entry.data) : ''
    ])
    
    return [headers, ...rows]
      .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n')
  }

  /**
   * Generate unique log ID
   */
  generateLogId() {
    return `log_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`
  }

  /**
   * Create child logger with context
   */
  child(context) {
    const childLogger = new Logger({
      ...this.options,
      component: context.component || this.options.component,
      prefix: context.prefix || this.options.prefix
    })
    
    // Share buffer and metrics with parent
    childLogger.logBuffer = this.logBuffer
    childLogger.bufferIndex = this.bufferIndex
    childLogger.performanceMetrics = this.performanceMetrics
    childLogger.stats = this.stats
    
    return childLogger
  }

  /**
   * Set log level
   */
  setLevel(level) {
    if (!this.levels.hasOwnProperty(level)) {
      throw new Error(`Invalid log level: ${level}`)
    }
    this.options.level = level
    this.info(`Log level changed to: ${level}`)
  }

  /**
   * Enable/disable console output
   */
  setConsoleEnabled(enabled) {
    this.options.enableConsole = enabled
    this.info(`Console output ${enabled ? 'enabled' : 'disabled'}`)
  }

  /**
   * Cleanup resources
   */
  cleanup() {
    if (this.persistTimeout) {
      clearTimeout(this.persistTimeout)
    }
    
    // Final persist
    if (this.options.persistBuffer) {
      this.persistBuffer()
    }
    
    this.listeners.clear()
    this.activeTimers.clear()
    
    this.info('Logger cleanup completed')
  }
}

// Create default logger instance
const defaultLogger = new Logger({
  component: 'AttentionTrainer',
  level: 'info'
})

// Export both class and default instance
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { Logger, logger: defaultLogger }
} else {
  window.Logger = Logger
  window.logger = defaultLogger
}
