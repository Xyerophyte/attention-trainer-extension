# Manual Testing Guide - Attention Trainer Extension

## 🧪 **MANUAL TESTING INSTRUCTIONS**

### **Step 1: Load Extension in Chrome**

1. **Open Chrome** and navigate to: `chrome://extensions/`
2. **Enable Developer Mode** (toggle in top-right corner)
3. **Click "Load unpacked"** and select: `C:\Users\harsh\Downloads\attention-trainer-extension\dist`
4. **Verify extension appears** in the extensions list

### **Step 2: Initial Load Testing**

✅ **Extension Load Checklist:**
- [ ] Extension appears in Chrome extensions list
- [ ] No error badges on extension
- [ ] Extension icon appears in toolbar
- [ ] Click extension icon - popup opens
- [ ] No console errors in Developer Tools

**How to check console errors:**
1. Right-click on any webpage → Inspect
2. Go to Console tab
3. Look for any red errors mentioning "attention-trainer" or "chrome-extension"

### **Step 3: Core Functionality Testing**

#### **A. Popup Interface Testing**
1. **Click extension icon** in toolbar
2. **Verify popup elements:**
   - [ ] Settings toggles work
   - [ ] Focus mode selector functions
   - [ ] Current domain displays
   - [ ] Analytics preview shows

#### **B. Background Script Testing**
1. **Go to**: `chrome://extensions/`
2. **Find your extension** → Click "Inspect views: background"
3. **Check console** for initialization messages
4. **Should see**: "✅ Background script initialized" or similar

#### **C. Content Script Testing**
1. **Visit any website** (e.g., https://example.com)
2. **Open Developer Tools** (F12)
3. **Check console** for content script messages
4. **Should see**: Shared modules initialized or similar

### **Step 4: Website-Specific Testing**

Test on these major platforms:

#### **YouTube.com**
- [ ] Navigate to YouTube
- [ ] Scroll down several times
- [ ] Check if intervention triggers after sustained scrolling
- [ ] Verify popup shows YouTube-specific analytics

#### **Instagram.com** (if accessible)
- [ ] Navigate to Instagram
- [ ] Scroll through feed
- [ ] Test intervention system

#### **Twitter/X.com**
- [ ] Navigate to Twitter/X
- [ ] Scroll through timeline
- [ ] Test scroll detection

#### **News Website** (e.g., BBC.com, CNN.com)
- [ ] Navigate to news site
- [ ] Scroll through articles
- [ ] Test general pattern detection

### **Step 5: Settings Persistence Testing**

1. **Open extension popup**
2. **Change a setting** (e.g., focus mode)
3. **Close popup**
4. **Reopen popup** - setting should persist
5. **Refresh page** - setting should still persist

### **Step 6: Performance Testing**

#### **Memory Usage Check:**
1. **Open Chrome Task Manager**: Shift+Esc
2. **Find your extension** in the list
3. **Check memory usage** (should be < 50MB typically)

#### **Page Load Impact:**
1. **Test page load speed** on major sites
2. **Should not noticeably slow down** page loading

### **Step 7: Error Testing**

#### **Test Error Scenarios:**
1. **Visit restricted sites** (some internal sites)
2. **Check console** for graceful error handling
3. **Extension should not break** or show user-facing errors

### **Step 8: Dashboard Testing**

1. **After some browsing activity**
2. **Open extension popup**
3. **Click "View Dashboard"** (if available)
4. **Verify analytics display correctly**

---

## 🐛 **COMMON ISSUES & SOLUTIONS**

### **Extension Won't Load**
- Check manifest.json syntax
- Verify all file paths exist
- Look for console errors

### **Popup Doesn't Open**
- Check popup.html file exists
- Verify manifest popup path is correct
- Check for JavaScript errors in popup

### **Content Script Not Working**
- Verify content script files exist
- Check manifest content_scripts section
- Test on non-restricted websites first

### **Console Errors**
- Most console.log messages are normal (for debugging)
- Only worry about red ERROR messages
- Yellow warnings are typically fine

---

## ✅ **TESTING COMPLETION CRITERIA**

**CRITICAL (Must Pass):**
- [ ] Extension loads without errors
- [ ] Popup opens and displays correctly
- [ ] No critical console errors
- [ ] Settings persist between sessions

**IMPORTANT (Should Pass):**
- [ ] Content scripts inject on websites
- [ ] Basic scroll detection works
- [ ] Memory usage is reasonable

**NICE TO HAVE:**
- [ ] All interventions work perfectly
- [ ] Dashboard displays data
- [ ] Works on all test websites

---

## 📝 **TESTING REPORT TEMPLATE**

```
MANUAL TESTING RESULTS
======================

Extension Version: 1.0.1
Test Date: [DATE]
Chrome Version: [VERSION]

CRITICAL TESTS:
✅/❌ Extension loads successfully
✅/❌ Popup opens without errors  
✅/❌ No critical console errors
✅/❌ Settings persistence works

FUNCTIONALITY TESTS:
✅/❌ Background script initializes
✅/❌ Content scripts inject
✅/❌ Scroll detection active
✅/❌ Basic interventions work

WEBSITE TESTS:
✅/❌ YouTube.com
✅/❌ Twitter/X.com  
✅/❌ News sites
✅/❌ General websites

PERFORMANCE:
Memory Usage: [X] MB
Page Load Impact: Minimal/Noticeable/Significant

OVERALL STATUS: ✅ READY / ❌ NEEDS FIXES

NOTES:
[Any issues or observations]
```

---

**🚀 Ready to start testing? Follow Step 1 above!**
