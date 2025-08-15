module.exports = {
  env: {
    browser: true,
    es2021: true,
    node: true,
    jest: true,
    webextensions: true
  },
  extends: [
    'standard'
  ],
  plugins: [
    'jest'
  ],
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module'
  },
  rules: {
    // Allow console statements in development
    'no-console': 'warn',
    
    // Allow alert/confirm dialogs in extensions
    'no-alert': 'warn',
    
    // Allow eval in tests for dynamic code loading
    'no-eval': process.env.NODE_ENV === 'test' ? 'warn' : 'error',
    
    // Allow unused variables that start with underscore
    'no-unused-vars': ['error', { 
      argsIgnorePattern: '^_',
      varsIgnorePattern: '^_',
      caughtErrorsIgnorePattern: '^_'
    }],
    
    // Allow window object usage in browser extensions
    'no-restricted-globals': 'off',
    
    // Allow lexical declarations in case blocks
    'no-case-declarations': 'off',
    
    // Allow unused expressions for extension messaging
    'no-unused-expressions': 'off',
    
    // Allow prototype methods access
    'no-prototype-builtins': 'warn',
    
    // Allow functions in loops for extension event handling
    'no-loop-func': 'warn',
    
    // Allow constant conditions for feature flags
    'no-constant-condition': 'warn',
    
    // Jest specific rules
    'jest/expect-expect': 'warn',
    'jest/no-disabled-tests': 'warn',
    'jest/no-focused-tests': 'error',
    'jest/no-identical-title': 'error',
    'jest/prefer-to-have-length': 'warn',
    'jest/valid-expect': 'error'
  },
  globals: {
    // Chrome extension globals
    chrome: 'readonly',
    browser: 'readonly',
    
    // Test globals
    jest: 'readonly',
    describe: 'readonly',
    it: 'readonly',
    test: 'readonly',
    expect: 'readonly',
    beforeEach: 'readonly',
    afterEach: 'readonly',
    beforeAll: 'readonly',
    afterAll: 'readonly'
  },
  overrides: [
    {
      files: ['tests/**/*.js'],
      env: {
        jest: true
      },
      rules: {
        // More lenient rules for test files
        'no-eval': 'warn',
        'no-undef': 'warn',
        'no-unused-vars': 'warn'
      }
    },
    {
      files: ['src/**/*.js'],
      env: {
        browser: true,
        webextensions: true
      },
      rules: {
        // Stricter rules for source code
        'no-eval': 'error',
        'no-undef': 'error'
      }
    }
  ]
};
