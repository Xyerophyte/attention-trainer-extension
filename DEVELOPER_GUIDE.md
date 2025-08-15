# Developer Guide - Attention Trainer Extension

Welcome to the Attention Trainer Extension development guide! This document provides comprehensive information for developers contributing to or maintaining this Chrome extension.

---

## 🎯 **Quick Start**

### **Prerequisites**
- **Node.js**: 16.0.0 or higher
- **npm**: 8.0.0 or higher  
- **Chrome Browser**: Version 88 or higher
- **Git**: For version control

### **Setup Development Environment**
```bash
# Clone the repository
git clone https://github.com/your-username/attention-trainer-extension
cd attention-trainer-extension

# Install dependencies
npm install --legacy-peer-deps

# Run tests to verify setup
npm test

# Load extension in Chrome for testing
# 1. Open Chrome → chrome://extensions/
# 2. Enable "Developer mode"
# 3. Click "Load unpacked" → Select project folder
```

---

## 🏗️ **Project Architecture**

### **High-Level Structure**
```
attention-trainer-extension/
├── src/                    # Source code
│   ├── background/         # Background service worker
│   ├── content/           # Content scripts for web pages
│   ├── popup/             # Extension popup interface
│   ├── dashboard/         # Analytics dashboard
│   └── shared/            # Shared utilities and modules
├── tests/                 # Testing infrastructure
├── docs/                  # Documentation
├── .github/               # CI/CD workflows
└── scripts/               # Build and utility scripts
```

### **Core Components**

#### **Background Service Worker** (`src/background/`)
- **Purpose**: Extension lifecycle management, message routing, analytics processing
- **Key Features**: Settings management, keep-alive mechanism, storage handling
- **Testing**: 95% coverage with comprehensive unit and integration tests

#### **Content Scripts** (`src/content/`)
- **Purpose**: Scroll monitoring, behavioral analysis, intervention delivery
- **Key Features**: Site pattern detection, real-time scroll tracking, intervention overlays
- **Testing**: 90% coverage including cross-site testing

#### **Popup Interface** (`src/popup/`)
- **Purpose**: User controls, quick settings, current domain statistics
- **Key Features**: Settings management, analytics preview, whitelist controls
- **Testing**: 90% coverage with DOM interaction testing

#### **Shared Modules** (`src/shared/`)
- **Purpose**: Common utilities, error handling, connection management
- **Key Features**: Robust message passing, fallback storage, error recovery
- **Testing**: 95% coverage with comprehensive mock scenarios

---

## 🧪 **Testing Strategy**

### **Test Organization**
```
tests/
├── unit/              # Component-level tests
├── integration/       # Cross-component tests
├── e2e/              # End-to-end browser tests
├── performance/      # Performance and load tests
├── setup/            # Test configuration
├── utils/            # Test utilities
└── mocks/            # Mock data and fixtures
```

### **Running Tests**

#### **Basic Test Commands**
```bash
# Run all tests
npm test

# Run specific test types
npm run test:unit                    # Unit tests only
npm run test:integration            # Integration tests
npm run test:e2e                    # End-to-end tests
npm run test:background             # Background script tests
npm run test:performance           # Performance tests

# Test with coverage
npm run test:coverage               # Generate coverage reports

# Watch mode for development
npm run test:watch                  # Re-run tests on file changes
```

#### **Test Configuration**
- **Framework**: Jest with jsdom environment
- **Mocking**: sinon-chrome for Chrome API simulation
- **E2E**: Puppeteer for real browser testing
- **Coverage**: 90%+ target for critical components

### **Writing Tests**

#### **Unit Test Pattern**
```javascript
describe('ComponentName', () => {
  beforeEach(() => {
    // Setup test environment
    chrome.flush(); // Reset Chrome API mocks
  });

  it('should perform expected behavior', async () => {
    // Arrange
    const input = 'test-input';
    chrome.storage.local.get.resolves({ setting: 'value' });

    // Act
    const result = await componentFunction(input);

    // Assert
    expect(result).toBe('expected-output');
    expect(chrome.storage.local.get).toHaveBeenCalledWith(['setting']);
  });
});
```

#### **Integration Test Pattern**
```javascript
describe('Component Integration', () => {
  it('should handle cross-component communication', async () => {
    // Setup multiple components
    const backgroundScript = require('../../src/background/background.js');
    const contentScript = require('../../src/content/content.js');

    // Simulate message passing
    const message = { type: 'BEHAVIORAL_EVENT', data: behaviorData };
    await backgroundScript.handleMessage(message);

    // Verify integration
    expect(chrome.storage.local.set).toHaveBeenCalled();
  });
});
```

