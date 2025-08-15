/**
 * Error Handler - Centralized error handling with retry capabilities
 * Provides unified error management across all extension components
 */

class ErrorHandler {
  constructor () {
    this.errorLog = []
    this.maxLogSize = 100
    this.errorListeners = []
    this.initialized = false

    // Error categories for analytics
    this.errorCategories = {
      CONTEXT: 'context_invalidation',
      CONNECTION: 'connection_failure',
      STORAGE: 'storage_operation',
      RUNTIME: 'runtime_error',
      MESSAGING: 'messaging_error',
      DOM: 'dom_operation',
      API: 'chrome_api',
      UNKNOWN: 'unknown'
    }

    this.init()
  }

  init () {
    if (this.initialized) {
      return
    }

    // Set up global error handler
    this.setupGlobalErrorHandler()

    // Listen for unhandled promise rejections
    this.setupPromiseRejectionHandler()

    this.initialized = true
    console.log('🛡️ Error handler initialized')
  }

  /**
   * Set up global error handler
   */
  setupGlobalErrorHandler () {
    if (typeof window !== 'undefined') {
      const originalOnError = window.onerror

      window.onerror = (message, source, lineno, colno, error) => {
        this.handleError(error || new Error(message), {
          source,
          line: lineno,
          column: colno,
          context: 'window.onerror'
        })

        // Call original handler if exists
        if (typeof originalOnError === 'function') {
          return originalOnError(message, source, lineno, colno, error)
        }

        return false
      }
    }
  }

  /**
   * Set up unhandled promise rejection handler
   */
  setupPromiseRejectionHandler () {
    if (typeof window !== 'undefined') {
      window.addEventListener('unhandledrejection', (event) => {
        const error = event.reason instanceof Error
          ? event.reason
          : new Error(String(event.reason))

        this.handleError(error, {
          context: 'unhandledrejection',
          isCritical: true
        })
      })
    }
  }

  /**
   * Handle error with appropriate categorization and logging
   */
  handleError (error, metadata = {}) {
    const category = this.categorizeError(error)
    const timestamp = Date.now()

    const errorInfo = {
      message: error.message,
      stack: error.stack,
      category,
      timestamp,
      metadata: {
        ...metadata,
        userAgent: navigator?.userAgent,
        url: window?.location?.href
      }
    }

    // Add to log with size limit
    this.errorLog.unshift(errorInfo)
    if (this.errorLog.length > this.maxLogSize) {
      this.errorLog.pop()
    }

    // Log to console
    console.error(`🛑 [${category}] ${error.message}`, error, metadata)

    // Notify listeners
    this.notifyErrorListeners(errorInfo)

    // Store in fallback storage if available
    this.persistError(errorInfo)

    return errorInfo
  }

  /**
   * Categorize error based on message patterns
   */
  categorizeError (error) {
    const message = error?.message?.toLowerCase() || ''

    if (message.includes('context invalidated') ||
        message.includes('receiving end does not exist')) {
      return this.errorCategories.CONTEXT
    } else if (message.includes('connection') ||
               message.includes('network') ||
               message.includes('timeout')) {
      return this.errorCategories.CONNECTION
    } else if (message.includes('storage') ||
               message.includes('database') ||
               message.includes('indexeddb')) {
      return this.errorCategories.STORAGE
    } else if (message.includes('messaging') ||
               message.includes('port closed')) {
      return this.errorCategories.MESSAGING
    } else if (message.includes('dom') ||
               message.includes('element')) {
      return this.errorCategories.DOM
    } else if (message.includes('chrome') ||
               message.includes('api') ||
               message.includes('runtime')) {
      return this.errorCategories.API
    }

    return this.errorCategories.UNKNOWN
  }

  /**
   * Subscribe to error events
   */
  subscribeToErrors (callback) {
    if (typeof callback !== 'function') {
      throw new Error('Error listener must be a function')
    }

    this.errorListeners.push(callback)
    return () => this.unsubscribeFromErrors(callback)
  }

  /**
   * Unsubscribe from error events
   */
  unsubscribeFromErrors (callback) {
    this.errorListeners = this.errorListeners.filter(cb => cb !== callback)
  }

  /**
   * Notify all error listeners
   */
  notifyErrorListeners (errorInfo) {
    this.errorListeners.forEach(listener => {
      try {
        listener(errorInfo)
      } catch (err) {
        console.error('Error in error listener:', err)
      }
    })
  }

  /**
   * Persist error to fallback storage if available
   */
  async persistError (errorInfo) {
    try {
      if (window.FallbackStorage) {
        const storage = new window.FallbackStorage()
        await storage.init()

        const date = new Date().toISOString().split('T')[0]
        await storage.storeAnalytics('errors', date, {
          errors: [errorInfo]
        })
      }
    } catch (err) {
      console.warn('Failed to persist error:', err)
    }
  }

  /**
   * Get error log
   */
  getErrorLog () {
    return [...this.errorLog]
  }

  /**
   * Clear error log
   */
  clearErrorLog () {
    this.errorLog = []
  }

