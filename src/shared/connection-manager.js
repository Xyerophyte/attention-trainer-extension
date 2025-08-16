/**
 * Connection Manager - Handles robust connection between content scripts and background service
 * Addresses extension context invalidation and provides fallback mechanisms
 * Enhanced with circuit breaker patterns, health checks, and graceful degradation
 */

class ConnectionManager {
  constructor (options = {}) {
    this.options = {
      maxRetries: options.maxRetries || 5,
      retryDelay: options.retryDelay || 1000,
      healthCheckInterval: options.healthCheckInterval || 15000,
      messageTimeout: options.messageTimeout || 5000,
      maxQueueSize: options.maxQueueSize || 100,
      circuitBreakerThreshold: options.circuitBreakerThreshold || 3,
      circuitBreakerTimeout: options.circuitBreakerTimeout || 30000,
      gracefulDegradation: options.gracefulDegradation !== false,
      ...options
    }

    this.isConnected = false
    this.contextValid = true
    this.messageQueue = []
    this.connectionAttempts = 0
    this.healthCheckInterval = null
    this.reconnectTimeout = null
    this.listeners = new Map() // Event listeners for cleanup

    // Circuit breaker state
    this.circuitBreaker = {
      failures: 0,
      lastFailure: 0,
      isOpen: false,
      halfOpenAttempts: 0
    }

    // Health monitoring
    this.healthMetrics = {
      lastHealthCheck: 0,
      consecutiveFailures: 0,
      averageResponseTime: 0,
      totalHealthChecks: 0,
      successfulHealthChecks: 0
    }

    // Performance metrics
    this.performanceMetrics = {
      totalMessages: 0,
      successfulMessages: 0,
      failedMessages: 0,
      averageResponseTime: 0,
      totalResponseTime: 0
    }

    // Connection state callbacks
    this.onConnectionChange = null
    this.onContextInvalid = null
    this.onCircuitBreakerOpen = null
    this.onHealthCheckFail = null

    // Initialize logger if available
    this.logger = window.logger ? window.logger.child({ component: 'ConnectionManager' }) : null

    this.init()
  }

  async init () {
    this.log('info', 'Initializing connection manager')
    
    await this.validateContext()
    if (this.contextValid) {
      await this.establishConnection()
      this.startHealthCheck()
      this.startPerformanceMonitoring()
    } else {
      this.log('warn', 'Context invalid during initialization')
    }
  }

  /**
   * Validates if the extension context is still valid
   */
  async validateContext () {
    try {
      // Basic chrome object check
      if (!chrome) {
        throw new Error('Chrome object not available')
      }

      // Check if chrome.runtime exists
      if (!chrome.runtime) {
        throw new Error('Chrome runtime not available')
      }

      // Check for runtime ID (but be more lenient)
      if (!chrome.runtime.id) {
        // During extension reload, this might temporarily be undefined
        // Try a few times before giving up
        await new Promise(resolve => setTimeout(resolve, 100))
        if (!chrome.runtime.id) {
          throw new Error('Extension context invalidated - no runtime ID')
        }
      }

      // Test runtime API accessibility with error handling
      try {
        const testUrl = chrome.runtime.getURL('manifest.json')
        if (!testUrl || !testUrl.startsWith('chrome-extension://')) {
          throw new Error('Cannot access extension URLs')
        }
      } catch (apiError) {
        // If we can't get URL but runtime exists, context might be temporarily invalid
        if (chrome.runtime.lastError || apiError.message.includes('Extension context invalidated')) {
          throw new Error('Extension context invalidated during API test')
        }
        // Other errors might be transient, don't fail validation immediately
        console.warn('Runtime API test failed but context may still be valid:', apiError.message)
      }

      this.contextValid = true
      return true
    } catch (error) {
      // Only log as warning if it's not a critical context error
      const isCritical = error.message.includes('Extension context invalidated') ||
                        error.message.includes('Chrome runtime not available')
      if (isCritical) {
        console.warn('Extension context validation failed:', error.message)
        this.contextValid = false
        this.handleContextInvalidation()
      } else {
        console.debug('Context validation warning (may be transient):', error.message)
      }
      return false
    }
  }

