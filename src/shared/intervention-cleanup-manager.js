/**
 * Intervention Cleanup Manager
 * Automatically manages and cleans up intervention overlays to prevent DOM pollution
 * Integrates with DOMManager for memory-efficient element tracking
 */

class InterventionCleanupManager {
  constructor(options = {}) {
    this.options = {
      // Cleanup timing
      maxOverlayAge: options.maxOverlayAge || 300000, // 5 minutes
      cleanupInterval: options.cleanupInterval || 30000, // 30 seconds
      aggressiveCleanupAfter: options.aggressiveCleanupAfter || 600000, // 10 minutes
      
      // Overlay limits
      maxOverlaysPerPage: options.maxOverlaysPerPage || 10,
      maxOverlaysGlobal: options.maxOverlaysGlobal || 50,
      
      // Performance options
      batchCleanupSize: options.batchCleanupSize || 5,
      useIdleCallback: options.useIdleCallback !== false,
      enableTransitions: options.enableTransitions !== false,
      
      // DOM pollution prevention
      maxDOMNodes: options.maxDOMNodes || 1000,
      preventOrphans: options.preventOrphans !== false,
      cleanupOrphansInterval: options.cleanupOrphansInterval || 60000, // 1 minute
      
      // Debug and monitoring
      debug: options.debug || false,
      trackMetrics: options.trackMetrics !== false,
      
      ...options
    }

    // Overlay tracking using WeakMaps for automatic cleanup
    this.overlayData = new WeakMap() // overlay -> metadata
    this.overlayTimers = new WeakMap() // overlay -> cleanup timer
    this.overlayAnimations = new WeakMap() // overlay -> animation controller
    
    // Registry for manual cleanup (needed for iteration)
    this.activeOverlays = new Set()
    this.overlayHistory = []
    this.cleanupQueue = new Set()
    
    // Performance and metrics
    this.metrics = {
      overlaysCreated: 0,
      overlaysRemoved: 0,
      cleanupRuns: 0,
      aggressiveCleanups: 0,
      orphansFound: 0,
      memoryReclaimed: 0,
      averageCleanupTime: 0
    }
    
    // DOM observer for detecting orphaned elements
    this.mutationObserver = null
    this.intersectionObserver = null
    
    // Cleanup intervals
    this.cleanupInterval = null
    this.orphanCleanupInterval = null
    
    // Initialize logger and DOM manager
    this.logger = typeof logger !== 'undefined' 
      ? logger.child({ component: 'InterventionCleanup' })
      : { debug: console.debug, info: console.log, warn: console.warn, error: console.error }
    
    this.domManager = typeof domManager !== 'undefined' 
      ? domManager 
      : null
      
    this.init()
  }

  /**
   * Initialize cleanup manager
   */
  init() {
    if (typeof document === 'undefined') {
      this.logger.warn('Document not available, skipping initialization')
      return
    }

    this.setupDOMObservers()
    this.startPeriodicCleanup()
    this.setupVisibilityHandlers()
    
    this.logger.info('Intervention Cleanup Manager initialized', {
      options: this.options,
      domManagerAvailable: !!this.domManager
    })
  }

