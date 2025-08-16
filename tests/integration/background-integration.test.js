/**
 * Integration Tests for Background Script
 * Tests interactions between background script, content scripts, popup, and storage systems
 */

const fs = require('fs')
const path = require('path')

describe('Background Script Integration Tests', () => {
  let mockChrome
  let backgroundScript
  let messageHandlers
  let alarmHandlers
  let installHandlers

  beforeEach(async () => {
    // Reset module cache
    jest.resetModules()

    // Create comprehensive chrome mock
    mockChrome = {
      runtime: {
        onInstalled: { addListener: jest.fn() },
        onStartup: { addListener: jest.fn() },
        onMessage: { addListener: jest.fn() },
        sendMessage: jest.fn(),
        getURL: jest.fn(path => `chrome-extension://test-id/${path}`),
        id: 'test-extension-id',
        getManifest: jest.fn(() => ({ version: '1.0.0' }))
      },
      storage: {
        local: {
          get: jest.fn(),
          set: jest.fn(),
          clear: jest.fn()
        },
        sync: {
          get: jest.fn(),
          set: jest.fn()
        }
      },
      tabs: {
        query: jest.fn(),
        sendMessage: jest.fn(),
        onActivated: { addListener: jest.fn() },
        onUpdated: { addListener: jest.fn() }
      },
      alarms: {
        create: jest.fn(),
        onAlarm: { addListener: jest.fn() },
        clear: jest.fn()
      },
      action: {
        setBadgeText: jest.fn(),
        setBadgeBackgroundColor: jest.fn()
      }
    }

    global.chrome = mockChrome

    // Capture handlers for testing
    messageHandlers = []
    alarmHandlers = []
    installHandlers = []

    mockChrome.runtime.onMessage.addListener.mockImplementation(handler => {
      messageHandlers.push(handler)
    })

    mockChrome.alarms.onAlarm.addListener.mockImplementation(handler => {
      alarmHandlers.push(handler)
    })

    mockChrome.runtime.onInstalled.addListener.mockImplementation(handler => {
      installHandlers.push(handler)
    })

    // Load background script
    const backgroundPath = path.join(__dirname, '../../src/background/background.js')
    const backgroundCode = fs.readFileSync(backgroundPath, 'utf8')
    eval(backgroundCode)
  })

  describe('Extension Lifecycle Integration', () => {
    it('should initialize extension with default settings on first install', async () => {
      mockChrome.storage.local.get.mockResolvedValue({})
      mockChrome.storage.local.set.mockResolvedValue()

      // Simulate fresh install
      const installHandler = installHandlers[0]
      await installHandler({ reason: 'install' })

      expect(mockChrome.storage.local.set).toHaveBeenCalledWith(
        expect.objectContaining({
          isEnabled: true,
          focusMode: 'gentle',
          thresholds: expect.any(Object),
          whitelist: expect.any(Array)
        })
      )
    })

    it('should migrate settings on extension update', async () => {
      const oldSettings = {
        enabled: true, // old format
        mode: 'soft', // old format
        sites: ['youtube.com'] // old format
      }

      mockChrome.storage.local.get.mockResolvedValue(oldSettings)
      mockChrome.storage.local.set.mockResolvedValue()

      const installHandler = installHandlers[0]
      await installHandler({ reason: 'update', previousVersion: '0.9.0' })

      expect(mockChrome.storage.local.set).toHaveBeenCalledWith(
        expect.objectContaining({
          isEnabled: true,
          focusMode: 'gentle',
          whitelist: ['youtube.com']
        })
      )
    })

    it('should maintain keep-alive mechanism', async () => {
      mockChrome.storage.local.get.mockResolvedValue({ keepAlive: Date.now() })

      const alarmHandler = alarmHandlers[0]
      await alarmHandler({ name: 'keepAlive' })

      expect(mockChrome.storage.local.set).toHaveBeenCalledWith(
        expect.objectContaining({ keepAlive: expect.any(Number) })
      )
    })
  })

  describe('Content Script Communication', () => {
    it('should send settings to content script when ready', async () => {
      const mockSettings = {
        isEnabled: true,
        focusMode: 'gentle',
        thresholds: { stage1: 30, stage2: 60, stage3: 120, stage4: 180 },
        whitelist: []
      }

      mockChrome.storage.local.get.mockResolvedValue(mockSettings)
      mockChrome.tabs.sendMessage.mockResolvedValue({ success: true })

      const messageHandler = messageHandlers[0]
      const sendResponse = jest.fn()

      await messageHandler(
        { type: 'CONTENT_SCRIPT_READY' },
        { tab: { id: 1, url: 'https://youtube.com' } },
        sendResponse
      )

      expect(mockChrome.tabs.sendMessage).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          type: 'SETTINGS_UPDATE',
          data: mockSettings
        })
      )
    })

    it('should process behavioral events from content script', async () => {
      const existingAnalytics = {
        'youtube.com': {
          '2024-01-15': [
            { timeOnPage: 1.5, behaviorScore: 30, timestamp: Date.now() - 3600000 }
          ]
        }
      }

      mockChrome.storage.local.get.mockResolvedValue({ analytics: existingAnalytics })
      mockChrome.storage.local.set.mockResolvedValue()

      const behavioralData = {
        domain: 'youtube.com',
        siteType: 'video',
        timeOnPage: 2.5,
        behaviorScore: 45,
        interventionStage: 2,
        timestamp: Date.now()
      }

      const messageHandler = messageHandlers[0]
      const sendResponse = jest.fn()

      await messageHandler(
        { type: 'BEHAVIORAL_EVENT', data: behavioralData },
        { tab: { id: 1 } },
        sendResponse
      )

      expect(mockChrome.storage.local.set).toHaveBeenCalledWith(
        expect.objectContaining({
          analytics: expect.any(Object)
        })
      )
      expect(sendResponse).toHaveBeenCalledWith({ success: true })
    })

    it('should trigger interventions based on behavioral data', async () => {
      const settings = { isEnabled: true, focusMode: 'strict' }
      mockChrome.storage.local.get.mockResolvedValue(settings)
      mockChrome.tabs.sendMessage.mockResolvedValue({ success: true })

      const messageHandler = messageHandlers[0]
      const sendResponse = jest.fn()

      await messageHandler(
        { type: 'TRIGGER_INTERVENTION', data: { stage: 3, domain: 'youtube.com' } },
        { tab: { id: 1 } },
        sendResponse
      )

      expect(mockChrome.tabs.sendMessage).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          type: 'TRIGGER_INTERVENTION',
          data: expect.objectContaining({ stage: 3 })
        })
      )

      expect(mockChrome.action.setBadgeText).toHaveBeenCalledWith({
        text: '3',
        tabId: 1
      })
    })

    it('should handle content script disconnections gracefully', async () => {
      mockChrome.tabs.sendMessage.mockRejectedValue(
        new Error('receiving end does not exist')
      )

      const messageHandler = messageHandlers[0]
      const sendResponse = jest.fn()

      // Should not throw error when content script is unavailable
      await messageHandler(
        { type: 'CONTENT_SCRIPT_READY' },
        { tab: { id: 1 } },
        sendResponse
      )

      expect(sendResponse).toHaveBeenCalled()
    })
  })

  describe('Popup Communication', () => {
    it('should provide settings to popup', async () => {
      const mockSettings = {
        isEnabled: true,
        focusMode: 'moderate',
        thresholds: { stage1: 30, stage2: 60, stage3: 120, stage4: 180 },
        whitelist: ['facebook.com']
      }

      mockChrome.storage.local.get.mockResolvedValue(mockSettings)

      const messageHandler = messageHandlers[0]
      const sendResponse = jest.fn()

      await messageHandler(
        { type: 'GET_SETTINGS' },
        { tab: { id: 1 } },
        sendResponse
      )

      expect(sendResponse).toHaveBeenCalledWith(mockSettings)
    })

    it('should update settings from popup and broadcast changes', async () => {
      const newSettings = {
        isEnabled: false,
        focusMode: 'strict',
        thresholds: { stage1: 20, stage2: 40, stage3: 80, stage4: 120 }
      }

      mockChrome.storage.local.set.mockResolvedValue()
      mockChrome.tabs.query.mockResolvedValue([
        { id: 1, url: 'https://youtube.com' },
        { id: 2, url: 'https://instagram.com' }
      ])
      mockChrome.tabs.sendMessage.mockResolvedValue({ success: true })

      const messageHandler = messageHandlers[0]
      const sendResponse = jest.fn()

      await messageHandler(
        { type: 'UPDATE_SETTINGS', data: newSettings },
        { tab: { id: 1 } },
        sendResponse
      )

      expect(mockChrome.storage.local.set).toHaveBeenCalledWith(
        expect.objectContaining(newSettings)
      )

      expect(mockChrome.tabs.sendMessage).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          type: 'SETTINGS_UPDATE',
          data: expect.objectContaining(newSettings)
        })
      )

      expect(sendResponse).toHaveBeenCalledWith({ success: true })
    })

    it('should provide analytics data to popup', async () => {
      const analyticsData = {
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

      mockChrome.storage.local.get.mockResolvedValue({ analytics: analyticsData })

      const messageHandler = messageHandlers[0]
      const sendResponse = jest.fn()

      await messageHandler(
        { type: 'GET_ANALYTICS', data: { days: 7 } },
        { tab: { id: 1 } },
        sendResponse
      )

      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          analytics: analyticsData
        })
      )
    })

    it('should export user data for popup', async () => {
      const mockData = {
        isEnabled: true,
        focusMode: 'gentle',
        analytics: { 'youtube.com': { '2024-01-15': [] } }
      }

      mockChrome.storage.local.get.mockResolvedValue(mockData)

      const messageHandler = messageHandlers[0]
      const sendResponse = jest.fn()

      await messageHandler(
        { type: 'EXPORT_DATA' },
        { tab: { id: 1 } },
        sendResponse
      )

      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            exportDate: expect.any(String),
            version: expect.any(String),
            settings: expect.any(Object),
            analytics: expect.any(Object)
          })
        })
      )
    })
  })

  describe('Storage Management Integration', () => {
    it('should handle storage quota exceeded gracefully', async () => {
      mockChrome.storage.local.set.mockRejectedValue(
        new Error('QUOTA_BYTES quota exceeded')
      )

      // Mock existing large analytics data
      const largeAnalytics = {}
      for (let i = 0; i < 100; i++) {
        largeAnalytics[`domain${i}.com`] = {
          '2024-01-15': Array(1000).fill({
            timeOnPage: 2.5,
            behaviorScore: 45,
            timestamp: Date.now()
          })
        }
      }

      mockChrome.storage.local.get.mockResolvedValue({ analytics: largeAnalytics })

      const messageHandler = messageHandlers[0]
      const sendResponse = jest.fn()

      const behavioralData = {
        domain: 'youtube.com',
        timeOnPage: 2.5,
        behaviorScore: 45,
        timestamp: Date.now()
      }

      await messageHandler(
        { type: 'BEHAVIORAL_EVENT', data: behavioralData },
        { tab: { id: 1 } },
        sendResponse
      )

      // Should attempt cleanup and retry
      expect(mockChrome.storage.local.set).toHaveBeenCalledTimes(2)
      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({ success: true })
      )
    })

    it('should clean up old analytics data automatically', async () => {
      const oldDate = new Date(Date.now() - 91 * 24 * 60 * 60 * 1000)
        .toISOString().split('T')[0]
      const recentDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
        .toISOString().split('T')[0]

      const analyticsData = {
        'youtube.com': {
          [oldDate]: [{ timestamp: Date.now() - 91 * 24 * 60 * 60 * 1000 }],
          [recentDate]: [{ timestamp: Date.now() - 30 * 24 * 60 * 60 * 1000 }]
        }
      }

      mockChrome.storage.local.get.mockResolvedValue({ analytics: analyticsData })
      mockChrome.storage.local.set.mockResolvedValue()

      const messageHandler = messageHandlers[0]
      const sendResponse = jest.fn()

      await messageHandler(
        { type: 'CLEANUP_ANALYTICS' },
        { tab: { id: 1 } },
        sendResponse
      )

      const setCall = mockChrome.storage.local.set.mock.calls[0][0]
      const cleanedAnalytics = setCall.analytics

      expect(cleanedAnalytics['youtube.com'][oldDate]).toBeUndefined()
      expect(cleanedAnalytics['youtube.com'][recentDate]).toBeDefined()
    })

    it('should migrate storage between versions', async () => {
      const v09Data = {
        enabled: true,
        mode: 'soft',
        sites: ['youtube.com', 'facebook.com'],
        stats: {
          youtube_com: [{ time: 120, score: 45 }]
        }
      }

      mockChrome.storage.local.get.mockResolvedValue(v09Data)
      mockChrome.storage.local.set.mockResolvedValue()

      const installHandler = installHandlers[0]
      await installHandler({ reason: 'update', previousVersion: '0.9.0' })

      expect(mockChrome.storage.local.set).toHaveBeenCalledWith(
        expect.objectContaining({
          isEnabled: true,
          focusMode: 'gentle',
          whitelist: ['youtube.com', 'facebook.com'],
          analytics: expect.any(Object)
        })
      )
    })
  })

  describe('Tab Management Integration', () => {
    it('should handle tab activation and send settings', async () => {
      const mockSettings = {
        isEnabled: true,
        focusMode: 'moderate',
        whitelist: []
      }

      mockChrome.storage.local.get.mockResolvedValue(mockSettings)
      mockChrome.tabs.query.mockResolvedValue([
        { id: 1, url: 'https://youtube.com/watch', active: true }
      ])
      mockChrome.tabs.sendMessage.mockResolvedValue({ success: true })

      // Simulate tab activation
      const tabActivationHandler = mockChrome.tabs.onActivated.addListener.mock.calls[0]?.[0]
      if (tabActivationHandler) {
        await tabActivationHandler({ tabId: 1 })
      }

      expect(mockChrome.tabs.sendMessage).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          type: 'TAB_ACTIVATED',
          data: expect.objectContaining(mockSettings)
        })
      )
    })

    it('should handle tab updates and refresh content script', async () => {
      mockChrome.tabs.sendMessage.mockResolvedValue({ success: true })

      // Simulate tab update
      const tabUpdateHandler = mockChrome.tabs.onUpdated.addListener.mock.calls[0]?.[0]
      if (tabUpdateHandler) {
        await tabUpdateHandler(
          1,
          { status: 'complete' },
          { id: 1, url: 'https://youtube.com/watch' }
        )
      }

      expect(mockChrome.tabs.sendMessage).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          type: 'TAB_UPDATED'
        })
      )
    })

    it('should update badge based on intervention level', async () => {
      const messageHandler = messageHandlers[0]
      const sendResponse = jest.fn()

      await messageHandler(
        { type: 'UPDATE_BADGE', data: { stage: 2, tabId: 1 } },
        { tab: { id: 1 } },
        sendResponse
      )

      expect(mockChrome.action.setBadgeText).toHaveBeenCalledWith({
        text: '2',
        tabId: 1
      })

      expect(mockChrome.action.setBadgeBackgroundColor).toHaveBeenCalledWith({
        color: expect.any(String),
        tabId: 1
      })
    })
  })

  describe('Error Recovery Integration', () => {
    it('should recover from storage corruption', async () => {
      // Simulate corrupted storage
      mockChrome.storage.local.get.mockResolvedValue({
        isEnabled: 'invalid',
        focusMode: null,
        thresholds: 'corrupt'
      })

      mockChrome.storage.local.set.mockResolvedValue()

      const messageHandler = messageHandlers[0]
      const sendResponse = jest.fn()

      await messageHandler(
        { type: 'GET_SETTINGS' },
        { tab: { id: 1 } },
        sendResponse
      )

      // Should provide default settings and fix corruption
      expect(mockChrome.storage.local.set).toHaveBeenCalledWith(
        expect.objectContaining({
          isEnabled: true,
          focusMode: 'gentle',
          thresholds: expect.any(Object)
        })
      )

      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          isEnabled: true,
          focusMode: 'gentle'
        })
      )
    })

    it('should handle runtime context invalidation', async () => {
      // Simulate chrome.runtime context becoming invalid
      mockChrome.runtime.sendMessage.mockRejectedValue(
        new Error('Extension context invalidated')
      )

      const messageHandler = messageHandlers[0]
      const sendResponse = jest.fn()

      // Should handle context invalidation gracefully
      await messageHandler(
        { type: 'HEALTH_CHECK' },
        { tab: { id: 1 } },
        sendResponse
      )

      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          healthy: false,
          error: expect.stringContaining('context')
        })
      )
    })

    it('should recover from failed tab communications', async () => {
      mockChrome.tabs.sendMessage
        .mockRejectedValueOnce(new Error('receiving end does not exist'))
        .mockResolvedValueOnce({ success: true })

      const messageHandler = messageHandlers[0]
      const sendResponse = jest.fn()

      await messageHandler(
        { type: 'CONTENT_SCRIPT_READY' },
        { tab: { id: 1 } },
        sendResponse
      )

      // Should attempt retry and handle failure gracefully
      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({ success: true })
      )
    })
  })

  describe('Performance Integration', () => {
    it('should batch multiple analytics events', async () => {
      mockChrome.storage.local.get.mockResolvedValue({ analytics: {} })
      mockChrome.storage.local.set.mockResolvedValue()

      const messageHandler = messageHandlers[0]

      // Send multiple events in rapid succession
      const events = Array.from({ length: 5 }, (_, i) => ({
        type: 'BEHAVIORAL_EVENT',
        data: {
          domain: 'youtube.com',
          timeOnPage: 2.5 + i,
          behaviorScore: 45 + i,
          timestamp: Date.now() + i * 1000
        }
      }))

      const promises = events.map(event =>
        messageHandler(event, { tab: { id: 1 } }, jest.fn())
      )

      await Promise.all(promises)

      // Should batch storage operations
      expect(mockChrome.storage.local.set.mock.calls.length).toBeLessThanOrEqual(2)
    })

    it('should implement rate limiting for high-frequency events', async () => {
      mockChrome.storage.local.get.mockResolvedValue({ analytics: {} })
      mockChrome.storage.local.set.mockResolvedValue()

      const messageHandler = messageHandlers[0]

      // Send many events very rapidly
      const rapidEvents = Array.from({ length: 50 }, (_, i) => ({
        type: 'BEHAVIORAL_EVENT',
        data: {
          domain: 'youtube.com',
          timeOnPage: 0.1,
          behaviorScore: 10,
          timestamp: Date.now() + i
        }
      }))

      const promises = rapidEvents.map(event =>
        messageHandler(event, { tab: { id: 1 } }, jest.fn())
      )

      await Promise.all(promises)

      // Should implement rate limiting
      expect(mockChrome.storage.local.set.mock.calls.length).toBeLessThan(25)
    })
  })

  describe('Cross-Component Data Flow', () => {
    it('should maintain data consistency across popup and content script', async () => {
      const initialSettings = {
        isEnabled: true,
        focusMode: 'gentle',
        whitelist: []
      }

      mockChrome.storage.local.get.mockResolvedValue(initialSettings)
      mockChrome.storage.local.set.mockResolvedValue()
      mockChrome.tabs.query.mockResolvedValue([{ id: 1, url: 'https://youtube.com' }])
      mockChrome.tabs.sendMessage.mockResolvedValue({ success: true })

      const messageHandler = messageHandlers[0]

      // 1. Popup requests settings
      let sendResponse = jest.fn()
      await messageHandler(
        { type: 'GET_SETTINGS' },
        { tab: { id: 1 } },
        sendResponse
      )
      expect(sendResponse).toHaveBeenCalledWith(initialSettings)

      // 2. Popup updates settings
      const newSettings = { ...initialSettings, focusMode: 'strict' }
      sendResponse = jest.fn()
      await messageHandler(
        { type: 'UPDATE_SETTINGS', data: newSettings },
        { tab: { id: 1 } },
        sendResponse
      )

      expect(mockChrome.storage.local.set).toHaveBeenCalledWith(
        expect.objectContaining(newSettings)
      )

      // 3. Content script should receive updated settings
      expect(mockChrome.tabs.sendMessage).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          type: 'SETTINGS_UPDATE',
          data: expect.objectContaining(newSettings)
        })
      )

      // 4. New content script connecting should get latest settings
      mockChrome.storage.local.get.mockResolvedValue(newSettings)
      sendResponse = jest.fn()
      await messageHandler(
        { type: 'CONTENT_SCRIPT_READY' },
        { tab: { id: 2, url: 'https://instagram.com' } },
        sendResponse
      )

      expect(mockChrome.tabs.sendMessage).toHaveBeenCalledWith(
        2,
        expect.objectContaining({
          type: 'SETTINGS_UPDATE',
          data: expect.objectContaining(newSettings)
        })
      )
    })
  })
})