  /**
   * Establishes connection with background service
   */
  async establishConnection () {
    if (!this.contextValid) {
      return false
    }

    try {
      // Test connection with a ping message
      const response = await this.sendMessage({
        type: 'CONNECTION_TEST',
        timestamp: Date.now()
      }, { skipQueue: true })

      if (response && response.success) {
        this.isConnected = true
        this.connectionAttempts = 0
        await this.flushMessageQueue()
        this.notifyConnectionChange(true)
        console.log('✅ Connection established with background service')
        return true
      }

      throw new Error('Invalid response from background service')
    } catch (error) {
      console.warn('Failed to establish connection:', error.message)
      this.isConnected = false
      this.scheduleReconnection()
      return false
    }
  }

  /**
   * Sends message with automatic queuing and retry logic
   */
  async sendMessage (message, options = {}) {
    const {
      skipQueue = false,
      timeout = 5000
      // priority = 'normal' // Available but not used in current implementation
    } = options

    // If context is invalid, reject immediately
    if (!this.contextValid) {
      throw new Error('Extension context is invalid')
    }

    // If not connected and not a connection test, queue the message
    if (!this.isConnected && !skipQueue) {
      return this.queueMessage(message, options)
    }

    try {
      return await this.executeMessage(message, timeout)
    } catch (error) {
      // Handle different types of errors
      if (this.isContextError(error)) {
        await this.handleContextInvalidation()
        throw new Error('Extension context invalidated during message send')
      } else if (this.isConnectionError(error)) {
        this.isConnected = false
        if (!skipQueue) {
          return this.queueMessage(message, options)
        }
        throw error
      } else {
        throw error
      }
    }
  }

