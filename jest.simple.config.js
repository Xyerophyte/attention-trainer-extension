module.exports = {
  // Test environment setup
  testEnvironment: 'jsdom',
  
  // Test file patterns
  testMatch: [
    '<rootDir>/tests/simple.test.js'
  ],
  
  // Don't use the complex setup file for now
  setupFilesAfterEnv: [],
  
  // Module file extensions
  moduleFileExtensions: ['js', 'json'],
  
  // Test timeout
  testTimeout: 5000,
  
  // Verbose output
  verbose: true,
  
  // Clear mocks between tests
  clearMocks: true,
  
  // Don't collect coverage for simple tests
  collectCoverage: false
};
