/**
 * Global Setup for Jest Tests
 * Runs once before all tests start
 */

module.exports = async () => {
  console.log('🚀 Starting Chrome Extension Test Suite...')

  // Set up global test environment
  process.env.NODE_ENV = 'test'
  process.env.CHROME_EXTENSION_ID = 'test-extension-id'

  // Configure timeouts for async operations
  process.env.TEST_TIMEOUT = '10000'

  // Mock necessary globals
  global.JEST_WORKER_ID = process.env.JEST_WORKER_ID

  console.log('✅ Global test setup complete')
}