  /**
   * Executes message with timeout
   */
  async executeMessage (message, timeout) {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error('Message timeout'))
      }, timeout)

      chrome.runtime.sendMessage(message, (response) => {
        clearTimeout(timeoutId)

        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message))
        } else {
          resolve(response)
        }
      })
    })
  }

  /**
   * Queues message for later delivery
   */
  queueMessage (message, options) {
    return new Promise((resolve, reject) => {
      this.messageQueue.push({
        message,
        options,
        resolve,
        reject,
        timestamp: Date.now(),
        priority: options.priority || 'normal'
      })

      // Sort queue by priority (high -> normal -> low)
      this.messageQueue.sort((a, b) => {
        const priorities = { high: 3, normal: 2, low: 1 }
        return priorities[b.priority] - priorities[a.priority]
      })

      // Limit queue size to prevent memory issues
      if (this.messageQueue.length > 100) {
        const dropped = this.messageQueue.splice(50) // Keep most recent 50
        dropped.forEach(item => {
          item.reject(new Error('Message queue overflow'))
        })
      }

      console.log(`📬 Message queued (${this.messageQueue.length} pending): ${message.type}`)
    })
  }

  /**
   * Flushes queued messages
   */
  async flushMessageQueue () {
    if (this.messageQueue.length === 0) {
      return
    }

    console.log(`📤 Flushing ${this.messageQueue.length} queued messages`)

    const queue = [...this.messageQueue]
    this.messageQueue = []

    for (const item of queue) {
      try {
        const response = await this.executeMessage(item.message, 5000)
        item.resolve(response)
      } catch (error) {
        // If we lose connection while flushing, re-queue remaining messages
        if (this.isConnectionError(error)) {
          this.messageQueue.unshift(item, ...queue.slice(queue.indexOf(item) + 1))
          break
        }
        item.reject(error)
      }
    }
  }

  /**
   * Schedules reconnection attempt with exponential backoff
   */
  scheduleReconnection () {
    if (this.reconnectTimeout) {
      return
    } // Already scheduled

    this.connectionAttempts++
    const delay = Math.min(
      this.retryDelay * Math.pow(2, this.connectionAttempts - 1),
      30000 // Max 30 seconds
    )

    console.log(`🔄 Scheduling reconnection attempt ${this.connectionAttempts}/${this.maxRetries} in ${delay}ms`)

    this.reconnectTimeout = setTimeout(async () => {
      this.reconnectTimeout = null

      if (this.connectionAttempts < this.maxRetries) {
        await this.validateContext()
        if (this.contextValid) {
          await this.establishConnection()
        }
      } else {
        console.error('❌ Max reconnection attempts reached. Running in offline mode.')
        this.notifyConnectionChange(false)
      }
    }, delay)
  }

  /**
   * Starts periodic health checks
   */
  startHealthCheck () {
    if (this.healthCheckInterval) {
      return
    }

    this.healthCheckInterval = setInterval(async () => {
      if (!this.contextValid) {
        this.stopHealthCheck()
        return
      }

      try {
        await this.validateContext()

        if (this.contextValid && this.isConnected) {
          // Send ping to verify connection is still alive
          await this.sendMessage({
            type: 'HEALTH_CHECK',
            timestamp: Date.now()
          }, { skipQueue: true, timeout: 2000 })
        } else if (this.contextValid && !this.isConnected) {
          // Try to reconnect if context is valid but connection is lost
          await this.establishConnection()
        }
      } catch (error) {
        console.warn('Health check failed:', error.message)
        if (this.isContextError(error)) {
          await this.handleContextInvalidation()
        } else {
          this.isConnected = false
          this.scheduleReconnection()
        }
      }
    }, 15000) // Check every 15 seconds
  }

  /**
   * Stops health check
   */
  stopHealthCheck () {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval)
      this.healthCheckInterval = null
    }
  }

  /**
   * Handles context invalidation
   */
  async handleContextInvalidation () {
    // Check if this is just a temporary issue during reload
    const isReload = this.connectionAttempts === 0 && chrome && chrome.runtime

    if (isReload) {
      console.info('🔄 Extension context temporarily invalid (likely during reload)')
    } else {
      console.warn('🚨 Extension context invalidated - switching to offline mode')
    }

    this.contextValid = false
    this.isConnected = false
    this.stopHealthCheck()

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout)
      this.reconnectTimeout = null
    }

    // For reloads, be more gentle with queued messages
    if (isReload) {
      console.info('💾 Preserving message queue for post-reload reconnection')
      // Don't reject messages immediately, give reconnection a chance
    } else {
      // Reject all queued messages for true context invalidation
      this.messageQueue.forEach(item => {
        item.reject(new Error('Extension context invalidated'))
      })
      this.messageQueue = []
    }

    // Only do full cleanup for true invalidation
    if (!isReload) {
      this.cleanup()
    }

    // Notify components
    this.notifyConnectionChange(false)
    if (this.onContextInvalid) {
      this.onContextInvalid(isReload)
    }
  }

  /**
   * Determines if error is context-related
   */
  isContextError (error) {
    const contextErrors = [
      'Extension context invalidated',
      'receiving end does not exist',
      'message port closed',
      'runtime.lastError'
    ]

    return contextErrors.some(errorType =>
      error.message.toLowerCase().includes(errorType.toLowerCase())
    )
  }

  /**
   * Determines if error is connection-related
   */
  isConnectionError (error) {
    const connectionErrors = [
      'timeout',
      'connection',
      'network',
      'unavailable'
    ]

    return connectionErrors.some(errorType =>
      error.message.toLowerCase().includes(errorType.toLowerCase())
    )
  }

  /**
   * Notifies listeners of connection state changes
   */
  notifyConnectionChange (connected) {
    if (this.onConnectionChange) {
      this.onConnectionChange(connected)
    }

    // Dispatch custom event for other components
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('connectionStateChange', {
        detail: { connected, contextValid: this.contextValid }
      }))
    }
  }

  /**
   * Registers event listener for cleanup
   */
  addListener (element, event, handler, options) {
    const key = `${element.constructor.name}-${event}-${Date.now()}`
    element.addEventListener(event, handler, options)

    this.listeners.set(key, () => {
      element.removeEventListener(event, handler, options)
    })

    return key
  }

  /**
   * Removes specific listener
   */
  removeListener (key) {
    const cleanup = this.listeners.get(key)
    if (cleanup) {
      cleanup()
      this.listeners.delete(key)
    }
  }

  /**
   * Cleanup all resources
   */
  cleanup () {
    this.stopHealthCheck()

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout)
      this.reconnectTimeout = null
    }

    // Remove all event listeners
    this.listeners.forEach(cleanup => cleanup())
    this.listeners.clear()

    console.log('🧹 Connection manager cleanup completed')
  }

  /**
   * Start performance monitoring
   */
  startPerformanceMonitoring() {
    this.log('info', 'Starting performance monitoring')
    
    // Monitor message performance every 60 seconds
    setInterval(() => {
      this.reportPerformanceMetrics()
    }, 60000)
  }

  /**
   * Enhanced message sending with circuit breaker
   */
  async sendMessageWithCircuitBreaker(message, options = {}) {
    // Check circuit breaker state
    if (this.circuitBreaker.isOpen) {
      const timeSinceFailure = Date.now() - this.circuitBreaker.lastFailure
      
      if (timeSinceFailure < this.options.circuitBreakerTimeout) {
        if (this.options.gracefulDegradation) {
          this.log('warn', 'Circuit breaker open, using graceful degradation')
          return this.handleGracefulDegradation(message, options)
        }
        throw new Error('Circuit breaker is open')
      } else {
        // Try half-open state
        this.circuitBreaker.isOpen = false
        this.circuitBreaker.halfOpenAttempts++
        this.log('info', 'Circuit breaker attempting half-open state')
      }
    }

    const startTime = performance.now()
    
    try {
      const result = await this.sendMessage(message, options)
      
      // Success - reset circuit breaker
      if (this.circuitBreaker.failures > 0) {
        this.circuitBreaker.failures = 0
        this.circuitBreaker.halfOpenAttempts = 0
        this.log('info', 'Circuit breaker reset after successful message')
      }
      
      this.updatePerformanceMetrics(startTime, true)
      return result
    } catch (error) {
      this.updatePerformanceMetrics(startTime, false)
      this.handleCircuitBreakerFailure(error)
      throw error
    }
  }

  /**
   * Handle circuit breaker failure
   */
  handleCircuitBreakerFailure(error) {
    this.circuitBreaker.failures++
    this.circuitBreaker.lastFailure = Date.now()
    
    if (this.circuitBreaker.failures >= this.options.circuitBreakerThreshold) {
      this.circuitBreaker.isOpen = true
      this.log('warn', `Circuit breaker opened after ${this.circuitBreaker.failures} failures`)
      
      if (this.onCircuitBreakerOpen) {
        this.onCircuitBreakerOpen(error)
      }
      
      // Notify error boundary if available
      if (window.ErrorBoundary) {
        const errorBoundary = new window.ErrorBoundary({ componentName: 'ConnectionManager' })
        errorBoundary.handleError(error, {
          circuitBreakerFailures: this.circuitBreaker.failures,
          context: 'circuit_breaker'
        })
      }
    }
  }

  /**
   * Handle graceful degradation
   */
  async handleGracefulDegradation(message, options) {
    this.log('info', `Graceful degradation for message type: ${message.type}`)
    
    // Queue message for later retry
    if (!options.skipQueue) {
      return this.queueMessage(message, { ...options, priority: 'low' })
    }
    
    // Return mock response for non-critical operations
    switch (message.type) {
      case 'BEHAVIORAL_EVENT':
      case 'ANALYTICS_UPDATE':
        return { success: true, queued: true }
      
      case 'HEALTH_CHECK':
        return { success: false, circuitBreakerOpen: true }
      
      default:
        throw new Error('Circuit breaker open - no fallback available')
    }
  }

  /**
   * Enhanced health check with metrics
   */
  async performEnhancedHealthCheck() {
    const startTime = performance.now()
    this.healthMetrics.totalHealthChecks++
    
    try {
      // Validate context first
      await this.validateContext()
      
      if (!this.contextValid) {
        throw new Error('Context invalid')
      }
      
      // Test connection with timeout
      const response = await this.sendMessage({
        type: 'HEALTH_CHECK',
        timestamp: Date.now(),
        metrics: this.getHealthMetrics()
      }, { skipQueue: true, timeout: 3000 })
      
      if (!response || !response.success) {
        throw new Error('Invalid health check response')
      }
      
      // Success
      const responseTime = performance.now() - startTime
      this.updateHealthMetrics(responseTime, true)
      this.healthMetrics.successfulHealthChecks++
      this.healthMetrics.consecutiveFailures = 0
      
      this.log('debug', 'Health check successful', { responseTime })
      return true
      
    } catch (error) {
      const responseTime = performance.now() - startTime
      this.updateHealthMetrics(responseTime, false)
      this.healthMetrics.consecutiveFailures++
      
      this.log('warn', 'Health check failed', { 
        error: error.message, 
        consecutiveFailures: this.healthMetrics.consecutiveFailures 
      })
      
      if (this.onHealthCheckFail) {
        this.onHealthCheckFail(error, this.healthMetrics.consecutiveFailures)
      }
      
      // Handle critical health failures
      if (this.healthMetrics.consecutiveFailures >= 3) {
        await this.handleCriticalHealthFailure(error)
      }
      
      return false
    }
  }

  /**
   * Handle critical health failure
   */
  async handleCriticalHealthFailure(error) {
    this.log('error', 'Critical health failure detected', {
      consecutiveFailures: this.healthMetrics.consecutiveFailures,
      error: error.message
    })
    
    if (this.isContextError(error)) {
      await this.handleContextInvalidation()
    } else {
      // Force reconnection
      this.isConnected = false
      this.scheduleReconnection()
    }
  }

  /**
   * Update performance metrics
   */
  updatePerformanceMetrics(startTime, success) {
    const duration = performance.now() - startTime
    
    this.performanceMetrics.totalMessages++
    this.performanceMetrics.totalResponseTime += duration
    this.performanceMetrics.averageResponseTime = 
      this.performanceMetrics.totalResponseTime / this.performanceMetrics.totalMessages
    
    if (success) {
      this.performanceMetrics.successfulMessages++
    } else {
      this.performanceMetrics.failedMessages++
    }
  }

  /**
   * Update health metrics
   */
  updateHealthMetrics(responseTime, success) {
    this.healthMetrics.lastHealthCheck = Date.now()
    
    // Update average response time
    const totalChecks = this.healthMetrics.totalHealthChecks
    this.healthMetrics.averageResponseTime = 
      ((this.healthMetrics.averageResponseTime * (totalChecks - 1)) + responseTime) / totalChecks
  }

  /**
   * Get health metrics
   */
  getHealthMetrics() {
    return {
      ...this.healthMetrics,
      healthRatio: this.healthMetrics.totalHealthChecks > 0 
        ? (this.healthMetrics.successfulHealthChecks / this.healthMetrics.totalHealthChecks * 100).toFixed(1) + '%'
        : 'N/A'
    }
  }

  /**
   * Get performance metrics
   */
  getPerformanceMetrics() {
    return {
      ...this.performanceMetrics,
      successRate: this.performanceMetrics.totalMessages > 0
        ? (this.performanceMetrics.successfulMessages / this.performanceMetrics.totalMessages * 100).toFixed(1) + '%'
        : 'N/A'
    }
  }

  /**
   * Report performance metrics
   */
  reportPerformanceMetrics() {
    const metrics = {
      performance: this.getPerformanceMetrics(),
      health: this.getHealthMetrics(),
      circuitBreaker: {
        isOpen: this.circuitBreaker.isOpen,
        failures: this.circuitBreaker.failures,
        lastFailure: this.circuitBreaker.lastFailure
      },
      connection: {
        connected: this.isConnected,
        contextValid: this.contextValid,
        queueSize: this.messageQueue.length,
        attempts: this.connectionAttempts
      }
    }
    
    this.log('info', 'Performance metrics report', metrics)
    
    // Send metrics to background for analytics if connected
    if (this.isConnected && !this.circuitBreaker.isOpen) {
      this.sendMessage({
        type: 'CONNECTION_METRICS',
        data: metrics,
        timestamp: Date.now()
      }, { skipQueue: true }).catch(error => {
        this.log('debug', 'Failed to send metrics to background', { error: error.message })
      })
    }
  }

  /**
   * Enhanced status with full metrics
   */
  getEnhancedStatus() {
    return {
      connection: {
        connected: this.isConnected,
        contextValid: this.contextValid,
        queuedMessages: this.messageQueue.length,
        connectionAttempts: this.connectionAttempts
      },
      circuitBreaker: {
        isOpen: this.circuitBreaker.isOpen,
        failures: this.circuitBreaker.failures,
        lastFailure: this.circuitBreaker.lastFailure,
        halfOpenAttempts: this.circuitBreaker.halfOpenAttempts
      },
      health: this.getHealthMetrics(),
      performance: this.getPerformanceMetrics(),
      options: this.options
    }
  }

  /**
   * Log helper method
   */
  log(level, message, data = null) {
    if (this.logger) {
      this.logger[level](message, data)
    } else {
      console[level === 'debug' ? 'debug' : level === 'info' ? 'info' : level === 'warn' ? 'warn' : 'error'](
        `[ConnectionManager] ${message}`,
        data || ''
      )
    }
  }

  /**
   * Get current connection status (legacy method)
   */
  getStatus () {
    return {
      connected: this.isConnected,
      contextValid: this.contextValid,
      queuedMessages: this.messageQueue.length,
      connectionAttempts: this.connectionAttempts
    }
  }
}

// Export for use in other components
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ConnectionManager
} else {
  window.ConnectionManager = ConnectionManager
}
