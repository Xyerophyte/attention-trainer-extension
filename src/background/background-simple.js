// Minimal background script for testing
console.log('Background script loaded successfully!')

// Test chrome API access
chrome.runtime.onInstalled.addListener(() => {
  console.log('Extension installed')
})

console.log('Background script initialization complete')
