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
      contentPieces: 0
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

    this.init()
  }

  async init () {
    try {
      // Initialize shared modules first
      await this.initializeSharedModules()

      await this.loadSettings()
      this.setupBehavioralAnalysis()
      this.setupMessageListener()
      this.createInterventionElements()
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
        const timeoutPromise = new Promise((_, reject) =>
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
    document.body.classList.add('attention-trainer-dim', 'attention-trainer-pulse')
    document.body.style.opacity = '0.75'
    console.log('📉 Applied enhanced dimming')
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

    const scrollTime = this.getScrollTime()
    const maxTime = 15 // 15 seconds for full progress
    const progress = Math.min((scrollTime / maxTime) * 100, 100)
    progressBar.style.width = `${progress}%`
  }

  // Enhanced Stage 2: Progressive blur with gentle shake
  applyProgressiveBlur () {
    const elements = document.querySelectorAll('p, span, div:not([class*="attention-trainer"]), img, video, article, section')
    elements.forEach(el => {
      el.classList.add('attention-trainer-blur')
      el.style.filter = 'blur(2px) brightness(0.8)'
    })
    console.log('😵‍💫 Applied progressive blur')
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
    const scrollTime = this.getScrollTime()
    const scrollDistance = Math.round(this.scrollData.scrollDistance / 100) // Convert to rough screen heights

    this.interventionOverlay.innerHTML = `
      <div class="attention-trainer-nudge">
        <div class="nudge-content">
          <span class="nudge-icon">${selectedMessage.icon}</span>
          <h3>${selectedMessage.title}</h3>
          <p class="nudge-subtitle">${selectedMessage.subtitle}</p>
          
          <div class="nudge-stats">
            <div class="stat-item">
              <div class="stat-value">${Math.round(scrollTime)}s</div>
              <div class="stat-label">Scrolling</div>
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
    this.interventionOverlay.innerHTML = `
      <div class="attention-trainer-nudge" style="border: 3px solid #ef4444;">
        <div class="nudge-content">
          <span class="nudge-icon">⚠️</span>
          <h3 style="color: #ef4444;">Attention overload detected</h3>
          <p class="nudge-subtitle">You've been scrolling for ${Math.round(this.getScrollTime())} seconds straight</p>
          
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
    }

    // Remove all intervention classes and effects
    document.body.classList.remove('attention-trainer-dim', 'attention-trainer-pulse', 'attention-trainer-shake')
    document.body.style.opacity = ''
    document.body.style.overflow = ''

    // Remove blur effects
    const blurredElements = document.querySelectorAll('.attention-trainer-blur')
    blurredElements.forEach(el => {
      el.classList.remove('attention-trainer-blur')
      el.style.filter = ''
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

  setupBehavioralAnalysis () {
    // Multi-layered behavioral detection
    this.setupScrollAnalysis() // Enhanced scroll analysis
    this.setupTimeTracking()
    this.setupInteractionTracking() // Tracks engagement
    this.setupContentConsumptionTracking() // Monitors content velocity
    this.setupSiteSpecificTracking() // Contextual profiles

    console.log('🧠 Advanced behavioral analysis activated')
  }

  setupScrollAnalysis () {
    let lastScrollY = window.scrollY
    const scrollVelocity = []
    const scrollDirection = []
    let _rapidScrollCount = 0

    const analyzeScroll = () => {
      if (!this.settings.isEnabled || this.behaviorData.focusMode) {
        return
      }

      const currentY = window.scrollY
      const velocity = Math.abs(currentY - lastScrollY)
      const direction = currentY > lastScrollY ? 'down' : 'up'

      // Scroll pause detection (indicative of reading)
      if (velocity < 10) {
        this.behaviorData.scrollPauseCount = (this.behaviorData.scrollPauseCount || 0) + 1
      } else {
        this.behaviorData.scrollPauseCount = 0 // Reset on movement
      }

      // Track scroll patterns
      scrollVelocity.push(velocity)
      scrollDirection.push(direction)

      // Keep only last 10 samples
      if (scrollVelocity.length > 10) {
        scrollVelocity.shift()
      }
      if (scrollDirection.length > 10) {
        scrollDirection.shift()
      }

      // Detect rapid scrolling
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

      lastScrollY = currentY
      this.updateBehaviorScore()
    }

    let scrollTimeout
    window.addEventListener('scroll', () => {
      clearTimeout(scrollTimeout)
      scrollTimeout = setTimeout(analyzeScroll, 50)
    }, { passive: true })
  }

  setupTimeTracking () {
    // Track time spent on page
    setInterval(() => {
      if (!this.settings.isEnabled) {
        return
      }

      this.behaviorData.totalTimeOnPage = Date.now() - this.behaviorData.sessionStart

      // Detect excessive time spent
      const minutes = this.behaviorData.totalTimeOnPage / (1000 * 60)
      if (minutes > this.sitePatterns.thresholds.time / 60) {
        this.addBehaviorFlag('excessive_time')
      }

      // Track passive consumption time
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
      this.updateBehaviorScore()
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

  trackElementEngagement (element) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          this.addBehaviorFlag('content_viewed')
        } else {
          this.addBehaviorFlag('content_passed')
        }
      })
    }, { threshold: 0.5 })

    observer.observe(element)
    this.observers.push(observer)
  }

  updateBehaviorScore () {
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

    // Send behavioral analytics to background service
    this.sendBehavioralAnalytics()

    // Trigger interventions based on score
    this.checkInterventionTriggers()
  }

  checkInterventionTriggers () {
    // Site-specific dynamic thresholds
    const thresholds = {
      social: { stage1: 25, stage2: 40, stage3: 60, stage4: 80 },
      video: { stage1: 30, stage2: 50, stage3: 70, stage4: 85 },
      forum: { stage1: 20, stage2: 35, stage3: 55, stage4: 75 },
      microblog: { stage1: 25, stage2: 45, stage3: 65, stage4: 80 },
      general: { stage1: 40, stage2: 60, stage3: 80, stage4: 90 }
    }
    const siteType = this.sitePatterns.type || 'general'
    const interventionThresholds = thresholds[siteType]

    if (this.behaviorData.focusMode ||
        (this.behaviorData.snoozeUntil && Date.now() < this.behaviorData.snoozeUntil)) {
      return
    }

    const now = Date.now()
    const timeSinceLastIntervention = now - this.behaviorData.lastInterventionTime

    // Minimum 30 seconds between interventions
    if (timeSinceLastIntervention < 30000) {
      return
    }

    let targetStage = 0

    if (this.behaviorScore >= interventionThresholds.stage4) {
      targetStage = 4
    } else if (this.behaviorScore >= interventionThresholds.stage3) {
      targetStage = 3
    } else if (this.behaviorScore >= interventionThresholds.stage2) {
      targetStage = 2
    } else if (this.behaviorScore >= interventionThresholds.stage1) {
      targetStage = 1
    }

    if (targetStage > 0 && targetStage !== this.behaviorData.interventionStage) {
      console.log(`📊 Behavior score: ${Math.round(this.behaviorScore)} → Stage ${targetStage}`)
      this.behaviorData.lastInterventionTime = now
      this.triggerIntervention(targetStage, this.settings.focusMode || 'gentle')
    }
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
    // Start continuous behavior analysis
    setInterval(() => {
      this.updateBehaviorScore()
    }, 5000) // Update every 5 seconds

    console.log('🔄 Behavior tracking started')
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
        new AttentionTrainerContent()
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
