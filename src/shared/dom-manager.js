/**
 * Advanced DOM Reference Manager
 * Uses WeakMaps for memory-efficient DOM element tracking and automatic cleanup
 * Prevents memory leaks and improves garbage collection performance
 */

class DOMManager {
  constructor(options = {}) {
    this.options = {
      // Performance options
      maxElements: options.maxElements || 1000,
      cleanupInterval: options.cleanupInterval || 30000, // 30 seconds
      debounceDelay: options.debounceDelay || 16, // ~60fps
      useIntersectionObserver: options.useIntersectionObserver !== false,
      
      // Memory management
      enableAutoCleanup: options.enableAutoCleanup !== false,
      maxMemoryUsage: options.maxMemoryUsage || 10 * 1024 * 1024, // 10MB
      
      // Debug options
      debug: options.debug || false,
      trackPerformance: options.trackPerformance !== false,
      
      ...options
    }

    // WeakMaps for memory-efficient storage (automatically cleaned up when elements are GC'd)
    this.elementData = new WeakMap()
    this.elementObservers = new WeakMap()
    this.elementHandlers = new WeakMap()
    this.elementTimers = new WeakMap()
    
    // Regular Maps for tracking (these need manual cleanup)
    this.elementRegistry = new Map() // element -> metadata
    this.selectorMap = new Map() // selector -> Set<elements>
    this.tagCounts = new Map() // tag -> count
    
    // Performance tracking
    this.performanceMetrics = {
      elementsTracked: 0,
      elementsRemoved: 0,
      memoryUsage: 0,
      cleanupRuns: 0,
      observerCallbacks: 0,
      eventHandlers: 0,
      debounceSkips: 0
    }
    
    // Cleanup and optimization
    this.cleanupQueue = new Set()
    this.debounceMap = new Map()
    this.resizeObserver = null
    this.mutationObserver = null
    
    // Initialize logger if available
    this.logger = typeof logger !== 'undefined' 
      ? logger.child({ component: 'DOMManager' })
      : { debug: console.debug, info: console.log, warn: console.warn, error: console.error }
      
    this.init()
  }

  /**
   * Initialize DOM manager
   */
  init() {
    if (typeof document === 'undefined') {
      this.logger.warn('DOM Manager: Document not available, skipping initialization')
      return
    }

    this.setupGlobalObservers()
    this.startPeriodicCleanup()
    this.setupPerformanceMonitoring()
    
    this.logger.info('DOM Manager initialized', {
      options: this.options,
      features: {
        intersectionObserver: !!window.IntersectionObserver,
        resizeObserver: !!window.ResizeObserver,
        mutationObserver: !!window.MutationObserver,
        requestIdleCallback: !!window.requestIdleCallback
      }
    })
  }