  /**
   * Setup DOM observers for automatic detection
   */
  setupDOMObservers() {
    // Mutation observer to detect intervention overlays
    if (window.MutationObserver) {
      this.mutationObserver = new MutationObserver((mutations) => {
        this.handleDOMMutations(mutations)
      })
      
      this.mutationObserver.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['class', 'id', 'data-intervention']
      })
    }

    // Intersection observer to detect invisible overlays
    if (window.IntersectionObserver) {
      this.intersectionObserver = new IntersectionObserver((entries) => {
        this.handleVisibilityChanges(entries)
      }, {
        threshold: [0],
        rootMargin: '0px'
      })
    }
  }

  /**
   * Setup page visibility handlers
   */
  setupVisibilityHandlers() {
    // Page visibility change
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.performAggressiveCleanup()
      } else {
        this.resumeNormalCleanup()
      }
    })

    // Page unload cleanup
    window.addEventListener('beforeunload', () => {
      this.cleanup()
    })

    // Focus change cleanup
    window.addEventListener('focus', () => {
      this.performMaintenance()
    })
  }

  /**
   * Register intervention overlay for tracking
   */
  registerOverlay(element, metadata = {}) {
    if (!element || !element.nodeType) {
      this.logger.warn('Invalid element provided to registerOverlay')
      return false
    }

    try {
      const overlayId = this.generateOverlayId(element)
      const overlayData = {
        id: overlayId,
        element,
        createdAt: Date.now(),
        lastSeen: Date.now(),
        type: metadata.type || 'unknown',
        stage: metadata.stage || 0,
        priority: metadata.priority || 'normal',
        persistUntil: metadata.persistUntil || null,
        canAutoRemove: metadata.canAutoRemove !== false,
        ...metadata
      }

      // Store in WeakMap for automatic cleanup
      this.overlayData.set(element, overlayData)
      
      // Add to active set for iteration
      this.activeOverlays.add(element)
      
      // Track with DOM manager if available
      if (this.domManager) {
        this.domManager.trackElement(element, {
          type: 'intervention-overlay',
          priority: overlayData.priority,
          ...metadata
        })
      }

      // Set up automatic cleanup timer
      this.scheduleOverlayCleanup(element)
      
      // Set up intersection observer
      if (this.intersectionObserver) {
        this.intersectionObserver.observe(element)
      }
      
      this.metrics.overlaysCreated++
      
      // Check overlay limits
      this.enforceOverlayLimits()
      
      if (this.options.debug) {
        this.logger.debug('Overlay registered', {
          id: overlayId,
          type: overlayData.type,
          stage: overlayData.stage,
          totalActive: this.activeOverlays.size
        })
      }
      
      return overlayId
    } catch (error) {
      this.logger.error('Error registering overlay', { error: error.message })
      return false
    }
  }

  /**
   * Unregister and cleanup overlay
   */
  unregisterOverlay(element) {
    if (!element || !this.overlayData.has(element)) {
      return false
    }

    try {
      const data = this.overlayData.get(element)
      
      // Clear cleanup timer
      this.clearOverlayTimer(element)
      
      // Stop observing
      if (this.intersectionObserver) {
        this.intersectionObserver.unobserve(element)
      }
      
      // Untrack from DOM manager
      if (this.domManager) {
        this.domManager.untrackElement(element)
      }
      
      // Remove from tracking
      this.overlayData.delete(element)
      this.activeOverlays.delete(element)
      this.cleanupQueue.delete(element)
      
      // Add to history for analytics
      this.overlayHistory.push({
        ...data,
        removedAt: Date.now(),
        lifespan: Date.now() - data.createdAt
      })
      
      // Limit history size
      if (this.overlayHistory.length > 100) {
        this.overlayHistory.shift()
      }
      
      // Animate removal if enabled
      if (this.options.enableTransitions) {
        this.animateOverlayRemoval(element)
      } else {
        this.removeOverlayFromDOM(element)
      }
      
      this.metrics.overlaysRemoved++
      
      if (this.options.debug) {
        this.logger.debug('Overlay unregistered', {
          id: data.id,
          lifespan: Date.now() - data.createdAt,
          totalActive: this.activeOverlays.size
        })
      }
      
      return true
    } catch (error) {
      this.logger.error('Error unregistering overlay', { error: error.message })
      return false
    }
  }

  /**
   * Schedule automatic cleanup for overlay
   */
  scheduleOverlayCleanup(element) {
    const data = this.overlayData.get(element)
    if (!data || !data.canAutoRemove) return

    let cleanupDelay = this.options.maxOverlayAge
    
    // Adjust delay based on priority
    switch (data.priority) {
      case 'high':
        cleanupDelay = Math.max(cleanupDelay, 600000) // 10 minutes minimum
        break
      case 'low':
        cleanupDelay = Math.min(cleanupDelay, 120000) // 2 minutes maximum
        break
      default:
        // Use default delay
        break
    }

    // Override with persistUntil if specified
    if (data.persistUntil && data.persistUntil > Date.now()) {
      cleanupDelay = data.persistUntil - Date.now()
    }

    const timerId = setTimeout(() => {
      this.cleanupQueue.add(element)
      this.processCleanupQueue()
    }, cleanupDelay)

    this.overlayTimers.set(element, timerId)
  }

  /**
   * Clear cleanup timer for overlay
   */
  clearOverlayTimer(element) {
    if (this.overlayTimers.has(element)) {
      const timerId = this.overlayTimers.get(element)
      clearTimeout(timerId)
      this.overlayTimers.delete(element)
    }
  }

  /**
   * Animate overlay removal
   */
  animateOverlayRemoval(element) {
    try {
      if (!element.isConnected) {
        return
      }

      const animation = element.animate([
        { opacity: 1, transform: 'scale(1)' },
        { opacity: 0, transform: 'scale(0.9)' }
      ], {
        duration: 300,
        easing: 'ease-out'
      })

      this.overlayAnimations.set(element, animation)

      animation.addEventListener('finish', () => {
        this.removeOverlayFromDOM(element)
        this.overlayAnimations.delete(element)
      })

      animation.addEventListener('cancel', () => {
        this.removeOverlayFromDOM(element)
        this.overlayAnimations.delete(element)
      })
    } catch (error) {
      this.logger.debug('Animation failed, removing directly', { error: error.message })
      this.removeOverlayFromDOM(element)
    }
  }

  /**
   * Remove overlay from DOM safely
   */
  removeOverlayFromDOM(element) {
    try {
      if (element && element.parentNode) {
        element.parentNode.removeChild(element)
      }
    } catch (error) {
      this.logger.debug('Error removing overlay from DOM', { error: error.message })
    }
  }

  /**
   * Handle DOM mutations to detect new overlays
   */
  handleDOMMutations(mutations) {
    mutations.forEach(mutation => {
      // Check for added intervention elements
      mutation.addedNodes.forEach(node => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          this.detectInterventionOverlay(node)
        }
      })

      // Check for removed intervention elements
      mutation.removedNodes.forEach(node => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          this.handleRemovedNode(node)
        }
      })
    })
  }

  /**
   * Detect intervention overlay in DOM
   */
  detectInterventionOverlay(element) {
    const overlaySelectors = [
      '[data-intervention]',
      '.attention-intervention',
      '.scroll-intervention',
      '.focus-overlay',
      '[id*="intervention"]',
      '[class*="overlay"][class*="intervention"]'
    ]

    overlaySelectors.forEach(selector => {
      if (element.matches && element.matches(selector)) {
        if (!this.overlayData.has(element)) {
          this.registerOverlay(element, {
            type: 'auto-detected',
            autoDetected: true,
            priority: 'normal'
          })
        }
      }

      // Check children
      if (element.querySelectorAll) {
        const childOverlays = element.querySelectorAll(selector)
        childOverlays.forEach(childOverlay => {
          if (!this.overlayData.has(childOverlay)) {
            this.registerOverlay(childOverlay, {
              type: 'auto-detected-child',
              autoDetected: true,
              priority: 'low'
            })
          }
        })
      }
    })
  }

  /**
   * Handle removed DOM node
   */
  handleRemovedNode(node) {
    if (this.activeOverlays.has(node)) {
      this.unregisterOverlay(node)
    }

    // Check for child overlays
    if (node.querySelectorAll) {
      const childOverlays = node.querySelectorAll('[data-intervention], .attention-intervention')
      childOverlays.forEach(childOverlay => {
        if (this.activeOverlays.has(childOverlay)) {
          this.unregisterOverlay(childOverlay)
        }
      })
    }
  }

  /**
   * Handle visibility changes
   */
  handleVisibilityChanges(entries) {
    entries.forEach(entry => {
      const element = entry.target
      const data = this.overlayData.get(element)
      
      if (data) {
        if (!entry.isIntersecting) {
          // Element is not visible, update last seen
          data.lastSeen = Date.now()
          data.isVisible = false
          
          // Queue for cleanup if invisible for too long
          const invisibleTime = Date.now() - data.lastSeen
          if (invisibleTime > this.options.maxOverlayAge / 2) {
            this.cleanupQueue.add(element)
          }
        } else {
          data.isVisible = true
          data.lastSeen = Date.now()
        }
      }
    })
  }

  /**
   * Enforce overlay limits
   */
  enforceOverlayLimits() {
    const totalOverlays = this.activeOverlays.size
    
    // Check global limit
    if (totalOverlays > this.options.maxOverlaysGlobal) {
      const excess = totalOverlays - this.options.maxOverlaysGlobal
      this.removeOldestOverlays(excess)
    }

    // Check per-page limit (simplified)
    if (totalOverlays > this.options.maxOverlaysPerPage) {
      const excess = totalOverlays - this.options.maxOverlaysPerPage
      this.removeOldestOverlays(excess)
    }
  }

  /**
   * Remove oldest overlays
   */
  removeOldestOverlays(count) {
    const overlaysByAge = Array.from(this.activeOverlays)
      .map(element => ({
        element,
        data: this.overlayData.get(element)
      }))
      .filter(item => item.data && item.data.canAutoRemove)
      .sort((a, b) => a.data.createdAt - b.data.createdAt)

    for (let i = 0; i < Math.min(count, overlaysByAge.length); i++) {
      this.cleanupQueue.add(overlaysByAge[i].element)
    }

    this.processCleanupQueue()
  }

  /**
   * Start periodic cleanup
   */
  startPeriodicCleanup() {
    this.cleanupInterval = setInterval(() => {
      this.performPeriodicCleanup()
    }, this.options.cleanupInterval)

    this.orphanCleanupInterval = setInterval(() => {
      this.cleanupOrphanedElements()
    }, this.options.cleanupOrphansInterval)
  }

  /**
   * Perform periodic cleanup
   */
  performPeriodicCleanup() {
    const startTime = performance.now()
    
    try {
      this.metrics.cleanupRuns++
      
      let cleanedCount = 0
      const currentTime = Date.now()
      
      // Check for expired overlays
      this.activeOverlays.forEach(element => {
        const data = this.overlayData.get(element)
        
        if (!data) {
          this.cleanupQueue.add(element)
          return
        }

        // Check age-based cleanup
        if (data.canAutoRemove && currentTime - data.createdAt > this.options.maxOverlayAge) {
          this.cleanupQueue.add(element)
          return
        }

        // Check if element is still in DOM
        if (!element.isConnected) {
          this.cleanupQueue.add(element)
          return
        }

        // Check visibility-based cleanup
        if (!data.isVisible && currentTime - data.lastSeen > this.options.maxOverlayAge / 2) {
          this.cleanupQueue.add(element)
          return
        }
      })

      // Process cleanup queue
      cleanedCount = this.processCleanupQueue()
      
      const cleanupTime = performance.now() - startTime
      this.metrics.averageCleanupTime = 
        (this.metrics.averageCleanupTime * (this.metrics.cleanupRuns - 1) + cleanupTime) / this.metrics.cleanupRuns

      if (this.options.debug && cleanedCount > 0) {
        this.logger.debug('Periodic cleanup completed', {
          cleaned: cleanedCount,
          remaining: this.activeOverlays.size,
          time: Math.round(cleanupTime * 100) / 100
        })
      }
    } catch (error) {
      this.logger.error('Error during periodic cleanup', { error: error.message })
    }
  }

  /**
   * Process cleanup queue efficiently
   */
  processCleanupQueue() {
    if (this.cleanupQueue.size === 0) return 0

    let processedCount = 0
    const elementsToClean = Array.from(this.cleanupQueue)
    this.cleanupQueue.clear()

    const cleanupBatch = () => {
      const batchSize = Math.min(this.options.batchCleanupSize, elementsToClean.length)
      
      for (let i = 0; i < batchSize; i++) {
        const element = elementsToClean.shift()
        if (element && this.unregisterOverlay(element)) {
          processedCount++
        }
      }

      if (elementsToClean.length > 0) {
        if (this.options.useIdleCallback && window.requestIdleCallback) {
          window.requestIdleCallback(cleanupBatch)
        } else {
          setTimeout(cleanupBatch, 0)
        }
      }
    }

    cleanupBatch()
    return processedCount
  }

  /**
   * Perform aggressive cleanup
   */
  performAggressiveCleanup() {
    this.logger.debug('Performing aggressive cleanup')
    
    this.metrics.aggressiveCleanups++
    
    // Queue all removable overlays
    this.activeOverlays.forEach(element => {
      const data = this.overlayData.get(element)
      if (data && data.canAutoRemove && data.priority !== 'high') {
        this.cleanupQueue.add(element)
      }
    })

    // Process immediately
    this.processCleanupQueue()

    // Cancel all animations
    this.overlayAnimations.forEach((animation) => {
      try {
        animation.cancel()
      } catch (error) {
        // Animation already finished/cancelled
      }
    })

    // Force garbage collection if available (development only)
    if (window.gc && this.options.debug) {
      try {
        window.gc()
      } catch (error) {
        // GC not available
      }
    }
  }

  /**
   * Resume normal cleanup after aggressive cleanup
   */
  resumeNormalCleanup() {
    this.logger.debug('Resuming normal cleanup')
    this.performMaintenance()
  }

  /**
   * Perform maintenance tasks
   */
  performMaintenance() {
    // Update metrics
    this.updateMetrics()
    
    // Check DOM pollution
    this.checkDOMPollution()
    
    // Validate active overlays
    this.validateActiveOverlays()
  }

  /**
   * Cleanup orphaned elements
   */
  cleanupOrphanedElements() {
    if (!this.options.preventOrphans) return

    try {
      const orphanSelectors = [
        '[data-intervention]:not([data-intervention-managed])',
        '.attention-intervention:not([data-managed])',
        '.intervention-overlay:not([data-active])'
      ]

      let orphansFound = 0

      orphanSelectors.forEach(selector => {
        const orphans = document.querySelectorAll(selector)
        orphans.forEach(orphan => {
          // Check if it's truly orphaned (not tracked)
          if (!this.overlayData.has(orphan)) {
            // Check age using data attributes or creation time estimation
            const ageEstimate = this.estimateElementAge(orphan)
            
            if (ageEstimate > this.options.maxOverlayAge) {
              this.removeOverlayFromDOM(orphan)
              orphansFound++
            } else {
              // Register for tracking
              this.registerOverlay(orphan, {
                type: 'orphan-recovered',
                priority: 'low',
                autoDetected: true
              })
            }
          }
        })
      })

      if (orphansFound > 0) {
        this.metrics.orphansFound += orphansFound
        this.logger.info('Orphaned elements cleaned up', { count: orphansFound })
      }
    } catch (error) {
      this.logger.error('Error cleaning up orphaned elements', { error: error.message })
    }
  }

  /**
   * Estimate element age for orphan detection
   */
  estimateElementAge(element) {
    try {
      // Try to get timestamp from data attributes
      const timestamp = element.dataset.createdAt || element.dataset.timestamp
      if (timestamp) {
        return Date.now() - parseInt(timestamp, 10)
      }

      // Estimate based on DOM position and other factors
      // This is a heuristic approach
      const siblings = element.parentElement ? element.parentElement.children : []
      const position = Array.from(siblings).indexOf(element)
      
      // Rough estimate: assume elements are created chronologically
      return position * 10000 // 10 seconds per position
    } catch (error) {
      return 0
    }
  }

  /**
   * Check DOM pollution levels
   */
  checkDOMPollution() {
    const totalNodes = document.querySelectorAll('*').length
    
    if (totalNodes > this.options.maxDOMNodes) {
      this.logger.warn('DOM pollution detected', {
        totalNodes,
        maxNodes: this.options.maxDOMNodes,
        activeOverlays: this.activeOverlays.size
      })
      
      // Trigger aggressive cleanup
      this.performAggressiveCleanup()
    }
  }

  /**
   * Validate active overlays
   */
  validateActiveOverlays() {
    const toRemove = []
    
    this.activeOverlays.forEach(element => {
      if (!element.isConnected || !this.overlayData.has(element)) {
        toRemove.push(element)
      }
    })

    toRemove.forEach(element => {
      this.activeOverlays.delete(element)
      if (this.overlayData.has(element)) {
        this.unregisterOverlay(element)
      }
    })

    if (toRemove.length > 0) {
      this.logger.debug('Invalid overlays removed', { count: toRemove.length })
    }
  }

  /**
   * Update metrics
   */
  updateMetrics() {
    if (performance.memory) {
      const currentMemory = performance.memory.usedJSHeapSize
      const previousMemory = this.metrics.memoryUsage || currentMemory
      this.metrics.memoryReclaimed += Math.max(0, previousMemory - currentMemory)
      this.metrics.memoryUsage = currentMemory
    }

    this.metrics.activeOverlays = this.activeOverlays.size
    this.metrics.queuedForCleanup = this.cleanupQueue.size
    this.metrics.lastUpdate = Date.now()
  }

  /**
   * Generate unique overlay ID
   */
  generateOverlayId(element) {
    const prefix = element.dataset.interventionType || 'overlay'
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`
  }

  /**
   * Get overlay information
   */
  getOverlayInfo(element) {
    return this.overlayData.get(element)
  }

  /**
   * Get all active overlays
   */
  getActiveOverlays() {
    return Array.from(this.activeOverlays)
  }

  /**
   * Get overlay history
   */
  getOverlayHistory() {
    return [...this.overlayHistory]
  }

  /**
   * Get comprehensive metrics
   */
  getMetrics() {
    this.updateMetrics()
    return {
      ...this.metrics,
      overlayHistory: this.overlayHistory.length,
      averageLifespan: this.overlayHistory.length > 0
        ? this.overlayHistory.reduce((sum, item) => sum + (item.lifespan || 0), 0) / this.overlayHistory.length
        : 0
    }
  }

  /**
   * Get status report
   */
  getStatus() {
    return {
      active: this.activeOverlays.size,
      queued: this.cleanupQueue.size,
      metrics: this.getMetrics(),
      options: this.options,
      features: {
        domManager: !!this.domManager,
        mutationObserver: !!this.mutationObserver,
        intersectionObserver: !!this.intersectionObserver
      }
    }
  }

  /**
   * Cleanup all resources
   */
  cleanup() {
    this.logger.info('Intervention cleanup manager shutting down')

    // Clear intervals
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
    }
    if (this.orphanCleanupInterval) {
      clearInterval(this.orphanCleanupInterval)
    }

    // Disconnect observers
    if (this.mutationObserver) {
      this.mutationObserver.disconnect()
    }
    if (this.intersectionObserver) {
      this.intersectionObserver.disconnect()
    }

    // Cancel all animations
    this.overlayAnimations.forEach(animation => {
      try {
        animation.cancel()
      } catch (error) {
        // Animation already finished/cancelled
      }
    })

    // Clear all timers
    this.activeOverlays.forEach(element => {
      this.clearOverlayTimer(element)
    })

    // Remove all tracked overlays
    const elementsToClean = Array.from(this.activeOverlays)
    elementsToClean.forEach(element => {
      this.removeOverlayFromDOM(element)
    })

    // Clear data structures
    this.activeOverlays.clear()
    this.cleanupQueue.clear()
    this.overlayHistory = []

    this.logger.info('Intervention cleanup manager shutdown complete')
  }
}

// Create default instance
const interventionCleanupManager = new InterventionCleanupManager({
  debug: false,
  trackMetrics: true
})

// Export for use in other components
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { InterventionCleanupManager, interventionCleanupManager }
} else {
  window.InterventionCleanupManager = InterventionCleanupManager
  window.interventionCleanupManager = interventionCleanupManager
}
