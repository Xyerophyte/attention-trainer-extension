/**
 * Enhanced Error Boundary System
 * Provides comprehensive error handling, recovery mechanisms, and telemetry
 * Built on top of the existing ErrorHandler for maximum robustness
 */

class ErrorBoundary {
  constructor(options = {}) {
    this.options = {
      // Recovery options
      maxRetries: options.maxRetries || 3,
      retryDelay: options.retryDelay || 1000,
      exponentialBackoff: options.exponentialBackoff !== false,
      
      // Circuit breaker options
      circuitBreakerEnabled: options.circuitBreakerEnabled !== false,
      maxFailures: options.maxFailures || 5,
      resetTimeout: options.resetTimeout || 30000,
      
      // Telemetry options
      telemetryEnabled: options.telemetryEnabled !== false,
      telemetryBufferSize: options.telemetryBufferSize || 1000,
      
      // Recovery strategies
      fallbackEnabled: options.fallbackEnabled !== false,
      gracefulDegradation: options.gracefulDegradation !== false,
      
      // Component identification
      componentName: options.componentName || 'Unknown',
      version: options.version || '1.0.0',
      
      ...options
    }

    // Initialize core components
    this.errorHandler = window.ErrorHandler ? new window.ErrorHandler() : null
    this.connectionManager = null // Set by components that need it
    
    // Error tracking
    this.errorCount = 0
    this.lastError = null
    this.errorFrequency = new Map() // Track error frequency
    this.recoveryAttempts = new Map() // Track recovery attempts
    
    // Circuit breaker states
    this.circuitBreakers = new Map()
    
    // Telemetry data
    this.telemetryBuffer = []
    this.performanceMetrics = new Map()
    
    // Recovery strategies
    this.recoveryStrategies = new Map()
    this.fallbackHandlers = new Map()
    
    // Health monitoring
    this.healthStatus = {
      overall: 'healthy',
      components: new Map(),
      lastHealthCheck: Date.now(),
      uptime: Date.now()
    }
    
    this.initialized = false
    this.init()
  }

  async init() {
    if (this.initialized) return

    try {
      // Set up error monitoring
      this.setupErrorMonitoring()
      
      // Initialize telemetry
      this.initializeTelemetry()
      
      // Set up periodic health checks
      this.startHealthMonitoring()
      
      // Register default recovery strategies
      this.registerDefaultStrategies()
      
      this.initialized = true
      this.logTelemetry('init', { 
        componentName: this.options.componentName,
        options: this.options
      })
      
      console.log(`🛡️ Error boundary initialized for ${this.options.componentName}`)
    } catch (error) {
      console.error('Failed to initialize error boundary:', error)
      // Continue without error boundary as fallback
    }
  }

  /**
   * Set up comprehensive error monitoring
   */
  setupErrorMonitoring() {
    // Hook into existing error handler if available
    if (this.errorHandler) {
      this.errorHandler.subscribeToErrors((errorInfo) => {
        this.handleError(new Error(errorInfo.message), {
          category: errorInfo.category,
          timestamp: errorInfo.timestamp,
          ...errorInfo.metadata
        })
      })
    }

    // Additional monitoring for unhandled errors
    if (typeof window !== 'undefined') {
      window.addEventListener('error', (event) => {
        this.handleError(event.error || new Error(event.message), {
          source: 'window.error',
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno
        })
      })

      window.addEventListener('unhandledrejection', (event) => {
        this.handleError(event.reason, {
          source: 'unhandledrejection',
          isCritical: true
        })
      })
    }
  }

  /**
   * Initialize telemetry system
   */
  initializeTelemetry() {
    if (!this.options.telemetryEnabled) return

    // Performance observer for monitoring
    if (typeof PerformanceObserver !== 'undefined') {
      try {
        const observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            this.recordPerformanceMetric(entry.name, {
              duration: entry.duration,
              startTime: entry.startTime,
              entryType: entry.entryType
            })
          }
        })
        
