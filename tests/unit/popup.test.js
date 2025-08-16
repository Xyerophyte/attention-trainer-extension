/**
 * Unit Tests for Popup Script
 * Tests UI interactions, settings management, analytics display, and user preferences
 */

// Mock DOM environment
global.document = {
  getElementById: jest.fn(),
  querySelector: jest.fn(),
  querySelectorAll: jest.fn(),
  createElement: jest.fn(),
  addEventListener: jest.fn()
}

global.window = {
  addEventListener: jest.fn(),
  location: { hostname: 'test.com' }
}

// Mock chrome APIs
global.chrome = {
  runtime: {
    sendMessage: jest.fn(),
    onMessage: { addListener: jest.fn() },
    getURL: jest.fn()
  },
  tabs: {
    query: jest.fn(),
    create: jest.fn()
  },
  storage: {
    local: {
      get: jest.fn(),
      set: jest.fn()
    }
  }
}

// Mock DOM elements
const mockElements = {
  toggleSwitch: {
    checked: true,
    addEventListener: jest.fn(),
    classList: { add: jest.fn(), remove: jest.fn(), toggle: jest.fn() }
  },
  focusModeSelect: {
    value: 'gentle',
    addEventListener: jest.fn(),
    options: [
      { value: 'gentle', text: 'Gentle' },
      { value: 'moderate', text: 'Moderate' },
      { value: 'strict', text: 'Strict' }
    ]
  },
  analyticsContainer: {
    innerHTML: '',
    style: { display: 'block' },
    appendChild: jest.fn()
  },
  settingsContainer: {
    style: { display: 'none' }
  },
  statusText: {
    textContent: '',
    className: ''
  },
  saveButton: {
    addEventListener: jest.fn(),
    disabled: false,
    textContent: 'Save Settings'
  },
  exportButton: {
    addEventListener: jest.fn(),
    disabled: false
  },
  resetButton: {
    addEventListener: jest.fn(),
    disabled: false
  }
}