  /**
   * Set up global observers for automatic cleanup
   */
  setupGlobalObservers() {
    // Mutation observer to track DOM changes
    if (window.MutationObserver) {
      this.mutationObserver = new MutationObserver((mutations) => {
        this.handleMutations(mutations)
      })
      
      this.mutationObserver.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: false
      })
    }

    // Resize observer for performance optimization
    if (window.ResizeObserver) {
      this.resizeObserver = new ResizeObserver((entries) => {
        this.handleResize(entries)
      })
    }

    // Page visibility change for cleanup optimization
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.performAggressiveCleanup()
      }
    })

    // Window unload cleanup
    window.addEventListener('beforeunload', () => {
      this.cleanup()
    })
  }

  /**
   * Track DOM element with metadata
   */
  trackElement(element, metadata = {}) {
    if (!element || !element.nodeType) {
      this.logger.warn('Invalid element provided to trackElement')
      return false
    }

    try {
      const elementId = this.generateElementId(element)
      const trackingData = {
        id: elementId,
        tag: element.tagName?.toLowerCase() || 'unknown',
        selector: this.generateSelector(element),
        timestamp: Date.now(),
        ...metadata
      }

      // Store in WeakMap (automatic cleanup)
      this.elementData.set(element, trackingData)
      
      // Store in regular Map for tracking (manual cleanup needed)
      this.elementRegistry.set(element, trackingData)
      
      // Update selector mapping
      if (trackingData.selector) {
        if (!this.selectorMap.has(trackingData.selector)) {
          this.selectorMap.set(trackingData.selector, new Set())
        }
        this.selectorMap.get(trackingData.selector).add(element)
      }
      
      // Update tag counts
      const tagCount = this.tagCounts.get(trackingData.tag) || 0
      this.tagCounts.set(trackingData.tag, tagCount + 1)
      
      this.performanceMetrics.elementsTracked++
      
      if (this.options.debug) {
        this.logger.debug('Element tracked', {
          tag: trackingData.tag,
          selector: trackingData.selector,
          totalTracked: this.performanceMetrics.elementsTracked
        })
      }
      
      return elementId
    } catch (error) {
      this.logger.error('Error tracking element', { error: error.message })
      return false
    }
  }

  /**
   * Untrack DOM element and cleanup
   */
  untrackElement(element) {
    if (!element || !this.elementData.has(element)) {
      return false
    }

    try {
      const data = this.elementData.get(element)
      
      // Remove from WeakMap (will be cleaned automatically)
      this.elementData.delete(element)
      
      // Manual cleanup from regular Maps
      this.elementRegistry.delete(element)
      
      // Update selector mapping
      if (data.selector && this.selectorMap.has(data.selector)) {
        this.selectorMap.get(data.selector).delete(element)
        if (this.selectorMap.get(data.selector).size === 0) {
          this.selectorMap.delete(data.selector)
        }
      }
      
      // Update tag counts
      const currentCount = this.tagCounts.get(data.tag) || 0
      if (currentCount <= 1) {
        this.tagCounts.delete(data.tag)
      } else {
        this.tagCounts.set(data.tag, currentCount - 1)
      }
      
      // Cleanup observers and handlers
      this.cleanupElementObservers(element)
      this.cleanupElementHandlers(element)
      this.cleanupElementTimers(element)
      
      this.performanceMetrics.elementsRemoved++
      
      if (this.options.debug) {
        this.logger.debug('Element untracked', {
          tag: data.tag,
          totalTracked: this.performanceMetrics.elementsTracked - this.performanceMetrics.elementsRemoved
        })
      }
      
      return true
    } catch (error) {
      this.logger.error('Error untracking element', { error: error.message })
      return false
    }
  }

  /**
   * Get element data from WeakMap
   */
  getElementData(element) {
    return this.elementData.get(element)
  }

  /**
   * Find elements by selector efficiently
   */
  findTrackedElements(selector) {
    return this.selectorMap.get(selector) || new Set()
  }

  /**
   * Add event handler with automatic cleanup tracking
   */
  addEventListener(element, event, handler, options = {}) {
    if (!element || typeof handler !== 'function') {
      this.logger.warn('Invalid parameters for addEventListener')
      return null
    }

    try {
      const wrappedHandler = this.wrapEventHandler(handler, options)
      element.addEventListener(event, wrappedHandler, options)
      
      // Store handler for cleanup
      if (!this.elementHandlers.has(element)) {
        this.elementHandlers.set(element, new Map())
      }
      
      const handlerKey = `${event}_${Date.now()}_${Math.random()}`
      this.elementHandlers.get(element).set(handlerKey, {
        event,
        handler: wrappedHandler,
        options,
        originalHandler: handler
      })
      
      this.performanceMetrics.eventHandlers++
      
      return handlerKey
    } catch (error) {
      this.logger.error('Error adding event listener', { error: error.message })
      return null
    }
  }

  /**
   * Remove specific event handler
   */
  removeEventListener(element, handlerKey) {
    if (!this.elementHandlers.has(element)) {
      return false
    }

    try {
      const handlers = this.elementHandlers.get(element)
      const handlerInfo = handlers.get(handlerKey)
      
      if (handlerInfo) {
        element.removeEventListener(
          handlerInfo.event, 
          handlerInfo.handler, 
          handlerInfo.options
        )
        handlers.delete(handlerKey)
        
        if (handlers.size === 0) {
          this.elementHandlers.delete(element)
        }
        
        return true
      }
    } catch (error) {
      this.logger.error('Error removing event listener', { error: error.message })
    }
    
    return false
  }

  /**
   * Wrap event handler with performance optimizations
   */
  wrapEventHandler(handler, options = {}) {
    if (options.debounce) {
      return this.debounce(handler, options.debounce)
    }
    
    if (options.throttle) {
      return this.throttle(handler, options.throttle)
    }
    
    if (options.idle) {
      return this.requestIdleCallback(handler)
    }
    
    return handler
  }

  /**
   * Debounce function calls for performance
   */
  debounce(func, delay = this.options.debounceDelay) {
    return (...args) => {
      const key = func.toString() + JSON.stringify(args)
      
      if (this.debounceMap.has(key)) {
        clearTimeout(this.debounceMap.get(key))
        this.performanceMetrics.debounceSkips++
      }
      
      const timeoutId = setTimeout(() => {
        this.debounceMap.delete(key)
        func.apply(this, args)
      }, delay)
      
      this.debounceMap.set(key, timeoutId)
    }
  }

  /**
   * Throttle function calls
   */
  throttle(func, limit) {
    let inThrottle = false
    
    return (...args) => {
      if (!inThrottle) {
        func.apply(this, args)
        inThrottle = true
        setTimeout(() => { inThrottle = false }, limit)
      }
    }
  }

  /**
   * Use requestIdleCallback for non-critical operations
   */
  requestIdleCallback(func) {
    if (window.requestIdleCallback) {
      return (...args) => {
        window.requestIdleCallback((deadline) => {
          if (deadline.timeRemaining() > 0) {
            func.apply(this, args)
          }
        })
      }
    }
    
    return func
  }

  /**
   * Create intersection observer for element
   */
  observeElement(element, callback, options = {}) {
    if (!this.options.useIntersectionObserver || !window.IntersectionObserver) {
      return null
    }

    try {
      const observer = new IntersectionObserver((entries) => {
        this.performanceMetrics.observerCallbacks++
        callback(entries)
      }, {
        threshold: options.threshold || [0, 0.1, 0.5, 1.0],
        rootMargin: options.rootMargin || '10px',
        ...options
      })
      
      observer.observe(element)
      
      // Store observer for cleanup
      if (!this.elementObservers.has(element)) {
        this.elementObservers.set(element, new Set())
      }
      this.elementObservers.get(element).add(observer)
      
      return observer
    } catch (error) {
      this.logger.error('Error creating intersection observer', { error: error.message })
      return null
    }
  }

  /**
   * Handle DOM mutations
   */
  handleMutations(mutations) {
    const removedElements = new Set()
    
    mutations.forEach(mutation => {
      // Track removed nodes
      mutation.removedNodes.forEach(node => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          removedElements.add(node)
          // Check for tracked child elements
          const trackedChildren = node.querySelectorAll ? node.querySelectorAll('*') : []
          trackedChildren.forEach(child => removedElements.add(child))
        }
      })
    })
    
    // Queue removed elements for cleanup
    removedElements.forEach(element => {
      if (this.elementData.has(element)) {
        this.cleanupQueue.add(element)
      }
    })
    
    // Process cleanup queue
    this.processCleanupQueue()
  }

  /**
   * Handle resize events
   */
  handleResize(entries) {
    // Optimize performance during resize
    entries.forEach(entry => {
      const element = entry.target
      if (this.elementData.has(element)) {
        // Update element data with new dimensions
        const data = this.elementData.get(element)
        if (data) {
          data.dimensions = {
            width: entry.contentRect.width,
            height: entry.contentRect.height,
            timestamp: Date.now()
          }
        }
      }
    })
  }

  /**
   * Process cleanup queue efficiently
   */
  processCleanupQueue() {
    if (this.cleanupQueue.size === 0) return
    
    const elementsToClean = Array.from(this.cleanupQueue)
    this.cleanupQueue.clear()
    
    // Use requestIdleCallback for non-urgent cleanup
    const cleanupBatch = () => {
      const batchSize = Math.min(10, elementsToClean.length)
      
      for (let i = 0; i < batchSize; i++) {
        const element = elementsToClean.shift()
        if (element) {
          this.untrackElement(element)
        }
      }
      
      if (elementsToClean.length > 0) {
        if (window.requestIdleCallback) {
          window.requestIdleCallback(cleanupBatch)
        } else {
          setTimeout(cleanupBatch, 0)
        }
      }
    }
    
    cleanupBatch()
  }

  /**
   * Cleanup element observers
   */
  cleanupElementObservers(element) {
    if (this.elementObservers.has(element)) {
      const observers = this.elementObservers.get(element)
      observers.forEach(observer => {
        try {
          observer.disconnect()
        } catch (error) {
          this.logger.debug('Error disconnecting observer', { error: error.message })
        }
      })
      this.elementObservers.delete(element)
    }
  }

  /**
   * Cleanup element event handlers
   */
  cleanupElementHandlers(element) {
    if (this.elementHandlers.has(element)) {
      const handlers = this.elementHandlers.get(element)
      handlers.forEach((handlerInfo) => {
        try {
          element.removeEventListener(
            handlerInfo.event, 
            handlerInfo.handler, 
            handlerInfo.options
          )
        } catch (error) {
          this.logger.debug('Error removing event listener during cleanup', { error: error.message })
        }
      })
      this.elementHandlers.delete(element)
    }
  }

  /**
   * Cleanup element timers
   */
  cleanupElementTimers(element) {
    if (this.elementTimers.has(element)) {
      const timers = this.elementTimers.get(element)
      timers.forEach(timerId => {
        try {
          clearTimeout(timerId)
        } catch (error) {
          this.logger.debug('Error clearing timer during cleanup', { error: error.message })
        }
      })
      this.elementTimers.delete(element)
    }
  }

  /**
   * Start periodic cleanup
   */
  startPeriodicCleanup() {
    if (!this.options.enableAutoCleanup) return
    
    setInterval(() => {
      this.performPeriodicCleanup()
    }, this.options.cleanupInterval)
  }

  /**
   * Perform periodic cleanup
   */
  performPeriodicCleanup() {
    try {
      let cleaned = 0
      
      // Check for disconnected elements
      const elementsToRemove = []
      
      this.elementRegistry.forEach((data, element) => {
        if (!document.contains(element)) {
          elementsToRemove.push(element)
        }
      })
      
      elementsToRemove.forEach(element => {
        this.untrackElement(element)
        cleaned++
      })
      
      // Clear expired debounce timers
      this.cleanupDebounceMap()
      
      this.performanceMetrics.cleanupRuns++
      
      if (cleaned > 0) {
        this.logger.debug('Periodic cleanup completed', {
          elementsRemoved: cleaned,
          totalCleanupRuns: this.performanceMetrics.cleanupRuns
        })
      }
      
      // Check memory usage
      this.checkMemoryUsage()
      
    } catch (error) {
      this.logger.error('Error during periodic cleanup', { error: error.message })
    }
  }

  /**
   * Perform aggressive cleanup when page is hidden
   */
  performAggressiveCleanup() {
    this.logger.debug('Performing aggressive cleanup due to page visibility change')
    
    // Clear all debounce timers
    this.debounceMap.forEach(timerId => clearTimeout(timerId))
    this.debounceMap.clear()
    
    // Process entire cleanup queue immediately
    this.processCleanupQueue()
    
    // Force garbage collection if available (development only)
    if (window.gc && this.options.debug) {
      try {
        window.gc()
      } catch (error) {
        // Ignore - gc not available
      }
    }
  }

  /**
   * Cleanup debounce map
   */
  cleanupDebounceMap() {
    // Debounce map cleanup is automatic as timers expire
    // This is just for monitoring
    const beforeSize = this.debounceMap.size
    
    // Remove completed timers (they remove themselves)
    setTimeout(() => {
      const afterSize = this.debounceMap.size
      if (beforeSize !== afterSize) {
        this.logger.debug('Debounce map cleaned', {
          before: beforeSize,
          after: afterSize
        })
      }
    }, 100)
  }

  /**
   * Check memory usage and optimize if needed
   */
  checkMemoryUsage() {
    if (performance.memory) {
      const currentUsage = performance.memory.usedJSHeapSize
      this.performanceMetrics.memoryUsage = currentUsage
      
      if (currentUsage > this.options.maxMemoryUsage) {
        this.logger.warn('Memory usage high, performing optimization', {
          currentUsage: Math.round(currentUsage / 1024 / 1024) + 'MB',
          maxUsage: Math.round(this.options.maxMemoryUsage / 1024 / 1024) + 'MB'
        })
        
        this.performMemoryOptimization()
      }
    }
  }

  /**
   * Perform memory optimization
   */
  performMemoryOptimization() {
    // Aggressive cleanup
    this.performAggressiveCleanup()
    
    // Reduce tracking for less critical elements
    let reducedCount = 0
    this.elementRegistry.forEach((data, element) => {
      if (data.priority === 'low' || !element.isConnected) {
        this.untrackElement(element)
        reducedCount++
      }
    })
    
    this.logger.info('Memory optimization completed', {
      elementsRemoved: reducedCount,
      newMemoryUsage: performance.memory ? 
        Math.round(performance.memory.usedJSHeapSize / 1024 / 1024) + 'MB' : 'unknown'
    })
  }

  /**
   * Setup performance monitoring
   */
  setupPerformanceMonitoring() {
    if (!this.options.trackPerformance) return
    
    // Monitor every 10 seconds
    setInterval(() => {
      this.updatePerformanceMetrics()
    }, 10000)
  }

  /**
   * Update performance metrics
   */
  updatePerformanceMetrics() {
    const metrics = {
      ...this.performanceMetrics,
      activeElements: this.elementRegistry.size,
      selectorMappings: this.selectorMap.size,
      tagTypes: this.tagCounts.size,
      cleanupQueueSize: this.cleanupQueue.size,
      debounceTimers: this.debounceMap.size,
      memoryUsage: performance.memory ? performance.memory.usedJSHeapSize : 0,
      timestamp: Date.now()
    }
    
    // Log performance data
    this.logger.debug('Performance metrics updated', metrics)
    
    return metrics
  }

  /**
   * Generate unique element ID
   */
  generateElementId(element) {
    return `dom_${element.tagName?.toLowerCase()}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  /**
   * Generate CSS selector for element
   */
  generateSelector(element) {
    try {
      if (element.id) {
        return `#${element.id}`
      }
      
      if (element.className && typeof element.className === 'string') {
        const classes = element.className.trim().split(/\s+/)
        if (classes.length > 0 && classes[0]) {
          return `${element.tagName?.toLowerCase()}.${classes[0]}`
        }
      }
      
      return element.tagName?.toLowerCase() || 'unknown'
    } catch (error) {
      return 'unknown'
    }
  }

  /**
   * Get comprehensive status
   */
  getStatus() {
    return {
      tracked: this.elementRegistry.size,
      performance: this.updatePerformanceMetrics(),
      options: this.options,
      features: {
        intersectionObserver: !!window.IntersectionObserver,
        resizeObserver: !!window.ResizeObserver,
        mutationObserver: !!window.MutationObserver,
        requestIdleCallback: !!window.requestIdleCallback
      }
    }
  }

  /**
   * Cleanup all resources
   */
  cleanup() {
    this.logger.info('DOM Manager cleanup initiated')
    
    // Disconnect global observers
    if (this.mutationObserver) {
      this.mutationObserver.disconnect()
    }
    
    if (this.resizeObserver) {
      this.resizeObserver.disconnect()
    }
    
    // Cleanup all tracked elements
    const elementsToClean = Array.from(this.elementRegistry.keys())
    elementsToClean.forEach(element => {
      this.untrackElement(element)
    })
    
    // Clear all timers
    this.debounceMap.forEach(timerId => clearTimeout(timerId))
    this.debounceMap.clear()
    
    // Clear all data structures
    this.elementRegistry.clear()
    this.selectorMap.clear()
    this.tagCounts.clear()
    this.cleanupQueue.clear()
    
    this.logger.info('DOM Manager cleanup completed')
  }
}

// Create default instance
const domManager = new DOMManager({
  debug: false,
  trackPerformance: true
})

// Export for use in other components
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { DOMManager, domManager }
} else {
  window.DOMManager = DOMManager
  window.domManager = domManager
}
