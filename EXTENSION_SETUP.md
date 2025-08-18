# 🔧 Chrome Extension Loading Guide

## Step 1: Load Extension in Chrome Developer Mode

1. **Open Chrome** and navigate to: `chrome://extensions/`

2. **Enable Developer Mode**:
   - Click the toggle in the top-right corner that says "Developer mode"

3. **Load Unpacked Extension**:
   - Click "Load unpacked" button
   - Navigate to and select your extension folder: `C:\Users\harsh\Downloads\attention-trainer-extension`
   - Click "Select Folder"

4. **Verify Extension is Loaded**:
   - You should see "Attention Trainer" in the extensions list
   - Make sure the toggle switch is ON (blue)
   - Note the extension ID (looks like: `abcdefghijklmnopqrstuvwxyz123456`)

## Step 2: Test the Extension

1. **Open the test page**:
   - Navigate to: `file:///C:/Users/harsh/Downloads/attention-trainer-extension/test-page.html`
   - OR drag and drop the `test-page.html` file into Chrome

2. **Open Developer Console**:
   - Press `F12` or right-click → Inspect → Console tab

3. **Look for these console messages**:
   ```
   🧪 Attention Trainer test page loaded
   📋 Open browser dev tools to see extension debug output
   ⏱️ Extension should activate after 15 seconds of being on page
   ```

4. **Check extension status**:
   - The test page should show "Extension is active!" after 1-2 seconds
   - If it shows "Extension not detected", try refreshing the page

## Step 3: Troubleshooting

### If Extension Won't Load:
- Check that all required files exist in the extension folder
- Make sure `manifest.json` is in the root directory
- Look for any errors in the Chrome extensions page

### If Extension Loads but Test Page Shows "Not Detected":
- **Refresh the test page** (Ctrl+R)
- Check browser console for any error messages
- Make sure you're not in incognito mode (unless extension is enabled for incognito)

### If Extension Activates but No Interventions Show:
- Wait at least 15 seconds on the page
- Scroll occasionally to simulate activity  
- Check that page has focus (click on it)
- Look for console messages starting with "🔍 Extension Status"

## Expected Timeline:
- **0-1 seconds**: Extension should be detected by test page
- **15 seconds**: Stage 1 - brightness dimming should start
- **30 seconds**: Stage 2 - blur effect should apply
- **1 minute**: Stage 3 - intervention modal should appear
- **1+ minutes**: Stage 4 - final warnings/reminders

If you see any errors or unexpected behavior, check the browser console for detailed error messages!
