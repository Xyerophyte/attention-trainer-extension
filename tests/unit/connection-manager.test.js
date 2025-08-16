/**
 * Unit Tests for Connection Manager
 * Tests connection validation, message handling, retry logic, and error recovery
 */

const fs = require('fs')
const path = require('path')

// Load the connection manager source
const connectionManagerPath = path.join(__dirname, '../../src/shared/connection-manager.js')
let connectionManagerSource = fs.readFileSync(connectionManagerPath, 'utf8')

// Define required globals for ConnectionManager
global.window = global.window || {}
global.window.logger = {
  child: jest.fn().mockReturnValue({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  })
}

// Remove module exports and expose class globally
connectionManagerSource = connectionManagerSource.replace(/if \(typeof module.*[\s\S]*$/, '')
connectionManagerSource += "\n;try{globalThis.ConnectionManager = ConnectionManager}catch(_){}\n"
eval(connectionManagerSource)

describe('ConnectionManager', () => {
  let connectionManager
  let mockErrorHandler

  beforeEach(() => {
    // Mock error handler
    mockErrorHandler = {
      handleError: jest.fn(),
      showErrorNotification: jest.fn()
    }

    // Reset chrome mocks with sinon-chrome style
    chrome.runtime.id = 'test-extension-id'
    chrome.runtime.getURL.returns('chrome-extension://test-extension-id/manifest.json')
    chrome.runtime.sendMessage.resolves({ success: true })

    connectionManager = new ConnectionManager(mockErrorHandler)
  })

  describe('constructor', () => {
    it('should initialize with default values', () => {
      expect(connectionManager.isConnected).toBe(false)
      expect(connectionManager.contextValid).toBe(true)
      expect(connectionManager.messageQueue).toEqual([])
      expect(connectionManager.connectionAttempts).toBe(0)
    })

    it('should accept error handler in options', () => {
      const cmWithHandler = new ConnectionManager({ errorHandler: mockErrorHandler })
      expect(cmWithHandler.options.errorHandler).toBe(mockErrorHandler)
    })
  })

  describe('validateContext', () => {
    it('should return true for valid context', async () => {
      chrome.runtime.getURL.returns('chrome-extension://test-extension-id/manifest.json')

      const isValid = await connectionManager.validateContext()

      expect(isValid).toBe(true)
      expect(chrome.runtime.getURL.calledWith('manifest.json')).toBe(true)
    })

    it('should return false for invalid context', async () => {
      chrome.runtime.getURL.throws(new Error('Extension context invalidated'))

      const isValid = await connectionManager.validateContext()

      expect(isValid).toBe(false)
      expect(connectionManager.contextValid).toBe(false)
    })

    it('should return false for invalid URL format', async () => {
      chrome.runtime.getURL.returns('invalid-url')

      const isValid = await connectionManager.validateContext()

      expect(isValid).toBe(false)
    })
  })

  describe('sendMessage', () => {
    const testMessage = { type: 'TEST_MESSAGE', data: { test: true } }

    it('should send message successfully', async () => {
      const mockResponse = { success: true, data: 'response' }
      chrome.runtime.sendMessage.resolves(mockResponse)

      const response = await connectionManager.sendMessage(testMessage)

      expect(response).toEqual(mockResponse)
      expect(chrome.runtime.sendMessage.calledWith(testMessage)).toBe(true)
      expect(connectionManager.isConnected).toBe(true)
    })

    it('should handle connection failure and retry', async () => {
      chrome.runtime.sendMessage
        .onFirstCall().rejects(new Error('Connection failed'))
        .onSecondCall().resolves({ success: true })

      const response = await connectionManager.sendMessage(testMessage)

      expect(response).toEqual({ success: true })
      expect(chrome.runtime.sendMessage.callCount).toBe(2)
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
      chrome.runtime.sendMessage.rejects(new Error('Persistent failure'))

      await expect(connectionManager.sendMessage(testMessage)).rejects.toThrow('Max retries exceeded')
      expect(mockErrorHandler.handleError).toHaveBeenCalled()
    })

    it('should detect context invalidation errors', async () => {
      chrome.runtime.sendMessage.rejects(new Error('Extension context invalidated'))

      await expect(connectionManager.sendMessage(testMessage)).rejects.toThrow()
      expect(connectionManager.contextValid).toBe(false)
    })
  })

  describe('establishConnection', () => {
    it('should establish connection successfully', async () => {
      chrome.runtime.sendMessage.resolves({ success: true })
      connectionManager.contextValid = true

      const result = await connectionManager.establishConnection()

      expect(result).toBe(true)
      expect(connectionManager.isConnected).toBe(true)
      expect(chrome.runtime.sendMessage.calledOnce).toBe(true)
    })

    it('should fail to connect with invalid context', async () => {
      connectionManager.contextValid = false

      const result = await connectionManager.establishConnection()

      expect(result).toBe(false)
      expect(connectionManager.isConnected).toBe(false)
    })

    it('should call connection change callback', async () => {
      const mockCallback = jest.fn()
      connectionManager.onConnectionChange = mockCallback
      connectionManager.contextValid = true
      chrome.runtime.sendMessage.resolves({ success: true })

      await connectionManager.establishConnection()

      expect(mockCallback).toHaveBeenCalledWith(true)
    })
  })

  describe('flushMessageQueue', () => {
    it('should flush queued messages when connected', async () => {
      // Manually add messages to queue for testing
      connectionManager.messageQueue.push({
        message: { type: 'TEST1', data: {} },
        resolve: jest.fn(),
        reject: jest.fn()
      })
      connectionManager.messageQueue.push({
        message: { type: 'TEST2', data: {} },
        resolve: jest.fn(),
        reject: jest.fn()
      })

      chrome.runtime.sendMessage.resolves({ success: true })

      await connectionManager.flushMessageQueue()

      expect(connectionManager.messageQueue).toHaveLength(0)
    })
  })

  describe('cleanup', () => {
    it('should cleanup resources', () => {
      connectionManager.isConnected = true
      connectionManager.healthCheckInterval = 123
      const mockCallback = jest.fn()
      connectionManager.onConnectionChange = mockCallback

      connectionManager.cleanup()

      expect(connectionManager.healthCheckInterval).toBeNull()
    })
  })

  describe('scheduling reconnection', () => {
    it('should schedule reconnection with backoff', () => {
      const spy = jest.spyOn(global, 'setTimeout')
      
      connectionManager.scheduleReconnection()

      expect(spy).toHaveBeenCalled()
      expect(connectionManager.connectionAttempts).toBe(1)
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
    it('should start health check', () => {
      const spy = jest.spyOn(global, 'setInterval')

      connectionManager.startHealthCheck()

      expect(spy).toHaveBeenCalledWith(expect.any(Function), 15000)
      expect(connectionManager.healthCheckInterval).toBeDefined()
    })

    it('should stop health check', () => {
      const spy = jest.spyOn(global, 'clearInterval')
      connectionManager.healthCheckInterval = 123

      connectionManager.stopHealthCheck()

      expect(spy).toHaveBeenCalledWith(123)
      expect(connectionManager.healthCheckInterval).toBeNull()
    })
  })
})
