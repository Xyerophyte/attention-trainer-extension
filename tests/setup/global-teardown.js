/**
 * Global Teardown for Jest Tests
 * Runs once after all tests complete
 */

module.exports = async () => {
  console.log('🧹 Cleaning up test environment...')

  // Clean up any global resources
  // Reset environment variables
  delete process.env.CHROME_EXTENSION_ID
  delete process.env.TEST_TIMEOUT

  console.log('✅ Global test teardown complete')
}