  /**
   * Get error statistics
   */
  getErrorStats () {
    const stats = {}

    Object.values(this.errorCategories).forEach(category => {
      stats[category] = this.errorLog.filter(e => e.category === category).length
    })

    stats.total = this.errorLog.length
    stats.recentErrors = this.errorLog.slice(0, 5)

    return stats
  }

  /**
   * Retry function with exponential backoff
   */
  async retry (fn, options = {}) {
    const {
      maxRetries = 3,
      baseDelay = 1000,
      factor = 2,
      jitter = true,
      onRetry = null,
      retryableErrors = null
    } = options

    let attempt = 0

    while (true) {
      try {
        return await fn(attempt)
      } catch (error) {
        attempt++

        // Check if error is retryable
        const isRetryable = retryableErrors
          ? retryableErrors.some(pattern => error.message.includes(pattern))
          : true

        if (!isRetryable || attempt >= maxRetries) {
          this.handleError(error, {
            context: 'retry',
            attempts: attempt,
            maxRetries
          })
          throw error
        }

        // Calculate delay with exponential backoff and optional jitter
        const delay = baseDelay * Math.pow(factor, attempt - 1)
        const actualDelay = jitter
          ? delay * (0.5 + Math.random())
          : delay

        if (onRetry) {
          try {
            onRetry(error, attempt, actualDelay)
          } catch (err) {
            console.warn('Error in retry callback:', err)
          }
        }

        console.warn(`⏳ Retry attempt ${attempt}/${maxRetries} in ${Math.round(actualDelay)}ms...`)

        // Wait before next attempt
        await new Promise(resolve => setTimeout(resolve, actualDelay))
      }
    }
  }

  /**
   * Wrap function with error handling
   */
  wrap (fn, metadata = {}) {
    return async (...args) => {
      try {
        return await fn(...args)
      } catch (error) {
        this.handleError(error, {
          ...metadata,
          arguments: args.map(arg =>
            typeof arg === 'object'
              ? (arg ? Object.keys(arg) : null)
              : typeof arg
          )
        })
        throw error
      }
    }
  }

  /**
   * Create a circuit breaker for a function
   */
  circuitBreaker (fn, options = {}) {
    const {
      maxFailures = 3,
      resetTimeout = 30000,
      onOpen = null,
      onClose = null,
      fallback = null
    } = options

    let failures = 0
    let isOpen = false
    let lastFailureTime = 0

    return async (...args) => {
      // Check if circuit is open
      if (isOpen) {
        const now = Date.now()
        if (now - lastFailureTime > resetTimeout) {
          // Try to close the circuit after timeout
          isOpen = false
          failures = 0
          if (onClose) {
            try {
              onClose()
            } catch (err) {
              console.warn('Error in circuit breaker close callback:', err)
            }
          }
        } else if (fallback) {
          return fallback(...args)
        } else {
          throw new Error('Circuit breaker is open')
        }
      }

      try {
        const result = await fn(...args)
        // Reset failures on success
        failures = 0
        return result
      } catch (error) {
        failures++
        lastFailureTime = Date.now()

        if (failures >= maxFailures) {
          isOpen = true
          if (onOpen) {
            try {
              onOpen(error)
            } catch (err) {
              console.warn('Error in circuit breaker open callback:', err)
            }
          }
        }

        this.handleError(error, {
          context: 'circuitBreaker',
          failures,
          isOpen
        })

        if (fallback && isOpen) {
          return fallback(...args)
        }

        throw error
      }
    }
  }

  /**
   * Shows user-friendly error notification
   */
  showErrorNotification (message, duration = 5000) {
    if (typeof document === 'undefined') {
      return
    }

    // Create notification container if not exists
    let container = document.getElementById('error-notification-container')
    if (!container) {
      container = document.createElement('div')
      container.id = 'error-notification-container'
      container.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        z-index: 9999999;
        display: flex;
        flex-direction: column;
        gap: 10px;
      `
      document.body.appendChild(container)
    }

    // Create notification element
    const notification = document.createElement('div')
    notification.className = 'error-notification'
    notification.style.cssText = `
      background: #ef4444;
      color: white;
      padding: 12px 16px;
      border-radius: 8px;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
      display: flex;
      align-items: center;
      gap: 10px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 14px;
      max-width: 350px;
      animation: fadeIn 0.3s ease;
      transition: opacity 0.3s ease, transform 0.3s ease;
    `

    notification.innerHTML = `
      <div style="font-size: 20px;">⚠️</div>
      <div style="flex-grow: 1;">${message}</div>
      <div style="cursor: pointer; padding: 4px;" onclick="this.parentElement.remove()">✕</div>
    `

    container.appendChild(notification)

    // Auto-remove after duration
    setTimeout(() => {
      notification.style.opacity = '0'
      notification.style.transform = 'translateX(20px)'
      setTimeout(() => notification.remove(), 300)
    }, duration)

    return notification
  }
}

// Export for use in other components
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ErrorHandler
} else {
  window.ErrorHandler = ErrorHandler
}
