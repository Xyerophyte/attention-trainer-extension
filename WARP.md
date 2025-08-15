# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Common Development Commands

### Building the Extension
```powershell
# Build with default version (1.0.0)
.\build.ps1

# Build with specific version
.\build.ps1 -Version "1.0.2"

# Build with production optimizations (removes console.log, minifies)
.\build.ps1 -Version "1.0.2" -Production

# Quick build without comprehensive validation
.\build-simple.ps1 -Version "1.0.1"
```

### Chrome Extension Development
```powershell
# Load extension in Chrome (navigate to chrome://extensions/ first)
# 1. Enable Developer Mode
# 2. Click "Load unpacked"
# 3. Select the root directory (not the build/dist folder)

# For testing built extensions, use:
# Select build/dist folder instead

# Reload extension after changes
# Click the reload button on chrome://extensions/ or use Ctrl+R in extension popup
```

### Storage and Debugging
```powershell
# Inspect Chrome storage (in DevTools Console of any extension page)
chrome.storage.local.get().then(console.log)

# Check specific analytics data
chrome.storage.local.get(['analytics']).then(console.log)

# Clear all storage for testing
chrome.storage.local.clear()

# View background service worker logs
# Go to chrome://extensions/ → Details → Service worker → inspect
```

## Architecture Overview

### Three-Tier Component Architecture

**Background Service Worker** (`src/background/background.js`)
- Persistent service managing extension lifecycle and coordination
- Handles all Chrome Storage API operations with batched updates
- Manages intervention threshold calculations and triggers
- Implements data retention and cleanup (90-day retention)
- Maintains service worker alive using multiple strategies

**Content Scripts** (`src/content/content.js`)
- Injected into all web pages for behavioral monitoring
- Advanced scroll pattern detection and site classification
- Applies visual interventions (dimming, blur, overlays, scroll locks)
- Real-time behavioral scoring and session tracking
- Fallback mode when background service is unavailable

**UI Components**
- `src/popup/popup.js`: Quick settings and daily stats overview
- `src/dashboard/dashboard.js`: Comprehensive analytics with custom charts
- Both communicate with background service via message passing

### Message Passing Flow

```javascript
// Content Script → Background
chrome.runtime.sendMessage({
  type: "BEHAVIORAL_EVENT",
  data: { scrollTime, deltaTime, scrollDistance }
})

// Background → Content Script  
chrome.tabs.sendMessage(tabId, {
  type: "TRIGGER_INTERVENTION", 
  stage: 2,
  focusMode: "gentle"
})
```

### Storage Architecture

**Batched Update System**: Content scripts generate high-frequency events, but storage updates are batched every 1 second to prevent performance issues.

**Storage Keys Structure**:
- `analytics.dailyStats[YYYY-MM-DD][domain]` - Daily site statistics
- `analytics.interventions[]` - Intervention log with timestamps
- `thresholds.{stage1,stage2,stage3,stage4}` - Intervention timing (seconds)
- `whitelist[]` - Domains exempt from monitoring

## Behavioral Tracking System

### Four-Stage Intervention Progression
1. **Stage 1** (3s): Subtle dimming (`opacity: 0.8`)
2. **Stage 2** (6s): Progressive blur on non-interactive elements  
3. **Stage 3** (10s): Motivational overlay with "Continue" or "Focus Session" options
4. **Stage 4** (15s): Scroll lock (strict mode) or final warning (gentle mode)

*Note: Default thresholds are much lower than production (3s vs 30s) for testing*

### Intelligent Behavioral Detection Patterns

The system uses advanced behavioral analysis to distinguish productive browsing from mindless scrolling:

**Scroll Intelligence**:
- **Pause Detection**: Tracks scroll pauses (velocity < 10px) as reading indicators
- **Velocity Analysis**: Monitors average scroll speed over 10-sample windows
- **Direction Patterns**: Detects erratic back-and-forth scrolling (> 6 direction changes)
- **Rapid Consumption**: Flags content consumed in < 3 seconds intervals

**Engagement Tracking**:
- **Productive Interactions**: Links, buttons, inputs, textareas (negative scoring)
- **Passive Interactions**: General clicks/taps (positive scoring)  
- **Content Engagement**: IntersectionObserver tracks if content is viewed vs. passed
- **Passive Time Ratio**: Measures time without user interaction (> 10s idle)

**Site-Specific Profiles**:
- **Social/Microblog**: Lower thresholds (25/40/60/80), social validation detection
- **Video Platforms**: Higher thresholds (30/50/70/85), rapid video skip detection
- **Forums**: Moderate thresholds (20/35/55/75), thread diving analysis
- **General Sites**: Highest thresholds (40/60/80/90), requires stronger signals