---

## 🔧 **Development Workflow**

### **Code Style & Standards**
- **ESLint**: Automated linting with Chrome extension specific rules
- **Prettier**: Code formatting (if configured)
- **Naming Conventions**: camelCase for variables, PascalCase for classes
- **File Organization**: Logical grouping by functionality

### **Git Workflow**
```bash
# Create feature branch
git checkout -b feature/your-feature-name

# Make changes and commit
git add .
git commit -m "feat: add new feature description"

# Run tests before pushing
npm test

# Push branch and create PR
git push origin feature/your-feature-name
```

### **Pull Request Process**
1. **Create PR** with descriptive title and description
2. **Automated Checks**: CI/CD pipeline runs tests and linting
3. **Code Review**: Team review for quality and standards
4. **Testing**: Verify functionality in Chrome browser
5. **Merge**: Squash merge to main branch

---

## 🚀 **Chrome Extension Development**

### **Manifest V3 Considerations**
- **Service Workers**: Background scripts run as service workers
- **Permissions**: Minimal required permissions for security
- **Content Security Policy**: Strict CSP prevents code injection
- **Message Passing**: Async communication between components

### **Chrome APIs Used**
```javascript
// Storage API
chrome.storage.local.get/set()     // User settings and analytics
chrome.storage.sync.get/set()      // Cross-device sync

// Runtime API  
chrome.runtime.onMessage           // Message handling
chrome.runtime.sendMessage()       // Inter-component communication
chrome.runtime.getURL()            // Resource URLs

// Tabs API
chrome.tabs.query()                // Tab information
chrome.tabs.sendMessage()          // Content script communication

// Action API (Manifest V3)
chrome.action.setBadgeText()       // Extension badge
chrome.action.setBadgeBackgroundColor()

// Alarms API
chrome.alarms.create()             // Keep-alive mechanism
chrome.alarms.onAlarm              // Alarm handling
```

### **Content Script Injection**
```json
// manifest.json
"content_scripts": [{
  "matches": ["<all_urls>"],
  "js": [
    "src/shared/error-handler.js",
    "src/shared/fallback-storage.js", 
    "src/shared/connection-manager.js",
    "src/shared/index.js",
    "src/content/content.js"
  ],
  "css": ["src/content/content.css"]
}]
```

---

## 🎨 **UI/UX Development**

### **Popup Development**
- **Size Constraints**: 400px width max, 600px height max
- **Responsive Design**: Adapts to different screen sizes
- **Performance**: Lightweight, fast loading
- **Accessibility**: Keyboard navigation, screen reader friendly

### **Dashboard Development** 
- **Charts**: Chart.js for analytics visualization
- **Data Visualization**: Interactive charts and statistics
- **Export Features**: CSV/JSON data export capabilities
- **Mobile Responsive**: Works on different screen sizes

### **Content Script UI**
- **Non-Intrusive**: Minimal impact on host page
- **Intervention Overlays**: Stage-based visual interventions
- **Animation Performance**: RequestAnimationFrame for smooth animations
- **Cleanup**: Proper removal when extension disabled

---

## 📊 **Analytics & Data Management**

### **Data Structure**
```javascript
// User Settings
{
  isEnabled: boolean,
  focusMode: 'gentle' | 'moderate' | 'strict',
  thresholds: {
    stage1: number, // seconds
    stage2: number,
    stage3: number, 
    stage4: number
  },
  whitelist: string[], // domains
  notifications: boolean
}

// Analytics Data
{
  'domain.com': {
    'YYYY-MM-DD': [{
      timeOnPage: number,
      behaviorScore: number,
      interventionStage: number,
      scrollTime: number,
      flags: object,
      timestamp: number
    }]
  }
}
```

### **Storage Management**
- **Local Storage**: Settings, analytics, temporary data
- **Sync Storage**: Cross-device settings synchronization  
- **IndexedDB Fallback**: Backup storage when Chrome storage unavailable
- **Data Cleanup**: Automatic removal of data older than 90 days
- **Quota Monitoring**: Handle storage quota exceeded scenarios

---

## 🔒 **Security & Privacy**

### **Privacy Principles**
- **Local-Only**: All data stored locally, no external servers
- **No Tracking**: Zero analytics sent to third parties
- **Minimal Permissions**: Only essential Chrome APIs requested
- **User Control**: Complete user control over data and settings

### **Security Considerations**
- **Content Security Policy**: Strict CSP in manifest
- **Input Sanitization**: All user inputs properly sanitized
- **Error Handling**: Secure error messages, no sensitive data exposure
- **Update Security**: Secure update mechanism through Chrome Web Store

