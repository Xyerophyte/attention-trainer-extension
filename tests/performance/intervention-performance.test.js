/**
 * Performance and Edge Case Tests for Progressive Intervention System
 * Tests system behavior under stress, rapid changes, memory usage, and edge conditions
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
  getStatus: jest.fn().mockReturnValue({ initialized: true, contextValid: true })
}

global.window.SharedModules = mockSharedModules

// Strip auto-initialize and expose class
contentScriptSource = contentScriptSource.replace(/if \(document\.readyState.*[\s\S]*$/, '')
contentScriptSource += "\n;try{globalThis.AttentionTrainerContent = AttentionTrainerContent}catch(_){}\n"
eval(contentScriptSource)

const minutes = m => m * 60000
const seconds = s => s * 1000

describe('Intervention System Performance Tests', () => {
  let trainer

  beforeEach(async () => {
    // Setup DOM
    document.body.innerHTML = '<main><div>Test content</div></main>'
    
    // Mock location
    Object.defineProperty(window, 'location', {
      value: { hostname: 'example.com', pathname: '/', href: 'https://example.com/' },
      writable: true
    })

    // Settings
    const settings = {
      isEnabled: true,
      focusMode: 'gentle',
      interventionConfig: {
        thresholdsMinutes: { 
          stage1Start: 0, stage1To80End: 3, stage1To50End: 10,
          stage2Start: 10, stage3Start: 12, stage4Start: 15 
        },
        brightness: { start: 100, at3min: 80, at10min: 50, transitionMs: 600 },
        blur: { stage2Px: 0.75, maxPx: 1.0, transitionMs: 800 },
        debounceMs: 1000, // Reduced for testing
        idleDetection: { scrollIdleMs: 2000, videoIdleGraceMs: 1000 }
      }
    }

    window.SharedModules.getModules.mockResolvedValue({
      errorHandler: { handleError: jest.fn(), showErrorNotification: jest.fn() },
      connectionManager: {
        contextValid: true,
        isConnected: true,
        sendMessage: jest.fn().mockResolvedValue(settings),
        onConnectionChange: null,
        onContextInvalid: null
      },
      fallbackStorage: {
        storeAnalytics: jest.fn().mockResolvedValue(true),
        getSettings: jest.fn().mockResolvedValue({ isEnabled: true })
      }
    })

    chrome.runtime.sendMessage.mockResolvedValue(settings)
    chrome.runtime.id = 'test-extension-id'
    chrome.storage.local.get.mockResolvedValue({})
    chrome.storage.local.set.mockResolvedValue()

    trainer = new AttentionTrainerContent()
    await testUtils.waitFor(() => trainer.settings.isEnabled === true, 2000)
  })

  afterEach(() => {
    if (trainer) {
      trainer.clearIntervention()
      trainer.destroy()
    }
  })

  describe('Rapid State Changes Performance', () => {
    test('Handles rapid brightness changes without performance degradation', () => {
      const startTime = performance.now()
      
      // Rapidly change brightness 100 times
      for (let i = 0; i < 100; i++) {
        const brightness = 50 + (i % 50)
        trainer.setBrightness(brightness)
      }
      
      const endTime = performance.now()
      const duration = endTime - startTime
      
      // Should complete within 100ms
      expect(duration).toBeLessThan(100)
      
      // Final brightness should be correct
      expect(trainer.brightnessState.currentPercent).toBeGreaterThanOrEqual(50)
      expect(trainer.brightnessState.currentPercent).toBeLessThanOrEqual(100)
    })

    test('Manages rapid stage transitions with debouncing', () => {
      const startTime = Date.now()
      
      // Try to rapidly change stages (should be debounced)
      for (let i = 1; i <= 20; i++) {
        trainer.distractionState.activeMs = minutes(i)
        trainer.evaluateTimeBasedStages(startTime + i * 100, false) // 100ms apart
      }
      
      // Due to debouncing, should not reach highest stage immediately
      expect(trainer.distractionState.stage).toBeLessThan(4)
      
      // Wait for debounce period and try again
      const laterTime = startTime + 2000 // 2 seconds later
      trainer.distractionState.activeMs = minutes(20)
      trainer.evaluateTimeBasedStages(laterTime, false)
      
      expect(trainer.distractionState.stage).toBe(4)
    })

    test('Blur application scales efficiently with many DOM elements', () => {
      // Add many DOM elements
      for (let i = 0; i < 200; i++) {
        const element = document.createElement('p')
        element.textContent = `Test paragraph ${i}`
        document.body.appendChild(element)
      }
      
      const startTime = performance.now()
      trainer.applyProgressiveBlur()
      const endTime = performance.now()
      
      const blurredElements = document.querySelectorAll('.attention-trainer-blur')
      
      // Should blur many elements quickly
      expect(blurredElements.length).toBeGreaterThan(200)
      expect(endTime - startTime).toBeLessThan(50) // Should complete in under 50ms
    })
  })

  describe('Memory Management', () => {
    test('Cleans up event listeners on destroy', () => {
      const initialEventListenerCount = trainer.eventListeners.size
      
      // Add some test event listeners
      trainer.addEventListenerWithCleanup(document, 'click', () => {})
      trainer.addEventListenerWithCleanup(document, 'scroll', () => {})
      trainer.addEventListenerWithCleanup(window, 'resize', () => {})
      
      expect(trainer.eventListeners.size).toBeGreaterThan(initialEventListenerCount)
      
      // Destroy should clean up
      trainer.destroy()
      
      expect(trainer.eventListeners.size).toBe(0)
      expect(trainer.isDestroyed).toBe(true)
    })

    test('Manages observer pool efficiently', () => {
      // Create many elements to observe
      const elements = []
      for (let i = 0; i < 100; i++) {
        const el = document.createElement('div')
        el.textContent = `Element ${i}`
        document.body.appendChild(el)
        elements.push(el)
        trainer.trackElementEngagement(el)
      }
      
      expect(trainer.observerPool.observers.size).toBe(100)
      
      // Remove some elements from DOM
      for (let i = 0; i < 50; i++) {
        elements[i].remove()
      }
      
      // Trigger cleanup
      trainer.cleanupOldObservedElements()
      
      // Should have cleaned up removed elements
      expect(trainer.observerPool.observers.size).toBeLessThan(100)
    })

    test('Limits analytics queue size to prevent memory leaks', () => {
      // Fill analytics queue beyond limit
      for (let i = 0; i < 20; i++) {
        trainer.queueAnalyticsData()
      }
      
      // Should be limited to prevent memory growth
      expect(trainer.analyticsQueue.length).toBeLessThanOrEqual(10)
    })
  })

  describe('Edge Cases and Error Handling', () => {
    test('Handles invalid brightness values gracefully', () => {
      const testCases = [
        { input: -100, expected: 0 },
        { input: -1, expected: 0 },
        { input: 150, expected: 100 },
        { input: 1000, expected: 100 },
        { input: null, expected: 0 },
        { input: undefined, expected: 0 },
        { input: 'invalid', expected: 0 },
        { input: 50.7, expected: 51 }, // Should round
        { input: 50.3, expected: 50 }  // Should round
      ]

      testCases.forEach(({ input, expected }) => {
        trainer.setBrightness(input)
        expect(trainer.brightnessState.currentPercent).toBe(expected)
      })
    })

    test('Survives DOM manipulation during interventions', () => {
      // Apply blur
      trainer.applyProgressiveBlur()
      const initialBlurredCount = document.querySelectorAll('.attention-trainer-blur').length
      
      // Manipulate DOM while blur is active
      const newElement = document.createElement('p')
      newElement.textContent = 'New element'
      document.body.appendChild(newElement)
      
      // Remove some existing elements
      const existingElements = document.querySelectorAll('div')
      if (existingElements.length > 0) {
        existingElements[0].remove()
      }
      
      // Should not throw errors
      expect(() => {
        trainer.applyProgressiveBlur()
        trainer.clearIntervention()
      }).not.toThrow()
    })

    test('Handles rapid visibility state changes', () => {
      trainer.distractionState.lastScrollTs = Date.now() - 500
      trainer.distractionState.mediaPlaying = true
      
      // Rapidly change visibility
      for (let i = 0; i < 10; i++) {
        Object.defineProperty(document, 'visibilityState', { 
          value: i % 2 === 0 ? 'visible' : 'hidden',
          writable: true 
        })
        
        const isActive = trainer.isDistractionActive()
        expect(typeof isActive).toBe('boolean')
      }
    })

    test('Gracefully handles Chrome API failures', async () => {
      // Mock API failures
      chrome.storage.local.set.mockRejectedValue(new Error('Storage error'))
      chrome.storage.local.get.mockRejectedValue(new Error('Storage error'))
      chrome.runtime.sendMessage.mockRejectedValue(new Error('Runtime error'))
      
      // Should not throw
      await expect(trainer.persistDistractionTime()).resolves.not.toThrow()
      await expect(trainer.restoreDistractionTime()).resolves.not.toThrow()
    })
  })

  describe('Timing and Concurrency', () => {
    test('Handles concurrent timer operations', (done) => {
      let completedTasks = 0
      const totalTasks = 5
      
      // Add multiple timer tasks simultaneously
      for (let i = 0; i < totalTasks; i++) {
        trainer.addTimerTask(`test_task_${i}`, () => {
          completedTasks++
          if (completedTasks === totalTasks) {
            // Verify all tasks completed
            expect(completedTasks).toBe(totalTasks)
            done()
          }
        }, 100 + i * 10) // Slightly different intervals
      }
      
      // Start the timer system
      trainer.startUnifiedTimer()
    }, 5000)

    test('Manages timer cleanup on context invalidation', () => {
      // Add some timer tasks
      trainer.addTimerTask('test_task_1', () => {}, 1000)
      trainer.addTimerTask('test_task_2', () => {}, 2000)
      
      expect(trainer.timerManager.taskQueue.size).toBe(2)
      
      // Simulate context invalidation
      trainer.handleContextInvalidation(false)
      
      // Should clean up gracefully
      expect(trainer.contextValid).toBe(false)
    })
  })

  describe('Configuration Boundary Testing', () => {
    test('Handles extreme configuration values', () => {
      const extremeConfig = {
        thresholdsMinutes: { 
          stage1Start: 0, stage1To80End: 0.1, stage1To50End: 0.2,
          stage2Start: 0.2, stage3Start: 0.3, stage4Start: 0.4 
        },
        brightness: { start: 100, at3min: 1, at10min: 0, transitionMs: 1 },
        blur: { stage2Px: 10, maxPx: 50, transitionMs: 1 },
        debounceMs: 1,
        idleDetection: { scrollIdleMs: 1, videoIdleGraceMs: 1 }
      }
      
      trainer.settings.interventionConfig = extremeConfig
      
      // Should handle extreme values without crashing
      expect(() => {
        trainer.distractionState.activeMs = minutes(1)
        trainer.evaluateTimeBasedStages(Date.now(), true)
        trainer.updateBrightnessForTime(minutes(1))
      }).not.toThrow()
    })

    test('Works with minimal configuration', () => {
      trainer.settings.interventionConfig = {}
      
      // Should use defaults gracefully
      expect(() => {
        trainer.evaluateTimeBasedStages(Date.now(), true)
        trainer.updateBrightnessForTime(minutes(5))
        trainer.isDistractionActive()
      }).not.toThrow()
    })
  })

  describe('Real-world Scenario Simulation', () => {
    test('Simulates long browsing session with mixed activity', async () => {
      const sessionDuration = 30 // 30 minutes simulated
      const startTime = Date.now()
      
      for (let minute = 0; minute < sessionDuration; minute++) {
        const currentTime = startTime + minute * 1000 // Fast simulation
        
        // Simulate activity patterns
        if (minute % 5 === 0) {
          // Simulate scroll activity every 5 minutes
          trainer.distractionState.lastScrollTs = currentTime
        }
        
        if (minute > 10 && minute < 15) {
          // Simulate media playing
          trainer.distractionState.mediaPlaying = true
        } else {
          trainer.distractionState.mediaPlaying = false
        }
        
        if (minute === 20) {
          // Simulate focus mode activation
          trainer.behaviorData.focusMode = true
        }
        
        if (minute === 25) {
          // Disable focus mode
          trainer.behaviorData.focusMode = false
        }
        
        // Update distraction time and evaluate
        if (trainer.isDistractionActive(currentTime)) {
          trainer.distractionState.activeMs += 60000 // 1 minute
        }
        
        trainer.evaluateTimeBasedStages(currentTime, false)
        trainer.updateBrightnessForTime(trainer.distractionState.activeMs)
      }
      
      // Verify final state is reasonable
      expect(trainer.distractionState.stage).toBeGreaterThanOrEqual(0)
      expect(trainer.distractionState.stage).toBeLessThanOrEqual(4)
      expect(trainer.brightnessState.currentPercent).toBeGreaterThanOrEqual(0)
      expect(trainer.brightnessState.currentPercent).toBeLessThanOrEqual(100)
    })

    test('Handles tab switching and visibility changes during interventions', () => {
      // Start intervention
      trainer.distractionState.activeMs = minutes(15)
      trainer.evaluateTimeBasedStages(Date.now(), true)
      
      const initialStage = trainer.distractionState.stage
      
      // Simulate tab switching
      Object.defineProperty(document, 'visibilityState', { value: 'hidden', writable: true })
      document.dispatchEvent(new Event('visibilitychange'))
      
      // Wait a moment
      setTimeout(() => {
        Object.defineProperty(document, 'visibilityState', { value: 'visible', writable: true })
        document.dispatchEvent(new Event('visibilitychange'))
        
        // Should maintain intervention state
        expect(trainer.distractionState.stage).toBe(initialStage)
      }, 100)
    })
  })
})
