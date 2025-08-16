/**
 * Jest Setup File
 * Configures the testing environment for Chrome extension testing
 */

// Import required polyfills and mocks
require('fake-indexeddb/auto')
const chrome = require('sinon-chrome/webextensions')

// Global setup for Chrome APIs
global.chrome = chrome

// Enhance sinon-chrome stubs with Jest mock functionality for better compatibility
function enhanceStubWithJestMocks(stub) {
  if (!stub) return stub
  
  // Add Jest mock methods while preserving sinon functionality
  stub.mockResolvedValue = (val) => {
    stub.returns(Promise.resolve(val))
    return stub
  }
  
  stub.mockRejectedValue = (err) => {
    stub.returns(Promise.reject(err))
    return stub
  }
  
  stub.mockImplementation = (fn) => {
    stub.callsFake(fn)
    return stub
  }
  
  stub.mockReturnValue = (val) => {
    stub.returns(val)
    return stub
  }
  
  stub.mockClear = () => {
    stub.resetHistory()
    return stub
  }
  
  // Add toHaveBeenCalled compatibility 
  stub.toHaveBeenCalled = () => stub.called
  stub.toHaveBeenCalledWith = (...args) => stub.calledWith(...args)
  
  // Add Jest-style properties for compatibility (only if not already present)
  if (!stub.hasOwnProperty('mock')) {
    try {
      Object.defineProperty(stub, 'mock', {
        get() {
          return {
            calls: stub.getCalls().map(call => call.args),
            results: stub.getCalls().map(call => ({ type: 'return', value: call.returnValue })),
            instances: [],
            invocationCallOrder: stub.getCalls().map((call, index) => index)
          }
        },
        configurable: true
      })
    } catch (e) {
      // If mock property can't be defined, stub probably already has Jest-compatible interface
    }
  }
  
  return stub
}

// Enhance Chrome API stubs with Jest mock functionality
enhanceStubWithJestMocks(chrome.runtime.sendMessage)
enhanceStubWithJestMocks(chrome.storage?.local?.get)
enhanceStubWithJestMocks(chrome.storage?.local?.set)
enhanceStubWithJestMocks(chrome.storage?.local?.clear)
enhanceStubWithJestMocks(chrome.tabs?.query)
enhanceStubWithJestMocks(chrome.tabs?.sendMessage)

// Ensure action API exists and enhance it
if (!chrome.action) {
  chrome.action = {
    setBadgeText: chrome.runtime.sendMessage // Use existing stub as template
  }
}
if (!chrome.action.setBadgeText) {
  chrome.action.setBadgeText = chrome.runtime.sendMessage // Use existing stub
}
enhanceStubWithJestMocks(chrome.action.setBadgeText)

// Ensure alarms API exists and enhance it
if (!chrome.alarms) {
  chrome.alarms = {
    create: chrome.runtime.sendMessage, // Use existing stub as template
    onAlarm: { addListener: jest.fn(), removeListener: jest.fn() }
  }
}
if (!chrome.alarms.create) {
  chrome.alarms.create = chrome.runtime.sendMessage // Use existing stub
}
enhanceStubWithJestMocks(chrome.alarms.create)

// Mock window and document globals for content script testing
global.window = window
global.document = document

// Provide document.getElementById as a jest.fn so unit tests can mockImplementation
if (typeof document.getElementById !== 'function' || !document.getElementById._isMock) {
  const realGetElementById = document.getElementById?.bind(document)
  const mockGet = jest.fn((id) => realGetElementById ? realGetElementById(id) : null)
  mockGet._isMock = true
  document.getElementById = mockGet
}

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

  // Replace getURL with deterministic function compatible with tests
  if (typeof chrome.runtime.getURL?.callsFake === 'function') {
    chrome.runtime.getURL.callsFake((p) => `chrome-extension://test-extension-id/${p}`)
  } else if (typeof chrome.runtime.getURL?.returns === 'function') {
    // Fallback: static path (may not satisfy some tests expecting dynamic)
    chrome.runtime.getURL.returns('chrome-extension://test-extension-id/test.html')
  }

  // Make async style defaults return promises
  chrome.runtime.sendMessage.returns(Promise.resolve({}))
  chrome.storage.local.get.returns(Promise.resolve({}))
  chrome.storage.local.set.returns(Promise.resolve())
  chrome.storage.local.clear.returns(Promise.resolve())

  chrome.tabs.query.returns(Promise.resolve([]))
  chrome.tabs.sendMessage.returns(Promise.resolve({}))
  
  // Ensure action API has proper defaults
  if (chrome.action?.setBadgeText) {
    chrome.action.setBadgeText.returns(Promise.resolve())
  }
  
  // Ensure alarms API has proper defaults
  if (chrome.alarms?.create) {
    chrome.alarms.create.returns(Promise.resolve())
  }
  
  // Note: Chrome APIs are read-only sinon stubs, so we work with them as-is

  // Ensure event addListener methods are Jest-mock compatible for expectations
  const ensureEvent = (evt) => {
    if (evt && typeof evt.addListener === 'function') {
      // track listeners so tests can inspect or invoke them
      evt._listeners = []
      evt.addListener = jest.fn((fn) => {
        evt._listeners.push(fn)
      })
    }
  }
  ensureEvent(chrome.runtime.onInstalled)
  ensureEvent(chrome.runtime.onStartup)
  ensureEvent(chrome.runtime.onMessage)
  ensureEvent(chrome.tabs.onUpdated)
  ensureEvent(chrome.tabs.onActivated)
  ensureEvent(chrome.alarms?.onAlarm)

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
  }),
  
  // Chrome API assertion helpers for sinon-chrome compatibility
  expectChromeApiCalled: (stub) => {
    if (!stub || !stub.called) {
      throw new Error(`Expected Chrome API to have been called`)
    }
  },
  
  expectChromeApiCalledWith: (stub, ...expectedArgs) => {
    if (!stub || !stub.called) {
      throw new Error(`Expected Chrome API to have been called`)
    }
    if (!stub.calledWith(...expectedArgs)) {
      const actualCalls = stub.getCalls().map(call => call.args)
      throw new Error(`Expected Chrome API to have been called with ${JSON.stringify(expectedArgs)}, but was called with: ${JSON.stringify(actualCalls)}`)
    }
  }
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
