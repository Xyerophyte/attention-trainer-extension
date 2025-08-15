# Background Script Testing Documentation

## Overview

This document describes the comprehensive testing infrastructure for the Attention Trainer Extension's background script components, including unit tests, integration tests, and the popup script tests.

## Test Structure

### Unit Tests

#### 1. Background Script Unit Tests (`tests/unit/background-script.test.js`)

**Coverage Areas:**
- **Extension Lifecycle Management**
  - Installation and initialization
  - Settings migration on updates
  - Keep-alive mechanism
  - Health checks

- **Settings Management**
  - GET_SETTINGS message handling
  - UPDATE_SETTINGS with validation
  - Default settings provision
  - Settings migration from old formats

- **Analytics Processing**
  - Behavioral event handling and aggregation
  - Data cleanup and storage optimization
  - Analytics retrieval and summary generation
  - Rate limiting and batching

- **Tab Management**
  - Tab activation and update handling
  - Badge updates based on intervention levels
  - Settings broadcast to content scripts

- **Intervention Management**
  - Intervention triggering and logging
  - Stage-based intervention escalation
  - Badge visual feedback

- **Error Handling**
  - Storage quota exceeded recovery
  - Tab communication failures
  - Unknown message type handling
  - Corrupted data recovery

- **Performance Optimization**
  - Storage operation batching
  - Rate limiting for high-frequency events
  - Memory usage optimization

#### 2. Popup Script Unit Tests (`tests/unit/popup.test.js`)

**Coverage Areas:**
- **Popup Initialization**
  - DOM ready handling
  - Settings loading and UI updates
  - Error handling for missing settings

- **Settings Management**
  - Extension toggle functionality
  - Focus mode selection
  - Settings validation and saving
  - Visual feedback for save operations

- **Analytics Display**
  - Analytics data loading and rendering
  - Chart generation
  - Current domain statistics
  - Empty data handling

- **Site-Specific Controls**
  - Whitelist toggle for current domain
  - Domain-specific settings management

- **Data Export/Import**
  - User data export functionality
  - Error handling for export failures

- **UI State Management**
  - Control state based on extension status
  - Real-time updates from background script

- **Keyboard Navigation**
  - Keyboard shortcuts (Ctrl+S for save, Escape to close)
  - Accessibility features

### Integration Tests

#### Background Integration Tests (`tests/integration/background-integration.test.js`)

**Coverage Areas:**
- **Extension Lifecycle Integration**
  - Complete installation flow with default settings
  - Settings migration across versions
  - Keep-alive mechanism maintenance

- **Content Script Communication**
  - Settings delivery to content scripts
  - Behavioral event processing and storage
  - Intervention triggering across components
  - Graceful handling of disconnected scripts

- **Popup Communication**
  - Settings retrieval and updates
  - Analytics data provision
  - Data export functionality
  - Real-time settings synchronization

- **Storage Management Integration**
  - Storage quota management and recovery
  - Automatic data cleanup
  - Cross-version data migration
  - Corruption recovery

- **Tab Management Integration**
  - Tab lifecycle handling
  - Settings broadcast on tab changes
  - Badge updates across tabs

- **Error Recovery Integration**
  - Storage corruption recovery
  - Runtime context invalidation handling
  - Communication failure recovery

- **Performance Integration**
  - Event batching across components
  - Rate limiting in high-load scenarios
  - Cross-component data consistency

- **Cross-Component Data Flow**
  - Data consistency between popup and content scripts
  - Settings synchronization across all components
  - Analytics data flow from content to popup

## Test Execution

### Running Background Tests

```bash
# Run all background script tests
npm run test:background

# Run only unit tests
npm run test:background:unit

# Run only integration tests  
npm run test:background:integration

# Run with coverage
npm run test:coverage -- --testPathPattern="(background|popup)"
```

### Test Runner Features

The custom test runner (`scripts/test-background.js`) provides:
- **File Validation**: Ensures all required test files exist
- **Dependency Management**: Auto-installs npm packages if needed
- **Linting**: Runs ESLint on test files and source code
- **Coverage Reports**: Generates detailed coverage for background components
- **Test Summary**: Creates JSON summary of test results
- **Colored Output**: User-friendly terminal output with status indicators

## Test Configuration

### Jest Configuration

