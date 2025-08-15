/**
 * Unit Tests for Background Script
 * Tests message handling, analytics processing, settings management, and keep-alive functionality
 */

const fs = require('fs')
const path = require('path')

// Load background script source
const backgroundScriptPath = path.join(__dirname, '../../src/background/background.js')
let backgroundScriptSource = fs.readFileSync(backgroundScriptPath, 'utf8')

// Mock chrome APIs before loading the script
global.chrome = {
  runtime: {
    onInstalled: { addListener: jest.fn() },
    onStartup: { addListener: jest.fn() },
    onMessage: { addListener: jest.fn() },
    sendMessage: jest.fn(),
    getURL: jest.fn(),
    id: 'test-extension-id'
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

// Remove any module exports and self-executing code for testing
backgroundScriptSource = backgroundScriptSource.replace(/chrome\.runtime\.onInstalled\.addListener.*?}\);/s, '')
backgroundScriptSource = backgroundScriptSource.replace(/chrome\.runtime\.onStartup\.addListener.*?}\);/s, '')
backgroundScriptSource = backgroundScriptSource.replace(/chrome\.runtime\.onMessage\.addListener.*?}\);/s, '')

// Evaluate the background script
eval(backgroundScriptSource)

describe('Background Script Unit Tests', () => {
  let mockTabs
  let mockStorage

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks()

    // Setup default mock responses
    mockStorage = {
      isEnabled: true,
      focusMode: 'gentle',
      thresholds: { stage1: 30, stage2: 60, stage3: 120, stage4: 180 },
      whitelist: [],
      analytics: {}
    }

    mockTabs = [
      { id: 1, url: 'https://youtube.com/watch?v=test', active: true },
      { id: 2, url: 'https://instagram.com/feed', active: false }
    ]

    chrome.storage.local.get.mockResolvedValue(mockStorage)
    chrome.storage.local.set.mockResolvedValue()
    chrome.tabs.query.mockResolvedValue(mockTabs)
    chrome.tabs.sendMessage.mockResolvedValue({ success: true })
    chrome.runtime.getURL.mockImplementation((path) => `chrome-extension://test-extension-id/${path}`)
  })

  describe('Extension Lifecycle', () => {
    it('should register install listener', () => {
      expect(chrome.runtime.onInstalled.addListener).toHaveBeenCalled()
    })

    it('should register startup listener', () => {
      expect(chrome.runtime.onStartup.addListener).toHaveBeenCalled()
    })

    it('should register message listener', () => {
      expect(chrome.runtime.onMessage.addListener).toHaveBeenCalled()
    })

    it('should handle extension installation', async () => {
      const installListener = chrome.runtime.onInstalled.addListener.mock.calls[0][0]

      await installListener({ reason: 'install' })

      expect(chrome.storage.local.set).toHaveBeenCalledWith(
        expect.objectContaining({
          isEnabled: true,
          focusMode: 'gentle'
        })
      )
    })

    it('should handle extension update', async () => {
      const installListener = chrome.runtime.onInstalled.addListener.mock.calls[0][0]

      await installListener({ reason: 'update', previousVersion: '0.9.0' })

      // Should migrate settings or perform update tasks
      expect(chrome.storage.local.get).toHaveBeenCalled()
    })
  })

  describe('Settings Management', () => {
    it('should handle GET_SETTINGS message', async () => {
      const messageListener = chrome.runtime.onMessage.addListener.mock.calls[0][0]
      const sendResponse = jest.fn()

      await messageListener(
        { type: 'GET_SETTINGS' },
        { tab: { id: 1 } },
        sendResponse
      )

      expect(chrome.storage.local.get).toHaveBeenCalled()
      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          isEnabled: true,
          focusMode: 'gentle'
        })
      )
    })

    it('should handle UPDATE_SETTINGS message', async () => {
      const messageListener = chrome.runtime.onMessage.addListener.mock.calls[0][0]
      const sendResponse = jest.fn()
      const newSettings = { focusMode: 'strict', isEnabled: false }

      await messageListener(
        { type: 'UPDATE_SETTINGS', data: newSettings },
        { tab: { id: 1 } },
        sendResponse
      )

      expect(chrome.storage.local.set).toHaveBeenCalledWith(
        expect.objectContaining(newSettings)
      )
      expect(sendResponse).toHaveBeenCalledWith({ success: true })
    })

    it('should validate settings before saving', async () => {
      const messageListener = chrome.runtime.onMessage.addListener.mock.calls[0][0]
      const sendResponse = jest.fn()
      const invalidSettings = { focusMode: 'invalid_mode' }

      await messageListener(
        { type: 'UPDATE_SETTINGS', data: invalidSettings },
        { tab: { id: 1 } },
        sendResponse
      )

      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({ success: false })
      )
    })

    it('should provide default settings when none exist', async () => {
      chrome.storage.local.get.mockResolvedValue({})

      const messageListener = chrome.runtime.onMessage.addListener.mock.calls[0][0]
      const sendResponse = jest.fn()

      await messageListener(
        { type: 'GET_SETTINGS' },
        { tab: { id: 1 } },
        sendResponse
      )

      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          isEnabled: true,
          focusMode: 'gentle'
        })
      )
    })
  })

  describe('Analytics Processing', () => {
    const mockBehavioralData = {
      domain: 'youtube.com',
      siteType: 'video',
      timeOnPage: 2.5,
      behaviorScore: 45,
      interventionStage: 2,
      scrollTime: 150,
      flags: { rapid_scrolling: 3, content_viewed: 15 },
      timestamp: Date.now()
    }

    it('should handle BEHAVIORAL_EVENT message', async () => {
      const messageListener = chrome.runtime.onMessage.addListener.mock.calls[0][0]
      const sendResponse = jest.fn()

      await messageListener(
        { type: 'BEHAVIORAL_EVENT', data: mockBehavioralData },
        { tab: { id: 1 } },
        sendResponse
      )

      expect(chrome.storage.local.get).toHaveBeenCalledWith(['analytics'])
      expect(chrome.storage.local.set).toHaveBeenCalledWith(
        expect.objectContaining({
          analytics: expect.any(Object)
        })
      )
      expect(sendResponse).toHaveBeenCalledWith({ success: true })
    })

    it('should aggregate analytics data by domain and date', async () => {
      const existingAnalytics = {
        'youtube.com': {
          '2024-01-15': [
            { timeOnPage: 1.5, behaviorScore: 30, timestamp: Date.now() - 3600000 }
          ]
        }
      }

      chrome.storage.local.get.mockResolvedValue({ analytics: existingAnalytics })

      const messageListener = chrome.runtime.onMessage.addListener.mock.calls[0][0]
      const sendResponse = jest.fn()

      await messageListener(
        { type: 'BEHAVIORAL_EVENT', data: mockBehavioralData },
        { tab: { id: 1 } },
        sendResponse
      )

      const setCall = chrome.storage.local.set.mock.calls[0][0]
      const savedAnalytics = setCall.analytics

      expect(savedAnalytics['youtube.com']['2024-01-15']).toHaveLength(2)
    })

    it('should handle GET_ANALYTICS message', async () => {
      const analyticsData = {
        'youtube.com': {
          '2024-01-15': [mockBehavioralData]
        }
      }

      chrome.storage.local.get.mockResolvedValue({ analytics: analyticsData })

      const messageListener = chrome.runtime.onMessage.addListener.mock.calls[0][0]
      const sendResponse = jest.fn()

      await messageListener(
        { type: 'GET_ANALYTICS', data: { domain: 'youtube.com', days: 7 } },
        { tab: { id: 1 } },
        sendResponse
      )

      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          analytics: expect.any(Object)
        })
      )
    })

    it('should clean up old analytics data', async () => {
      const oldTimestamp = Date.now() - (91 * 24 * 60 * 60 * 1000) // 91 days ago
      const recentTimestamp = Date.now() - (30 * 24 * 60 * 60 * 1000) // 30 days ago

      const analyticsData = {
        'youtube.com': {
          '2023-10-15': [{ timestamp: oldTimestamp, timeOnPage: 1 }],
          '2023-12-15': [{ timestamp: recentTimestamp, timeOnPage: 2 }]
        }
      }

      chrome.storage.local.get.mockResolvedValue({ analytics: analyticsData })

      const messageListener = chrome.runtime.onMessage.addListener.mock.calls[0][0]
      const sendResponse = jest.fn()

      await messageListener(
        { type: 'CLEANUP_ANALYTICS' },
        { tab: { id: 1 } },
        sendResponse
      )

      const setCall = chrome.storage.local.set.mock.calls[0][0]
      const cleanedAnalytics = setCall.analytics

      expect(cleanedAnalytics['youtube.com']['2023-10-15']).toBeUndefined()
      expect(cleanedAnalytics['youtube.com']['2023-12-15']).toBeDefined()
    })

    it('should calculate analytics summary', async () => {
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

      chrome.storage.local.get.mockResolvedValue({ analytics: analyticsData })

      const messageListener = chrome.runtime.onMessage.addListener.mock.calls[0][0]
      const sendResponse = jest.fn()

      await messageListener(
        { type: 'GET_ANALYTICS_SUMMARY', data: { days: 7 } },
        { tab: { id: 1 } },
        sendResponse
      )

      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          summary: expect.objectContaining({
            totalSessions: expect.any(Number),
            averageTimeOnPage: expect.any(Number),
            topDomains: expect.any(Array),
            interventionStats: expect.any(Object)
          })
        })
      )
    })
  })

  describe('Tab Management', () => {
    it('should handle tab activation', async () => {
      chrome.tabs.onActivated.addListener = jest.fn()

      // Re-evaluate background script to register listeners
      eval(backgroundScriptSource)

      const activationListener = chrome.tabs.onActivated.addListener.mock.calls[0][0]

      await activationListener({ tabId: 1 })

      expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ type: 'TAB_ACTIVATED' })
      )
    })

    it('should handle tab updates', async () => {
      chrome.tabs.onUpdated.addListener = jest.fn()

      // Re-evaluate background script to register listeners
      eval(backgroundScriptSource)

      const updateListener = chrome.tabs.onUpdated.addListener.mock.calls[0][0]

      await updateListener(1, { status: 'complete' }, { url: 'https://youtube.com' })

      expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ type: 'TAB_UPDATED' })
      )
    })

    it('should send settings to new tabs', async () => {
      const messageListener = chrome.runtime.onMessage.addListener.mock.calls[0][0]
      const sendResponse = jest.fn()

      await messageListener(
        { type: 'CONTENT_SCRIPT_READY' },
        { tab: { id: 1 } },
        sendResponse
      )

      expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          type: 'SETTINGS_UPDATE',
          data: expect.any(Object)
        })
      )
    })
  })

  describe('Keep-Alive Functionality', () => {
    it('should implement keep-alive mechanism', () => {
      // Check that keep-alive is implemented
      expect(chrome.alarms.create).toHaveBeenCalledWith(
        'keepAlive',
        expect.objectContaining({ periodInMinutes: expect.any(Number) })
      )
    })

    it('should handle keep-alive alarm', async () => {
      chrome.alarms.onAlarm.addListener = jest.fn()

      // Re-evaluate background script to register alarm listener
      eval(backgroundScriptSource)

      const alarmListener = chrome.alarms.onAlarm.addListener.mock.calls[0][0]

      await alarmListener({ name: 'keepAlive' })

      expect(chrome.storage.local.get).toHaveBeenCalledWith(['keepAlive'])
    })

    it('should perform health check', async () => {
      const messageListener = chrome.runtime.onMessage.addListener.mock.calls[0][0]
      const sendResponse = jest.fn()

      await messageListener(
        { type: 'HEALTH_CHECK' },
        { tab: { id: 1 } },
        sendResponse
      )

      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          healthy: true,
          timestamp: expect.any(Number),
          version: expect.any(String)
        })
      )
    })
  })

  describe('Intervention Management', () => {
    it('should handle intervention triggers', async () => {
      const messageListener = chrome.runtime.onMessage.addListener.mock.calls[0][0]
      const sendResponse = jest.fn()

      await messageListener(
        { type: 'TRIGGER_INTERVENTION', data: { stage: 2, domain: 'youtube.com' } },
        { tab: { id: 1 } },
        sendResponse
      )

      expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          type: 'TRIGGER_INTERVENTION',
          data: expect.objectContaining({ stage: 2 })
        })
      )
    })

    it('should log intervention events', async () => {
      const messageListener = chrome.runtime.onMessage.addListener.mock.calls[0][0]
      const sendResponse = jest.fn()

      await messageListener(
        { type: 'INTERVENTION_TRIGGERED', data: { stage: 3, timestamp: Date.now() } },
        { tab: { id: 1 } },
        sendResponse
      )

      expect(chrome.storage.local.get).toHaveBeenCalledWith(['interventionLog'])
      expect(chrome.storage.local.set).toHaveBeenCalledWith(
        expect.objectContaining({ interventionLog: expect.any(Array) })
      )
    })

    it('should update badge based on intervention stage', async () => {
      const messageListener = chrome.runtime.onMessage.addListener.mock.calls[0][0]
      const sendResponse = jest.fn()

      await messageListener(
        { type: 'UPDATE_BADGE', data: { stage: 2, tabId: 1 } },
        { tab: { id: 1 } },
        sendResponse
      )

      expect(chrome.action.setBadgeText).toHaveBeenCalledWith({
        text: '2',
        tabId: 1
      })
      expect(chrome.action.setBadgeBackgroundColor).toHaveBeenCalled()
    })
  })

  describe('Error Handling', () => {
    it('should handle storage errors gracefully', async () => {
      chrome.storage.local.get.mockRejectedValue(new Error('Storage quota exceeded'))

      const messageListener = chrome.runtime.onMessage.addListener.mock.calls[0][0]
      const sendResponse = jest.fn()

      await messageListener(
        { type: 'GET_SETTINGS' },
        { tab: { id: 1 } },
        sendResponse
      )

      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.any(String)
        })
      )
    })

    it('should handle tab communication errors', async () => {
      chrome.tabs.sendMessage.mockRejectedValue(new Error('receiving end does not exist'))

      const messageListener = chrome.runtime.onMessage.addListener.mock.calls[0][0]
      const sendResponse = jest.fn()

      await messageListener(
        { type: 'CONTENT_SCRIPT_READY' },
        { tab: { id: 1 } },
        sendResponse
      )

      // Should not throw error
      expect(sendResponse).toHaveBeenCalled()
    })

    it('should handle unknown message types', async () => {
      const messageListener = chrome.runtime.onMessage.addListener.mock.calls[0][0]
      const sendResponse = jest.fn()

      await messageListener(
        { type: 'UNKNOWN_MESSAGE_TYPE' },
        { tab: { id: 1 } },
        sendResponse
      )

      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Unknown message type'
        })
      )
    })
  })

  describe('Data Migration', () => {
    it('should migrate old settings format', async () => {
      const oldSettings = {
        enabled: true, // old format
        mode: 'soft' // old format
      }

      chrome.storage.local.get.mockResolvedValue(oldSettings)

      const messageListener = chrome.runtime.onMessage.addListener.mock.calls[0][0]
      const sendResponse = jest.fn()

      await messageListener(
        { type: 'GET_SETTINGS' },
        { tab: { id: 1 } },
        sendResponse
      )

      expect(chrome.storage.local.set).toHaveBeenCalledWith(
        expect.objectContaining({
          isEnabled: true,
          focusMode: 'gentle'
        })
      )
    })

    it('should handle data export request', async () => {
      const mockData = {
        settings: mockStorage,
        analytics: { 'youtube.com': { '2024-01-15': [mockBehavioralData] } }
      }

      chrome.storage.local.get.mockResolvedValue(mockData)

      const messageListener = chrome.runtime.onMessage.addListener.mock.calls[0][0]
      const sendResponse = jest.fn()

      await messageListener(
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

  describe('Performance Optimization', () => {
    it('should batch storage operations', async () => {
      const messageListener = chrome.runtime.onMessage.addListener.mock.calls[0][0]
      const sendResponse = jest.fn()

      // Send multiple behavioral events quickly
      const promises = []
      for (let i = 0; i < 5; i++) {
        promises.push(messageListener(
          { type: 'BEHAVIORAL_EVENT', data: { ...mockBehavioralData, timestamp: Date.now() + i } },
          { tab: { id: 1 } },
          jest.fn()
        ))
      }

      await Promise.all(promises)

      // Should batch operations rather than making 5 separate storage calls
      expect(chrome.storage.local.set).toHaveBeenCalledTimes(1)
    })

    it('should implement rate limiting for analytics', async () => {
      const messageListener = chrome.runtime.onMessage.addListener.mock.calls[0][0]

      // Send many events rapidly
      const promises = []
      for (let i = 0; i < 20; i++) {
        promises.push(messageListener(
          { type: 'BEHAVIORAL_EVENT', data: mockBehavioralData },
          { tab: { id: 1 } },
          jest.fn()
        ))
      }

      await Promise.all(promises)

      // Should implement rate limiting
      expect(chrome.storage.local.set.mock.calls.length).toBeLessThan(20)
    })
  })

  describe('Connection Testing', () => {
    it('should handle connection test message', async () => {
      const messageListener = chrome.runtime.onMessage.addListener.mock.calls[0][0]
      const sendResponse = jest.fn()

      await messageListener(
        { type: 'CONNECTION_TEST', timestamp: Date.now() },
        { tab: { id: 1 } },
        sendResponse
      )

      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          timestamp: expect.any(Number)
        })
      )
    })

    it('should provide health info', async () => {
      const messageListener = chrome.runtime.onMessage.addListener.mock.calls[0][0]
      const sendResponse = jest.fn()

      await messageListener(
        { type: 'GET_HEALTH_INFO' },
        { tab: { id: 1 } },
        sendResponse
      )

      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          healthy: true,
          uptime: expect.any(Number),
          memoryUsage: expect.any(Object),
          activeConnections: expect.any(Number)
        })
      )
    })
  })
})
