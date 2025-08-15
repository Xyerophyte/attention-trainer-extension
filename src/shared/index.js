/**
 * Shared Module Loader
 * Initializes and exports shared modules for use in other components
 * Handles timing issues, retry logic, and graceful degradation
 */

// Handles module loading in different contexts (content script, background, popup, etc.)
const moduleLoader = {
  initialized: false,
  modules: {},
  initPromise: null,
  retryCount: 0,
  maxRetries: 3,

  /**
   * Initialize shared modules with retry logic
   */
  async init () {
    if (this.initialized) {
      return this.modules
    }
    if (this.initPromise) {
      return this.initPromise
    }

    this.initPromise = this._initializeWithRetry()
    return this.initPromise
  },

  async _initializeWithRetry () {
    try {
      console.log('🔄 Initializing shared modules...')

      // Check if we're in a valid extension context
      if (!this._validateExtensionContext()) {
        console.warn('⚠️ Extension context not fully available, using fallback modules')
        return this._initializeFallbackModules()
      }

      // Wait for dependencies to be available with timeout
      await this._waitForDependencies()

      // Initialize error handler first
      if (!this.modules.errorHandler) {
        this.modules.errorHandler = typeof window.ErrorHandler !== 'undefined'
          ? new window.ErrorHandler()
          : this._createFallbackErrorHandler()
      }

      // Initialize fallback storage
      if (!this.modules.fallbackStorage) {
        this.modules.fallbackStorage = typeof window.FallbackStorage !== 'undefined'
          ? new window.FallbackStorage()
          : this._createFallbackStorage()

        if (this.modules.fallbackStorage && this.modules.fallbackStorage.init) {
          await this.modules.fallbackStorage.init()
        }
      }

      // Initialize connection manager last (depends on error handler)
      if (!this.modules.connectionManager) {
        this.modules.connectionManager = typeof window.ConnectionManager !== 'undefined'
          ? new window.ConnectionManager(this.modules.errorHandler)
          : this._createFallbackConnectionManager()
      }

      this.initialized = true
      console.log('✅ Shared modules initialized successfully')

      return this.modules
    } catch (error) {
      console.error('❌ Failed to initialize shared modules:', error)

      // Retry with exponential backoff
      if (this.retryCount < this.maxRetries) {
        this.retryCount++
        const delay = Math.pow(2, this.retryCount) * 500 // 1s, 2s, 4s
        console.log(`🔄 Retrying shared module initialization in ${delay}ms (attempt ${this.retryCount}/${this.maxRetries})`)

        await new Promise(resolve => setTimeout(resolve, delay))
        this.initPromise = null // Reset promise for retry
        return this.init()
      }

      // Max retries reached - use fallback modules
      console.warn('⚠️ Max retries reached, initializing fallback modules for degraded functionality')
      return this._initializeFallbackModules()
    }
  },

  /**
   * Wait for dependencies to be available
   */
  async _waitForDependencies () {
    const timeout = 5000 // 5 seconds
    const startTime = Date.now()

    while (Date.now() - startTime < timeout) {
      // Check if required classes are available
      const hasErrorHandler = typeof window.ErrorHandler !== 'undefined'
      const hasFallbackStorage = typeof window.FallbackStorage !== 'undefined'
      const hasConnectionManager = typeof window.ConnectionManager !== 'undefined'

      if (hasErrorHandler && hasFallbackStorage && hasConnectionManager) {
        console.log('📦 All dependencies loaded')
        return
      }

      await new Promise(resolve => setTimeout(resolve, 100))
    }

    console.warn('⏰ Timeout waiting for dependencies, proceeding with partial initialization')
  },

  /**
   * Validate extension context
   */
  _validateExtensionContext () {
    try {
      return !!(chrome && chrome.runtime && chrome.storage)
    } catch (error) {
      return false
    }
  },

  /**
   * Initialize fallback modules for degraded functionality
   */
  _initializeFallbackModules () {
    console.log('🏗️ Initializing fallback modules...')

    if (!this.modules.errorHandler) {
      this.modules.errorHandler = this._createFallbackErrorHandler()
    }

    if (!this.modules.fallbackStorage) {
      this.modules.fallbackStorage = this._createFallbackStorage()
    }

    if (!this.modules.connectionManager) {
      this.modules.connectionManager = this._createFallbackConnectionManager()
    }

    this.initialized = true
    console.log('⚠️ Fallback modules initialized (limited functionality)')

    return this.modules
  },

  /**
   * Create fallback error handler
   */
  _createFallbackErrorHandler () {
    return {
      handleError: (error, context) => {
        console.error('Error (fallback mode):', error, context)
      },
      showErrorNotification: (message) => {
        console.warn('Notification (fallback mode):', message)
      },
      logError: (error, context) => {
        console.error('Log (fallback mode):', error, context)
      },
      reportError: (error, context) => {
        console.error('Report (fallback mode):', error, context)
      }
    }
  },

  /**
   * Create fallback storage
   */
  _createFallbackStorage () {
    return {
      init: async () => {
        console.log('📦 Fallback storage initialized')
      },
      storeAnalytics: async (domain, date, data) => {
        console.log('📊 Analytics storage not available (fallback mode):', { domain, date, data })
      },
      getAnalytics: async () => {
        console.log('📊 Analytics retrieval not available (fallback mode)')
        return []
      },
      getSettings: async () => {
        console.log('⚙️ Settings retrieval not available (fallback mode)')
        return {
          isEnabled: false,
          focusMode: 'gentle',
          thresholds: { stage1: 30, stage2: 60, stage3: 120, stage4: 180 },
          whitelist: []
        }
      },
      storeSettings: async (settings) => {
        console.log('⚙️ Settings storage not available (fallback mode):', settings)
      }
    }
  },

  /**
   * Create fallback connection manager
   */
  _createFallbackConnectionManager () {
    return {
      contextValid: false,
      isConnected: false,
      sendMessage: async (message) => {
        console.log('📡 Message sending not available (fallback mode):', message)
        throw new Error('Connection not available in fallback mode')
      },
      onConnectionChange: () => {},
      onContextInvalid: () => {},
      validateContext: () => false,
      connect: async () => false,
      disconnect: () => {},
      queueMessage: (message) => {
        console.log('📡 Message queuing not available (fallback mode):', message)
      }
    }
  },

  /**
   * Get module instance, initializing if necessary
   */
  async getModule (name) {
    if (!this.initialized) {
      await this.init()
    }

    return this.modules[name] || null
  },

  /**
   * Get all initialized modules
   */
  async getModules () {
    if (!this.initialized) {
      await this.init()
    }

    return { ...this.modules }
  },

  /**
   * Get initialization status
   */
  getStatus () {
    return {
      initialized: this.initialized,
      retryCount: this.retryCount,
      hasErrorHandler: !!this.modules.errorHandler,
      hasConnectionManager: !!this.modules.connectionManager,
      hasFallbackStorage: !!this.modules.fallbackStorage,
      contextValid: this._validateExtensionContext()
    }
  },

  /**
   * Force re-initialization (for testing or recovery)
   */
  async reset () {
    this.initialized = false
    this.initPromise = null
    this.retryCount = 0
    this.modules = {}

    console.log('🔄 Shared modules reset, re-initializing...')
    return this.init()
  }
}

// Initialize with delay to ensure dependencies are loaded
setTimeout(() => {
  moduleLoader.init().catch(error => {
    console.warn('Failed to auto-initialize shared modules:', error)
  })
}, 200) // Increased delay to ensure all scripts are loaded

// Export moduleLoader for use in other components
if (typeof module !== 'undefined' && module.exports) {
  module.exports = moduleLoader
} else {
  window.SharedModules = moduleLoader
}

console.log('📦 Shared module loader ready')