        observer.observe({ entryTypes: ['measure', 'navigation'] })
      } catch (error) {
        console.warn('Performance observer not available:', error.message)
      }
    }

    // Memory monitoring
    this.monitorMemoryUsage()
  }

  /**
   * Start health monitoring
   */
  startHealthMonitoring() {
    setInterval(() => {
      this.performHealthCheck()
    }, 30000) // Every 30 seconds

    // Initial health check
    this.performHealthCheck()
  }

  /**
   * Perform comprehensive health check
   */
  async performHealthCheck() {
    const healthData = {
      timestamp: Date.now(),
      uptime: Date.now() - this.healthStatus.uptime,
      errorCount: this.errorCount,
      circuitBreakerStates: {},
      memoryUsage: this.getMemoryUsage(),
      telemetryBufferSize: this.telemetryBuffer.length
    }

    // Check circuit breakers
    for (const [name, breaker] of this.circuitBreakers) {
      healthData.circuitBreakerStates[name] = {
        isOpen: breaker.isOpen,
        failures: breaker.failures,
        lastFailure: breaker.lastFailure
      }
    }

    // Update overall health status
    const criticalErrors = this.errorCount > 10
    const memoryIssue = healthData.memoryUsage?.used > 50 * 1024 * 1024 // 50MB
    const circuitBreakersOpen = Object.values(healthData.circuitBreakerStates)
      .some(state => state.isOpen)

    if (criticalErrors || memoryIssue || circuitBreakersOpen) {
      this.healthStatus.overall = 'degraded'
    } else {
      this.healthStatus.overall = 'healthy'
    }

    this.healthStatus.lastHealthCheck = healthData.timestamp
    
    this.logTelemetry('health_check', healthData)
  }

  /**
   * Enhanced error handling with recovery mechanisms
   */
  async handleError(error, metadata = {}) {
    if (!error) return

    const errorId = this.generateErrorId()
    const timestamp = Date.now()
    
    // Track error frequency
    const errorKey = `${error.name}:${error.message}`
    const frequency = this.errorFrequency.get(errorKey) || 0
    this.errorFrequency.set(errorKey, frequency + 1)
    
    this.errorCount++
    this.lastError = {
      id: errorId,
      error,
      metadata,
      timestamp,
      frequency: frequency + 1
    }

    const errorInfo = {
      id: errorId,
      message: error.message,
      stack: error.stack,
      name: error.name,
      frequency: frequency + 1,
      component: this.options.componentName,
      timestamp,
      metadata: {
        ...metadata,
        url: typeof window !== 'undefined' ? window.location?.href : null,
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : null
      }
    }

    // Log to telemetry
    this.logTelemetry('error', errorInfo)

    // Attempt recovery based on error type
    await this.attemptRecovery(error, errorInfo)

    // Update health status
    this.updateHealthStatus('error', errorInfo)

    // Delegate to existing error handler if available
    if (this.errorHandler) {
      this.errorHandler.handleError(error, metadata)
    }

    return errorInfo
  }

  /**
   * Attempt error recovery based on strategies
   */
  async attemptRecovery(error, errorInfo) {
    const errorType = this.categorizeError(error)
    const strategy = this.recoveryStrategies.get(errorType)
    
    if (!strategy) {
      console.warn(`No recovery strategy for error type: ${errorType}`)
      return false
    }

    const attemptKey = `${errorType}:${errorInfo.id}`
    const attempts = this.recoveryAttempts.get(attemptKey) || 0
    
    if (attempts >= this.options.maxRetries) {
      console.error(`Max recovery attempts reached for ${errorType}`)
      await this.triggerFallback(error, errorInfo)
      return false
    }

    try {
      console.log(`🔄 Attempting recovery for ${errorType} (attempt ${attempts + 1}/${this.options.maxRetries})`)
      
      const success = await strategy(error, errorInfo, attempts)
      
      if (success) {
        this.logTelemetry('recovery_success', {
          errorType,
          attempts: attempts + 1,
          errorId: errorInfo.id
        })
        this.recoveryAttempts.delete(attemptKey)
        return true
      }
      
      this.recoveryAttempts.set(attemptKey, attempts + 1)
      
      // Schedule retry with exponential backoff
      if (this.options.exponentialBackoff) {
        const delay = this.options.retryDelay * Math.pow(2, attempts)
        setTimeout(() => this.attemptRecovery(error, errorInfo), delay)
      }
      
      return false
    } catch (recoveryError) {
      console.error('Recovery attempt failed:', recoveryError)
      this.recoveryAttempts.set(attemptKey, attempts + 1)
      return false
    }
  }

  /**
   * Trigger fallback mechanisms
   */
  async triggerFallback(error, errorInfo) {
    if (!this.options.fallbackEnabled) return

    const errorType = this.categorizeError(error)
    const fallback = this.fallbackHandlers.get(errorType)
    
    if (fallback) {
      try {
        console.log(`🛟 Triggering fallback for ${errorType}`)
        await fallback(error, errorInfo)
        
        this.logTelemetry('fallback_triggered', {
          errorType,
          errorId: errorInfo.id
        })
      } catch (fallbackError) {
        console.error('Fallback failed:', fallbackError)
      }
    } else if (this.options.gracefulDegradation) {
      this.enableGracefulDegradation(errorType, errorInfo)
    }
  }

  /**
   * Enable graceful degradation
   */
  enableGracefulDegradation(errorType, errorInfo) {
    console.log(`🔄 Enabling graceful degradation for ${errorType}`)
    
    // Disable non-critical features
    this.healthStatus.components.set(errorType, 'degraded')
    
    // Show user notification if in browser context
    if (typeof document !== 'undefined' && this.errorHandler?.showErrorNotification) {
      this.errorHandler.showErrorNotification(
        'Some features are temporarily disabled due to technical issues. Core functionality remains available.',
        10000
      )
    }
    
    this.logTelemetry('graceful_degradation', {
      errorType,
      errorId: errorInfo.id,
      timestamp: Date.now()
    })
  }

  /**
   * Enhanced wrap function with circuit breaker
   */
  wrapWithCircuitBreaker(name, fn, options = {}) {
    if (!this.options.circuitBreakerEnabled) {
      return this.wrap(name, fn, options)
    }

    let circuitBreaker = this.circuitBreakers.get(name)
    
    if (!circuitBreaker) {
      circuitBreaker = {
        failures: 0,
        lastFailure: 0,
        isOpen: false,
        name
      }
      this.circuitBreakers.set(name, circuitBreaker)
    }

    return async (...args) => {
      // Check if circuit is open
      if (circuitBreaker.isOpen) {
        const timeSinceFailure = Date.now() - circuitBreaker.lastFailure
        
        if (timeSinceFailure < this.options.resetTimeout) {
          const fallback = this.fallbackHandlers.get(name)
          if (fallback) {
            return await fallback(new Error('Circuit breaker open'), {}, ...args)
          }
          throw new Error(`Circuit breaker is open for ${name}`)
        } else {
          // Try to close circuit
          circuitBreaker.isOpen = false
          circuitBreaker.failures = 0
          console.log(`🔄 Circuit breaker closed for ${name}`)
        }
      }

      try {
        const result = await this.wrap(name, fn, options)(...args)
        
        // Reset failures on success
        if (circuitBreaker.failures > 0) {
          circuitBreaker.failures = 0
          console.log(`✅ Circuit breaker reset for ${name}`)
        }
        
        return result
      } catch (error) {
        circuitBreaker.failures++
        circuitBreaker.lastFailure = Date.now()
        
        if (circuitBreaker.failures >= this.options.maxFailures) {
          circuitBreaker.isOpen = true
          console.warn(`🚨 Circuit breaker opened for ${name} after ${circuitBreaker.failures} failures`)
          
          this.logTelemetry('circuit_breaker_opened', {
            name,
            failures: circuitBreaker.failures,
            lastFailure: circuitBreaker.lastFailure
          })
        }
        
        throw error
      }
    }
  }

  /**
   * Wrap function with error boundary protection
   */
  wrap(name, fn, options = {}) {
    return async (...args) => {
      const startTime = performance.now()
      
      try {
        const result = await fn(...args)
        
        // Record performance metric
        const duration = performance.now() - startTime
        this.recordPerformanceMetric(name, { duration, success: true })
        
        return result
      } catch (error) {
        const duration = performance.now() - startTime
        this.recordPerformanceMetric(name, { duration, success: false })
        
        // Enhanced error with context
        const enhancedError = new Error(`${name}: ${error.message}`)
        enhancedError.originalError = error
        enhancedError.functionName = name
        enhancedError.arguments = args
        
        await this.handleError(enhancedError, {
          functionName: name,
          duration,
          arguments: args.map(arg => typeof arg),
          ...options.metadata
        })
        
        throw enhancedError
      }
    }
  }

  /**
   * Register recovery strategy
   */
  registerRecoveryStrategy(errorType, strategy) {
    if (typeof strategy !== 'function') {
      throw new Error('Recovery strategy must be a function')
    }
    
    this.recoveryStrategies.set(errorType, strategy)
    console.log(`🔧 Recovery strategy registered for ${errorType}`)
  }

  /**
   * Register fallback handler
   */
  registerFallbackHandler(errorType, handler) {
    if (typeof handler !== 'function') {
      throw new Error('Fallback handler must be a function')
    }
    
    this.fallbackHandlers.set(errorType, handler)
    console.log(`🛟 Fallback handler registered for ${errorType}`)
  }

  /**
   * Register default recovery strategies
   */
  registerDefaultStrategies() {
    // Context invalidation recovery
    this.registerRecoveryStrategy('context_invalidation', async (error, errorInfo, attempts) => {
      if (this.connectionManager) {
        await this.connectionManager.validateContext()
        if (this.connectionManager.contextValid) {
          await this.connectionManager.establishConnection()
          return this.connectionManager.isConnected
        }
      }
      return false
    })

    // Connection failure recovery
    this.registerRecoveryStrategy('connection_failure', async (error, errorInfo, attempts) => {
      if (this.connectionManager) {
        return await this.connectionManager.establishConnection()
      }
      return false
    })

    // Storage operation recovery
    this.registerRecoveryStrategy('storage_operation', async (error, errorInfo, attempts) => {
      try {
        // Try fallback storage if available
        if (window.FallbackStorage) {
          const fallbackStorage = new window.FallbackStorage()
          await fallbackStorage.init()
          return true
        }
      } catch (fallbackError) {
        console.warn('Fallback storage not available:', fallbackError.message)
      }
      return false
    })

    // Default fallback handlers
    this.registerFallbackHandler('context_invalidation', async () => {
      console.warn('🛟 Context invalidation fallback: Running in offline mode')
      // Could implement offline functionality here
    })

    this.registerFallbackHandler('connection_failure', async () => {
      console.warn('🛟 Connection failure fallback: Queuing operations')
      // Operations would be queued by connection manager
    })

    this.registerFallbackHandler('storage_operation', async () => {
      console.warn('🛟 Storage failure fallback: Using memory storage')
      // Could implement memory-only storage here
    })
  }

  /**
   * Set connection manager reference
   */
  setConnectionManager(connectionManager) {
    this.connectionManager = connectionManager
    
    // Hook into connection events
    if (connectionManager.onConnectionChange) {
      const originalCallback = connectionManager.onConnectionChange
      connectionManager.onConnectionChange = (connected) => {
        this.updateHealthStatus('connection', { connected })
        if (originalCallback) originalCallback(connected)
      }
    }
  }

  /**
   * Categorize error for recovery strategies
   */
  categorizeError(error) {
    if (this.errorHandler?.categorizeError) {
      return this.errorHandler.categorizeError(error)
    }

    const message = error?.message?.toLowerCase() || ''
    
    if (message.includes('context invalidated')) {
      return 'context_invalidation'
    } else if (message.includes('connection') || message.includes('network')) {
      return 'connection_failure'
    } else if (message.includes('storage') || message.includes('database')) {
      return 'storage_operation'
    } else if (message.includes('timeout')) {
      return 'timeout'
    }
    
    return 'unknown'
  }

  /**
   * Log telemetry data
   */
  logTelemetry(eventType, data) {
    if (!this.options.telemetryEnabled) return

    const telemetryEntry = {
      id: this.generateErrorId(),
      eventType,
      component: this.options.componentName,
      timestamp: Date.now(),
      data: { ...data }
    }

    this.telemetryBuffer.push(telemetryEntry)
    
    // Maintain buffer size
    if (this.telemetryBuffer.length > this.options.telemetryBufferSize) {
      this.telemetryBuffer.shift()
    }

    // Log to console in debug mode
    if (this.options.debug) {
      console.debug(`📊 [${eventType}]`, data)
    }
  }

  /**
   * Record performance metric
   */
  recordPerformanceMetric(name, data) {
    const existing = this.performanceMetrics.get(name) || {
      calls: 0,
      totalDuration: 0,
      successes: 0,
      failures: 0,
      avgDuration: 0
    }

    existing.calls++
    existing.totalDuration += data.duration || 0
    existing.avgDuration = existing.totalDuration / existing.calls

    if (data.success) {
      existing.successes++
    } else {
      existing.failures++
    }

    this.performanceMetrics.set(name, existing)
  }

  /**
   * Monitor memory usage
   */
  monitorMemoryUsage() {
    if (typeof performance !== 'undefined' && performance.memory) {
      setInterval(() => {
        const memory = performance.memory
        this.logTelemetry('memory_usage', {
          used: memory.usedJSHeapSize,
          total: memory.totalJSHeapSize,
          limit: memory.jsHeapSizeLimit
        })
      }, 60000) // Every minute
    }
  }

  /**
   * Get current memory usage
   */
  getMemoryUsage() {
    if (typeof performance !== 'undefined' && performance.memory) {
      return {
        used: performance.memory.usedJSHeapSize,
        total: performance.memory.totalJSHeapSize,
        limit: performance.memory.jsHeapSizeLimit
      }
    }
    return null
  }

  /**
   * Update health status
   */
  updateHealthStatus(component, data) {
    this.healthStatus.components.set(component, {
      status: data.connected === false ? 'error' : 'healthy',
      lastUpdate: Date.now(),
      data
    })
  }

  /**
   * Generate unique error ID
   */
  generateErrorId() {
    return `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  /**
   * Get comprehensive status
   */
  getStatus() {
    return {
      initialized: this.initialized,
      componentName: this.options.componentName,
      health: this.healthStatus,
      errorCount: this.errorCount,
      lastError: this.lastError,
      circuitBreakers: Object.fromEntries(
        Array.from(this.circuitBreakers.entries()).map(([name, breaker]) => [
          name,
          {
            isOpen: breaker.isOpen,
            failures: breaker.failures,
            lastFailure: breaker.lastFailure
          }
        ])
      ),
      performanceMetrics: Object.fromEntries(this.performanceMetrics),
      telemetryBufferSize: this.telemetryBuffer.length
    }
  }

  /**
   * Get telemetry data
   */
  getTelemetry() {
    return [...this.telemetryBuffer]
  }

  /**
   * Export all data for debugging
   */
  exportDiagnostics() {
    return {
      status: this.getStatus(),
      telemetry: this.getTelemetry(),
      errorFrequency: Object.fromEntries(this.errorFrequency),
      recoveryAttempts: Object.fromEntries(this.recoveryAttempts),
      timestamp: Date.now(),
      version: this.options.version
    }
  }

  /**
   * Cleanup resources
   */
  cleanup() {
    // Clear intervals and timeouts
    this.initialized = false
    
    // Clear telemetry buffer
    this.telemetryBuffer = []
    
    // Reset states
    this.errorCount = 0
    this.errorFrequency.clear()
    this.recoveryAttempts.clear()
    this.circuitBreakers.clear()
    this.performanceMetrics.clear()
    this.healthStatus.components.clear()
    
    console.log(`🧹 Error boundary cleanup completed for ${this.options.componentName}`)
  }
}

// Export for use in other components
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ErrorBoundary
} else {
  window.ErrorBoundary = ErrorBoundary
}
