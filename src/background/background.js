// Background service worker for Attention Trainer
console.log('Attention Trainer background script loading...')

// Load shared modules for error handling
if (typeof importScripts !== 'undefined') {
  try {
    importScripts('/src/shared/logger.js')
    importScripts('/src/shared/error-handler.js')
    importScripts('/src/shared/error-boundary.js')
  } catch (error) {
    console.warn('Failed to load shared modules:', error)
  }
}

// Keep service worker alive using multiple strategies
let keepAliveInterval

// Strategy 1: Periodic self-ping to keep service worker alive
const keepServiceWorkerAlive = () => {
  if (keepAliveInterval) {
    clearInterval(keepAliveInterval)
  }
  keepAliveInterval = setInterval(() => {
    // Use a simple storage operation to keep the service worker active
    chrome.storage.local.get(['keepAlive'], () => {
      // This keeps the service worker active without causing errors
      if (chrome.runtime.lastError) {
        console.warn('Keep-alive check failed:', chrome.runtime.lastError.message)
      }
    })
  }, 25000) // Every 25 seconds
}

// Strategy 2: Wake up on various events
chrome.runtime.onStartup.addListener(keepServiceWorkerAlive)
chrome.runtime.onInstalled.addListener(keepServiceWorkerAlive)
chrome.tabs.onActivated?.addListener && chrome.tabs.onActivated.addListener(keepServiceWorkerAlive)

// Start keep-alive immediately
keepServiceWorkerAlive()

class AttentionTrainerBackground {
  constructor () {
    this.pendingStorageUpdates = new Map()
    this.storageUpdateTimeout = null
    this.STORAGE_BATCH_DELAY = 1000 // Batch storage updates for 1 second
    this.DATA_RETENTION_DAYS = 90 // Keep data for 90 days

    // Initialize error handling
    this.initializeErrorHandling()

    // Set up with error boundaries
    this.safeSetupEventListeners()
    this.safeInitializeStorage()

    // Schedule periodic cleanup
    this.schedulePeriodicCleanup()

    this.logger.info('Attention Trainer background service initialized')
  }

  /**
   * Initialize error handling system
   */
  initializeErrorHandling() {
    try {
      // Initialize logger
      this.logger = typeof logger !== 'undefined' 
        ? logger.child({ component: 'Background' })
        : { info: console.log, warn: console.warn, error: console.error, debug: console.debug }
      
      // Initialize error boundary
      this.errorBoundary = typeof ErrorBoundary !== 'undefined'
        ? new ErrorBoundary({
            componentName: 'AttentionTrainerBackground',
            telemetryEnabled: true,
            circuitBreakerEnabled: true,
            gracefulDegradation: true
          })
        : null
        
      if (this.errorBoundary) {
        // Register recovery strategies specific to background script
        this.registerRecoveryStrategies()
        this.logger.info('Error boundary system initialized')
      }
    } catch (error) {
      console.error('Failed to initialize error handling:', error)
      // Fallback logging
      this.logger = { info: console.log, warn: console.warn, error: console.error, debug: console.debug }
    }
  }

  /**
   * Register background-specific recovery strategies
   */
  registerRecoveryStrategies() {
    if (!this.errorBoundary) return

    // Storage operation recovery
    this.errorBoundary.registerRecoveryStrategy('storage_operation', async (error, errorInfo, attempts) => {
      this.logger.warn(`Storage recovery attempt ${attempts + 1}`, { error: error.message })
      
      try {
        // Try to reinitialize storage with defaults
        await this.initializeStorage()
        return true
      } catch (recoveryError) {
        this.logger.error('Storage recovery failed', { error: recoveryError.message })
        return false
      }
    })

    // Message handling recovery
    this.errorBoundary.registerRecoveryStrategy('messaging_error', async (error, errorInfo, attempts) => {
      this.logger.warn(`Message handling recovery attempt ${attempts + 1}`, { error: error.message })
      
      // For messaging errors, we typically can't recover the specific message
      // but we can ensure the service remains stable
      return true
    })

    // Tab communication recovery
    this.errorBoundary.registerFallbackHandler('tab_communication', async (error, errorInfo) => {
      this.logger.warn('Tab communication failed, using fallback', { error: error.message })
      // Fallback: Continue operation without the specific tab communication
      return { success: false, fallback: true }
    })
  }

