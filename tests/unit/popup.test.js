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
    it('should initialize popup when DOM loads', async () => {
      // Simulate DOMContentLoaded
      const domLoadedListener = global.document.addEventListener.mock.calls
        .find(call => call[0] === 'DOMContentLoaded')?.[1]

      if (domLoadedListener) {
        await domLoadedListener()
      }

      expect(chrome.tabs.query).toHaveBeenCalledWith(
        { active: true, currentWindow: true }
      )
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
        { type: 'GET_SETTINGS' }
      )
    })

    it('should load current settings into UI', async () => {
      const popupScript = require('../../src/popup/popup.js')

      // Mock the settings response
      chrome.runtime.sendMessage.mockImplementation((message, callback) => {
        if (message.type === 'GET_SETTINGS') {
          callback(mockSettings)
        }
      })

      // Simulate initialization
      await popupScript.init()

      expect(mockElements.toggleSwitch.checked).toBe(true)
      expect(mockElements.focusModeSelect.value).toBe('gentle')
    })

    it('should handle missing settings gracefully', async () => {
      chrome.runtime.sendMessage.mockImplementation((message, callback) => {
        if (message.type === 'GET_SETTINGS') {
          callback(null)
        }
      })

      const popupScript = require('../../src/popup/popup.js')
      await popupScript.init()

      // Should use defaults
      expect(mockElements.toggleSwitch.checked).toBe(true)
      expect(mockElements.focusModeSelect.value).toBe('gentle')
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

  describe('Analytics Display', () => {
    it('should load and display analytics data', async () => {
      const popupScript = require('../../src/popup/popup.js')

      chrome.runtime.sendMessage.mockImplementation((message, callback) => {
        if (message.type === 'GET_ANALYTICS') {
          callback({ success: true, analytics: mockAnalytics })
        }
      })

      await popupScript.loadAnalytics()

      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'GET_ANALYTICS',
          data: expect.objectContaining({ days: 7 })
        })
      )
    })

    it('should create analytics charts and summaries', async () => {
      const mockChart = {
        getContext: jest.fn(() => ({
          fillRect: jest.fn(),
          fillText: jest.fn(),
          strokeRect: jest.fn()
        }))
      }

      document.createElement.mockReturnValue(mockChart)

      const popupScript = require('../../src/popup/popup.js')
      await popupScript.renderAnalytics(mockAnalytics)

      expect(document.createElement).toHaveBeenCalledWith('canvas')
      expect(mockElements.analyticsContainer.appendChild).toHaveBeenCalled()
    })

    it('should show current domain analytics', async () => {
      const popupScript = require('../../src/popup/popup.js')

      // Mock current tab as YouTube
      chrome.tabs.query.mockResolvedValue([{ url: 'https://youtube.com/watch' }])

      await popupScript.showCurrentDomainStats()

      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'GET_ANALYTICS',
          data: expect.objectContaining({ domain: 'youtube.com' })
        })
      )
    })

    it('should handle analytics data gracefully when empty', async () => {
      chrome.runtime.sendMessage.mockImplementation((message, callback) => {
        if (message.type === 'GET_ANALYTICS') {
          callback({ success: true, analytics: {} })
        }
      })

      const popupScript = require('../../src/popup/popup.js')
      await popupScript.loadAnalytics()

      expect(mockElements.analyticsContainer.innerHTML).toContain('No analytics data available')
    })
  })

  describe('Site-Specific Controls', () => {
    it('should show whitelist toggle for current domain', async () => {
      const popupScript = require('../../src/popup/popup.js')

      chrome.tabs.query.mockResolvedValue([{ url: 'https://youtube.com/watch' }])

      await popupScript.showSiteControls()

      const whitelistToggle = document.getElementById.mock.calls
        .find(call => call[0] === 'whitelist-toggle')

      expect(whitelistToggle).toBeDefined()
    })

    it('should add current domain to whitelist', async () => {
      const whitelistToggle = {
        checked: true,
        addEventListener: jest.fn()
      }

      document.getElementById.mockImplementation((id) => {
        if (id === 'whitelist-toggle') {
          return whitelistToggle
        }
        return mockElements[id] || { addEventListener: jest.fn() }
      })

      const toggleListener = whitelistToggle.addEventListener.mock.calls
        .find(call => call[0] === 'change')?.[1]

      if (toggleListener) {
        await toggleListener()
      }

      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'UPDATE_SETTINGS',
          data: expect.objectContaining({
            whitelist: expect.arrayContaining(['youtube.com'])
          })
        })
      )
    })

    it('should remove domain from whitelist when unchecked', async () => {
      mockSettings.whitelist = ['youtube.com']

      const whitelistToggle = {
        checked: false,
        addEventListener: jest.fn()
      }

      document.getElementById.mockImplementation((id) => {
        if (id === 'whitelist-toggle') {
          return whitelistToggle
        }
        return mockElements[id] || { addEventListener: jest.fn() }
      })

      const toggleListener = whitelistToggle.addEventListener.mock.calls
        .find(call => call[0] === 'change')?.[1]

      if (toggleListener) {
        await toggleListener()
      }

      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'UPDATE_SETTINGS',
          data: expect.objectContaining({
            whitelist: []
          })
        })
      )
    })
  })

  describe('Data Export/Import', () => {
    it('should export user data', async () => {
      const mockExportData = {
        success: true,
        data: {
          exportDate: '2024-01-15',
          version: '1.0.0',
          settings: mockSettings,
          analytics: mockAnalytics
        }
      }

      chrome.runtime.sendMessage.mockImplementation((message, callback) => {
        if (message.type === 'EXPORT_DATA') {
          callback(mockExportData)
        }
      })

      // Mock URL.createObjectURL and download
      global.URL = {
        createObjectURL: jest.fn(() => 'blob:mock-url'),
        revokeObjectURL: jest.fn()
      }

      const mockAnchor = {
        href: '',
        download: '',
        click: jest.fn()
      }
      document.createElement.mockReturnValue(mockAnchor)

      const exportListener = mockElements.exportButton.addEventListener.mock.calls
        .find(call => call[0] === 'click')?.[1]

      if (exportListener) {
        await exportListener()
      }

      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
        { type: 'EXPORT_DATA' }
      )
      expect(mockAnchor.click).toHaveBeenCalled()
      expect(mockAnchor.download).toContain('attention-trainer-data')
    })

    it('should handle export errors', async () => {
      chrome.runtime.sendMessage.mockImplementation((message, callback) => {
        if (message.type === 'EXPORT_DATA') {
          callback({ success: false, error: 'Export failed' })
        }
      })

      const exportListener = mockElements.exportButton.addEventListener.mock.calls
        .find(call => call[0] === 'click')?.[1]

      if (exportListener) {
        await exportListener()
      }

      expect(mockElements.statusText.textContent).toContain('Error exporting data')
      expect(mockElements.statusText.className).toContain('error')
    })
  })

  describe('Settings Reset', () => {
    it('should reset settings to defaults', async () => {
      chrome.runtime.sendMessage.mockImplementation((message, callback) => {
        if (message.type === 'RESET_SETTINGS') {
          callback({ success: true })
        }
      })

      const resetListener = mockElements.resetButton.addEventListener.mock.calls
        .find(call => call[0] === 'click')?.[1]

      if (resetListener) {
        await resetListener()
      }

      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
        { type: 'RESET_SETTINGS' }
      )
    })

    it('should reload UI after reset', async () => {
      chrome.runtime.sendMessage.mockImplementation((message, callback) => {
        if (message.type === 'RESET_SETTINGS') {
          callback({ success: true })
        } else if (message.type === 'GET_SETTINGS') {
          callback({
            isEnabled: true,
            focusMode: 'gentle',
            thresholds: { stage1: 30, stage2: 60, stage3: 120, stage4: 180 }
          })
        }
      })

      const resetListener = mockElements.resetButton.addEventListener.mock.calls
        .find(call => call[0] === 'click')?.[1]

      if (resetListener) {
        await resetListener()
      }

      // Should reload settings after reset
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
        { type: 'GET_SETTINGS' }
      )
    })
  })

  describe('UI State Management', () => {
    it('should disable controls when extension is off', async () => {
      mockSettings.isEnabled = false
      mockElements.toggleSwitch.checked = false

      const popupScript = require('../../src/popup/popup.js')
      await popupScript.updateUI(mockSettings)

      expect(mockElements.focusModeSelect.disabled).toBe(true)
      expect(mockElements.analyticsContainer.style.display).toBe('none')
    })

    it('should enable controls when extension is on', async () => {
      mockSettings.isEnabled = true
      mockElements.toggleSwitch.checked = true

      const popupScript = require('../../src/popup/popup.js')
      await popupScript.updateUI(mockSettings)

      expect(mockElements.focusModeSelect.disabled).toBe(false)
      expect(mockElements.analyticsContainer.style.display).toBe('block')
    })

    it('should update status text based on current domain', async () => {
      chrome.tabs.query.mockResolvedValue([{ url: 'https://youtube.com/watch' }])
      mockSettings.whitelist = ['youtube.com']

      const popupScript = require('../../src/popup/popup.js')
      await popupScript.updateStatusForDomain()

      expect(mockElements.statusText.textContent).toContain('youtube.com is whitelisted')
    })
  })

  describe('Keyboard Navigation', () => {
    it('should handle keyboard shortcuts', async () => {
      const keydownEvent = new KeyboardEvent('keydown', {
        key: 's',
        ctrlKey: true
      })

      const keydownListener = global.document.addEventListener.mock.calls
        .find(call => call[0] === 'keydown')?.[1]

      if (keydownListener) {
        keydownListener(keydownEvent)
      }

      // Should trigger save when Ctrl+S is pressed
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'UPDATE_SETTINGS' })
      )
    })

    it('should handle escape key to close popup', async () => {
      const keydownEvent = new KeyboardEvent('keydown', { key: 'Escape' })
      global.window.close = jest.fn()

      const keydownListener = global.document.addEventListener.mock.calls
        .find(call => call[0] === 'keydown')?.[1]

      if (keydownListener) {
        keydownListener(keydownEvent)
      }

      expect(global.window.close).toHaveBeenCalled()
    })
  })

  describe('Real-time Updates', () => {
    it('should update UI when settings change from other sources', async () => {
      const messageListener = chrome.runtime.onMessage.addListener.mock.calls[0]?.[0]

      const newSettings = {
        ...mockSettings,
        isEnabled: false,
        focusMode: 'strict'
      }

      if (messageListener) {
        messageListener({
          type: 'SETTINGS_UPDATED',
          data: newSettings
        })
      }

      expect(mockElements.toggleSwitch.checked).toBe(false)
      expect(mockElements.focusModeSelect.value).toBe('strict')
    })

    it('should refresh analytics when new data is available', async () => {
      const messageListener = chrome.runtime.onMessage.addListener.mock.calls[0]?.[0]

      if (messageListener) {
        messageListener({
          type: 'ANALYTICS_UPDATED',
          data: { domain: 'youtube.com' }
        })
      }

      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'GET_ANALYTICS' })
      )
    })
  })
})
