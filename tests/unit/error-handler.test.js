/**
 * Unit Tests for Error Handler
 * Tests error handling, notifications, circuit breaker, and retry logic
 */

const fs = require('fs')
const path = require('path')

// Load the error handler source
const errorHandlerPath = path.join(__dirname, '../../src/shared/error-handler.js')
const errorHandlerSource = fs.readFileSync(errorHandlerPath, 'utf8')

// Extract the ErrorHandler class
const cleanSource = errorHandlerSource.replace(/if \(typeof module.*[\s\S]*$/, '')
eval(cleanSource)

describe('ErrorHandler', () => {
  let errorHandler
  let consoleSpy

  beforeEach(() => {
    errorHandler = new ErrorHandler()

    // Spy on console methods
    consoleSpy = {
      error: jest.spyOn(console, 'error').mockImplementation(),
      warn: jest.spyOn(console, 'warn').mockImplementation(),
      log: jest.spyOn(console, 'log').mockImplementation()
    }

    // Mock DOM for notifications
    document.body.innerHTML = ''
  })

  afterEach(() => {
    // Restore console methods
    Object.values(consoleSpy).forEach(spy => spy.mockRestore())
  })

  describe('constructor', () => {
    it('should initialize with default values', () => {
      expect(errorHandler.errorCounts).toEqual({})
      expect(errorHandler.circuitBreakers).toEqual({})
      expect(errorHandler.maxRetries).toBe(3)
      expect(errorHandler.circuitBreakerThreshold).toBe(5)
    })
  })

  describe('handleError', () => {
    const testError = new Error('Test error')
    const testContext = {
      component: 'test-component',
      operation: 'test-operation',
      userId: 'test-user'
    }

    it('should handle basic error', () => {
      errorHandler.handleError(testError, testContext)

      expect(consoleSpy.error).toHaveBeenCalledWith(
        '❌ Error in test-component:test-operation:',
        testError
      )
      expect(errorHandler.errorCounts['test-component:test-operation']).toBe(1)
    })

    it('should increment error count for repeated errors', () => {
      errorHandler.handleError(testError, testContext)
      errorHandler.handleError(testError, testContext)
      errorHandler.handleError(testError, testContext)

      expect(errorHandler.errorCounts['test-component:test-operation']).toBe(3)
    })

    it('should trigger circuit breaker after threshold', () => {
      const errorKey = 'test-component:test-operation'

      // Trigger errors up to threshold
      for (let i = 0; i < errorHandler.circuitBreakerThreshold; i++) {
        errorHandler.handleError(testError, testContext)
      }

      expect(errorHandler.circuitBreakers[errorKey]).toBeDefined()
      expect(errorHandler.circuitBreakers[errorKey].isOpen).toBe(true)
    })

    it('should handle errors without context', () => {
      errorHandler.handleError(testError)

      expect(consoleSpy.error).toHaveBeenCalledWith(
        '❌ Error in unknown:unknown:',
        testError
      )
    })

    it('should handle critical errors differently', () => {
      const criticalContext = { ...testContext, level: 'critical' }

      errorHandler.handleError(testError, criticalContext)

      expect(consoleSpy.error).toHaveBeenCalledWith(
        '🚨 CRITICAL ERROR in test-component:test-operation:',
        testError
      )
    })
  })

  describe('showErrorNotification', () => {
    it('should create and display notification', () => {
      const message = 'Test notification message'

      errorHandler.showErrorNotification(message)

      const notification = document.querySelector('.error-notification')
      expect(notification).toBeTruthy()
      expect(notification.textContent).toContain(message)
      expect(notification.style.display).toBe('block')
    })

    it('should auto-remove notification after timeout', async () => {
      jest.useFakeTimers()

      errorHandler.showErrorNotification('Test message')

      const notification = document.querySelector('.error-notification')
      expect(notification).toBeTruthy()

      // Fast-forward time
      jest.advanceTimersByTime(5000)

      expect(notification.style.display).toBe('none')

      jest.useRealTimers()
    })

    it('should not create duplicate notifications', () => {
      errorHandler.showErrorNotification('Test 1')
      errorHandler.showErrorNotification('Test 2')

      const notifications = document.querySelectorAll('.error-notification')
      expect(notifications).toHaveLength(1)
      expect(notifications[0].textContent).toContain('Test 2') // Should update content
    })

    it('should handle notification with custom type', () => {
      errorHandler.showErrorNotification('Warning message', 'warning')

      const notification = document.querySelector('.error-notification')
      expect(notification.classList.contains('warning')).toBe(true)
    })
  })

  describe('circuit breaker', () => {
    const errorKey = 'test-component:test-operation'
    const testError = new Error('Test error')
    const testContext = { component: 'test-component', operation: 'test-operation' }

    it('should open circuit breaker after threshold', () => {
      // Trigger threshold number of errors
      for (let i = 0; i < errorHandler.circuitBreakerThreshold; i++) {
        errorHandler.handleError(testError, testContext)
      }

      expect(errorHandler.isCircuitBreakerOpen(errorKey)).toBe(true)
    })

    it('should prevent operations when circuit breaker is open', () => {
      // Open circuit breaker
      for (let i = 0; i < errorHandler.circuitBreakerThreshold; i++) {
        errorHandler.handleError(testError, testContext)
      }

      const canProceed = errorHandler.canProceedWithOperation(errorKey)
      expect(canProceed).toBe(false)
    })

    it('should reset circuit breaker after timeout', async () => {
      jest.useFakeTimers()

      // Open circuit breaker
      for (let i = 0; i < errorHandler.circuitBreakerThreshold; i++) {
        errorHandler.handleError(testError, testContext)
      }

      expect(errorHandler.isCircuitBreakerOpen(errorKey)).toBe(true)

      // Fast-forward past reset timeout (30 seconds)
      jest.advanceTimersByTime(31000)

      expect(errorHandler.isCircuitBreakerOpen(errorKey)).toBe(false)

      jest.useRealTimers()
    })

    it('should allow testing circuit breaker state', () => {
      expect(errorHandler.isCircuitBreakerOpen('non-existent')).toBe(false)

      // Create open circuit breaker
      errorHandler.circuitBreakers[errorKey] = {
        isOpen: true,
        openedAt: Date.now(),
        resetTimeout: 30000
      }

      expect(errorHandler.isCircuitBreakerOpen(errorKey)).toBe(true)
    })
  })

  describe('retry mechanism', () => {
    it('should provide retry functionality', async () => {
      let attempts = 0
      const operation = async () => {
        attempts++
        if (attempts < 3) {
          throw new Error('Retry test error')
        }
        return 'success'
      }

      const result = await errorHandler.withRetry(operation, { maxRetries: 3 })

      expect(result).toBe('success')
      expect(attempts).toBe(3)
    })

    it('should fail after max retries', async () => {
      const operation = async () => {
        throw new Error('Persistent error')
      }

      await expect(
        errorHandler.withRetry(operation, { maxRetries: 2 })
      ).rejects.toThrow('Persistent error')
    })

    it('should use exponential backoff', async () => {
      jest.useFakeTimers()

      let attempts = 0
      const operation = async () => {
        attempts++
        if (attempts < 3) {
          throw new Error('Backoff test')
        }
        return 'success'
      }

      const promise = errorHandler.withRetry(operation, {
        maxRetries: 3,
        useExponentialBackoff: true
      })

      // Should delay before second attempt
      jest.advanceTimersByTime(1000)
      // Should delay more before third attempt
      jest.advanceTimersByTime(2000)

      const result = await promise
      expect(result).toBe('success')

      jest.useRealTimers()
    })
  })

  describe('error reporting', () => {
    it('should report errors to analytics', async () => {
      chrome.runtime.sendMessage.mockResolvedValue({ success: true })

      const testError = new Error('Test analytics error')
      const testContext = { component: 'test', operation: 'analytics' }

      await errorHandler.reportError(testError, testContext)

      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
        type: 'ERROR_REPORT',
        data: {
          error: {
            name: testError.name,
            message: testError.message,
            stack: testError.stack
          },
          context: testContext,
          timestamp: expect.any(Number),
          userAgent: navigator.userAgent,
          url: window.location.href
        }
      })
    })

    it('should handle reporting failures gracefully', async () => {
      chrome.runtime.sendMessage.mockRejectedValue(new Error('Reporting failed'))

      const testError = new Error('Test error')

      // Should not throw
      await expect(
        errorHandler.reportError(testError, {})
      ).resolves.toBeUndefined()

      expect(consoleSpy.warn).toHaveBeenCalledWith(
        'Failed to report error to analytics:',
        expect.any(Error)
      )
    })
  })

  describe('error categorization', () => {
    it('should categorize network errors', () => {
      const networkError = new Error('Failed to fetch')
      expect(errorHandler.categorizeError(networkError)).toBe('network')

      const connectionError = new Error('net::ERR_NETWORK_CHANGED')
      expect(errorHandler.categorizeError(connectionError)).toBe('network')
    })

    it('should categorize extension context errors', () => {
      const contextError = new Error('Extension context invalidated')
      expect(errorHandler.categorizeError(contextError)).toBe('context')

      const messageError = new Error('receiving end does not exist')
      expect(errorHandler.categorizeError(messageError)).toBe('context')
    })

    it('should categorize permission errors', () => {
      const permissionError = new Error('Permission denied')
      expect(errorHandler.categorizeError(permissionError)).toBe('permission')

      const accessError = new Error('Access denied')
      expect(errorHandler.categorizeError(accessError)).toBe('permission')
    })

    it('should default to unknown category', () => {
      const unknownError = new Error('Some random error')
      expect(errorHandler.categorizeError(unknownError)).toBe('unknown')
    })
  })

  describe('error aggregation', () => {
    it('should provide error statistics', () => {
      const testError = new Error('Test error')

      // Generate some errors
      errorHandler.handleError(testError, { component: 'comp1', operation: 'op1' })
      errorHandler.handleError(testError, { component: 'comp1', operation: 'op1' })
      errorHandler.handleError(testError, { component: 'comp2', operation: 'op2' })

      const stats = errorHandler.getErrorStats()

      expect(stats.totalErrors).toBe(3)
      expect(stats.uniqueErrors).toBe(2)
      expect(stats.errorsByComponent.comp1).toBe(2)
      expect(stats.errorsByComponent.comp2).toBe(1)
    })

    it('should track error trends', () => {
      const testError = new Error('Trend test')

      // Mock timestamps
      const now = Date.now()
      jest.spyOn(Date, 'now')
        .mockReturnValueOnce(now - 10000)
        .mockReturnValueOnce(now - 5000)
        .mockReturnValueOnce(now)

      errorHandler.handleError(testError, { component: 'trend' })
      errorHandler.handleError(testError, { component: 'trend' })
      errorHandler.handleError(testError, { component: 'trend' })

      const trends = errorHandler.getErrorTrends(15000) // Last 15 seconds
      expect(trends).toHaveLength(3)
    })
  })
})
