// Content script for scroll monitoring and interventions
class AttentionTrainerContent {
  constructor () {
    // Shared modules initialization
    this.connectionManager = null
    this.errorHandler = null
    this.fallbackStorage = null

    // Legacy properties for backward compatibility
    this.contextValid = true
    this.backgroundConnected = false

    // Advanced behavioral tracking
    this.behaviorData = {
      sessionStart: Date.now(),
      totalTimeOnPage: 0,
      scrollSessions: [],
      currentScrollSession: null,
      rapidScrollCount: 0,
      shortStayCount: 0,
      backAndForthCount: 0,
      passiveConsumptionTime: 0,
      interventionStage: 0,
      lastInterventionTime: 0,
      focusMode: false,
      snoozeUntil: null,
      flags: {},
      contentPieces: 0,
      scrollingStarted: false,
      actualScrollStartTime: null
    }

    // Legacy scroll tracking compatibility (for backward compatibility)
    this.scrollData = {
      isScrolling: false,
      startTime: 0,
      totalScrollTime: 0,
      scrollDistance: 0,
      interventionStage: 0,
      focusMode: false,
      snoozeUntil: null
    }

    // Site-specific behavior patterns
    this.sitePatterns = this.detectSitePattern()
    this.behaviorScore = 0
    this.interventionOverlay = null
    this.behaviorTimeout = null
    this.settings = {}
    this.observers = []

    // Time-based distraction tracking state
    this.distractionState = {
      activeMs: 0,
      lastActiveTs: 0,
      lastScrollTs: 0,
      mediaPlaying: false,
      stage: 0,
      lastStageChangeTs: 0,
      persistenceKey: null
    }

    // Brightness controller state
    this.brightnessState = {
      currentPercent: 100
    }

    // Performance optimization - batched updates
    this.scoreUpdateScheduled = false
    this.analyticsQueue = []
    this.lastAnalyticsFlush = Date.now()
    const ANALYTICS_FLUSH_INTERVAL = 30000; // Flush analytics every 30 seconds

    // IntersectionObserver pool for better performance
    this.observerPool = {
      contentViewing: null,
      observers: new Map(), // Track elements and their observers
      pendingElements: new Set() // Elements waiting to be observed
    }
    this.observerCleanupInterval = null

    // Memory leak prevention - track resources for cleanup
    this.activeTimers = new Set()
    this.eventListeners = new Map() // Track event listeners for cleanup
    this.isDestroyed = false
    
    // Unified timer manager for consolidated operations
    this.timerManager = {
      mainTimer: null,
      taskQueue: new Map(), // Tasks to run with their intervals
      lastRun: new Map(),   // Track when tasks last ran
      isRunning: false
    }
    
    // Lazy loading state management
    this.lazyLoadingState = {
      behavioralAnalysisSetup: false,
      scrollAnalysisSetup: false,
      interactionTrackingSetup: false,
      contentTrackingSetup: false,
      siteSpecificTrackingSetup: false,
      firstInteractionDetected: false,
      setupTimeout: null,
      scrollTrackingStarted: false
    }
    
    // Bind methods to preserve context
    this.destroy = this.destroy.bind(this)
    this.handlePageUnload = this.handlePageUnload.bind(this)
    
    // Set up automatic cleanup on page unload
    this.setupCleanupHandlers()

    this.init()
  }

  // ---------------- Brightness Controller ----------------
  initBrightnessController() {
    try {
      document.documentElement.classList.add('attention-trainer-brightness-transition')
      // Initialize at 100%
      this.setBrightness(100)
    } catch (e) {
      console.warn('Brightness controller init failed:', e)
    }
  }

  setBrightness(percent) {
    const clamped = Math.max(0, Math.min(100, Math.round(percent)))
    this.brightnessState.currentPercent = clamped
    document.documentElement.style.filter = `brightness(${clamped}%)`
  }

  updateBrightnessForTime(ms) {
    // Default curve: 0-3 min: 100 -> 80, 3-10 min: 80 -> 50, 10+ min: 50
    const mins = ms / 60000
    let target = 100
    if (mins <= 3) {
      // linear from 100 to 80
      target = 100 - (20 * (mins / 3))
    } else if (mins <= 10) {
      const t = (mins - 3) / 7
      target = 80 - (30 * t) // 80 -> 50
    } else {
      target = 50
    }
    this.setBrightness(target)
  }

