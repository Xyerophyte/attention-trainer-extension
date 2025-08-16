/**
 * Integration tests for time-based interventions: brightness dimming, blur stage, and media-driven activity
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

// Strip auto-initialize at file end for controlled instantiation
contentScriptSource = contentScriptSource.replace(/if \(document\.readyState.*[\s\S]*$/, '')
// Expose class to global for tests after eval
contentScriptSource += "\n;try{globalThis.AttentionTrainerContent = AttentionTrainerContent}catch(_){}\n"
eval(contentScriptSource)

const minutes = m => m * 60000

describe('Time-based Intervention Integration', () => {
  let trainer

  beforeEach(async () => {
    // Basic DOM
    document.body.innerHTML = '<main></main>'
    document.head.innerHTML = ''

    // Add some generic content elements that can be blurred in Stage 2
    const sample = document.createElement('div')
    sample.textContent = 'Sample content to blur'
    document.body.appendChild(sample)

    // Location
    Object.defineProperty(window, 'location', {
      value: { hostname: 'example.com', pathname: '/', href: 'https://example.com/' },
      writable: true
    })

    // Settings with interventionConfig
    const settings = {
      isEnabled: true,
      focusMode: 'gentle',
      interventionConfig: {
        thresholdsMinutes: { stage1Start: 0, stage1To80End: 3, stage1To50End: 10, stage2Start: 10, stage3Start: 12, stage4Start: 15 },
        brightness: { start: 100, at3min: 80, at10min: 50, transitionMs: 600, easing: 'cubic-bezier(0.25,0.46,0.45,0.94)' },
        blur: { stage2Px: 0.75, maxPx: 1.0, transitionMs: 800 },
        debounceMs: 20000,
        idleDetection: { scrollIdleMs: 2000, videoIdleGraceMs: 1000 },
        persistence: { perDomain: true, carryOverSameDay: true }
      }
    }

    // Make SharedModules return a connectionManager whose sendMessage returns settings
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

    // Use sinon-chrome stub API to return a promise when falling back to direct messaging
    chrome.runtime.sendMessage.returns(Promise.resolve(settings))
    chrome.runtime.id = 'test-extension-id'

    trainer = new AttentionTrainerContent()
    await testUtils.waitFor(() => trainer.settings.isEnabled === true, 1500)
  })

  test('Brightness curve at 2 min, 3 min, and 10 min', () => {
    // 2 min -> ~87%
    trainer.updateBrightnessForTime(minutes(2))
    expect(document.documentElement.style.filter).toContain('brightness(87%)')

    // 3 min -> 80%
    trainer.updateBrightnessForTime(minutes(3))
    expect(document.documentElement.style.filter).toContain('brightness(80%)')

    // 10 min -> 50%
    trainer.updateBrightnessForTime(minutes(10))
    expect(document.documentElement.style.filter).toContain('brightness(50%)')
  })

  test('Stage transitions based on distraction time (force bypass debounce)', () => {
    // Stage 1 threshold
    trainer.distractionState.activeMs = minutes(1)
    trainer.evaluateTimeBasedStages(Date.now(), true)
    expect(trainer.distractionState.stage).toBe(1)
    expect(trainer.behaviorData.interventionStage).toBe(1)

    // Stage 2 threshold (>=10 min)
    trainer.distractionState.activeMs = minutes(11)
    trainer.evaluateTimeBasedStages(Date.now(), true)
    expect(trainer.distractionState.stage).toBe(2)
    expect(trainer.behaviorData.interventionStage).toBe(2)

    // Blur applied lightly
    const blurred = document.querySelectorAll('.attention-trainer-blur')
    expect(blurred.length).toBeGreaterThan(0)
  })

  test('Media playback counts as activity (isDistractionActive)', () => {
    // Visible tab by default
    trainer.distractionState.mediaPlaying = true
    expect(trainer.isDistractionActive(Date.now())).toBe(true)
  })
})