### **Code Security**
```javascript
// Input validation example
function sanitizeInput(input) {
  if (typeof input !== 'string') return '';
  return input.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
}

// Secure message handling
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Validate message structure
  if (!message || typeof message.type !== 'string') {
    sendResponse({ error: 'Invalid message format' });
    return;
  }
  
  // Handle message securely
  handleSecureMessage(message, sender, sendResponse);
});
```

---

## 🚀 **Deployment & Release**

### **Build Process**
```bash
# Run full test suite
npm test

# Lint code
npm run lint:fix

# Performance validation  
npm run test:performance

# Create production build (when available)
npm run build:prod

# Package for Chrome Web Store
npm run package
```

### **Release Checklist**
- [ ] All tests passing (unit, integration, E2E)
- [ ] Performance benchmarks met
- [ ] Security audit completed
- [ ] Documentation updated
- [ ] Version bumped in manifest.json
- [ ] Changelog updated
- [ ] Chrome Web Store assets prepared

### **CI/CD Pipeline**
The project uses GitHub Actions for automated:
- **Testing**: Multi-node testing (Node 16, 18, 20)
- **Linting**: ESLint code quality checks
- **Security**: npm audit vulnerability scanning
- **Performance**: Bundle size and memory monitoring
- **Deployment**: Chrome Web Store package preparation

---

## 📚 **Documentation**

### **Available Documentation**
- **README.md**: Project overview and quick start
- **CHANGELOG.md**: Detailed change history
- **docs/TESTING.md**: Comprehensive testing guide
- **docs/CI_CD.md**: CI/CD pipeline documentation
- **docs/BACKGROUND_TESTING.md**: Background script testing specifics
- **docs/PROJECT_STATUS.md**: Current project status
- **DEVELOPER_GUIDE.md**: This document

### **Code Documentation**
- **JSDoc**: Function and class documentation
- **Inline Comments**: Complex logic explanation
- **README Files**: Component-specific documentation
- **API Documentation**: Chrome extension API usage patterns

---

## 🐛 **Debugging & Troubleshooting**

### **Common Issues**

#### **Chrome Extension API Mocking**
```bash
# Issue: Tests failing with Chrome API errors
# Solution: Ensure sinon-chrome is properly configured
npm install sinon-chrome --save-dev
```

#### **Test Environment Setup**
```bash
# Issue: Tests not finding modules
# Solution: Check Jest moduleNameMapper in jest.config.js
```

#### **Extension Loading Issues**
```bash
# Issue: Extension not loading in Chrome
# Solutions:
# 1. Check manifest.json syntax
# 2. Verify file paths are correct
# 3. Check console for errors
```

### **Debugging Tools**
- **Chrome DevTools**: Extension debugging and profiling
- **Jest Debugging**: Node.js inspector for test debugging
- **Performance Profiler**: Chrome's performance monitoring
- **Extension Debugging**: Chrome extension-specific tools

---

## 🤝 **Contributing Guidelines**

### **Types of Contributions**
- **Bug Fixes**: Fix existing functionality issues
- **Feature Development**: Add new features and capabilities
- **Performance Improvements**: Optimize existing code
- **Documentation**: Improve guides and documentation
- **Testing**: Add or improve test coverage

### **Contribution Process**
1. **Fork Repository**: Create your own fork
2. **Create Branch**: Feature or bugfix branch
3. **Make Changes**: Follow coding standards
4. **Add Tests**: Ensure new code is tested
5. **Update Documentation**: Document changes
6. **Submit PR**: Detailed description and testing notes

### **Code Review Criteria**
- **Functionality**: Does the code work as intended?
- **Testing**: Is the code properly tested?
- **Performance**: Does it maintain good performance?
- **Security**: Are there any security concerns?
- **Documentation**: Is it properly documented?

---

## 📞 **Support & Resources**

### **Getting Help**
- **GitHub Issues**: Bug reports and feature requests
- **GitHub Discussions**: General questions and ideas
- **Code Reviews**: Get feedback on your contributions
- **Documentation**: Comprehensive guides and references

### **Useful Resources**
- **Chrome Extensions Documentation**: https://developer.chrome.com/docs/extensions/
- **Jest Testing Framework**: https://jestjs.io/docs/getting-started
- **Puppeteer E2E Testing**: https://pptr.dev/
- **GitHub Actions**: https://docs.github.com/en/actions

---

*This developer guide is maintained by the Attention Trainer Extension team and updated regularly to reflect current development practices and architecture.*