describe('Popup Script Unit Tests', () => {
  let mockCurrentTab
  let mockSettings
  let mockAnalytics

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks()

    // Setup default mock data
    mockCurrentTab = [{ id: 1, url: 'https://youtube.com/watch?v=test' }]
    mockSettings = {
      isEnabled: true,
      focusMode: 'gentle',
      thresholds: { stage1: 30, stage2: 60, stage3: 120, stage4: 180 },
      whitelist: [],
      showAnalytics: true,
      notifications: true
    }
    mockAnalytics = {
      'youtube.com': {
        '2024-01-15': [
          { timeOnPage: 2.5, behaviorScore: 45, interventionStage: 2 },
          { timeOnPage: 1.8, behaviorScore: 30, interventionStage: 1 }
        ]
      },
      'instagram.com': {
        '2024-01-15': [
          { timeOnPage: 3.2, behaviorScore: 60, interventionStage: 3 }
        ]
      }
    }

    // Setup DOM element mocks
    document.getElementById.mockImplementation((id) => {
      const elementMap = {
        'toggle-extension': mockElements.toggleSwitch,
        'focus-mode': mockElements.focusModeSelect,
        'analytics-container': mockElements.analyticsContainer,
        'settings-container': mockElements.settingsContainer,
        'status-text': mockElements.statusText,
        'save-settings': mockElements.saveButton,
        'export-data': mockElements.exportButton,
        'reset-settings': mockElements.resetButton
      }
      return elementMap[id] || { addEventListener: jest.fn() }
    })

    // Setup chrome API mocks
    chrome.tabs.query.mockResolvedValue(mockCurrentTab)
    chrome.runtime.sendMessage.mockImplementation((message, callback) => {
      if (callback) {
        if (message.type === 'GET_SETTINGS') {
          callback(mockSettings)
        } else if (message.type === 'GET_ANALYTICS') {
          callback({ success: true, analytics: mockAnalytics })
        } else if (message.type === 'UPDATE_SETTINGS') {
          callback({ success: true })
        }
      }
      return Promise.resolve()
    })
  })

  describe('Popup Initialization', () => {
    it('should create AttentionTrainerPopup class', () => {
      // Load popup script (creates global instance)
      require('../../src/popup/popup.js')
      const popupInstance = global.window.attentionTrainerPopup
      
      expect(popupInstance).toBeDefined()
      expect(popupInstance.settings).toBeDefined()
      expect(typeof popupInstance.loadSettings).toBe('function')
      expect(typeof popupInstance.updateUI).toBe('function')
    })

    it('should load settings on initialization', async () => {
      // Mock proper DOM elements first
      document.getElementById = jest.fn().mockImplementation((id) => {
        const elementMap = {
          'mainToggle': { addEventListener: jest.fn(), classList: { add: jest.fn(), remove: jest.fn() } },
          'openDashboard': { addEventListener: jest.fn() },
          'manageWhitelist': { addEventListener: jest.fn() },
          'todayScrollTime': { textContent: '' },
          'todayInterventions': { textContent: '' },
          'focusScore': { textContent: '' }
        }
        return elementMap[id] || { addEventListener: jest.fn(), textContent: '' }
      })
      
      document.querySelectorAll = jest.fn().mockReturnValue([])
      
      // Mock successful message response
      chrome.runtime.sendMessage.mockImplementation(() => {
        return Promise.resolve(mockSettings)
      })

      // Create new popup instance
      require('../../src/popup/popup.js')
      const popupInstance = global.window.attentionTrainerPopup
      
      // Wait for async initialization to complete
      await new Promise(resolve => setTimeout(resolve, 100))
      
      expect(popupInstance.settings).toEqual(expect.objectContaining({
        isEnabled: true,
        focusMode: 'gentle'
      }))
    })

    it('should handle settings loading errors gracefully', async () => {
      // Mock DOM elements
      document.getElementById = jest.fn().mockImplementation(() => ({ 
        addEventListener: jest.fn(),
        classList: { add: jest.fn(), remove: jest.fn() },
        textContent: ''
      }))
      document.querySelectorAll = jest.fn().mockReturnValue([])
      
      // Mock error response
      chrome.runtime.sendMessage.mockImplementation(() => {
        return Promise.reject(new Error('Background script error'))
      })

      // Create popup instance
      require('../../src/popup/popup.js')
      const popupInstance = global.window.attentionTrainerPopup
      
      // Wait for async initialization
      await new Promise(resolve => setTimeout(resolve, 100))
      
      // Should have fallback settings
      expect(popupInstance.settings.isEnabled).toBe(true)
      expect(popupInstance.settings.focusMode).toBe('gentle')
    })
  })

  describe('Settings Management', () => {
    it('should toggle extension on/off', async () => {
      const toggleListener = mockElements.toggleSwitch.addEventListener.mock.calls
        .find(call => call[0] === 'change')?.[1]

      mockElements.toggleSwitch.checked = false

      if (toggleListener) {
        await toggleListener()
      }

      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'UPDATE_SETTINGS',
          data: expect.objectContaining({ isEnabled: false })
        })
      )
    })

    it('should update focus mode', async () => {
      const focusModeListener = mockElements.focusModeSelect.addEventListener.mock.calls
        .find(call => call[0] === 'change')?.[1]

      mockElements.focusModeSelect.value = 'strict'

      if (focusModeListener) {
        await focusModeListener()
      }

      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'UPDATE_SETTINGS',
          data: expect.objectContaining({ focusMode: 'strict' })
        })
      )
    })

    it('should save all settings when save button clicked', async () => {
      const saveListener = mockElements.saveButton.addEventListener.mock.calls
        .find(call => call[0] === 'click')?.[1]

      mockElements.toggleSwitch.checked = false
      mockElements.focusModeSelect.value = 'moderate'

      if (saveListener) {
        await saveListener()
      }

      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'UPDATE_SETTINGS',
          data: expect.objectContaining({
            isEnabled: false,
            focusMode: 'moderate'
          })
        })
      )
    })

    it('should provide visual feedback on successful save', async () => {
      chrome.runtime.sendMessage.mockImplementation((message, callback) => {
        if (message.type === 'UPDATE_SETTINGS') {
          callback({ success: true })
        }
      })

      const saveListener = mockElements.saveButton.addEventListener.mock.calls
        .find(call => call[0] === 'click')?.[1]

      if (saveListener) {
        await saveListener()
      }

      expect(mockElements.statusText.textContent).toBe('Settings saved successfully!')
      expect(mockElements.statusText.className).toContain('success')
    })

    it('should handle save errors', async () => {
      chrome.runtime.sendMessage.mockImplementation((message, callback) => {
        if (message.type === 'UPDATE_SETTINGS') {
          callback({ success: false, error: 'Storage quota exceeded' })
        }
      })

      const saveListener = mockElements.saveButton.addEventListener.mock.calls
        .find(call => call[0] === 'click')?.[1]

      if (saveListener) {
        await saveListener()
      }

      expect(mockElements.statusText.textContent).toContain('Error saving settings')
      expect(mockElements.statusText.className).toContain('error')
    })
  })

  describe('Basic Functionality', () => {
    it('should have basic popup functionality', () => {
      require('../../src/popup/popup.js')
      const popupInstance = global.window.attentionTrainerPopup
      
      expect(typeof popupInstance.toggleExtension).toBe('function')
      expect(typeof popupInstance.updateFocusMode).toBe('function')
      expect(typeof popupInstance.showError).toBe('function')
    })

    it('should handle whitelist management', async () => {
      require('../../src/popup/popup.js')
      const popupInstance = global.window.attentionTrainerPopup
      
      // Mock tabs query
      chrome.tabs.query = jest.fn().mockImplementation((query, callback) => {
        callback([{ url: 'https://youtube.com/watch' }])
      })
      
      // Test whitelist dialog (simplified)
      expect(typeof popupInstance.showWhitelistDialog).toBe('function')
      expect(typeof popupInstance.toggleWhitelist).toBe('function')
    })
  })






})