  // ---------------- Distraction Time Tracking ----------------
  setupDistractionTracking() {
    // Build persistence key
    const domain = window.location.hostname
    const date = new Date().toISOString().split('T')[0]
    this.distractionState.persistenceKey = `distractionState_${domain}_${date}`

    // Restore prior state if exists
    this.restoreDistractionTime()

    // Scroll activity marker (passive)
    const onScroll = () => {
      this.distractionState.lastScrollTs = Date.now()
    }
    window.addEventListener('scroll', onScroll, { passive: true })

    // Media tracking
    this.trackMediaActivity()

    // Visibility handling - pause when hidden
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        this.distractionState.lastActiveTs = Date.now() // mark now to avoid jumps
      }
    })

    // Main 1s tick to accumulate active time, drive brightness and stage
    this.addTimerTask('distraction_tick', () => {
      try {
        const now = Date.now()
        const active = this.isDistractionActive(now)
        if (active) {
          this.distractionState.activeMs += 1000
          // Update brightness smoothly
          this.updateBrightnessForTime(this.distractionState.activeMs)
          // Stage computation and transitions
          this.evaluateTimeBasedStages(now)
        }
      } catch (e) {
        console.warn('Distraction tick error:', e)
      }
    }, 1000)

    // Persist every 10s
    this.addTimerTask('distraction_persist', () => {
      this.persistDistractionTime()
    }, 10000)
  }

  isDistractionActive(nowTs = Date.now()) {
    // Active if: recent scroll (within idle window) OR any media playing, and tab visible
    const cfg = this.getInterventionConfig()
    const scrollIdleMs = cfg?.idleDetection?.scrollIdleMs ?? 2000
    const visible = document.visibilityState === 'visible'
    const recentScroll = nowTs - (this.distractionState.lastScrollTs || 0) <= scrollIdleMs
    const media = !!this.distractionState.mediaPlaying
    return visible && (recentScroll || media)
  }

  trackMediaActivity() {
    const attach = (el) => {
      if (!el || el.__attentionTrainerBound) return
      el.__attentionTrainerBound = true
      const onPlay = () => { this.distractionState.mediaPlaying = true }
      const onPauseEnd = () => {
        // If no other media is playing, mark false
        this.distractionState.mediaPlaying = this.anyMediaPlaying()
      }
      el.addEventListener('play', onPlay)
      el.addEventListener('pause', onPauseEnd)
      el.addEventListener('ended', onPauseEnd)
    }

    // Existing media
    document.querySelectorAll('video, audio').forEach(attach)

    // Watch for dynamically added media
    const mo = new MutationObserver(muts => {
      for (const m of muts) {
        m.addedNodes && m.addedNodes.forEach(n => {
          if (n && n.nodeType === 1) {
            if (n.matches && (n.matches('video') || n.matches('audio'))) attach(n)
            n.querySelectorAll && n.querySelectorAll('video, audio').forEach(attach)
          }
        })
      }
    })
    mo.observe(document.documentElement || document.body, { childList: true, subtree: true })
    this.observers.push(mo)
  }

  anyMediaPlaying() {
    const els = document.querySelectorAll('video, audio')
    for (const el of els) { if (!el.paused && !el.ended) return true }
    return false
  }

  getInterventionConfig() {
    // Settings may include interventionConfig injected by background
    return this.settings?.interventionConfig || null
  }

  async persistDistractionTime() {
    try {
      const key = this.distractionState.persistenceKey
      if (!key || !chrome?.storage?.local) return
      await chrome.storage.local.set({ [key]: { activeMs: this.distractionState.activeMs, ts: Date.now() } })
    } catch (e) {
      console.warn('Persist distraction time failed:', e?.message || e)
    }
  }

  async restoreDistractionTime() {
    try {
      const key = this.distractionState.persistenceKey
      if (!key || !chrome?.storage?.local) return
      const data = await chrome.storage.local.get([key])
      const state = data?.[key]
      if (state && typeof state.activeMs === 'number') {
        this.distractionState.activeMs = state.activeMs
        // Apply brightness immediately to match restored time
        this.initBrightnessController()
        this.updateBrightnessForTime(this.distractionState.activeMs)
        // Also evaluate stage right away
        this.evaluateTimeBasedStages(Date.now(), true)
        
        console.log(`🔄 Restored distraction state: ${Math.round(state.activeMs / 60000)} minutes, brightness: ${this.brightnessState.currentPercent}%`)
      }
    } catch (e) {
      console.warn('Restore distraction time failed:', e?.message || e)
    }
  }

  evaluateTimeBasedStages(nowTs = Date.now(), force = false) {
    // Check if focus mode or snooze is active - exit early if so
    if (this.behaviorData.focusMode || 
        (this.behaviorData.snoozeUntil && nowTs < this.behaviorData.snoozeUntil)) {
      console.log('⏸️ Interventions blocked - focus mode or snooze active')
      return
    }

    const cfg = this.getInterventionConfig()
    const minutesCfg = cfg?.thresholdsMinutes || {
      stage1Start: 0,
      stage1To80End: 3,
      stage1To50End: 10,
      stage2Start: 10,
      stage3Start: 12,
      stage4Start: 15
    }
    const debounceMs = cfg?.debounceMs ?? 20000

    const ms = this.distractionState.activeMs
    let nextStage = 0
    if (ms >= minutesCfg.stage4Start * 60000) nextStage = 4
    else if (ms >= minutesCfg.stage3Start * 60000) nextStage = 3
    else if (ms >= minutesCfg.stage2Start * 60000) nextStage = 2
    else if (ms >= minutesCfg.stage1Start * 60000) nextStage = 1

    if (nextStage !== this.distractionState.stage) {
      const sinceLast = nowTs - (this.distractionState.lastStageChangeTs || 0)
      if (force || sinceLast >= debounceMs) {
        this.distractionState.stage = nextStage
        this.distractionState.lastStageChangeTs = nowTs
        if (nextStage > 0) {
          this.triggerIntervention(nextStage, this.settings.focusMode || 'gentle')
        }
      }
    }
  }

  /**
   * Set up automatic cleanup on page unload and extension context invalidation
   */
  setupCleanupHandlers() {
    // Handle page unload - clean up resources
    window.addEventListener('beforeunload', this.handlePageUnload)
    window.addEventListener('pagehide', this.handlePageUnload)
    
    // Handle visibility changes (tab switching, etc.)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        this.pauseTimers()
      } else if (document.visibilityState === 'visible' && !this.isDestroyed) {
        this.resumeTimers()
      }
    })
    
    // Set up periodic resource cleanup using unified timer
    this.addTimerTask('periodic_cleanup', () => {
      this.performPeriodicCleanup()
    }, 300000) // Clean up every 5 minutes
  }

  /**
   * Handle page unload event
   */
  handlePageUnload() {
    this.destroy()
  }

  /**
   * Add timer to tracking set for cleanup
   */
  addTimer(timerId) {
    if (!this.isDestroyed) {
      this.activeTimers.add(timerId)
    }
    return timerId
  }

  /**
   * Remove and clear a specific timer
   */
  removeTimer(timerId) {
    if (this.activeTimers.has(timerId)) {
      clearTimeout(timerId)
      clearInterval(timerId)
      this.activeTimers.delete(timerId)
    }
  }

  /**
   * Add event listener with automatic cleanup tracking
   */
  addEventListenerWithCleanup(element, event, handler, options = {}) {
    if (this.isDestroyed) {
      return
    }
    
    const boundHandler = handler.bind(this)
    element.addEventListener(event, boundHandler, options)
    
    // Track for cleanup
    if (!this.eventListeners.has(element)) {
      this.eventListeners.set(element, [])
    }
    this.eventListeners.get(element).push({
      event,
      handler: boundHandler,
      options
    })
  }

  /**
   * Pause all active timers (for tab visibility changes)
   */
  pauseTimers() {
    // Store timer states but don't clear them - they'll resume automatically
    this.timersPaused = true
  }

  /**
   * Resume timers after pause
   */
  resumeTimers() {
    this.timersPaused = false
    // Timers will automatically resume since they weren't cleared
  }

  /**
   * Perform periodic cleanup of resources
   */
  performPeriodicCleanup() {
    if (this.isDestroyed) {
      return
    }
    
    try {
      // Clean up old observed elements
      this.cleanupOldObservedElements()
      
      // Clean up stale event listeners for removed DOM elements
      for (const [element, listeners] of this.eventListeners.entries()) {
        if (!document.contains(element)) {
          this.cleanupElementListeners(element)
        }
      }
      
      console.log('🧹 Periodic cleanup completed')
    } catch (error) {
      console.warn('Error during periodic cleanup:', error)
    }
  }

  /**
   * Clean up event listeners for a specific element
   */
  cleanupElementListeners(element) {
    const listeners = this.eventListeners.get(element)
    if (listeners) {
      listeners.forEach(({ event, handler, options }) => {
        try {
          element.removeEventListener(event, handler, options)
        } catch (error) {
          // Ignore errors for already removed listeners
        }
      })
      this.eventListeners.delete(element)
    }
  }

  /**
   * Add a task to the unified timer manager
   */
  addTimerTask(taskName, taskFunction, intervalMs) {
    if (this.isDestroyed) {
      return
    }
    
    this.timerManager.taskQueue.set(taskName, {
      func: taskFunction,
      interval: intervalMs,
      enabled: true
    })
    
    this.timerManager.lastRun.set(taskName, 0) // Initialize last run time
    
    // Start the main timer if not already running
    this.startUnifiedTimer()
    
    console.log(`⏲️ Added timer task: ${taskName} (${intervalMs}ms)`)
  }
  
  /**
   * Remove a task from the unified timer manager
   */
  removeTimerTask(taskName) {
    this.timerManager.taskQueue.delete(taskName)
    this.timerManager.lastRun.delete(taskName)
    
    console.log(`🗑️ Removed timer task: ${taskName}`)
    
    // Stop main timer if no tasks remain
    if (this.timerManager.taskQueue.size === 0) {
      this.stopUnifiedTimer()
    }
  }
  
  /**
   * Start the unified timer that manages all periodic tasks
   */
  startUnifiedTimer() {
    if (this.timerManager.isRunning || this.isDestroyed) {
      return
    }
    
    this.timerManager.isRunning = true
    
    // Use a single timer that checks all tasks
    this.timerManager.mainTimer = this.addTimer(setInterval(() => {
      this.runScheduledTasks()
    }, 1000)) // Check every second for task scheduling
    
    console.log('🚀 Unified timer manager started')
  }
  
  /**
   * Stop the unified timer
   */
  stopUnifiedTimer() {
    if (this.timerManager.mainTimer) {
      this.removeTimer(this.timerManager.mainTimer)
      this.timerManager.mainTimer = null
    }
    
    this.timerManager.isRunning = false
    console.log('⏹️ Unified timer manager stopped')
  }
  
  /**
   * Run scheduled tasks based on their intervals
   */
  runScheduledTasks() {
    if (this.isDestroyed || this.timersPaused) {
      return
    }
    
    const now = Date.now()
    
    for (const [taskName, task] of this.timerManager.taskQueue.entries()) {
      if (!task.enabled) {
        continue
      }
      
      const lastRun = this.timerManager.lastRun.get(taskName) || 0
      const timeSinceLastRun = now - lastRun
      
      if (timeSinceLastRun >= task.interval) {
        try {
          // Use requestIdleCallback for non-critical tasks
          if (this.isNonCriticalTask(taskName) && window.requestIdleCallback) {
            window.requestIdleCallback(() => {
              if (!this.isDestroyed) {
                task.func()
              }
            }, { timeout: 2000 })
          } else {
            task.func()
          }
          
          this.timerManager.lastRun.set(taskName, now)
        } catch (error) {
          console.error(`Error running timer task ${taskName}:`, error)
          // Disable failed task to prevent repeated errors
          task.enabled = false
        }
      }
    }
  }
  
  /**
   * Determine if a task is non-critical and can be deferred
   */
  isNonCriticalTask(taskName) {
    const nonCriticalTasks = [
      'analytics_flush',
      'observer_cleanup',
      'periodic_cleanup'
    ]
    
    return nonCriticalTasks.some(pattern => taskName.includes(pattern))
  }

  /**
   * Comprehensive cleanup and resource disposal
   */
  destroy() {
    if (this.isDestroyed) {
      return
    }
    
    console.log('🧹 Destroying AttentionTrainerContent - cleaning up resources')
    this.isDestroyed = true
    
    // Clear all active timers
    for (const timerId of this.activeTimers) {
      try {
        clearTimeout(timerId)
        clearInterval(timerId)
      } catch (error) {
        // Ignore errors for already cleared timers
      }
    }
    this.activeTimers.clear()
    
    // Clean up all event listeners
    for (const [element, listeners] of this.eventListeners.entries()) {
      listeners.forEach(({ event, handler, options }) => {
        try {
          element.removeEventListener(event, handler, options)
        } catch (error) {
          // Ignore errors for already removed listeners
        }
      })
    }
    this.eventListeners.clear()
    
    // Clean up page-level event listeners
    try {
      window.removeEventListener('beforeunload', this.handlePageUnload)
      window.removeEventListener('pagehide', this.handlePageUnload)
    } catch (error) {
      // Ignore errors
    }
    
    // Clean up observers
    this.cleanupObservers()
    
    // Clear intervention overlay
    if (this.interventionOverlay && this.interventionOverlay.parentElement) {
      this.interventionOverlay.remove()
    }
    
    // Clear analytics queue
    this.analyticsQueue = []
    
    // Save final state to fallback storage if available
    try {
      this.saveBehaviorDataToFallback()
    } catch (error) {
      console.warn('Failed to save final state to fallback storage:', error)
    }
    
    // Clear references to help with garbage collection
    this.connectionManager = null
    this.errorHandler = null
    this.fallbackStorage = null
    this.observers = []
    this.observerPool = {
      contentViewing: null,
      observers: new Map(),
      pendingElements: new Set()
    }
    
    console.log('✅ AttentionTrainerContent cleanup completed')
  }

  async init () {
    try {
      // Initialize shared modules first
      await this.initializeSharedModules()

      await this.loadSettings()
      this.setupBehavioralAnalysis()
      this.setupMessageListener()
      this.createInterventionElements()
      this.initBrightnessController()
      this.setupDistractionTracking()
      this.startBehaviorTracking()

      console.log(`🎯 Attention Trainer initialized for ${this.sitePatterns.type} site`)
    } catch (error) {
      if (this.errorHandler) {
        this.errorHandler.handleError(error, { context: 'content_init' })
      } else {
        console.error('Failed to initialize Attention Trainer:', error)
      }
    }
  }

  /**
   * Initialize shared modules with fallback handling
   */
  async initializeSharedModules () {
    const maxWaitTime = 5000 // 5 seconds max wait
    const startTime = Date.now()

    try {
      // Wait for shared modules to be available with timeout
      while (!window.SharedModules && (Date.now() - startTime) < maxWaitTime) {
        await new Promise(resolve => setTimeout(resolve, 100))
      }

      if (typeof window.SharedModules !== 'undefined') {
        console.log('🔗 Connecting to shared modules...')

        // Get modules with timeout
        const modulePromise = window.SharedModules.getModules()
        const timeoutPromise = new Promise((_resolve, reject) =>
          setTimeout(() => reject(new Error('Module initialization timeout')), 3000)
        )

        const modules = await Promise.race([modulePromise, timeoutPromise])

        this.errorHandler = modules.errorHandler
        this.connectionManager = modules.connectionManager
        this.fallbackStorage = modules.fallbackStorage

        // Log module status
        const status = window.SharedModules.getStatus()
        console.log('📊 Shared module status:', status)

        // Set up connection change handlers
        if (this.connectionManager) {
          this.connectionManager.onConnectionChange = (connected) => {
            this.backgroundConnected = connected
            this.contextValid = this.connectionManager.contextValid
            console.log(`📡 Connection state changed: ${connected ? 'connected' : 'disconnected'}`)
          }

          this.connectionManager.onContextInvalid = (isReload) => {
            this.handleContextInvalidation(isReload)
          }
        }

        console.log('✅ Shared modules initialized in content script')
        return true
      } else {
        console.warn('⚠️ Shared modules not available after timeout, using legacy mode')
        return false
      }
    } catch (error) {
      console.error('Failed to initialize shared modules:', error)

      // Log the error if error handler is available
      if (this.errorHandler) {
        this.errorHandler.handleError(error, { context: 'content_shared_modules_init' })
      }

      return false
    }
  }

  /**
   * Handle extension context invalidation
   */
  handleContextInvalidation (isReload = false) {
    if (isReload) {
      console.info('🔄 Extension context temporarily invalid (likely during reload)')
    } else {
      console.warn('🚨 Extension context invalidated in content script')
    }

    this.contextValid = false
    this.backgroundConnected = false

    // For reloads, be more gentle with cleanup
    if (!isReload) {
      // Clean up observers and event listeners only for true invalidation
      this.cleanupObservers()
    }

    // Switch to fallback storage if available
    if (this.fallbackStorage) {
      try {
        this.saveBehaviorDataToFallback()
      } catch (error) {
        console.warn('Failed to save to fallback storage:', error)
      }
    }

    // Show user-friendly notification based on context
    if (this.errorHandler && !isReload) {
      // Only show notification for true context invalidation, not reloads
      this.errorHandler.showErrorNotification(
        'Extension was updated or disabled. Please refresh this page to restore full functionality.',
        { type: 'warning', duration: 8000 }
      )
    } else if (isReload) {
      // For reloads, show a less alarming message
      this.showReloadNotification()
    }
  }

  /**
   * Show a gentle notification for extension reloads
   */
  showReloadNotification () {
    // Create a less intrusive notification for reloads
    const notification = document.createElement('div')
    notification.style.cssText = `
      position: fixed; top: 20px; right: 20px; 
      background: rgba(59, 130, 246, 0.9); 
      color: white; padding: 12px 16px; 
      border-radius: 8px; z-index: 999999;
      font-size: 14px; font-family: system-ui, sans-serif;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      max-width: 300px; line-height: 1.4;
    `
    notification.innerHTML = `
      <div style="display: flex; align-items: center; gap: 8px;">
        <span style="font-size: 16px;">🔄</span>
        <div>
          <div style="font-weight: 500;">Extension reloaded</div>
          <div style="font-size: 12px; opacity: 0.9;">Functionality will resume shortly</div>
        </div>
      </div>
    `
    document.body.appendChild(notification)

    // Auto-remove after 3 seconds
    setTimeout(() => {
      if (notification.parentElement) {
        notification.remove()
      }
    }, 3000)
  }

  /**
   * Clean up observers and event listeners
   */
  cleanupObservers () {
    this.observers.forEach(observer => {
      try {
        observer.disconnect()
      } catch (error) {
        console.warn('Error disconnecting observer:', error)
      }
    })
    this.observers = []
    
    // Clean up observer pool
    this.cleanupObserverPool()
  }

  /**
   * Clean up observer pool completely
   */
  cleanupObserverPool() {
    if (this.observerPool.contentViewing) {
      try {
        this.observerPool.contentViewing.disconnect()
      } catch (error) {
        console.warn('Error disconnecting pooled observer:', error)
      }
      this.observerPool.contentViewing = null
    }
    
    this.observerPool.observers.clear()
    this.observerPool.pendingElements.clear()
    
    if (this.observerCleanupInterval) {
      clearTimeout(this.observerCleanupInterval)
      this.observerCleanupInterval = null
    }
  }

  /**
   * Save current behavioral data to fallback storage
   */
  async saveBehaviorDataToFallback () {
    if (!this.fallbackStorage) {
      return
    }

    try {
      const domain = window.location.hostname
      const date = new Date().toISOString().split('T')[0]

      await this.fallbackStorage.storeAnalytics(domain, date, {
        timeOnPage: this.behaviorData.totalTimeOnPage / (1000 * 60),
        behaviorScore: this.behaviorScore,
        siteType: this.sitePatterns.type,
        flags: this.behaviorData.flags || {},
        contentPieces: this.behaviorData.contentPieces || 0,
        scrollPauses: this.behaviorData.scrollPauseCount || 0,
        interventionStage: this.behaviorData.interventionStage,
        sessionEnd: Date.now()
      })

      console.log('💾 Behavioral data saved to fallback storage')
    } catch (error) {
      console.error('Failed to save to fallback storage:', error)
    }
  }

  async loadSettings () {
    try {
      // Use connection manager if available, otherwise fallback to direct messaging
      if (this.connectionManager && this.connectionManager.contextValid) {
        const response = await this.connectionManager.sendMessage({ type: 'GET_SETTINGS' })
        this.settings = response || { isEnabled: true, focusMode: 'gentle' }
        this.backgroundConnected = this.connectionManager.isConnected
        console.log('✅ Settings loaded via connection manager')
        return
      }
    } catch (error) {
      console.warn('Connection manager failed, trying direct messaging:', error.message)
    }

    // Fallback to legacy direct messaging
    const maxRetries = 3
    let retries = 0

    while (retries < maxRetries) {
      try {
        // Basic context validation
        if (!chrome?.runtime?.id) {
          throw new Error('Extension context not available')
        }

        // Add a small delay between retries
        if (retries > 0) {
          await new Promise(resolve => setTimeout(resolve, 1000 * retries))
        }

        const response = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' })
        this.settings = response || { isEnabled: true, focusMode: 'gentle' }
        this.backgroundConnected = true
        console.log('✅ Settings loaded via direct messaging')
        return
      } catch (error) {
        retries++

        // Handle extension context invalidation specifically
        if (error.message.includes('Extension context') ||
            error.message.includes('receiving end does not exist') ||
            error.message.includes('message port closed')) {
          console.warn('🚨 Extension context invalidated during settings load')
          this.contextValid = false
          this.settings = { isEnabled: false }
          return
        }

        console.warn(`⚠️ Failed to load settings (attempt ${retries}/${maxRetries}):`, error.message)

        if (retries >= maxRetries) {
          console.warn('🔌 Background service unavailable, using fallback settings')
          this.backgroundConnected = false
          // Fallback settings for standalone mode
          this.settings = {
            isEnabled: true,
            focusMode: 'gentle',
            thresholds: { stage1: 30, stage2: 60, stage3: 120, stage4: 180 },
            whitelist: [] // Empty whitelist in standalone mode
          }
        }
      }
    }
  }

  // Old scroll monitoring system removed - replaced with behavioral analysis

  setupMessageListener () {
    if (!this.contextValid) {
      return
    }

    chrome.runtime.onMessage.addListener((message, _sender, _sendResponse) => {
      // Validate extension context on each message
      try {
        if (!chrome.runtime.id) {
          console.warn('Extension context invalidated in message listener')
          return
        }
      } catch (error) {
        console.warn('Extension context check failed:', error.message)
        return
      }

      switch (message.type) {
        case 'TRIGGER_INTERVENTION':
          this.triggerIntervention(message.stage, message.focusMode)
          break
        case 'RESET_BEHAVIORAL_DATA':
          this.resetBehaviorData()
          break
      }
    })
  }

  createInterventionElements () {
    this.interventionOverlay = document.createElement('div')
    this.interventionOverlay.className = 'attention-trainer-overlay'
    this.interventionOverlay.style.display = 'none'
    document.body.appendChild(this.interventionOverlay)
  }

  triggerIntervention (stage, focusMode) {
    try {
      // Check extension context validity
      if (!this.contextValid) {
        console.warn('Extension context invalid, skipping intervention')
        return
      }

      if (stage === this.behaviorData.interventionStage) {
        return
      }

      this.behaviorData.interventionStage = stage
      this.scrollData.interventionStage = stage // Keep both in sync

      // Log intervention to background with context validation
      if (this.backgroundConnected) {
        try {
          if (chrome.runtime.id) {
            chrome.runtime.sendMessage({
              type: 'INTERVENTION_TRIGGERED',
              data: { stage, timestamp: Date.now() }
            }).catch(error => {
              if (error.message.includes('Extension context invalidated')) {
                console.warn('Extension context invalidated during intervention logging')
                this.contextValid = false
              } else {
                console.log('Failed to log intervention:', error.message)
              }
            })
          }
        } catch (error) {
          console.warn('Runtime check failed during intervention logging:', error.message)
        }
      }

      // Clear any existing intervention effects first
      this.clearIntervention(false)

      console.log(`🎯 Triggering intervention stage ${stage}`)

      switch (stage) {
        case 1:
          this.applyEnhancedDimming()
          this.showScrollProgress()
          break
        case 2:
          this.applyProgressiveBlur()
          this.addGentleShake()
          break
        case 3:
          this.showEnhancedNudgeMessage()
          break
        case 4:
          if (focusMode === 'strict') {
            this.applyBreathingReminder()
          } else {
            this.showFinalWarning()
          }
          break
        default:
          console.warn('Unknown intervention stage:', stage)
      }
    } catch (error) {
      console.error('Error triggering intervention:', error)
    }
  }

  applyDimming () {
    document.body.style.transition = 'opacity 0.5s ease'
    document.body.style.opacity = '0.8'
  }

  applyBlur () {
    const nonInteractiveElements = document.querySelectorAll('p, span, div:not([role]), img, video')
    nonInteractiveElements.forEach((el) => {
      el.style.transition = 'filter 0.5s ease'
      el.style.filter = 'blur(1px)'
    })
  }

  showNudgeMessage () {
    const messages = [
      '🎯 Take a breath. What were you looking for?',
      "⏰ You've been scrolling for a while. Time for a break?",
      '🧠 Your future self will thank you for focusing now.',
      '✨ Great things happen when you stay focused!',
      '🎨 What could you create with this time instead?'
    ]

    const randomMessage = messages[Math.floor(Math.random() * messages.length)]

    this.interventionOverlay.innerHTML = `
      <div class="attention-trainer-nudge">
        <div class="nudge-content">
          <h3>${randomMessage}</h3>
          <div class="nudge-actions">
            <button class="continue-btn">Continue Browsing</button>
            <button class="focus-btn">Start Focus Session</button>
          </div>
        </div>
      </div>
    `

    this.interventionOverlay.style.display = 'flex'

    this.interventionOverlay.querySelector('.continue-btn').addEventListener('click', () => {
      this.clearIntervention()
    })

    this.interventionOverlay.querySelector('.focus-btn').addEventListener('click', () => {
      this.startFocusSession()
    })
  }

  applyScrollLock () {
    document.body.style.overflow = 'hidden'

    setTimeout(() => {
      document.body.style.overflow = ''
      this.clearIntervention()
    }, 5000)
  }

  // Enhanced Stage 1: Progressive dimming with pulse
  applyEnhancedDimming () {
    // Use brightness-based dimming instead of opacity pulse
    document.body.classList.add('attention-trainer-dim')
    // Brightness will be controlled globally; keep a subtle pulse if desired
    // document.body.classList.add('attention-trainer-pulse')
    console.log('📉 Applied enhanced dimming (brightness-based)')
  }

  // Show scroll progress indicator
  showScrollProgress () {
    let progressBar = document.getElementById('attention-trainer-progress')
    if (!progressBar) {
      progressBar = document.createElement('div')
      progressBar.id = 'attention-trainer-progress'
      progressBar.className = 'scroll-progress'
      document.body.appendChild(progressBar)
    }

    const activeScrollTime = this.distractionState.activeMs / 1000 // Convert to seconds
    const maxTime = 15 // 15 seconds for full progress
    const progress = Math.min((activeScrollTime / maxTime) * 100, 100)
    progressBar.style.width = `${progress}%`
  }

  // Enhanced Stage 2: Progressive blur with gentle shake
  applyProgressiveBlur () {
    const elements = document.querySelectorAll('p, span, div:not([class*="attention-trainer"]), img, video, article, section')
    elements.forEach(el => {
      el.classList.add('attention-trainer-blur')
      // Use class-based blur only; do not set brightness here to avoid stacking
      el.style.filter = ''
      // Allow tuning via CSS variable
      el.style.setProperty('--stage2-blur', `${this.getInterventionConfig()?.blur?.stage2Px ?? 0.75}px`)
    })
    console.log('😵‍💫 Applied progressive blur (reduced intensity)')
  }

  addGentleShake () {
    document.body.classList.add('attention-trainer-shake')
    setTimeout(() => {
      document.body.classList.remove('attention-trainer-shake')
    }, 1500)
  }

  // Enhanced Stage 3: Rich nudge message with stats
  showEnhancedNudgeMessage () {
    const messages = [
      { icon: '🎯', title: 'Take a mindful pause', subtitle: 'What were you looking for?' },
      { icon: '⏰', title: 'Time awareness check', subtitle: 'You\'ve been scrolling for a while' },
      { icon: '🧠', title: 'Focus opportunity', subtitle: 'Your future self will thank you' },
      { icon: '✨', title: 'Intentional browsing', subtitle: 'Great things happen when you stay focused' },
      { icon: '🌱', title: 'Growth moment', subtitle: 'What could you create with this time?' }
    ]

    const selectedMessage = messages[Math.floor(Math.random() * messages.length)]
    const activeScrollTime = Math.round(this.distractionState.activeMs / 1000) // Convert to seconds
    const scrollDistance = Math.round(this.scrollData.scrollDistance / 100) // Convert to rough screen heights

    this.interventionOverlay.innerHTML = `
      <div class="attention-trainer-nudge">
        <div class="nudge-content">
          <span class="nudge-icon">${selectedMessage.icon}</span>
          <h3>${selectedMessage.title}</h3>
          <p class="nudge-subtitle">${selectedMessage.subtitle}</p>
          
          <div class="nudge-stats">
            <div class="stat-item">
              <div class="stat-value">${activeScrollTime}s</div>
              <div class="stat-label">Active Time</div>
            </div>
            <div class="stat-item">
              <div class="stat-value">${scrollDistance}</div>
              <div class="stat-label">Screens</div>
            </div>
            <div class="stat-item">
              <div class="stat-value">${this.scrollData.interventionStage}</div>
              <div class="stat-label">Stage</div>
            </div>
          </div>
          
          <div class="nudge-actions">
            <button class="continue-btn">Continue Browsing</button>
            <button class="focus-btn">✨ Start Focus Mode</button>
          </div>
        </div>
      </div>
    `

    this.interventionOverlay.style.display = 'flex'

    // Add enhanced event listeners
    const continueBtn = this.interventionOverlay.querySelector('.continue-btn')
    const focusBtn = this.interventionOverlay.querySelector('.focus-btn')

    continueBtn.addEventListener('click', () => {
      this.clearIntervention()
      this.snoozeIntervention(30) // Snooze for 30 seconds
    })

    focusBtn.addEventListener('click', () => {
      this.startEnhancedFocusSession()
    })

    console.log('💬 Showed enhanced nudge message')
  }

  // Enhanced Stage 4: Breathing reminder or final warning
  applyBreathingReminder () {
    const breathingOverlay = document.createElement('div')
    breathingOverlay.className = 'breathing-reminder'
    breathingOverlay.innerHTML = `
      <div style="font-size: 24px; margin-bottom: 16px;">🫁</div>
      <h3>Take a deep breath</h3>
      <p>Inhale... Hold... Exhale...</p>
      <div style="margin-top: 20px;">
        <button onclick="this.parentElement.parentElement.remove(); this.clearIntervention();" 
                style="padding: 12px 24px; background: #3b82f6; color: white; border: none; border-radius: 8px; cursor: pointer;">
          I'm ready to focus
        </button>
      </div>
    `
    document.body.appendChild(breathingOverlay)

    // Auto-remove after 10 seconds
    setTimeout(() => {
      if (breathingOverlay.parentElement) {
        breathingOverlay.remove()
        this.clearIntervention()
      }
    }, 10000)

    console.log('🫁 Applied breathing reminder')
  }

  showFinalWarning () {
    const activeScrollTime = Math.round(this.distractionState.activeMs / 1000) // Convert to seconds
    
    this.interventionOverlay.innerHTML = `
      <div class="attention-trainer-nudge" style="border: 3px solid #ef4444;">
        <div class="nudge-content">
          <span class="nudge-icon">⚠️</span>
          <h3 style="color: #ef4444;">Attention overload detected</h3>
          <p class="nudge-subtitle">You've been actively scrolling for ${activeScrollTime} seconds straight</p>
          
          <div class="nudge-actions">
            <button class="continue-btn">Take a 5-min break</button>
            <button class="focus-btn">🚀 Focus Mode Now</button>
          </div>
        </div>
      </div>
    `

    this.interventionOverlay.style.display = 'flex'

    const breakBtn = this.interventionOverlay.querySelector('.continue-btn')
    const focusBtn = this.interventionOverlay.querySelector('.focus-btn')

    breakBtn.addEventListener('click', () => {
      this.startBreakMode()
    })

    focusBtn.addEventListener('click', () => {
      this.startEnhancedFocusSession()
    })

    console.log('⚠️ Showed final warning')
  }

  // Helper methods
  getScrollTime () {
    const timeOnPage = (Date.now() - this.behaviorData.sessionStart) / 1000
    return Math.min(timeOnPage, 300) // Cap at 5 minutes for display purposes
  }

  snoozeIntervention (seconds) {
    this.behaviorData.snoozeUntil = Date.now() + (seconds * 1000)
    this.scrollData.snoozeUntil = Date.now() + (seconds * 1000) // Keep both in sync
    console.log(`😴 Snoozed interventions for ${seconds} seconds`)
  }

  startEnhancedFocusSession () {
    this.clearIntervention()
    this.behaviorData.focusMode = true
    this.scrollData.focusMode = true // Keep both in sync
    this.behaviorData.focusStartTime = Date.now()

    // Show focus mode notification
    const notification = document.createElement('div')
    notification.style.cssText = `
      position: fixed; top: 20px; right: 20px; 
      background: linear-gradient(135deg, #10b981, #059669); 
      color: white; padding: 16px 24px; 
      border-radius: 12px; z-index: 999999;
      box-shadow: 0 8px 25px rgba(16, 185, 129, 0.3);
      animation: slideInRight 0.3s ease;
    `
    notification.innerHTML = `
      <div style="display: flex; align-items: center; gap: 12px;">
        <span style="font-size: 20px;">🚀</span>
        <div>
          <div style="font-weight: 600;">Focus Mode Active</div>
          <div style="font-size: 12px; opacity: 0.9;">Interventions paused for 25 minutes</div>
        </div>
      </div>
    `
    document.body.appendChild(notification)

    setTimeout(() => notification.remove(), 4000)

    // Disable interventions for 25 minutes
    setTimeout(() => {
      this.behaviorData.focusMode = false
      this.scrollData.focusMode = false // Keep both in sync
      console.log('🏁 Focus session ended')
    }, 25 * 60 * 1000)

    console.log('🚀 Started enhanced focus session')
  }

  startBreakMode () {
    this.clearIntervention()
    window.open('https://www.calm.com/breathe', '_blank')
    console.log('☕ Started break mode')
  }

  clearIntervention (resetStage = true) {
    if (resetStage) {
      this.behaviorData.interventionStage = 0
      this.scrollData.interventionStage = 0 // Keep both in sync
      // Reset time-based stage as well
      this.distractionState.stage = 0
    }

    // Remove all intervention classes and effects
    document.body.classList.remove('attention-trainer-dim', 'attention-trainer-pulse', 'attention-trainer-shake')
    document.body.style.opacity = ''
    document.body.style.overflow = ''

    // Reset global brightness
    try {
      document.documentElement.style.filter = ''
      document.documentElement.classList.remove('attention-trainer-brightness-transition')
      // Reapply transition class after a tick for future use
      setTimeout(() => document.documentElement.classList.add('attention-trainer-brightness-transition'), 0)
    } catch {}

    // Remove blur effects
    const blurredElements = document.querySelectorAll('.attention-trainer-blur')
    blurredElements.forEach(el => {
      el.classList.remove('attention-trainer-blur')
      el.style.filter = ''
      el.style.removeProperty('--stage2-blur')
    })

    // Remove progress bar
    const progressBar = document.getElementById('attention-trainer-progress')
    if (progressBar) {
      progressBar.remove()
    }

    // Hide overlay
    if (this.interventionOverlay) {
      this.interventionOverlay.style.display = 'none'
    }

    // Remove breathing reminder if exists
    const breathingReminder = document.querySelector('.breathing-reminder')
    if (breathingReminder) {
      breathingReminder.remove()
    }
  }

  startFocusSession () {
    this.clearIntervention()
    alert('Focus session started! Extension will be less intrusive for the next 25 minutes.')
  }

  // Advanced behavioral analysis system
  detectSitePattern () {
    const hostname = window.location.hostname.toLowerCase()
    const _pathname = window.location.pathname.toLowerCase()

    const patterns = {
      // Social media platforms
      'youtube.com': {
        type: 'video',
        selectors: {
          content: '#contents, ytd-rich-grid-renderer',
          videos: 'ytd-video-renderer, ytd-rich-item-renderer',
          infinite: 'ytd-continuation-item-renderer'
        },
        triggers: ['video_end', 'rapid_skip', 'homepage_scroll'],
        thresholds: { time: 45, interactions: 8, videos: 3 }
      },
      'instagram.com': {
        type: 'social',
        selectors: {
          content: 'main[role="main"], [role="main"]',
          posts: 'article',
          infinite: '[data-testid="loader"]'
        },
        triggers: ['rapid_scroll', 'story_binge', 'like_spam'],
        thresholds: { time: 30, interactions: 12, posts: 5 }
      },
      'tiktok.com': {
        type: 'shortform',
        selectors: {
          content: '[data-e2e="recommend-list-container"]',
          videos: '[data-e2e="recommend-list-item-container"]',
          infinite: '.tiktok-loading'
        },
        triggers: ['rapid_swipe', 'video_binge', 'endless_feed'],
        thresholds: { time: 20, interactions: 15, videos: 8 }
      },
      'twitter.com': {
        type: 'microblog',
        selectors: {
          content: 'main[role="main"]',
          posts: '[data-testid="tweet"]',
          infinite: '[data-testid="loader"]'
        },
        triggers: ['infinite_scroll', 'engagement_spiral', 'news_doom'],
        thresholds: { time: 35, interactions: 10, posts: 8 }
      },
      'x.com': { // Twitter rebrand
        type: 'microblog',
        selectors: {
          content: 'main[role="main"]',
          posts: '[data-testid="tweet"]',
          infinite: '[data-testid="loader"]'
        },
        triggers: ['infinite_scroll', 'engagement_spiral', 'news_doom'],
        thresholds: { time: 35, interactions: 10, posts: 8 }
      },
      'reddit.com': {
        type: 'forum',
        selectors: {
          content: '[data-testid="post-container"], .Post',
          posts: '[data-testid="post-container"] > div, .Post',
          infinite: '.loading, [data-testid="loader"]'
        },
        triggers: ['thread_dive', 'subreddit_hop', 'comment_spiral'],
        thresholds: { time: 40, interactions: 8, posts: 6 }
      },
      'facebook.com': {
        type: 'social',
        selectors: {
          content: '[role="feed"], [data-pagelet="FeedUnit"]',
          posts: '[data-pagelet="FeedUnit_"]',
          infinite: '[data-testid="loading_indicator"]'
        },
        triggers: ['feed_scroll', 'notification_chase', 'social_validation'],
        thresholds: { time: 35, interactions: 10, posts: 6 }
      },
      'linkedin.com': {
        type: 'professional',
        selectors: {
          content: '.feed-container, main',
          posts: '.feed-shared-update-v2',
          infinite: '.artdeco-spinner'
        },
        triggers: ['network_fomo', 'content_consumption', 'job_anxiety'],
        thresholds: { time: 25, interactions: 6, posts: 4 }
      }
    }

    // Find matching pattern
    for (const [domain, pattern] of Object.entries(patterns)) {
      if (hostname.includes(domain.split('.')[0])) {
        console.log(`🎯 Detected ${pattern.type} site: ${domain}`)
        return pattern
      }
    }

    // Default pattern for other sites
    return {
      type: 'general',
      selectors: {
        content: 'main, [role="main"], #main, .main-content',
        posts: 'article, .post, .item',
        infinite: '.loading, .spinner, [class*="load"]'
      },
      triggers: ['excessive_scroll', 'time_spent', 'aimless_browse'],
      thresholds: { time: 60, interactions: 15, posts: 10 }
    }
  }

  /**
   * Setup behavioral analysis with lazy loading for better performance
   */
  setupBehavioralAnalysis() {
    if (this.lazyLoadingState.behavioralAnalysisSetup) {
      return // Already setup
    }
    
    this.lazyLoadingState.behavioralAnalysisSetup = true
    
    // Setup critical components immediately
    this.setupTimeTracking() // Time tracking is essential
    
    // Setup lightweight first-interaction detection
    this.setupFirstInteractionDetection()
    
    // Schedule lazy initialization after a delay
    this.lazyLoadingState.setupTimeout = this.addTimer(setTimeout(() => {
      this.initializeRemainingAnalysis()
    }, 2000)) // Wait 2 seconds before full setup
    
    console.log('🧠 Behavioral analysis initialized with lazy loading')
  }
  
  /**
   * Setup lightweight first-interaction detection
   */
  setupFirstInteractionDetection() {
    const handleFirstInteraction = () => {
      if (this.lazyLoadingState.firstInteractionDetected || this.isDestroyed) {
        return
      }
      
      this.lazyLoadingState.firstInteractionDetected = true
      console.log('👆 First interaction detected, activating full analysis')
      
      // Immediately setup full analysis on first interaction
      if (window.requestIdleCallback) {
        window.requestIdleCallback(() => this.initializeRemainingAnalysis(), { timeout: 1000 })
      } else {
        setTimeout(() => this.initializeRemainingAnalysis(), 50)
      }
    }
    
    // Use passive listeners for better performance
    const events = ['scroll', 'click', 'keydown', 'touchstart', 'mousemove']
    events.forEach(event => {
      document.addEventListener(event, handleFirstInteraction, { 
        passive: true, 
        once: true // Only fire once
      })
    })
  }
  
  /**
   * Initialize remaining analysis components lazily
   */
  initializeRemainingAnalysis() {
    if (this.isDestroyed) {
      return
    }
    
    try {
      // Setup remaining components
      if (!this.lazyLoadingState.scrollAnalysisSetup) {
        this.setupScrollAnalysisLazy()
        this.lazyLoadingState.scrollAnalysisSetup = true
      }
      
      if (!this.lazyLoadingState.interactionTrackingSetup) {
        this.setupInteractionTrackingLazy()
        this.lazyLoadingState.interactionTrackingSetup = true
      }
      
      if (!this.lazyLoadingState.contentTrackingSetup) {
        this.setupContentConsumptionTrackingLazy()
        this.lazyLoadingState.contentTrackingSetup = true
      }
      
      if (!this.lazyLoadingState.siteSpecificTrackingSetup) {
        this.setupSiteSpecificTrackingLazy()
        this.lazyLoadingState.siteSpecificTrackingSetup = true
      }
      
      console.log('🚀 Full behavioral analysis activated')
    } catch (error) {
      console.error('Error initializing remaining analysis:', error)
    }
  }

  setupScrollAnalysis () {
    let lastScrollY = window.scrollY
    const scrollVelocity = []
    const scrollDirection = []
    let _rapidScrollCount = 0
    let scrollTicking = false
    let pendingScrollData = null
    let lastAnalysisTime = 0
    const SCROLL_ANALYSIS_DEBOUNCE = 100; // Debounce time in ms
    const SCROLL_ANALYSIS_THROTTLE = 250; // Min time between full analyses

    // Lightweight scroll data collector - runs on every scroll event
    const collectScrollData = () => {
      const currentY = window.scrollY
      const velocity = Math.abs(currentY - lastScrollY)
      const direction = currentY > lastScrollY ? 'down' : 'up'
      
      // Mark scrolling as started on first actual scroll
      if (!this.behaviorData.scrollingStarted && velocity > 5) {
        this.behaviorData.scrollingStarted = true
        this.behaviorData.actualScrollStartTime = Date.now()
        console.log('🔄 Scrolling detected, starting behavioral analysis')
      }
      
      pendingScrollData = {
        velocity,
        direction,
        y: currentY,
        timestamp: Date.now()
      }
      
      // Only request animation frame if not already pending
      if (!scrollTicking) {
        scrollTicking = true
        requestAnimationFrame(processScrollData)
      }

      lastScrollY = currentY
    }

    // Process collected scroll data in animation frame - lightweight calculations only
    const processScrollData = () => {
      scrollTicking = false
      
      if (!pendingScrollData || !this.settings.isEnabled || this.behaviorData.focusMode) {
        return
      }
      
      const { velocity, direction, y, timestamp } = pendingScrollData
      
      // Maintain scroll history
      scrollVelocity.push(velocity)
      scrollDirection.push(direction)

      // Keep only last 10 samples
      if (scrollVelocity.length > 10) {
        scrollVelocity.shift()
      }
      if (scrollDirection.length > 10) {
        scrollDirection.shift()
      }
      
      // Schedule detailed analysis if enough time has passed
      const timeSinceLastAnalysis = timestamp - lastAnalysisTime
      if (timeSinceLastAnalysis > SCROLL_ANALYSIS_THROTTLE) {
        lastAnalysisTime = timestamp
        // Use requestIdleCallback for non-critical analysis
        if (window.requestIdleCallback) {
          window.requestIdleCallback(() => analyzeScrollDetailed(), { timeout: 1000 })
        } else {
          setTimeout(() => analyzeScrollDetailed(), 10)
        }
      }
    }

    // Detailed scroll analysis - runs less frequently
    const analyzeScrollDetailed = () => {
      if (!this.settings.isEnabled || this.behaviorData.focusMode) {
        return
      }

      // Scroll pause detection (indicative of reading)
      const lastVelocity = scrollVelocity[scrollVelocity.length - 1] || 0
      if (lastVelocity < 10) {
        this.behaviorData.scrollPauseCount = (this.behaviorData.scrollPauseCount || 0) + 1
      } else {
        this.behaviorData.scrollPauseCount = 0 // Reset on movement
      }

      // Detect rapid scrolling
      if (scrollVelocity.length > 3) {
        const avgVelocity = scrollVelocity.reduce((a, b) => a + b, 0) / scrollVelocity.length
        if (avgVelocity > 100) {
          _rapidScrollCount++
          this.behaviorData.rapidScrollCount++
        }

        // Detect back-and-forth behavior
        const directionChanges = scrollDirection.reduce((count, dir, i) => {
          return i > 0 && dir !== scrollDirection[i - 1] ? count + 1 : count
        }, 0)

        if (directionChanges > 6) {
          this.behaviorData.backAndForthCount++
          this.addBehaviorFlag('erratic_scrolling')
        }

        // Schedule score update on next idle period
        if (window.requestIdleCallback) {
          window.requestIdleCallback(() => this.updateBehaviorScore(), { timeout: 2000 })
        } else {
          setTimeout(() => this.updateBehaviorScore(), 500)
        }
      }
    }

    // Use passive event listener for better scroll performance
    window.addEventListener('scroll', collectScrollData, { passive: true })
  }

  setupTimeTracking () {
    // Track time spent on page using unified timer system
    this.addTimerTask('time_tracking', () => {
      if (!this.settings.isEnabled || this.isDestroyed) {
        return
      }

      // Only start tracking time after scrolling has started
      if (!this.behaviorData.scrollingStarted) {
        return // Don't track time or update scores until scrolling begins
      }

      // Calculate actual time spent since scrolling started
      const actualStartTime = this.behaviorData.actualScrollStartTime || this.behaviorData.sessionStart
      this.behaviorData.totalTimeOnPage = Date.now() - actualStartTime

      // Only flag excessive time if user is actually scrolling
      const minutes = this.behaviorData.totalTimeOnPage / (1000 * 60)
      if (minutes > this.sitePatterns.thresholds.time / 60) {
        this.addBehaviorFlag('excessive_time')
      }

      // Track passive consumption time only during active sessions
      if (!this.behaviorData.lastInteractionTime ||
          (Date.now() - this.behaviorData.lastInteractionTime) > 10000) { // 10s idle
        this.behaviorData.passiveConsumptionTime += 10
      }

      this.updateBehaviorScore()
    }, 10000) // Check every 10 seconds
  }

  setupInteractionTracking () {
    let _clickCount = 0
    let _keyCount = 0
    let lastInteractionTime = Date.now()

    const trackInteraction = (type, event) => {
      if (!this.settings.isEnabled) {
        return
      }

      const now = Date.now()
      const timeSinceLastInteraction = now - lastInteractionTime

      if (type === 'click') {
        _clickCount++
      }
      if (type === 'key') {
        _keyCount++
      }

      // Detect rapid interactions (possible mindless clicking)
      if (timeSinceLastInteraction < 500) {
        this.addBehaviorFlag('rapid_interaction')
      }

      // Differentiate between productive and unproductive interactions
      if (event && event.target) {
        const targetElement = event.target
        if (targetElement.matches('a, button, input, textarea, [role="button"]')) {
          this.addBehaviorFlag('productive_interaction')
        } else {
          this.addBehaviorFlag('passive_interaction')
        }
      }

      // Update last interaction time for passive consumption tracking
      this.behaviorData.lastInteractionTime = now
      lastInteractionTime = now
      this.scheduleScoreUpdate()
    }

    document.addEventListener('click', (e) => trackInteraction('click', e), { passive: true })
    document.addEventListener('keydown', (e) => trackInteraction('key', e), { passive: true })
  }

  setupContentConsumptionTracking () {
    // Track content consumption patterns
    const contentSelector = this.sitePatterns.selectors.content
    const postSelector = this.sitePatterns.selectors.posts

    if (!contentSelector || !postSelector) {
      return
    }

    // Observe content changes (infinite scroll)
    const observer = new MutationObserver((mutations) => {
      mutations.forEach(mutation => {
        mutation.addedNodes.forEach(node => {
          if (node.nodeType === 1 && node.matches && node.matches(postSelector)) {
            this.trackContentConsumption(node)
          }
        })
      })
    })

    const contentContainer = document.querySelector(contentSelector)
    if (contentContainer) {
      observer.observe(contentContainer, {
        childList: true,
        subtree: true
      })
      this.observers.push(observer)
    }
  }

  setupSiteSpecificTracking () {
    // Site-specific behavioral patterns
    switch (this.sitePatterns.type) {
      case 'video':
        this.setupVideoTracking()
        break
      case 'social':
      case 'microblog':
        this.setupSocialTracking()
        break
      case 'shortform':
        this.setupShortFormTracking()
        break
      case 'forum':
        this.setupForumTracking()
        break
    }
  }

  setupVideoTracking () {
    // YouTube-specific tracking
    let videoStartTime = Date.now()
    let _videosWatched = 0
    let _skippedVideos = 0

    // Track video interactions
    document.addEventListener('click', (e) => {
      const target = e.target.closest('ytd-video-renderer, ytd-rich-item-renderer, a[href*="/watch"]')
      if (target) {
        _videosWatched++
        videoStartTime = Date.now()

        // Check if this was a rapid skip
        const timeOnLastVideo = Date.now() - videoStartTime
        if (timeOnLastVideo < 10000) { // Less than 10 seconds
          _skippedVideos++
          this.addBehaviorFlag('rapid_video_skip')
        }

        this.updateBehaviorScore()
      }
    })
  }

  setupSocialTracking () {
    let _postsViewed = 0
    let _likesGiven = 0
    const _commentsRead = 0

    // Track social interactions
    document.addEventListener('click', (e) => {
      if (e.target.matches('[data-testid*="like"], [aria-label*="Like"], .like-button')) {
        _likesGiven++
        this.addBehaviorFlag('social_validation_seeking')
      }

      if (e.target.closest('article, [data-testid="tweet"]')) {
        _postsViewed++
      }

      this.updateBehaviorScore()
    })
  }

  setupShortFormTracking () {
    let _swipeCount = 0
    const _videosConsumed = 0
    const _averageWatchTime = []

    // Track swipe behavior (simplified for TikTok-like interfaces)
    let startY = 0
    document.addEventListener('touchstart', (e) => {
      startY = e.touches[0].clientY
    })

    document.addEventListener('touchend', (e) => {
      const endY = e.changedTouches[0].clientY
      const swipeDistance = Math.abs(startY - endY)

      if (swipeDistance > 100) {
        _swipeCount++
        this.addBehaviorFlag('rapid_content_consumption')
        this.updateBehaviorScore()
      }
    })
  }

  setupForumTracking () {
    let _threadsVisited = 0
    const _commentsRead = 0
    let depthLevel = 0

    // Track thread diving behavior
    document.addEventListener('click', (e) => {
      if (e.target.closest('a[href*="/comments/"], a[href*="/r/"]')) {
        _threadsVisited++
        depthLevel++

        if (depthLevel > 3) {
          this.addBehaviorFlag('deep_thread_dive')
        }

        this.updateBehaviorScore()
      }
    })
  }

  // Lazy loading versions of setup methods
  
  /**
   * Lazy version of setupScrollAnalysis with passive event listeners
   */
  setupScrollAnalysisLazy() {
    // Reuse the existing scroll analysis but ensure it's optimized
    this.setupScrollAnalysis()
  }
  
  /**
   * Lazy version of setupInteractionTracking with passive event listeners
   */
  setupInteractionTrackingLazy() {
    let clickCount = 0
    let keyCount = 0
    let lastInteractionTime = Date.now()

    const trackInteraction = (type, event) => {
      if (!this.settings.isEnabled || this.isDestroyed) {
        return
      }

      const now = Date.now()
      const timeSinceLastInteraction = now - lastInteractionTime

      if (type === 'click') {
        clickCount++
      }
      if (type === 'key') {
        keyCount++
      }

      // Detect rapid interactions (possible mindless clicking)
      if (timeSinceLastInteraction < 500) {
        this.addBehaviorFlag('rapid_interaction')
      }

      // Differentiate between productive and unproductive interactions
      if (event && event.target) {
        const targetElement = event.target
        if (targetElement.matches('a, button, input, textarea, [role="button"]')) {
          this.addBehaviorFlag('productive_interaction')
        } else {
          this.addBehaviorFlag('passive_interaction')
        }
      }

      // Update last interaction time for passive consumption tracking
      this.behaviorData.lastInteractionTime = now
      lastInteractionTime = now
      this.scheduleScoreUpdate()
    }

    // Use passive event listeners and track with cleanup system
    this.addEventListenerWithCleanup(document, 'click', (e) => trackInteraction('click', e), { passive: true })
    this.addEventListenerWithCleanup(document, 'keydown', (e) => trackInteraction('key', e), { passive: true })
  }
  
  /**
   * Lazy version of setupContentConsumptionTracking
   */
  setupContentConsumptionTrackingLazy() {
    const contentSelector = this.sitePatterns.selectors.content
    const postSelector = this.sitePatterns.selectors.posts

    if (!contentSelector || !postSelector) {
      return
    }

    // Use requestIdleCallback to defer observer setup
    const setupObserver = () => {
      if (this.isDestroyed) {
        return
      }
      
      const observer = new MutationObserver((mutations) => {
        // Batch process mutations using requestIdleCallback
        if (window.requestIdleCallback) {
          window.requestIdleCallback(() => {
            if (this.isDestroyed) return
            
            mutations.forEach(mutation => {
              mutation.addedNodes.forEach(node => {
                if (node.nodeType === 1 && node.matches && node.matches(postSelector)) {
                  this.trackContentConsumption(node)
                }
              })
            })
          }, { timeout: 1000 })
        } else {
          // Fallback for browsers without requestIdleCallback
          setTimeout(() => {
            if (this.isDestroyed) return
            
            mutations.forEach(mutation => {
              mutation.addedNodes.forEach(node => {
                if (node.nodeType === 1 && node.matches && node.matches(postSelector)) {
                  this.trackContentConsumption(node)
                }
              })
            })
          }, 100)
        }
      })

      const contentContainer = document.querySelector(contentSelector)
      if (contentContainer) {
        observer.observe(contentContainer, {
          childList: true,
          subtree: true
        })
        this.observers.push(observer)
      }
    }

    if (window.requestIdleCallback) {
      window.requestIdleCallback(setupObserver, { timeout: 2000 })
    } else {
      setTimeout(setupObserver, 200)
    }
  }
  
  /**
   * Lazy version of setupSiteSpecificTracking
   */
  setupSiteSpecificTrackingLazy() {
    // Use requestIdleCallback to defer site-specific setup
    const setupSiteSpecific = () => {
      if (this.isDestroyed) {
        return
      }
      
      switch (this.sitePatterns.type) {
        case 'video':
          this.setupVideoTrackingLazy()
          break
        case 'social':
        case 'microblog':
          this.setupSocialTrackingLazy()
          break
        case 'shortform':
          this.setupShortFormTrackingLazy()
          break
        case 'forum':
          this.setupForumTrackingLazy()
          break
      }
    }

    if (window.requestIdleCallback) {
      window.requestIdleCallback(setupSiteSpecific, { timeout: 2000 })
    } else {
      setTimeout(setupSiteSpecific, 300)
    }
  }
  
  /**
   * Lazy video tracking setup
   */
  setupVideoTrackingLazy() {
    let videoStartTime = Date.now()
    let videosWatched = 0
    let skippedVideos = 0

    const trackVideo = (e) => {
      if (this.isDestroyed) return
      
      const target = e.target.closest('ytd-video-renderer, ytd-rich-item-renderer, a[href*="/watch"]')
      if (target) {
        videosWatched++
        videoStartTime = Date.now()

        // Check if this was a rapid skip
        const timeOnLastVideo = Date.now() - videoStartTime
        if (timeOnLastVideo < 10000) { // Less than 10 seconds
          skippedVideos++
          this.addBehaviorFlag('rapid_video_skip')
        }

        this.updateBehaviorScore()
      }
    }

    this.addEventListenerWithCleanup(document, 'click', trackVideo, { passive: true })
  }
  
  /**
   * Lazy social tracking setup
   */
  setupSocialTrackingLazy() {
    let postsViewed = 0
    let likesGiven = 0

    const trackSocial = (e) => {
      if (this.isDestroyed) return
      
      if (e.target.matches('[data-testid*="like"], [aria-label*="Like"], .like-button')) {
        likesGiven++
        this.addBehaviorFlag('social_validation_seeking')
      }

      if (e.target.closest('article, [data-testid="tweet"]')) {
        postsViewed++
      }

      this.updateBehaviorScore()
    }

    this.addEventListenerWithCleanup(document, 'click', trackSocial, { passive: true })
  }
  
  /**
   * Lazy short form tracking setup
   */
  setupShortFormTrackingLazy() {
    let swipeCount = 0
    let startY = 0

    const handleTouchStart = (e) => {
      if (this.isDestroyed) return
      startY = e.touches[0].clientY
    }

    const handleTouchEnd = (e) => {
      if (this.isDestroyed) return
      
      const endY = e.changedTouches[0].clientY
      const swipeDistance = Math.abs(startY - endY)

      if (swipeDistance > 100) {
        swipeCount++
        this.addBehaviorFlag('rapid_content_consumption')
        this.updateBehaviorScore()
      }
    }

    this.addEventListenerWithCleanup(document, 'touchstart', handleTouchStart, { passive: true })
    this.addEventListenerWithCleanup(document, 'touchend', handleTouchEnd, { passive: true })
  }
  
  /**
   * Lazy forum tracking setup
   */
  setupForumTrackingLazy() {
    let threadsVisited = 0
    let depthLevel = 0

    const trackForum = (e) => {
      if (this.isDestroyed) return
      
      if (e.target.closest('a[href*="/comments/"], a[href*="/r/"]')) {
        threadsVisited++
        depthLevel++

        if (depthLevel > 3) {
          this.addBehaviorFlag('deep_thread_dive')
        }

        this.updateBehaviorScore()
      }
    }

    this.addEventListenerWithCleanup(document, 'click', trackForum, { passive: true })
  }

  trackContentConsumption (contentElement) {
    // Track how content is being consumed
    this.behaviorData.contentPieces = (this.behaviorData.contentPieces || 0) + 1

    // Check consumption rate
    if (!this.behaviorData.lastContentTime) {
      this.behaviorData.lastContentTime = Date.now()
    } else {
      const timeSinceLast = Date.now() - this.behaviorData.lastContentTime
      if (timeSinceLast < 3000) { // Less than 3 seconds between content
        this.addBehaviorFlag('rapid_consumption')
      }
      this.behaviorData.lastContentTime = Date.now()
    }

    // Track engagement with the content element
    this.trackElementEngagement(contentElement)

    this.updateBehaviorScore()
  }

  addBehaviorFlag (flag) {
    if (!this.behaviorData.flags) {
      this.behaviorData.flags = {}
    }
    this.behaviorData.flags[flag] = (this.behaviorData.flags[flag] || 0) + 1

    console.log(`🚩 Behavior flag: ${flag} (${this.behaviorData.flags[flag]})`)
  }

  /**
   * Optimized element engagement tracking using observer pool
   */
  trackElementEngagement (element) {
    // Skip if element is already being observed
    if (this.observerPool.observers.has(element)) {
      return
    }

    // Use shared observer for better performance
    if (!this.observerPool.contentViewing) {
      this.observerPool.contentViewing = new IntersectionObserver((entries) => {
        // Batch process entries for better performance
        if (window.requestIdleCallback) {
          window.requestIdleCallback(() => this.processIntersectionEntries(entries), { timeout: 1000 })
        } else {
          setTimeout(() => this.processIntersectionEntries(entries), 10)
        }
      }, { 
        threshold: 0.5,
        rootMargin: '50px' // Preload detection for better responsiveness
      })
      
      this.observers.push(this.observerPool.contentViewing)
    }

    try {
      this.observerPool.contentViewing.observe(element)
      this.observerPool.observers.set(element, Date.now())
      
      // Schedule cleanup if we have too many observed elements
      if (this.observerPool.observers.size > 50) {
        this.scheduleObserverCleanup()
      }
    } catch (error) {
      console.warn('Failed to observe element:', error)
    }
  }

  /**
   * Process intersection observer entries with batching
   */
  processIntersectionEntries(entries) {
    let viewedCount = 0
    let passedCount = 0

    entries.forEach(entry => {
      const element = entry.target
      
      if (entry.isIntersecting) {
        viewedCount++
        // Remove from pending if it was there
        this.observerPool.pendingElements.delete(element)
      } else {
        // Only count as "passed" if the element was previously viewed
        if (this.observerPool.observers.has(element)) {
          passedCount++
        }
      }
    })

    // Batch the flag updates to reduce function calls
    if (viewedCount > 0) {
      this.behaviorData.flags = this.behaviorData.flags || {}
      this.behaviorData.flags.content_viewed = (this.behaviorData.flags.content_viewed || 0) + viewedCount
    }
    if (passedCount > 0) {
      this.behaviorData.flags = this.behaviorData.flags || {}
      this.behaviorData.flags.content_passed = (this.behaviorData.flags.content_passed || 0) + passedCount
    }

    // Only update score if there were significant changes
    if (viewedCount > 0 || passedCount > 2) {
      this.scheduleScoreUpdate()
    }
  }

  /**
   * Schedule cleanup of old observed elements
   */
  scheduleObserverCleanup() {
    if (this.observerCleanupInterval) {
      return // Already scheduled
    }
    
    this.observerCleanupInterval = setTimeout(() => {
      this.cleanupOldObservedElements()
      this.observerCleanupInterval = null
    }, 30000) // Cleanup every 30 seconds
  }

  /**
   * Clean up old observed elements that are no longer in the DOM
   */
  cleanupOldObservedElements() {
    if (!this.observerPool.contentViewing) {
      return
    }
    
    const now = Date.now()
    const elementsToRemove = []
    
    // Find elements that are either not in DOM or very old
    for (const [element, timestamp] of this.observerPool.observers.entries()) {
      const age = now - timestamp
      
      // Remove if element is no longer in DOM or older than 5 minutes
      if (!document.contains(element) || age > 300000) {
        elementsToRemove.push(element)
      }
    }
    
    // Batch unobserve operations
    elementsToRemove.forEach(element => {
      try {
        this.observerPool.contentViewing.unobserve(element)
        this.observerPool.observers.delete(element)
        this.observerPool.pendingElements.delete(element)
      } catch (error) {
        // Element might already be disconnected, ignore error
      }
    })
    
    if (elementsToRemove.length > 0) {
      console.log(`🧹 Cleaned up ${elementsToRemove.length} old observed elements`)
    }
  }

  /**
   * Schedule a batched score update using requestIdleCallback for better performance
   */
  scheduleScoreUpdate() {
    // Prevent multiple scheduled updates
    if (this.scoreUpdateScheduled) {
      return
    }
    
    this.scoreUpdateScheduled = true
    
    // Use requestIdleCallback to defer score calculations during idle periods
    if (window.requestIdleCallback) {
      window.requestIdleCallback((deadline) => {
        // Only proceed if we have at least 5ms left or if timeout exceeded
        if (deadline.timeRemaining() > 5 || deadline.didTimeout) {
          this.performBatchedScoreUpdate()
        } else {
          // Reschedule if not enough time
          this.scoreUpdateScheduled = false
          setTimeout(() => this.scheduleScoreUpdate(), 100)
        }
      }, { timeout: 2000 })
    } else {
      // Fallback for browsers without requestIdleCallback
      setTimeout(() => this.performBatchedScoreUpdate(), 100)
    }
  }

  /**
   * Perform the actual score update and analytics processing
   */
  performBatchedScoreUpdate() {
    this.scoreUpdateScheduled = false
    
    try {
      // Update behavior score
      this.updateBehaviorScoreInternal()
      
      // Queue analytics data instead of sending immediately
      this.queueAnalyticsData()
      
      // Check if we need to flush analytics queue
      const now = Date.now()
      if (now - this.lastAnalyticsFlush > 30000) { // 30 seconds
        this.flushAnalyticsQueue()
      }
      
      // Trigger interventions based on score (this should remain immediate)
      this.checkInterventionTriggers()
    } catch (error) {
      console.error('Error in batched score update:', error)
    }
  }

  /**
   * Queue analytics data for batched sending
   */
  queueAnalyticsData() {
    const timeMinutes = this.behaviorData.totalTimeOnPage / (1000 * 60)
    const timeSeconds = this.behaviorData.totalTimeOnPage / 1000

    // Calculate intervention count for this session
    const interventionCount = Object.keys(this.behaviorData.flags || {}).reduce((count, flag) => {
      if (flag.includes('intervention') || this.behaviorData.interventionStage > 0) {
        return count + 1
      }
      return count
    }, this.behaviorData.interventionStage > 0 ? 1 : 0)

    const analyticsData = {
      domain: window.location.hostname,
      siteType: this.sitePatterns.type,
      timeOnPage: timeMinutes,
      scrollTime: timeSeconds,
      behaviorScore: this.behaviorScore,
      flags: { ...this.behaviorData.flags } || {}, // Clone to avoid reference issues
      scrollPauseCount: this.behaviorData.scrollPauseCount || 0,
      contentPieces: this.behaviorData.contentPieces || 0,
      interventionStage: this.behaviorData.interventionStage,
      interventionCount,
      rapidScrollCount: this.behaviorData.rapidScrollCount || 0,
      backAndForthCount: this.behaviorData.backAndForthCount || 0,
      passiveConsumptionTime: this.behaviorData.passiveConsumptionTime || 0,
      focusMode: this.behaviorData.focusMode,
      timestamp: Date.now(),
      sessionStart: this.behaviorData.sessionStart
    }

    // Keep only the most recent analytics entries (prevent memory growth)
    if (this.analyticsQueue.length > 10) {
      this.analyticsQueue.shift()
    }
    
    this.analyticsQueue.push(analyticsData)
  }

  /**
   * Flush the analytics queue by sending batched data
   */
  flushAnalyticsQueue() {
    if (!this.backgroundConnected || !this.contextValid || this.analyticsQueue.length === 0) {
      return
    }

    try {
      if (chrome.runtime.id) {
        // Send the most recent analytics data
        const latestData = this.analyticsQueue[this.analyticsQueue.length - 1]
        
        chrome.runtime.sendMessage({
          type: 'BEHAVIORAL_EVENT',
          data: latestData
        }).catch(error => {
          if (error.message.includes('Extension context invalidated')) {
            this.contextValid = false
          }
        })
        
        // Clear the queue after successful send
        this.analyticsQueue = []
        this.lastAnalyticsFlush = Date.now()
      }
    } catch (error) {
      // Background service not available, continue in standalone mode
      console.warn('Failed to send analytics:', error.message)
    }
  }

  /**
   * Public interface - schedules a batched score update for better performance
   */
  updateBehaviorScore () {
    this.scheduleScoreUpdate()
  }

  /**
   * Internal method that performs the actual score calculation
   */
  updateBehaviorScoreInternal () {
    let score = 0
    const timeMinutes = this.behaviorData.totalTimeOnPage / (1000 * 60)

    // --- Base Scoring ---
    // Time on page is a neutral factor unless excessive
    if (timeMinutes > 5) {
      score += Math.min((timeMinutes - 5) * 2, 20) // Penalty for excessive time
    }

    // --- Negative Behavior Flags (increase score) ---
    const flags = this.behaviorData.flags || {}
    score += (flags.rapid_scrolling || 0) * 5
    score += (flags.erratic_scrolling || 0) * 10
    score += (flags.rapid_consumption || 0) * 3
    score += (flags.passive_interaction || 0) * 2
    score += (flags.content_passed || 0) * 1 // Penalty for passing content quickly

    // Site-specific penalties
    if (this.sitePatterns.type === 'social' || this.sitePatterns.type === 'microblog') {
      score += (flags.social_validation_seeking || 0) * 5
    }
    if (this.sitePatterns.type === 'video') {
      score += (flags.rapid_video_skip || 0) * 8
    }

    // --- Positive Behavior Flags (decrease score) ---
    score -= (flags.productive_interaction || 0) * 4
    score -= (flags.content_viewed || 0) * 2

    // Scroll pauses are a strong indicator of reading
    if (this.behaviorData.scrollPauseCount > 2) {
      score -= this.behaviorData.scrollPauseCount * 5
    }

    // --- Passive Consumption Penalty ---
    const passiveRatio = this.behaviorData.passiveConsumptionTime / (timeMinutes * 60)
    if (passiveRatio > 0.5) { // If over 50% of time is passive
      score += passiveRatio * 20
    }

    // Clamp score between 0 and 100
    this.behaviorScore = Math.max(0, Math.min(score, 100))
  }

  checkInterventionTriggers () {
    // Override: Use time-based distraction tracking for stage decisions
    if (this.behaviorData.focusMode ||
        (this.behaviorData.snoozeUntil && Date.now() < this.behaviorData.snoozeUntil)) {
      return
    }
    this.evaluateTimeBasedStages(Date.now())
  }

  sendBehavioralAnalytics () {
    // Send behavioral data to background service for analytics
    if (this.backgroundConnected && this.contextValid) {
      try {
        if (chrome.runtime.id) {
          const timeMinutes = this.behaviorData.totalTimeOnPage / (1000 * 60)
          const timeSeconds = this.behaviorData.totalTimeOnPage / 1000

          // Calculate intervention count for this session
          const interventionCount = Object.keys(this.behaviorData.flags || {}).reduce((count, flag) => {
            if (flag.includes('intervention') || this.behaviorData.interventionStage > 0) {
              return count + 1
            }
            return count
          }, this.behaviorData.interventionStage > 0 ? 1 : 0)

          chrome.runtime.sendMessage({
            type: 'BEHAVIORAL_EVENT',
            data: {
              domain: window.location.hostname,
              siteType: this.sitePatterns.type,
              timeOnPage: timeMinutes,
              scrollTime: timeSeconds, // Send in seconds for dashboard compatibility
              behaviorScore: this.behaviorScore,
              flags: this.behaviorData.flags || {},
              scrollPauseCount: this.behaviorData.scrollPauseCount || 0,
              contentPieces: this.behaviorData.contentPieces || 0,
              interventionStage: this.behaviorData.interventionStage,
              interventionCount,
              rapidScrollCount: this.behaviorData.rapidScrollCount || 0,
              backAndForthCount: this.behaviorData.backAndForthCount || 0,
              passiveConsumptionTime: this.behaviorData.passiveConsumptionTime || 0,
              focusMode: this.behaviorData.focusMode,
              timestamp: Date.now(),
              sessionStart: this.behaviorData.sessionStart
            }
          }).catch(error => {
            if (error.message.includes('Extension context invalidated')) {
              this.contextValid = false
            }
          })
        }
      } catch (error) {
        // Background service not available, continue in standalone mode
      }
    }
  }

  startBehaviorTracking () {
    // Start continuous behavior analysis using unified timer system
    this.addTimerTask('behavior_tracking', () => {
      if (!this.isDestroyed) {
        this.updateBehaviorScore()
      }
    }, 5000) // Update every 5 seconds
    
    // Add analytics flush timer to unified system
    this.addTimerTask('analytics_flush', () => {
      if (!this.isDestroyed && this.analyticsQueue.length > 0) {
        this.flushAnalyticsQueue()
      }
    }, 30000) // Flush analytics every 30 seconds

    console.log('🔄 Behavior tracking started with unified timer system')
  }

  resetScrollData () {
    // Reset behavioral data instead of scroll data
    this.behaviorData = {
      sessionStart: Date.now(),
      totalTimeOnPage: 0,
      scrollSessions: [],
      currentScrollSession: null,
      rapidScrollCount: 0,
      shortStayCount: 0,
      backAndForthCount: 0,
      passiveConsumptionTime: 0,
      interventionStage: 0,
      lastInterventionTime: 0,
      flags: {},
      contentPieces: 0
    }
    this.behaviorScore = 0
    this.clearIntervention()
    console.log('🔄 Behavioral data reset')
  }
}

// Initialize content script with delay to ensure background script is ready
function initializeExtension () {
  try {
    // Check if extension context is valid before initialization
    if (!chrome || !chrome.runtime || !chrome.runtime.id) {
      console.warn('Extension context not available, skipping initialization')
      return
    }

    // Add a small delay to ensure background script is fully loaded
    setTimeout(() => {
      try {
        const contentScript = new AttentionTrainerContent()
        window.attentionTrainerContent = contentScript
      } catch (error) {
        console.error('Failed to initialize Attention Trainer content script:', error)
      }
    }, 500)
  } catch (error) {
    console.warn('Chrome extension APIs not available:', error.message)
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeExtension)
} else {
  initializeExtension()
}