### Focus Mode Implementations
- **Gentle Mode**: Visual cues only (dimming, blur, nudges)
- **Strict Mode**: Includes temporary scroll locks
- **Gamified Mode**: Points system (coming in Phase 2)

## Performance Optimizations

### Batched Storage Operations
```javascript
// Updates are collected and flushed every 1 second
this.pendingStorageUpdates.set(key, data)
this.scheduleBatchedStorageUpdate() // Debounced
```

### Service Worker Keep-Alive
Multiple strategies prevent service worker termination:
- Periodic `chrome.runtime.getPlatformInfo()` calls every 25s
- Event listeners on runtime startup, tab activation
- Wake-up triggers on various Chrome API events

### Scroll Event Optimization
- Debounced scroll listeners prevent excessive message passing
- `RequestAnimationFrame` for smooth intervention animations
- Efficient DOM queries using specific selectors for blur effects

### Data Retention Management
- Automatic cleanup of data older than 90 days
- Runs on service worker initialization and every 24 hours
- Removes both daily stats and intervention logs

## Debugging and Troubleshooting

### Common Connection Issues

**Extension Context Invalidated**: The most common error occurs when the extension is reloaded while content scripts are still running. The fix includes:
```javascript
// Context validation on initialization
try {
  if (!chrome.runtime.id) {
    this.contextValid = false
    return // Skip initialization
  }
} catch (error) {
  this.contextValid = false
  return
}

// Context validation before runtime calls
if (chrome.runtime.id) {
  chrome.runtime.sendMessage(message).catch(error => {
    if (error.message.includes('Extension context invalidated')) {
      this.contextValid = false
    }
  })
}
```

**Background Service Unavailable**: Content script includes retry mechanism with exponential backoff and fallback to standalone mode:
```javascript
// Retry up to 3 times with increasing delays
while (retries < maxRetries) {
  await new Promise(resolve => setTimeout(resolve, 1000 * retries))
  // Attempt connection...
}
```

### Analytics Validation
```javascript
// Check intervention timing accuracy
chrome.storage.local.get(['analytics']).then(data => {
  const interventions = data.analytics.interventions
  interventions.forEach(i => console.log(`${i.domain}: Stage ${i.stage} at ${new Date(i.timestamp)}`))
})

// Verify daily aggregation
chrome.storage.local.get(['analytics']).then(data => {
  const today = new Date().toISOString().split('T')[0]
  console.log('Today stats:', data.analytics.dailyStats[today])
})
```

### Chart Rendering Diagnostics
Dashboard uses custom HTML charts (not Chart.js) for reliability:
- Falls back to text-based displays when rendering fails
- Check browser console for "Failed to render" errors
- Verify `dailyStats` data structure integrity

## Key Code Patterns

### Message Format Standard
```javascript
// Standard message structure
{
  type: "MESSAGE_TYPE",
  data: { /* payload */ }
}

// Response format
{
  success: boolean,
  error?: string,
  data?: any
}
```

### Storage Key Conventions
- `analytics_${domain}_${date}` - Temporary batch keys
- `analytics.dailyStats[YYYY-MM-DD]` - Persistent daily data
- CamelCase for settings: `isEnabled`, `focusMode`, `thresholds`

### Error Handling Pattern
```javascript
try {
  const response = await chrome.runtime.sendMessage(message)
  if (response && !response.success) {
    throw new Error(response.error || 'Operation failed')
  }
} catch (error) {
  console.error('Operation failed:', error)
  // Implement fallback behavior
}
```

### Intervention Stage Calculation
```javascript
calculateInterventionStage(scrollTime, thresholds) {
  if (scrollTime >= thresholds.stage4) return 4
  if (scrollTime >= thresholds.stage3) return 3  
  if (scrollTime >= thresholds.stage2) return 2
  if (scrollTime >= thresholds.stage1) return 1
  return 0
}
```

## Project Structure Context

```
src/
├── background/background.js     # Service worker with batching and lifecycle management
├── content/content.js          # Behavioral monitoring with advanced pattern detection  
├── popup/popup.{js,html}       # Quick settings with real-time stats
└── dashboard/dashboard.{js,html} # Analytics with custom chart implementation
```

The extension uses **Manifest V3** with vanilla JavaScript (no build tools required). All components communicate through Chrome's message passing API with comprehensive error handling and fallback modes.

## Testing and Validation

Load the extension in Developer Mode and verify:
- Background service worker starts without errors
- Content script injection on all sites  
- Intervention triggers at correct thresholds (test with default 3s/6s/10s/15s)
- Storage updates appear in Chrome DevTools
- Analytics dashboard renders charts correctly
- Popup displays current session statistics

The extension includes comprehensive console logging for development - these are automatically removed in production builds via the `-Production` flag.
