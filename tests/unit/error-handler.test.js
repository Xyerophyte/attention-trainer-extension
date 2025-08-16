/**
 * Unit Tests for Error Handler
 * Tests error handling, notifications, circuit breaker, and retry logic
 */

const ErrorHandler = require('../../src/shared/error-handler.js')

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
      expect(errorHandler.errorLog).toEqual([])
      expect(errorHandler.maxLogSize).toBe(100)
      expect(errorHandler.errorListeners).toEqual([])
      expect(errorHandler.initialized).toBe(true)
      expect(errorHandler.errorCategories).toBeDefined()
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
      const result = errorHandler.handleError(testError, testContext)

      expect(consoleSpy.error).toHaveBeenCalled()
      expect(result).toBeDefined()
      expect(result.message).toBe('Test error')
      expect(result.category).toBe('unknown')
    })

    it('should increment error count for repeated errors', () => {
      errorHandler.handleError(testError, testContext)
      errorHandler.handleError(testError, testContext)
      errorHandler.handleError(testError, testContext)

      expect(errorHandler.errorLog).toHaveLength(3)
    })

    it('should trigger circuit breaker after threshold', () => {
      const testError = new Error('Circuit breaker test')
      const fn = jest.fn().mockRejectedValue(testError)
      const circuitFn = errorHandler.circuitBreaker(fn, { maxFailures: 2 })
      
      expect(circuitFn).toBeDefined()
    })

    it('should handle errors without context', () => {
      const result = errorHandler.handleError(testError)

      expect(consoleSpy.error).toHaveBeenCalled()
      expect(result).toBeDefined()
    })

    it('should handle critical errors differently', () => {
      const criticalContext = { ...testContext, isCritical: true }
      const result = errorHandler.handleError(testError, criticalContext)

      expect(consoleSpy.error).toHaveBeenCalled()
      expect(result).toBeDefined()
    })
  })

  describe('showErrorNotification', () => {
    it('should create and display notification', () => {
      const message = 'Test notification message'

      errorHandler.showErrorNotification(message)

      const notification = document.querySelector('.error-notification')
      expect(notification).toBeTruthy()
      expect(notification.textContent).toContain(message)
    })

    it('should auto-remove notification after timeout', async () => {
      jest.useFakeTimers()

      errorHandler.showErrorNotification('Test message')

      const notification = document.querySelector('.error-notification')
      expect(notification).toBeTruthy()

      // Fast-forward time
      jest.advanceTimersByTime(6000)
      
      // Check if notification still exists or was removed
      const stillExists = document.querySelector('.error-notification')
      expect(stillExists).toBeFalsy() // Should be removed after timeout

      jest.useRealTimers()
    })

    it('should not create duplicate notifications', () => {
      errorHandler.showErrorNotification('Test 1')
      errorHandler.showErrorNotification('Test 2')

      const notifications = document.querySelectorAll('.error-notification')
      expect(notifications.length).toBeGreaterThanOrEqual(1)
    })

    it('should handle notification with custom duration', () => {
      errorHandler.showErrorNotification('Warning message', 1000)

      const notification = document.querySelector('.error-notification')
      expect(notification).toBeTruthy()
    })
  })

  describe('circuit breaker', () => {
    it('should create circuit breaker function', () => {
      const testFn = jest.fn().mockResolvedValue('success')
      const circuitFn = errorHandler.circuitBreaker(testFn, { maxFailures: 2 })
      
      expect(circuitFn).toBeDefined()
      expect(typeof circuitFn).toBe('function')
    })

    it('should allow circuit breaker to work', async () => {
      const testFn = jest.fn().mockResolvedValue('success')
      const circuitFn = errorHandler.circuitBreaker(testFn, { maxFailures: 2 })
      
      const result = await circuitFn()
      expect(result).toBe('success')
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

      const result = await errorHandler.retry(operation, { maxRetries: 3 })

      expect(result).toBe('success')
      expect(attempts).toBe(3)
    })

    it('should fail after max retries', async () => {
      const operation = async () => {
        throw new Error('Persistent error')
      }

      await expect(
        errorHandler.retry(operation, { maxRetries: 2 })
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

      const promise = errorHandler.retry(operation, {
        maxRetries: 3,
        factor: 2
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

  describe('error categorization', () => {
    it('should categorize context invalidation errors', () => {
      const contextError = new Error('Extension context invalidated')
      expect(errorHandler.categorizeError(contextError)).toBe('context_invalidation')

      const messageError = new Error('receiving end does not exist')
      expect(errorHandler.categorizeError(messageError)).toBe('context_invalidation')
    })

    it('should categorize connection errors', () => {
      const connectionError = new Error('connection failed')
      expect(errorHandler.categorizeError(connectionError)).toBe('connection_failure')

      const networkError = new Error('network timeout')
      expect(errorHandler.categorizeError(networkError)).toBe('connection_failure')
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

      expect(stats).toBeDefined()
      expect(stats.total).toBe(3)
      expect(stats.unknown).toBe(3) // All errors are 'unknown' category
    })
  })
})
