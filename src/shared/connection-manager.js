/**
 * Connection Manager - Handles robust connection between content scripts and background service
 * Addresses extension context invalidation and provides fallback mechanisms
 */

class ConnectionManager {
  constructor () {
    this.isConnected = false
    this.contextValid = true
    this.messageQueue = []
    this.connectionAttempts = 0
    this.maxRetries = 5
    this.retryDelay = 1000 // Base delay in ms
    this.healthCheckInterval = null
    this.reconnectTimeout = null
    this.listeners = new Map() // Event listeners for cleanup

    // Connection state callbacks
    this.onConnectionChange = null
    this.onContextInvalid = null

    this.init()
  }

  async init () {
    await this.validateContext()
    if (this.contextValid) {
      await this.establishConnection()
      this.startHealthCheck()
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
   * Get current connection status
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