  /**
   * Safe setup event listeners with error boundaries
   */
  safeSetupEventListeners() {
    const setupWithBoundary = this.errorBoundary
      ? this.errorBoundary.wrap('setupEventListeners', this.setupEventListeners.bind(this))
      : this.setupEventListeners.bind(this)
    
    try {
      setupWithBoundary()
    } catch (error) {
      this.logger.error('Failed to setup event listeners', { error: error.message })
      // Continue with basic functionality
    }
  }

  /**
   * Safe initialize storage with error boundaries
   */
  safeInitializeStorage() {
    const initWithBoundary = this.errorBoundary
      ? this.errorBoundary.wrap('initializeStorage', this.initializeStorage.bind(this))
      : this.initializeStorage.bind(this)
    
    initWithBoundary().catch(error => {
      this.logger.error('Critical storage initialization failure', { error: error.message })
      // Attempt minimal initialization
      this.initializeMinimalStorage()
    })
  }

  /**
   * Setup event listeners with enhanced error handling
   */
  setupEventListeners () {
    // Handle extension installation with error boundary
    chrome.runtime.onInstalled.addListener(async (details) => {
      try {
        await this.handleInstallation(details)
      } catch (error) {
        this.logger.error('Installation handler failed', { error: error.message, details })
        if (this.errorBoundary) {
          await this.errorBoundary.handleError(error, { context: 'installation', details })
        }
      }
    })

    // Handle messages from content scripts with enhanced error handling
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      this.handleMessageWithBoundary(message, sender, sendResponse)
      return true // Keep message channel open for async response
    })

    // Handle tab updates with error handling
    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      if (changeInfo.status === 'complete' && tab.url) {
        this.handleTabUpdateSafely(tabId, changeInfo, tab)
      }
    })

    // Add connection metrics handler
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.type === 'CONNECTION_METRICS') {
        this.handleConnectionMetrics(message.data, sender)
        sendResponse({ success: true })
      }
    })
  }

  async initializeStorage () {
    try {
      const defaultInterventionConfig = {
        thresholdsMinutes: {
          stage1Start: 0,
          stage1To80End: 3,
          stage1To50End: 10,
          stage2Start: 10,
          stage3Start: 12,
          stage4Start: 15
        },
        brightness: {
          start: 100,
          at3min: 80,
          at10min: 50,
          transitionMs: 600,
          easing: 'cubic-bezier(0.25,0.46,0.45,0.94)'
        },
        blur: {
          stage2Px: 0.75,
          maxPx: 1.0,
          transitionMs: 800
        },
        debounceMs: 20000,
        idleDetection: {
          scrollIdleMs: 2000,
          videoIdleGraceMs: 1000
        },
        persistence: {
          perDomain: true,
          carryOverSameDay: true
        }
      }

      const defaultSettings = {
        isEnabled: true,
        focusMode: 'gentle', // gentle, strict, gamified
        thresholds: {
          stage1: 30, // seconds - legacy (unused by new system)
          stage2: 60,
          stage3: 120,
          stage4: 180
        },
        interventionConfig: defaultInterventionConfig,
        whitelist: [],
        blacklist: [],
        analytics: {
          dailyStats: {},
          weeklyStats: {},
          interventions: []
        },
        gamification: {
          points: 0,
          streak: 0,
          achievements: []
        }
      }

      const stored = await chrome.storage.local.get(Object.keys(defaultSettings))
      const settings = { ...defaultSettings, ...stored }

      // Ensure deep merge for interventionConfig
      settings.interventionConfig = {
        ...defaultInterventionConfig,
        ...(stored.interventionConfig || {})
      }

      await chrome.storage.local.set(settings)
      console.log('Storage initialized successfully')
    } catch (error) {
      console.error('Failed to initialize storage:', error)
      // Fallback to basic functionality without analytics
      chrome.storage.local.set({ isEnabled: true, focusMode: 'gentle' })
    }
  }

  async handleMessage (message, sender, sendResponse) {
    try {
      switch (message.type) {
        case 'CONNECTION_TEST':
          // Connection test from ConnectionManager
          sendResponse({
            success: true,
            timestamp: Date.now(),
            backgroundVersion: '1.0.1'
          })
          break
        case 'HEALTH_CHECK':
          // Health check from ConnectionManager
          const healthInfo = await this.getHealthInfo()
          sendResponse({
            success: true,
            health: healthInfo,
            timestamp: Date.now()
          })
          break
        case 'BEHAVIORAL_EVENT':
          // New behavioral event handling
          await this.handleBehavioralEvent(message.data, sender.tab)
          sendResponse({ success: true })
          break
        case 'INTERVENTION_TRIGGERED':
          await this.logIntervention(message.data, sender.tab)
          sendResponse({ success: true })
          break
        case 'GET_SETTINGS':
          const settings = await chrome.storage.local.get()
          sendResponse(settings)
          break
        case 'UPDATE_SETTINGS':
          await chrome.storage.local.set(message.data)
          sendResponse({ success: true })
          break
        case 'OPEN_DASHBOARD':
          await this.openDashboard()
          sendResponse({ success: true })
          break
        default:
          console.warn('Unknown message type:', message.type)
          sendResponse({ success: false, error: 'Unknown message type' })
      }
    } catch (error) {
      console.error('Error handling message:', message.type, error)
      sendResponse({ success: false, error: error.message })
    }
  }

  async handleScrollEvent (data, tab) {
    try {
      if (!tab || !tab.url) {
        return
      }

      const settings = await chrome.storage.local.get()
      if (!settings.isEnabled) {
        return
      }

      // Validate data
      if (!data || typeof data.scrollTime !== 'number') {
        console.warn('Invalid scroll event data:', data)
        return
      }

      // Check if site is whitelisted
      const domain = new URL(tab.url).hostname
      if (settings.whitelist && settings.whitelist.includes(domain)) {
        return
      }

      // Update analytics
      await this.updateScrollAnalytics(domain, data)

      // Determine intervention stage
      const stage = this.calculateInterventionStage(data.scrollTime, settings.thresholds || {})
      console.log(`Scroll event: ${domain}, time: ${data.scrollTime}s, stage: ${stage}`)

      if (stage > 0) {
        // Send intervention command to content script
        try {
          console.log(`Triggering intervention stage ${stage} for ${domain}`)
          await chrome.tabs.sendMessage(tab.id, {
            type: 'TRIGGER_INTERVENTION',
            stage,
            focusMode: settings.focusMode || 'gentle'
          })
        } catch (messageError) {
          // Tab might be closed or navigating - silently ignore
          console.warn('Failed to send intervention message:', messageError)
        }
      }
    } catch (error) {
      console.error('Error handling scroll event:', error)
    }
  }

  calculateInterventionStage (scrollTime, thresholds) {
    if (scrollTime >= thresholds.stage4) {
      return 4
    }
    if (scrollTime >= thresholds.stage3) {
      return 3
    }
    if (scrollTime >= thresholds.stage2) {
      return 2
    }
    if (scrollTime >= thresholds.stage1) {
      return 1
    }
    return 0
  }

  async handleBehavioralEvent (data, tab) {
    try {
      if (!tab || !tab.url) {
        return
      }

      const settings = await chrome.storage.local.get()
      if (!settings.isEnabled) {
        return
      }

      // Check if site is whitelisted
      const domain = new URL(tab.url).hostname
      if (settings.whitelist && settings.whitelist.includes(domain)) {
        return
      }

      // Update analytics with new behavioral data format
      await this.updateBehavioralAnalytics(data)

      console.log(`Behavioral event: ${data.domain}, score: ${data.behaviorScore}, stage: ${data.interventionStage}`)
    } catch (error) {
      console.error('Error handling behavioral event:', error)
    }
  }

  async updateBehavioralAnalytics (data) {
    try {
      const key = `analytics_${data.domain}_${new Date().toISOString().split('T')[0]}`

      // Add to pending updates
      if (!this.pendingStorageUpdates.has(key)) {
        this.pendingStorageUpdates.set(key, {
          domain: data.domain,
          timeOnPage: 0,
          behaviorScore: 0,
          interventions: 0,
          siteType: data.siteType || 'general',
          flags: {},
          contentPieces: 0,
          scrollPauses: 0
        })
      }

      const pending = this.pendingStorageUpdates.get(key)
      pending.timeOnPage = Math.max(pending.timeOnPage, data.timeOnPage || 0)
      pending.behaviorScore = data.behaviorScore || 0
      pending.siteType = data.siteType || 'general'
      pending.contentPieces = data.contentPieces || 0
      pending.scrollPauses = data.scrollPauseCount || 0

      // Merge behavior flags
      if (data.flags) {
        Object.keys(data.flags).forEach(flag => {
          pending.flags[flag] = data.flags[flag] || 0
        })
      }

      // Schedule batched update
      this.scheduleBatchedStorageUpdate()
    } catch (error) {
      console.error('Error updating behavioral analytics:', error)
    }
  }

  async updateScrollAnalytics (domain, data) {
    try {
      const key = `analytics_${domain}_${new Date().toISOString().split('T')[0]}`

      // Add to pending updates
      if (!this.pendingStorageUpdates.has(key)) {
        this.pendingStorageUpdates.set(key, {
          domain,
          scrollTime: 0,
          scrollDistance: 0,
          interventions: 0
        })
      }

      const pending = this.pendingStorageUpdates.get(key)
      pending.scrollTime += data.deltaTime || 0
      pending.scrollDistance += data.scrollDistance || 0

      // Schedule batched update
      this.scheduleBatchedStorageUpdate()
    } catch (error) {
      console.error('Error updating scroll analytics:', error)
    }
  }

  scheduleBatchedStorageUpdate () {
    if (this.storageUpdateTimeout) {
      return
    }

    this.storageUpdateTimeout = setTimeout(async () => {
      await this.flushPendingStorageUpdates()
      this.storageUpdateTimeout = null
    }, this.STORAGE_BATCH_DELAY)
  }

  async flushPendingStorageUpdates () {
    if (this.pendingStorageUpdates.size === 0) {
      return
    }

    try {
      const settings = await chrome.storage.local.get(['analytics'])
      const today = new Date().toISOString().split('T')[0]

      if (!settings.analytics) {
        settings.analytics = { dailyStats: {}, interventions: [] }
      }

      if (!settings.analytics.dailyStats[today]) {
        settings.analytics.dailyStats[today] = {}
      }

      // Apply all pending updates
      for (const [_key, pending] of this.pendingStorageUpdates) {
        const domain = pending.domain

        if (!settings.analytics.dailyStats[today][domain]) {
          settings.analytics.dailyStats[today][domain] = {
            timeOnPage: 0,
            behaviorScore: 0,
            scrollTime: 0,
            scrollDistance: 0,
            interventions: 0,
            siteType: 'general',
            flags: {},
            contentPieces: 0,
            scrollPauses: 0
          }
        }

        if (pending.timeOnPage !== undefined) {
          // New behavioral analytics format
          settings.analytics.dailyStats[today][domain].timeOnPage = pending.timeOnPage
          settings.analytics.dailyStats[today][domain].behaviorScore = pending.behaviorScore || 0
          settings.analytics.dailyStats[today][domain].siteType = pending.siteType || 'general'
          settings.analytics.dailyStats[today][domain].flags = pending.flags || {}
          settings.analytics.dailyStats[today][domain].contentPieces = pending.contentPieces || 0
          settings.analytics.dailyStats[today][domain].scrollPauses = pending.scrollPauses || 0
          settings.analytics.dailyStats[today][domain].interventions += pending.interventions
        } else {
          // Legacy scroll analytics format
          settings.analytics.dailyStats[today][domain].scrollTime += pending.scrollTime || 0
          settings.analytics.dailyStats[today][domain].scrollDistance += pending.scrollDistance || 0
          settings.analytics.dailyStats[today][domain].interventions += pending.interventions
        }
      }

      // Save to storage
      await chrome.storage.local.set({ analytics: settings.analytics })

      // Clear pending updates
      this.pendingStorageUpdates.clear()
    } catch (error) {
      console.error('Error flushing storage updates:', error)
    }
  }

  async logIntervention (data, tab) {
    try {
      const settings = await chrome.storage.local.get(['analytics'])
      const domain = new URL(tab.url).hostname
      const today = new Date().toISOString().split('T')[0]

      settings.analytics.interventions.push({
        domain,
        stage: data.stage,
        timestamp: Date.now(),
        date: today
      })

      // Update daily stats
      if (settings.analytics.dailyStats[today] && settings.analytics.dailyStats[today][domain]) {
        settings.analytics.dailyStats[today][domain].interventions++
      }

      await chrome.storage.local.set({ analytics: settings.analytics })
    } catch (error) {
      console.error('Error logging intervention:', error)
    }
  }

  async resetTabScrollData (tabId, _url) {
    chrome.tabs
      .sendMessage(tabId, {
        type: 'RESET_SCROLL_DATA'
      })
      .catch(() => {
        // Ignore errors for tabs that don't have content script loaded
      })
  }

  async openDashboard () {
    try {
      const url = chrome.runtime.getURL('src/dashboard/dashboard.html')
      await chrome.tabs.create({ url })
    } catch (error) {
      console.error('Error opening dashboard:', error)
    }
  }

  schedulePeriodicCleanup () {
    // Run cleanup every 24 hours
    setInterval(() => {
      this.cleanupOldData()
    }, 24 * 60 * 60 * 1000)

    // Run initial cleanup after 5 minutes
    setTimeout(() => {
      this.cleanupOldData()
    }, 5 * 60 * 1000)
  }

  async cleanupOldData () {
    try {
      const settings = await chrome.storage.local.get(['analytics'])
      if (!settings.analytics) {
        return
      }

      const cutoffDate = new Date()
      cutoffDate.setDate(cutoffDate.getDate() - this.DATA_RETENTION_DAYS)
      const cutoffString = cutoffDate.toISOString().split('T')[0]

      // Clean up old daily stats
      let hasChanges = false
      const dailyStats = settings.analytics.dailyStats || {}

      for (const date in dailyStats) {
        if (date < cutoffString) {
          delete dailyStats[date]
          hasChanges = true
        }
      }

      // Clean up old interventions
      const cutoffTimestamp = cutoffDate.getTime()
      const interventions = settings.analytics.interventions || []
      const filteredInterventions = interventions.filter(
        intervention => intervention.timestamp > cutoffTimestamp
      )

      if (filteredInterventions.length !== interventions.length) {
        settings.analytics.interventions = filteredInterventions
        hasChanges = true
      }

      if (hasChanges) {
        await chrome.storage.local.set({ analytics: settings.analytics })
        console.log(`Cleaned up data older than ${this.DATA_RETENTION_DAYS} days`)
      }
    } catch (error) {
      console.error('Error during data cleanup:', error)
    }
  }

  /**
   * Handle installation with error boundaries
   */
  async handleInstallation(details) {
    this.logger.info('Extension installation/update detected', details)
    
    try {
      // Initialize or migrate storage
      await this.initializeStorage()
      
      // Handle version upgrades
      if (details.reason === 'update' && details.previousVersion) {
        await this.handleVersionUpgrade(details.previousVersion)
      }
    } catch (error) {
      this.logger.error('Installation handling failed', { error: error.message, details })
      throw error
    }
  }

  /**
   * Handle version upgrades
   */
  async handleVersionUpgrade(previousVersion) {
    try {
      this.logger.info('Handling version upgrade', { from: previousVersion })
      
      // Add version-specific migration logic here
      // For now, just ensure storage integrity
      const storage = await chrome.storage.local.get()
      await chrome.storage.local.set({
        ...storage,
        lastUpgrade: {
          from: previousVersion,
          to: chrome.runtime.getManifest().version,
          timestamp: Date.now()
        }
      })
    } catch (error) {
      this.logger.error('Version upgrade handling failed', { error: error.message })
    }
  }

  /**
   * Handle messages with enhanced error boundaries
   */
  async handleMessageWithBoundary(message, sender, sendResponse) {
    const messageHandler = this.errorBoundary
      ? this.errorBoundary.wrapWithCircuitBreaker('handleMessage', this.handleMessage.bind(this))
      : this.handleMessage.bind(this)
    
    try {
      await messageHandler(message, sender, sendResponse)
    } catch (error) {
      this.logger.error('Message handling failed with circuit breaker', {
        messageType: message.type,
        error: error.message,
        sender: sender?.tab?.url
      })
      
      // Send error response
      try {
        sendResponse({ success: false, error: error.message, fallback: true })
      } catch (responseError) {
        this.logger.error('Failed to send error response', { error: responseError.message })
      }
    }
  }

  /**
   * Handle tab updates safely
   */
  async handleTabUpdateSafely(tabId, changeInfo, tab) {
    try {
      await this.resetTabScrollData(tabId, tab.url)
    } catch (error) {
      this.logger.warn('Tab update handling failed', {
        tabId,
        url: tab.url,
        error: error.message
      })
      
      if (this.errorBoundary) {
        await this.errorBoundary.handleError(error, {
          context: 'tab_update',
          tabId,
          url: tab.url
        })
      }
    }
  }

  /**
   * Handle connection metrics from ConnectionManager
   */
  async handleConnectionMetrics(metrics, sender) {
    try {
      this.logger.debug('Received connection metrics', {
        from: sender?.tab?.url || 'unknown',
        metrics
      })
      
      // Store metrics for analytics
      const storage = await chrome.storage.local.get(['connectionMetrics'])
      const connectionMetrics = storage.connectionMetrics || []
      
      connectionMetrics.push({
        timestamp: Date.now(),
        url: sender?.tab?.url || 'unknown',
        metrics
      })
      
      // Keep only last 100 metrics entries
      if (connectionMetrics.length > 100) {
        connectionMetrics.splice(0, connectionMetrics.length - 100)
      }
      
      await chrome.storage.local.set({ connectionMetrics })
    } catch (error) {
      this.logger.error('Failed to handle connection metrics', { error: error.message })
    }
  }

  /**
   * Initialize minimal storage for fallback scenarios
   */
  async initializeMinimalStorage() {
    try {
      this.logger.warn('Initializing minimal storage fallback')
      
      const minimalSettings = {
        isEnabled: true,
        focusMode: 'gentle',
        thresholds: {
          stage1: 30,
          stage2: 60,
          stage3: 120,
          stage4: 180
        },
        interventionConfig: {
          thresholdsMinutes: {
            stage1Start: 0,
            stage1To80End: 3,
            stage1To50End: 10,
            stage2Start: 10,
            stage3Start: 12,
            stage4Start: 15
          },
          brightness: {
            start: 100,
            at3min: 80,
            at10min: 50,
            transitionMs: 600,
            easing: 'cubic-bezier(0.25,0.46,0.45,0.94)'
          },
          blur: {
            stage2Px: 0.75,
            maxPx: 1.0,
            transitionMs: 800
          },
          debounceMs: 20000,
          idleDetection: {
            scrollIdleMs: 2000,
            videoIdleGraceMs: 1000
          },
          persistence: {
            perDomain: true,
            carryOverSameDay: true
          }
        },
        whitelist: [],
        analytics: { dailyStats: {}, interventions: [] }
      }
      
      await chrome.storage.local.set(minimalSettings)
      this.logger.info('Minimal storage initialized successfully')
    } catch (error) {
      this.logger.error('Even minimal storage initialization failed', { error: error.message })
      // At this point, we can only log and hope for recovery
    }
  }

  /**
   * Get health information for diagnostics
   */
  async getHealthInfo () {
    try {
      const storage = await chrome.storage.local.get()
      const storageSize = JSON.stringify(storage).length

      return {
        storageSize,
        pendingUpdates: this.pendingStorageUpdates.size,
        dataRetentionDays: this.DATA_RETENTION_DAYS,
        batchDelay: this.STORAGE_BATCH_DELAY,
        keepAliveActive: !!keepAliveInterval,
        lastCleanup: storage.lastCleanup || 'never',
        uptime: Date.now() - (this.startTime || Date.now()),
        errorBoundary: this.errorBoundary ? this.errorBoundary.getStatus() : null,
        logger: this.logger ? {
          component: 'Background',
          bufferSize: typeof this.logger.getBuffer === 'function' ? this.logger.getBuffer().length : 'unknown'
        } : null
      }
    } catch (error) {
      this.logger.error('Error getting health info', { error: error.message })
      return {
        error: error.message,
        timestamp: Date.now()
      }
    }
  }
}

// Initialize background service
const backgroundService = new AttentionTrainerBackground()
console.log('Background service initialized:', !!backgroundService)
