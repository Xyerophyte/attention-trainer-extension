/**
 * Integration Tests for Content Script
 * Tests behavioral analysis, intervention triggers, site pattern detection, and module integration
 */

const fs = require('fs')
const path = require('path')

// Load content script source
const contentScriptPath = path.join(__dirname, '../../src/content/content.js')
let contentScriptSource = fs.readFileSync(contentScriptPath, 'utf8')

// Mock shared modules
const mockSharedModules = {
  getModules: jest.fn().mockResolvedValue({
    errorHandler: {
      handleError: jest.fn(),
      showErrorNotification: jest.fn()
    },
    connectionManager: {
      contextValid: true,
      isConnected: true,
      sendMessage: jest.fn().mockResolvedValue({ success: true }),
      onConnectionChange: null,
      onContextInvalid: null
    },
    fallbackStorage: {
      storeAnalytics: jest.fn().mockResolvedValue(true),
      getSettings: jest.fn().mockResolvedValue({ isEnabled: true })
    }
  }),
  getStatus: jest.fn().mockReturnValue({
    initialized: true,
    contextValid: true
  })
}

// Set up global context
global.window.SharedModules = mockSharedModules

// Remove initialization code from content script for controlled testing
contentScriptSource = contentScriptSource.replace(/if \(document\.readyState.*[\s\S]*$/, '')
// Expose class to global scope for tests
contentScriptSource += "\n;try{globalThis.AttentionTrainerContent = AttentionTrainerContent}catch(_){}\n"
eval(contentScriptSource)

describe('Content Script Integration Tests', () => {
  let attentionTrainer
  let mockSettings

  beforeEach(async () => {
    // Reset DOM
    document.body.innerHTML = ''
    document.head.innerHTML = ''

    // Mock window location for site pattern detection
    Object.defineProperty(window, 'location', {
      value: {
        hostname: 'youtube.com',
        pathname: '/watch',
        href: 'https://youtube.com/watch?v=test'
      },
      writable: true
    })

    // Mock settings
    mockSettings = {
      isEnabled: true,
      focusMode: 'gentle',
      thresholds: { stage1: 30, stage2: 60, stage3: 120, stage4: 180 },
      whitelist: []
    }

    // Reset Chrome API mocks
    chrome.runtime.sendMessage.resolves(mockSettings)
    chrome.runtime.id = 'test-extension-id'

    // Create fresh instance
    attentionTrainer = new AttentionTrainerContent()

    // Wait for initialization
    await testUtils.waitFor(() => attentionTrainer.settings.isEnabled === true, 2000)
  })

  describe('Site Pattern Detection', () => {
    it('should detect YouTube site pattern correctly', () => {
      window.location.hostname = 'youtube.com'
      const trainer = new AttentionTrainerContent()

      expect(trainer.sitePatterns.type).toBe('video')
      expect(trainer.sitePatterns.selectors.content).toBe('#contents, ytd-rich-grid-renderer')
      expect(trainer.sitePatterns.thresholds.time).toBe(45)
    })

    it('should detect Instagram site pattern correctly', () => {
      window.location.hostname = 'instagram.com'
      const trainer = new AttentionTrainerContent()

      expect(trainer.sitePatterns.type).toBe('social')
      expect(trainer.sitePatterns.selectors.posts).toBe('article')
      expect(trainer.sitePatterns.thresholds.time).toBe(30)
    })

    it('should fallback to general pattern for unknown sites', () => {
      window.location.hostname = 'unknown-site.com'
      const trainer = new AttentionTrainerContent()

      expect(trainer.sitePatterns.type).toBe('general')
      expect(trainer.sitePatterns.thresholds.time).toBe(60)
    })
  })

  describe('Behavioral Analysis Integration', () => {
    beforeEach(() => {
      // Set up DOM for behavioral tracking
      document.body.innerHTML = `
        <main id="contents">
          <div class="ytd-video-renderer">Video 1</div>
          <div class="ytd-video-renderer">Video 2</div>
          <div class="ytd-continuation-item-renderer">Loading...</div>
        </main>
      `
    })

    it('should initialize behavioral tracking systems', () => {
      expect(attentionTrainer.behaviorData).toBeDefined()
      expect(attentionTrainer.behaviorData.sessionStart).toBeGreaterThan(0)
      expect(attentionTrainer.behaviorScore).toBe(0)
    })

    it('should track scroll behavior and update score', async () => {
      // Simulate rapid scrolling
      for (let i = 0; i < 5; i++) {
        testUtils.simulateScroll(window, i * 200)
        await new Promise(resolve => setTimeout(resolve, 10))
      }

      await new Promise(resolve => setTimeout(resolve, 100))

      expect(attentionTrainer.behaviorData.rapidScrollCount).toBeGreaterThan(0)
      expect(attentionTrainer.behaviorScore).toBeGreaterThan(0)
    })

    it('should detect content consumption patterns', async () => {
      const initialContentCount = attentionTrainer.behaviorData.contentPieces

      // Simulate new content being added (infinite scroll)
      const newVideo = document.createElement('div')
      newVideo.className = 'ytd-video-renderer'
      newVideo.textContent = 'New Video'

      const contentContainer = document.querySelector('#contents')
      contentContainer.appendChild(newVideo)

      // Trigger mutation observer
      await new Promise(resolve => setTimeout(resolve, 100))

      expect(attentionTrainer.behaviorData.contentPieces).toBeGreaterThan(initialContentCount)
    })

    it('should track interaction patterns', async () => {
      const video = document.querySelector('.ytd-video-renderer')

      // Simulate rapid clicking
      for (let i = 0; i < 3; i++) {
        video.click()
        await new Promise(resolve => setTimeout(resolve, 100))
      }

      await new Promise(resolve => setTimeout(resolve, 200))

      expect(attentionTrainer.behaviorData.flags.rapid_interaction).toBeGreaterThan(0)
    })

    it('should differentiate productive vs passive interactions', async () => {
      // Productive interaction (button click)
      const button = document.createElement('button')
      document.body.appendChild(button)
      button.click()

      // Passive interaction (random div click)
      const div = document.createElement('div')
      document.body.appendChild(div)
      div.click()

      await new Promise(resolve => setTimeout(resolve, 100))

      expect(attentionTrainer.behaviorData.flags.productive_interaction).toBeGreaterThan(0)
      expect(attentionTrainer.behaviorData.flags.passive_interaction).toBeGreaterThan(0)
    })
  })

  describe('Intervention System Integration', () => {
    beforeEach(() => {
      document.body.innerHTML = '' // Clean slate for intervention testing
    })

    it('should trigger stage 1 intervention based on behavior score', async () => {
      // Artificially increase behavior score
      attentionTrainer.behaviorScore = 35 // Above YouTube stage1 threshold (30)

      attentionTrainer.checkInterventionTriggers()

      await new Promise(resolve => setTimeout(resolve, 100))

      expect(attentionTrainer.behaviorData.interventionStage).toBe(1)
      expect(document.body.classList.contains('attention-trainer-dim')).toBe(true)
    })

    it('should trigger stage 2 intervention with blur effects', async () => {
      attentionTrainer.behaviorScore = 55 // Above stage2 threshold (50)

      attentionTrainer.checkInterventionTriggers()

      await new Promise(resolve => setTimeout(resolve, 100))

      expect(attentionTrainer.behaviorData.interventionStage).toBe(2)

      const blurredElements = document.querySelectorAll('.attention-trainer-blur')
      expect(blurredElements.length).toBeGreaterThan(0)
    })

    it('should show stage 3 enhanced nudge message', async () => {
      attentionTrainer.behaviorScore = 75 // Above stage3 threshold (70)

      attentionTrainer.checkInterventionTriggers()

      await new Promise(resolve => setTimeout(resolve, 100))

      expect(attentionTrainer.behaviorData.interventionStage).toBe(3)

      const nudgeOverlay = document.querySelector('.attention-trainer-overlay')
      expect(nudgeOverlay.style.display).toBe('flex')

      const nudgeMessage = document.querySelector('.attention-trainer-nudge')
      expect(nudgeMessage).toBeTruthy()
    })

    it('should trigger stage 4 intervention based on focus mode', async () => {
      attentionTrainer.settings.focusMode = 'strict'
      attentionTrainer.behaviorScore = 90 // Above stage4 threshold (85)

      attentionTrainer.checkInterventionTriggers()

      await new Promise(resolve => setTimeout(resolve, 100))

      expect(attentionTrainer.behaviorData.interventionStage).toBe(4)

      const breathingReminder = document.querySelector('.breathing-reminder')
      expect(breathingReminder).toBeTruthy()
    })

    it('should respect snooze settings', async () => {
      attentionTrainer.behaviorScore = 50
      attentionTrainer.snoozeIntervention(60) // Snooze for 60 seconds

      attentionTrainer.checkInterventionTriggers()

      // Should not trigger intervention due to snooze
      expect(attentionTrainer.behaviorData.interventionStage).toBe(0)
    })

    it('should handle focus mode activation', async () => {
      attentionTrainer.startEnhancedFocusSession()

      expect(attentionTrainer.behaviorData.focusMode).toBe(true)

      const notification = document.querySelector('[style*="Focus Mode Active"]')
      expect(notification).toBeTruthy()
    })
  })

  describe('Shared Module Integration', () => {
    it('should initialize shared modules successfully', async () => {
      expect(attentionTrainer.connectionManager).toBeTruthy()
      expect(attentionTrainer.errorHandler).toBeTruthy()
      expect(attentionTrainer.fallbackStorage).toBeTruthy()
    })

    it('should handle connection manager state changes', async () => {
      const connectionManager = attentionTrainer.connectionManager

      // Simulate connection change
      connectionManager.onConnectionChange(false)

      expect(attentionTrainer.backgroundConnected).toBe(false)
    })

    it('should handle context invalidation gracefully', async () => {
      const connectionManager = attentionTrainer.connectionManager

      // Simulate context invalidation
      connectionManager.onContextInvalid()

      expect(attentionTrainer.contextValid).toBe(false)
      expect(attentionTrainer.fallbackStorage.storeAnalytics).toHaveBeenCalled()
    })

    it('should send behavioral analytics to background', async () => {
      attentionTrainer.backgroundConnected = true
      attentionTrainer.contextValid = true

      // Generate some behavioral data
      attentionTrainer.behaviorData.timeOnPage = 120000 // 2 minutes
      attentionTrainer.behaviorScore = 25

      attentionTrainer.sendBehavioralAnalytics()

      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'BEHAVIORAL_EVENT',
          data: expect.objectContaining({
            domain: 'youtube.com',
            timeOnPage: 2, // In minutes
            behaviorScore: 25
          })
        })
      )
    })

    it('should fallback to offline storage when connection fails', async () => {
      chrome.runtime.sendMessage.rejects(new Error('Extension context invalidated'))

      attentionTrainer.sendBehavioralAnalytics()

      await new Promise(resolve => setTimeout(resolve, 100))

      expect(attentionTrainer.contextValid).toBe(false)
    })
  })

  describe('Settings Management Integration', () => {
    it('should load settings from connection manager', async () => {
      const mockResponse = {
        isEnabled: false,
        focusMode: 'strict',
        thresholds: { stage1: 20, stage2: 40 }
      }

      mockSharedModules.getModules.mockResolvedValueOnce({
        ...await mockSharedModules.getModules(),
        connectionManager: {
          contextValid: true,
          isConnected: true,
          sendMessage: jest.fn().mockResolvedValue(mockResponse)
        }
      })

      const trainer = new AttentionTrainerContent()
      await new Promise(resolve => setTimeout(resolve, 100))

      expect(trainer.settings.isEnabled).toBe(false)
      expect(trainer.settings.focusMode).toBe('strict')
    })

    it('should fallback to direct messaging when connection manager fails', async () => {
      mockSharedModules.getModules.mockResolvedValueOnce({
        ...await mockSharedModules.getModules(),
        connectionManager: {
          contextValid: false,
          sendMessage: jest.fn().mockRejectedValue(new Error('Connection failed'))
        }
      })

      chrome.runtime.sendMessage.resolves({
        isEnabled: true,
        focusMode: 'gentle'
      })

      const trainer = new AttentionTrainerContent()
      await new Promise(resolve => setTimeout(resolve, 200))

      expect(trainer.settings.isEnabled).toBe(true)
      expect(trainer.backgroundConnected).toBe(true)
    })

    it('should use fallback settings when background is unavailable', async () => {
      chrome.runtime.sendMessage.rejects(new Error('receiving end does not exist'))

      const trainer = new AttentionTrainerContent()
      await new Promise(resolve => setTimeout(resolve, 200))

      expect(trainer.settings.isEnabled).toBe(true)
      expect(trainer.settings.focusMode).toBe('gentle')
      expect(trainer.backgroundConnected).toBe(false)
    })
  })

  describe('Message Handling Integration', () => {
    it('should handle intervention trigger messages', () => {
      const message = testUtils.simulateIntervention(2, 'gentle')

      attentionTrainer.triggerIntervention(message.data.stage, message.data.focusMode)

      expect(attentionTrainer.behaviorData.interventionStage).toBe(2)
    })

    it('should handle behavioral data reset messages', () => {
      // Set up some behavioral data
      attentionTrainer.behaviorData.rapidScrollCount = 5
      attentionTrainer.behaviorScore = 45

      attentionTrainer.resetScrollData()

      expect(attentionTrainer.behaviorData.rapidScrollCount).toBe(0)
      expect(attentionTrainer.behaviorScore).toBe(0)
    })

    it('should validate extension context during message handling', () => {
      chrome.runtime.id = null // Simulate invalid context

      const message = testUtils.simulateIntervention(1)

      // Should not process message with invalid context
      attentionTrainer.triggerIntervention(message.data.stage, message.data.focusMode)

      expect(attentionTrainer.behaviorData.interventionStage).toBe(0)
    })
  })

  describe('Error Recovery Integration', () => {
    it('should recover from initialization errors', async () => {
      mockSharedModules.getModules.mockRejectedValueOnce(new Error('Module init failed'))

      const trainer = new AttentionTrainerContent()

      // Should still initialize with fallback behavior
      await new Promise(resolve => setTimeout(resolve, 100))

      expect(trainer.behaviorData).toBeDefined()
      expect(trainer.sitePatterns).toBeDefined()
    })

    it('should handle settings loading errors gracefully', async () => {
      chrome.runtime.sendMessage.rejects(new Error('Background script error'))

      const trainer = new AttentionTrainerContent()
      await new Promise(resolve => setTimeout(resolve, 200))

      // Should have fallback settings
      expect(trainer.settings.isEnabled).toBe(true)
      expect(trainer.settings.focusMode).toBe('gentle')
    })

    it('should clean up observers on context invalidation', () => {
      const disconnectSpy = jest.fn()

      // Mock observer
      attentionTrainer.observers = [{
        disconnect: disconnectSpy
      }]

      attentionTrainer.handleContextInvalidation()

      expect(disconnectSpy).toHaveBeenCalled()
      expect(attentionTrainer.observers).toHaveLength(0)
    })
  })

  describe('Performance Integration', () => {
    it('should throttle scroll analysis updates', async () => {
      const updateSpy = jest.spyOn(attentionTrainer, 'updateBehaviorScore')

      // Rapidly trigger scroll events
      for (let i = 0; i < 10; i++) {
        testUtils.simulateScroll(window, i * 50)
      }

      await new Promise(resolve => setTimeout(resolve, 100))

      // Should be throttled/debounced
      expect(updateSpy).toHaveBeenCalledTimes(1)
    })

    it('should batch analytics sending', async () => {
      attentionTrainer.backgroundConnected = true

      // Generate multiple behavior updates quickly
      for (let i = 0; i < 5; i++) {
        attentionTrainer.addBehaviorFlag(`test_flag_${i}`)
      }

      await new Promise(resolve => setTimeout(resolve, 200))

      // Should batch into fewer messages
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'BEHAVIORAL_EVENT'
        })
      )
    })
  })
})