The background tests use the main Jest configuration with:
- **jsdom Environment**: For DOM mocking in popup tests
- **Chrome Extension Mocks**: Via jest-chrome and sinon-chrome
- **Module Mapping**: Maps extension resources to test mocks
- **Coverage Targets**: 90%+ coverage for critical components

### Mock Strategy

#### Chrome API Mocks
- Complete chrome.runtime, chrome.storage, chrome.tabs API mocks
- Event listener capture for testing message handling
- Realistic error simulation for edge cases

#### DOM Mocks  
- Document and window object mocking for popup tests
- DOM element behavior simulation
- Event handling and keyboard navigation

#### Storage Mocks
- IndexedDB simulation via fake-indexeddb
- Chrome storage API with quota simulation
- Data corruption and recovery scenarios

## Coverage Targets

### Background Script Coverage
- **Message Handling**: 95%+ coverage
- **Analytics Processing**: 90%+ coverage  
- **Settings Management**: 95%+ coverage
- **Keep-Alive Functionality**: 90%+ coverage
- **Error Handling**: 85%+ coverage

### Popup Script Coverage
- **UI Interactions**: 90%+ coverage
- **Settings Management**: 95%+ coverage
- **Analytics Display**: 85%+ coverage
- **Keyboard Navigation**: 80%+ coverage

### Integration Test Coverage
- **Component Communication**: 90%+ coverage
- **Data Flow**: 95%+ coverage
- **Error Recovery**: 85%+ coverage
- **Performance Scenarios**: 80%+ coverage

## Test Data

### Mock Settings
```javascript
{
  isEnabled: true,
  focusMode: 'gentle', // 'gentle', 'moderate', 'strict'
  thresholds: { stage1: 30, stage2: 60, stage3: 120, stage4: 180 },
  whitelist: [],
  notifications: true,
  showAnalytics: true
}
```

### Mock Analytics Data
```javascript
{
  'youtube.com': {
    '2024-01-15': [
      {
        timeOnPage: 2.5,
        behaviorScore: 45,
        interventionStage: 2,
        scrollTime: 150,
        flags: { rapid_scrolling: 3, content_viewed: 15 },
        timestamp: 1642204800000
      }
    ]
  }
}
```

## Debugging Tests

### Common Issues

1. **Chrome API Mocking**: Ensure all used Chrome APIs are mocked
2. **Async Handling**: Use proper async/await for Chrome API calls
3. **Event Listener Testing**: Capture and invoke event handlers manually
4. **DOM Element Mocking**: Mock all required DOM methods and properties

### Debug Commands

```bash
# Run tests with debug output
npm run test:background -- --verbose --no-coverage

# Run specific test suite
jest tests/unit/background-script.test.js --testNamePattern="Settings Management"

# Debug with Node inspector
node --inspect-brk node_modules/.bin/jest tests/unit/background-script.test.js --runInBand
```

## Continuous Integration

The background script tests are integrated into the CI/CD pipeline:

1. **Pre-commit**: Linting and unit tests
2. **PR Validation**: Full test suite including integration tests
3. **Coverage Reports**: Uploaded to coverage service
4. **Performance Benchmarks**: Track test execution time

## Future Enhancements

### Planned Improvements

1. **Visual Regression Tests**: Screenshot comparison for popup UI
2. **Performance Profiling**: Memory and CPU usage during tests
3. **Load Testing**: High-volume analytics processing
4. **Accessibility Testing**: Keyboard navigation and screen readers
5. **Cross-Browser Testing**: Firefox and Edge extension compatibility

### Test Metrics Tracking

- Test execution time trends
- Coverage percentage over time
- Flaky test identification
- Performance regression detection

## Contributing

When adding new background script functionality:

1. **Add Unit Tests**: Cover all new functions and edge cases
2. **Add Integration Tests**: Test component interactions
3. **Update Mocks**: Extend Chrome API mocks as needed
4. **Document Changes**: Update this documentation
5. **Verify Coverage**: Ensure coverage targets are met

### Test Writing Guidelines

1. **Descriptive Names**: Use clear, specific test descriptions
2. **Arrange-Act-Assert**: Structure tests consistently
3. **Mock Isolation**: Each test should be independent
4. **Error Cases**: Always test error scenarios
5. **Async Handling**: Proper promise and callback handling

## Related Documentation

- [Main Testing Documentation](./TESTING.md)
- [CI/CD Documentation](./CI_CD.md)
- [Architecture Overview](./ARCHITECTURE.md)
- [Contributing Guidelines](../CONTRIBUTING.md)
