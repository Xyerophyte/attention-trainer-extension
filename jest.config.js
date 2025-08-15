module.exports = {
  // Test environment setup
  testEnvironment: 'jsdom',
  
  // Test file patterns
  testMatch: [
    '<rootDir>/tests/**/*.test.js',
    '<rootDir>/tests/**/*.spec.js'
  ],
  
  // Setup files
  setupFilesAfterEnv: [
    '<rootDir>/tests/setup/jest.setup.js'
  ],
  
  // Module resolution
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@shared/(.*)$': '<rootDir>/src/shared/$1',
    '^@content/(.*)$': '<rootDir>/src/content/$1',
    '^@background/(.*)$': '<rootDir>/src/background/$1',
    '^@popup/(.*)$': '<rootDir>/src/popup/$1',
    '^@dashboard/(.*)$': '<rootDir>/src/dashboard/$1'
  },
  
  // Coverage configuration
  collectCoverage: true,
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/**/*.min.js',
    '!src/**/vendor/**',
    '!src/lib/**',
    '!**/node_modules/**'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: [
    'text',
    'lcov',
    'html',
    'json-summary'
  ],
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 70,
      lines: 80,
      statements: 80
    }
  },
  
  // Transform configuration
  transform: {
    '^.+\\.js$': 'babel-jest'
  },
  
  // Module file extensions
  moduleFileExtensions: ['js', 'json'],
  
  // Test timeout
  testTimeout: 10000,
  
  // Global setup and teardown
  globalSetup: '<rootDir>/tests/setup/global-setup.js',
  globalTeardown: '<rootDir>/tests/setup/global-teardown.js',
  
  // Verbose output
  verbose: true,
  
  // Clear mocks between tests
  clearMocks: true,
  
  // Restore mocks after each test
  restoreMocks: true,
  
  // Error handling
  errorOnDeprecated: true,
  
  // Reporter configuration
  reporters: [
    'default',
    ['jest-html-reporter', {
      pageTitle: 'Attention Trainer Extension Test Report',
      outputPath: './coverage/test-report.html',
      includeFailureMsg: true,
      includeSuiteFailure: true
    }]
  ]
};
