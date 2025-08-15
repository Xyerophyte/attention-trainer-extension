#!/usr/bin/env node

/**
 * Test Runner for Background Script Tests
 * Runs unit and integration tests for the background script with detailed reporting
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const PROJECT_ROOT = path.join(__dirname, '..');

console.log('🧪 Background Script Test Runner');
console.log('================================\n');

// Color codes for terminal output
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  reset: '\x1b[0m',
  bold: '\x1b[1m'
};

function colorLog(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function checkTestFiles() {
  const requiredTestFiles = [
    'tests/unit/background-script.test.js',
    'tests/unit/popup.test.js',
    'tests/integration/background-integration.test.js'
  ];

  colorLog('📁 Checking test files...', 'blue');
  
  for (const testFile of requiredTestFiles) {
    const fullPath = path.join(PROJECT_ROOT, testFile);
    if (fs.existsSync(fullPath)) {
      colorLog(`  ✓ ${testFile}`, 'green');
    } else {
      colorLog(`  ✗ ${testFile} (missing)`, 'red');
      return false;
    }
  }
  
  return true;
}

function runTests() {
  try {
    // Check if Node modules are installed
    const nodeModulesPath = path.join(PROJECT_ROOT, 'node_modules');
    if (!fs.existsSync(nodeModulesPath)) {
      colorLog('📦 Installing dependencies...', 'yellow');
      execSync('npm install', { 
        cwd: PROJECT_ROOT, 
        stdio: 'inherit' 
      });
    }

    // Run background script unit tests
    colorLog('🧪 Running Background Script Unit Tests...', 'cyan');
    execSync('npm test -- tests/unit/background-script.test.js --verbose', {
      cwd: PROJECT_ROOT,
      stdio: 'inherit'
    });

    // Run popup unit tests
    colorLog('\n🖥️ Running Popup Unit Tests...', 'cyan');
    execSync('npm test -- tests/unit/popup.test.js --verbose', {
      cwd: PROJECT_ROOT,
      stdio: 'inherit'
    });

    // Run background integration tests
    colorLog('\n🔗 Running Background Integration Tests...', 'cyan');
    execSync('npm test -- tests/integration/background-integration.test.js --verbose', {
      cwd: PROJECT_ROOT,
      stdio: 'inherit'
    });

    // Generate coverage report for background scripts only
    colorLog('\n📊 Generating Coverage Report for Background Components...', 'cyan');
    execSync('npm run test:coverage -- --testPathPattern="(background|popup)" --collectCoverageFrom="src/background/**/*.js" --collectCoverageFrom="src/popup/**/*.js"', {
      cwd: PROJECT_ROOT,
      stdio: 'inherit'
    });

    colorLog('\n✅ All background script tests passed!', 'green');
    
  } catch (error) {
    colorLog('\n❌ Some tests failed!', 'red');
    colorLog(`Error: ${error.message}`, 'red');
    process.exit(1);
  }
}

function runLinting() {
  try {
    colorLog('\n🔍 Running ESLint on background scripts...', 'blue');
    execSync('npx eslint src/background/ src/popup/ tests/unit/background-script.test.js tests/unit/popup.test.js tests/integration/background-integration.test.js --fix', {
      cwd: PROJECT_ROOT,
      stdio: 'inherit'
    });
    
    colorLog('✓ Linting completed', 'green');
  } catch (error) {
    colorLog('⚠️ Linting issues found (check output above)', 'yellow');
  }
}

function generateTestSummary() {
  const summaryPath = path.join(PROJECT_ROOT, 'test-results', 'background-test-summary.json');
  const summary = {
    timestamp: new Date().toISOString(),
    testSuite: 'Background Script Tests',
    components: [
      'Background Script Unit Tests',
      'Popup Script Unit Tests', 
      'Background Integration Tests'
    ],
    coverage: {
      target: '90%',
      components: ['message handling', 'analytics processing', 'settings management', 'keep-alive']
    },
    status: 'completed'
  };

  // Ensure directory exists
  const resultsDir = path.dirname(summaryPath);
  if (!fs.existsSync(resultsDir)) {
    fs.mkdirSync(resultsDir, { recursive: true });
  }

  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
  colorLog(`📄 Test summary saved to: ${summaryPath}`, 'blue');
}

function main() {
  try {
    // Validate test files exist
    if (!checkTestFiles()) {
      colorLog('\n❌ Required test files are missing!', 'red');
      process.exit(1);
    }

    colorLog('✅ All test files found\n', 'green');

    // Run linting first
    runLinting();

    // Run tests
    runTests();

    // Generate summary
    generateTestSummary();

    colorLog('\n🎉 Background script testing complete!', 'bold');
    colorLog('\nNext steps:', 'blue');
    colorLog('  • Review coverage reports in coverage/ directory', 'cyan');
    colorLog('  • Check test results in test-results/ directory', 'cyan');
    colorLog('  • Run full test suite with: npm test', 'cyan');
    
  } catch (error) {
    colorLog(`\n💥 Test runner failed: ${error.message}`, 'red');
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { 
  checkTestFiles, 
  runTests, 
  runLinting, 
  generateTestSummary 
};
