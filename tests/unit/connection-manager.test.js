/**
 * Unit Tests for Connection Manager
 * Tests connection validation, message handling, retry logic, and error recovery
 */

const fs = require('fs')
const path = require('path')

// Load the connection manager source
const connectionManagerPath = path.join(__dirname, '../../src/shared/connection-manager.js')
const connectionManagerSource = fs.readFileSync(connectionManagerPath, 'utf8')

// Extract the ConnectionManager class (remove any module exports)
const cleanSource = connectionManagerSource.replace(/if \(typeof module.*[\s\S]*$/, '')
eval(cleanSource)

describe('ConnectionManager', () => {
  let connectionManager
  let mockErrorHandler

  beforeEach(() => {
    // Mock error handler
    mockErrorHandler = {
      handleError: jest.fn(),
      showErrorNotification: jest.fn()
    }

    // Reset chrome mocks
    chrome.runtime.id = 'test-extension-id'
    chrome.runtime.getURL.mockImplementation((path) => `chrome-extension://test-extension-id/${path}`)
    chrome.runtime.sendMessage.mockResolvedValue({ success: true })

    connectionManager = new ConnectionManager(mockErrorHandler)
  })

  describe('constructor', () => {
    it('should initialize with default values', () => {
      expect(connectionManager.isConnected).toBe(false)
      expect(connectionManager.contextValid).toBe(true)
      expect(connectionManager.messageQueue).toEqual([])
      expect(connectionManager.retryCount).toBe(0)
    })

    it('should accept error handler', () => {
      expect(connectionManager.errorHandler).toBe(mockErrorHandler)
    })
  })

  describe('validateContext', () => {
    it('should return true for valid context', async () => {
      chrome.runtime.getURL.mockReturnValue('chrome-extension://test-extension-id/manifest.json')

      const isValid = await connectionManager.validateContext()

      expect(isValid).toBe(true)
      expect(chrome.runtime.getURL).toHaveBeenCalledWith('manifest.json')
    })

    it('should return false for invalid context', async () => {
      chrome.runtime.getURL.mockImplementation(() => {
        throw new Error('Extension context invalidated')
      })

      const isValid = await connectionManager.validateContext()

      expect(isValid).toBe(false)
      expect(connectionManager.contextValid).toBe(false)
    })

    it('should return false for invalid URL format', async () => {
      chrome.runtime.getURL.mockReturnValue('invalid-url')

      const isValid = await connectionManager.validateContext()

      expect(isValid).toBe(false)
    })
  })

  describe('sendMessage', () => {
    const testMessage = { type: 'TEST_MESSAGE', data: { test: true } }

    it('should send message successfully', async () => {
      const mockResponse = { success: true, data: 'response' }
      chrome.runtime.sendMessage.mockResolvedValue(mockResponse)

      const response = await connectionManager.sendMessage(testMessage)

      expect(response).toEqual(mockResponse)
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(testMessage)
      expect(connectionManager.isConnected).toBe(true)
    })

    it('should handle connection failure and retry', async () => {
      chrome.runtime.sendMessage
        .mockRejectedValueOnce(new Error('Connection failed'))
        .mockResolvedValueOnce({ success: true })

      const response = await connectionManager.sendMessage(testMessage)

      expect(response).toEqual({ success: true })
      expect(chrome.runtime.sendMessage).toHaveBeenCalledTimes(2)
    })

    it('should queue message when context is invalid', async () => {
      connectionManager.contextValid = false

      const promise = connectionManager.sendMessage(testMessage)

      expect(connectionManager.messageQueue).toHaveLength(1)
      expect(connectionManager.messageQueue[0].message).toEqual(testMessage)

      // Should not resolve immediately
      await expect(Promise.race([promise, new Promise(resolve => setTimeout(resolve, 100))])).resolves.toBeUndefined()
    })

    it('should handle max retries exceeded', async () => {
      chrome.runtime.sendMessage.mockRejectedValue(new Error('Persistent failure'))

      await expect(connectionManager.sendMessage(testMessage)).rejects.toThrow('Max retries exceeded')
      expect(mockErrorHandler.handleError).toHaveBeenCalled()
    })

    it('should detect context invalidation errors', async () => {
      chrome.runtime.sendMessage.mockRejectedValue(new Error('Extension context invalidated'))

      await expect(connectionManager.sendMessage(testMessage)).rejects.toThrow()
      expect(connectionManager.contextValid).toBe(false)
    })
  })

  describe('connect', () => {
    it('should establish connection successfully', async () => {
      chrome.runtime.sendMessage.mockResolvedValue({ success: true })

      const result = await connectionManager.connect()

      expect(result).toBe(true)
      expect(connectionManager.isConnected).toBe(true)
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
        type: 'CONNECTION_TEST',
        timestamp: expect.any(Number)
      })
    })

    it('should fail to connect with invalid context', async () => {
      chrome.runtime.getURL.mockImplementation(() => {
        throw new Error('Invalid context')
      })

      const result = await connectionManager.connect()

      expect(result).toBe(false)
      expect(connectionManager.isConnected).toBe(false)
    })

    it('should call connection change callback', async () => {
      const mockCallback = jest.fn()
      connectionManager.onConnectionChange = mockCallback
      chrome.runtime.sendMessage.mockResolvedValue({ success: true })

      await connectionManager.connect()

      expect(mockCallback).toHaveBeenCalledWith(true)
    })
  })

  describe('processMessageQueue', () => {
    it('should process queued messages when connected', async () => {
      const message1 = { type: 'TEST1', data: {} }
      const message2 = { type: 'TEST2', data: {} }

      // Queue messages while disconnected
      connectionManager.isConnected = false
      connectionManager.queueMessage(message1)
      connectionManager.queueMessage(message2)

      expect(connectionManager.messageQueue).toHaveLength(2)

      // Connect and process queue
      chrome.runtime.sendMessage.mockResolvedValue({ success: true })
      connectionManager.isConnected = true

      await connectionManager.processMessageQueue()

      expect(connectionManager.messageQueue).toHaveLength(0)
      expect(chrome.runtime.sendMessage).toHaveBeenCalledTimes(2)
    })

    it('should handle queue processing errors gracefully', async () => {
      const message = { type: 'TEST', data: {} }
      connectionManager.queueMessage(message)

      chrome.runtime.sendMessage.mockRejectedValue(new Error('Queue processing failed'))
      connectionManager.isConnected = true

      await connectionManager.processMessageQueue()

      expect(mockErrorHandler.handleError).toHaveBeenCalled()
    })
  })

  describe('disconnect', () => {
    it('should disconnect and clear state', () => {
      connectionManager.isConnected = true
      connectionManager.retryCount = 3
      const mockCallback = jest.fn()
      connectionManager.onConnectionChange = mockCallback

      connectionManager.disconnect()

      expect(connectionManager.isConnected).toBe(false)
      expect(connectionManager.retryCount).toBe(0)
      expect(mockCallback).toHaveBeenCalledWith(false)
    })
  })

  describe('exponential backoff', () => {
    it('should calculate correct backoff delays', () => {
      expect(connectionManager.getBackoffDelay(0)).toBe(1000)
      expect(connectionManager.getBackoffDelay(1)).toBe(2000)
      expect(connectionManager.getBackoffDelay(2)).toBe(4000)
      expect(connectionManager.getBackoffDelay(3)).toBe(8000)
      expect(connectionManager.getBackoffDelay(10)).toBe(30000) // Capped at 30s
    })
  })

  describe('error handling', () => {
    it('should handle context invalidation properly', () => {
      const mockContextCallback = jest.fn()
      connectionManager.onContextInvalid = mockContextCallback

      connectionManager.handleContextInvalidation()

      expect(connectionManager.contextValid).toBe(false)
      expect(connectionManager.isConnected).toBe(false)
      expect(mockContextCallback).toHaveBeenCalled()
    })

    it('should detect connection errors correctly', () => {
      expect(connectionManager.isConnectionError(new Error('receiving end does not exist'))).toBe(true)
      expect(connectionManager.isConnectionError(new Error('message port closed'))).toBe(true)
      expect(connectionManager.isConnectionError(new Error('Extension context invalidated'))).toBe(true)
      expect(connectionManager.isConnectionError(new Error('Some other error'))).toBe(false)
    })
  })

  describe('health monitoring', () => {
    it('should start health monitoring', () => {
      const spy = jest.spyOn(global, 'setInterval')

      connectionManager.startHealthMonitoring()

      expect(spy).toHaveBeenCalledWith(expect.any(Function), 30000)
      expect(connectionManager.healthCheckInterval).toBeDefined()
    })

    it('should stop health monitoring', () => {
      const spy = jest.spyOn(global, 'clearInterval')
      connectionManager.healthCheckInterval = 123

      connectionManager.stopHealthMonitoring()

      expect(spy).toHaveBeenCalledWith(123)
      expect(connectionManager.healthCheckInterval).toBeNull()
    })

    it('should perform health check', async () => {
      chrome.runtime.sendMessage.mockResolvedValue({ healthy: true })

      await connectionManager.performHealthCheck()

      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
        type: 'HEALTH_CHECK',
        timestamp: expect.any(Number)
      })
    })
  })
})
