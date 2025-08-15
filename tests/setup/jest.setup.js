/**
 * Jest Setup File
 * Configures the testing environment for Chrome extension testing
 */

// Import required polyfills and mocks
require('fake-indexeddb/auto')
const chrome = require('sinon-chrome/webextensions')

// Global setup for Chrome APIs
global.chrome = chrome

// Mock window and document globals for content script testing
global.window = window
global.document = document

// Setup IndexedDB for fallback storage testing
global.indexedDB = require('fake-indexeddb')
global.IDBKeyRange = require('fake-indexeddb/lib/FDBKeyRange')

// Mock CSS for intervention testing
Object.defineProperty(window, 'getComputedStyle', {
  value: () => ({
    getPropertyValue: (prop) => ''
  })
})

// Mock IntersectionObserver for behavioral tracking tests
global.IntersectionObserver = class IntersectionObserver {
  constructor (callback, options) {
    this.callback = callback
    this.options = options
  }

  observe () {}
  unobserve () {}
  disconnect () {}
}

// Mock MutationObserver for content tracking tests
global.MutationObserver = class MutationObserver {
  constructor (callback) {
    this.callback = callback
  }

  observe () {}
  disconnect () {}
}

// Mock ResizeObserver
global.ResizeObserver = class ResizeObserver {
  constructor (callback) {
    this.callback = callback
  }

  observe () {}
  unobserve () {}
  disconnect () {}
}

// Setup Chrome extension API defaults
beforeEach(() => {
  // Reset all Chrome API mocks using sinon-chrome
  chrome.flush()

  // Setup basic properties
  chrome.runtime.id = 'test-extension-id'

  // Setup method responses
  chrome.runtime.getURL.callsFake((path) => `chrome-extension://test-extension-id/${path}`)
  chrome.runtime.sendMessage.resolves({})

  chrome.storage.local.get.resolves({})
  chrome.storage.local.set.resolves()
  chrome.storage.local.clear.resolves()

  chrome.tabs.query.resolves([])
  chrome.tabs.sendMessage.resolves({})

  // Reset console to avoid noise in tests
  console.log = jest.fn()
  console.warn = jest.fn()
  console.error = jest.fn()
})

// Cleanup after each test
afterEach(() => {
  // Clear all mocks
  jest.clearAllMocks()

  // Reset DOM
  document.body.innerHTML = ''
  document.head.innerHTML = ''
})

// Global test utilities
global.testUtils = {
  // Create mock Chrome message
  createMockMessage: (type, data = {}) => ({
    type,
    data,
    timestamp: Date.now()
  }),

  // Create mock DOM element
  createElement: (tag, attributes = {}, children = []) => {
    const element = document.createElement(tag)
    Object.keys(attributes).forEach(key => {
      element.setAttribute(key, attributes[key])
    })
    children.forEach(child => {
      if (typeof child === 'string') {
        element.textContent = child
      } else {
        element.appendChild(child)
      }
    })
    return element
  },

  // Simulate scroll event
  simulateScroll: (element = window, scrollY = 100) => {
    Object.defineProperty(element, 'scrollY', {
      value: scrollY,
      writable: true
    })

    const scrollEvent = new Event('scroll')
    element.dispatchEvent(scrollEvent)
  },

  // Simulate intervention trigger
  simulateIntervention: (stage = 1, focusMode = 'gentle') => {
    const message = global.testUtils.createMockMessage('TRIGGER_INTERVENTION', {
      stage,
      focusMode
    })
    return message
  },

  // Wait for async operations
  waitFor: (fn, timeout = 5000) => {
    return new Promise((resolve, reject) => {
      const startTime = Date.now()

      const check = () => {
        try {
          const result = fn()
          if (result) {
            resolve(result)
            return
          }
        } catch (error) {
          // Continue checking
        }

        if (Date.now() - startTime > timeout) {
          reject(new Error(`Timeout waiting for condition after ${timeout}ms`))
          return
        }

        setTimeout(check, 10)
      }

      check()
    })
  },

  // Mock site patterns for testing
  mockSitePatterns: {
    youtube: {
      type: 'video',
      selectors: {
        content: '#contents',
        videos: 'ytd-video-renderer',
        infinite: 'ytd-continuation-item-renderer'
      },
      thresholds: { time: 45, interactions: 8, videos: 3 }
    },
    general: {
      type: 'general',
      selectors: {
        content: 'main',
        posts: 'article',
        infinite: '.loading'
      },
      thresholds: { time: 60, interactions: 15, posts: 10 }
    }
  },

  // Create mock behavioral data
  createMockBehaviorData: (overrides = {}) => ({
    sessionStart: Date.now() - 60000, // 1 minute ago
    totalTimeOnPage: 60000,
    rapidScrollCount: 0,
    backAndForthCount: 0,
    passiveConsumptionTime: 0,
    interventionStage: 0,
    lastInterventionTime: 0,
    focusMode: false,
    snoozeUntil: null,
    flags: {},
    contentPieces: 0,
    ...overrides
  })
}

// Setup error handling for tests
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason)
})

// Add custom matchers
expect.extend({
  toBeValidMessage (received) {
    const pass = received &&
                 typeof received.type === 'string' &&
                 received.hasOwnProperty('data')

    if (pass) {
      return {
        message: () => `expected ${received} not to be a valid message`,
        pass: true
      }
    } else {
      return {
        message: () => `expected ${received} to be a valid message with type and data properties`,
        pass: false
      }
    }
  },

  toHaveBeenCalledWithMessage (received, type, data) {
    const calls = received.mock.calls
    const matchingCall = calls.find(call => {
      const message = call[0]
      return message && message.type === type &&
             (!data || JSON.stringify(message.data) === JSON.stringify(data))
    })

    if (matchingCall) {
      return {
        message: () => `expected not to have been called with message type "${type}"`,
        pass: true
      }
    } else {
      return {
        message: () => `expected to have been called with message type "${type}"${data ? ` and data ${JSON.stringify(data)}` : ''}`,
        pass: false
      }
    }
  }
})

console.log('🧪 Jest setup complete - ready for Chrome extension testing')
