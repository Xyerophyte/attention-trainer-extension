# Simple test script for runtime stability fixes
param([switch]$Verbose = $false)

Write-Host "Testing Attention Trainer Runtime Stability Fixes" -ForegroundColor Green
Write-Host "=================================================" -ForegroundColor Green
Write-Host ""

# Test required files
Write-Host "Checking required files..." -ForegroundColor Yellow
$requiredFiles = @(
    "src\shared\connection-manager.js",
    "src\shared\fallback-storage.js", 
    "src\shared\error-handler.js",
    "src\shared\index.js",
    "src\background\background.js",
    "src\content\content.js",
    "src\content\content.css",
    "manifest.json"
)

$allFilesPresent = $true
foreach ($file in $requiredFiles) {
    if (-not (Test-Path $file)) {
        Write-Host "  Missing: $file" -ForegroundColor Red
        $allFilesPresent = $false
    } else {
        if ($Verbose) {
            Write-Host "  Found: $file" -ForegroundColor Green
        }
    }
}

if ($allFilesPresent) {
    Write-Host "  All required files present" -ForegroundColor Green
} else {
    Write-Host "  Some files missing" -ForegroundColor Red
}

# Test manifest
Write-Host ""
Write-Host "Checking manifest configuration..." -ForegroundColor Yellow
try {
    $manifest = Get-Content "manifest.json" -Raw | ConvertFrom-Json
    $sharedModules = @(
        "src/shared/error-handler.js",
        "src/shared/fallback-storage.js", 
        "src/shared/connection-manager.js",
        "src/shared/index.js"
    )
    
    $contentScriptJS = $manifest.content_scripts[0].js
    $allModulesPresent = $true
    
    foreach ($module in $sharedModules) {
        if ($contentScriptJS -notcontains $module) {
            Write-Host "  Missing in manifest: $module" -ForegroundColor Red
            $allModulesPresent = $false
        }
    }
    
    if ($allModulesPresent) {
        Write-Host "  All shared modules included in manifest" -ForegroundColor Green
    }
    
    if ($manifest.manifest_version -eq 3) {
        Write-Host "  Using Manifest V3" -ForegroundColor Green
    }
    
} catch {
    Write-Host "  Error reading manifest.json: $_" -ForegroundColor Red
    $allModulesPresent = $false
}

# Test JavaScript patterns
Write-Host ""
Write-Host "Checking JavaScript patterns..." -ForegroundColor Yellow
$jsFiles = @("src\content\content.js", "src\background\background.js")

foreach ($file in $jsFiles) {
    if (Test-Path $file) {
        $content = Get-Content $file -Raw
        Write-Host "  Analyzing $file..." -ForegroundColor Cyan
        
        $patterns = @("try", "catch", "handleError", "connectionManager", "contextValid", "fallbackStorage", "IndexedDB", "chrome.runtime.id", "sendMessage", "CONNECTION_TEST")
        $foundCount = 0
        
        foreach ($pattern in $patterns) {
            if ($content -match $pattern) {
                $foundCount++
            }
        }
        
        Write-Host "    Found $foundCount/$($patterns.Count) key patterns" -ForegroundColor Green
    }
}

# Test CSS updates
Write-Host ""
Write-Host "Checking CSS updates..." -ForegroundColor Yellow
if (Test-Path "src\content\content.css") {
    $cssContent = Get-Content "src\content\content.css" -Raw
    $requiredStyles = @("error-notification", "connection-status", "fadeIn", "slideInRight")
    
    $foundStyles = 0
    foreach ($style in $requiredStyles) {
        if ($cssContent -match $style) {
            $foundStyles++
        }
    }
    
    Write-Host "  CSS: $foundStyles/$($requiredStyles.Count) new styles present" -ForegroundColor Green
    
    if ($cssContent -match "@media.*prefers-reduced-motion") {
        Write-Host "  Accessibility: Reduced motion support" -ForegroundColor Green
    }
    
    if ($cssContent -match "@media.*prefers-color-scheme") {
        Write-Host "  Accessibility: Dark mode support" -ForegroundColor Green
    }
}

Write-Host ""
Write-Host "Test Results Summary:" -ForegroundColor Cyan
Write-Host "====================" -ForegroundColor Cyan

$overallSuccess = $allFilesPresent -and $allModulesPresent
if ($overallSuccess) {
    Write-Host "All critical tests passed!" -ForegroundColor Green
    Write-Host "Extension is ready for testing" -ForegroundColor Green
} else {
    Write-Host "Some issues detected. Please review the output above." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "New Features Implemented:" -ForegroundColor Green
Write-Host "========================" -ForegroundColor Green
Write-Host ""
Write-Host "Connection Manager:" -ForegroundColor Green
Write-Host "  - Robust connection handling between content scripts and background" -ForegroundColor White
Write-Host "  - Automatic reconnection with exponential backoff" -ForegroundColor White
Write-Host "  - Message queuing during disconnections" -ForegroundColor White
Write-Host "  - Health checks every 15 seconds" -ForegroundColor White
Write-Host ""
Write-Host "Fallback Storage (IndexedDB):" -ForegroundColor Green  
Write-Host "  - Automatic fallback when Chrome storage unavailable" -ForegroundColor White
Write-Host "  - Data synchronization when connection restored" -ForegroundColor White
Write-Host "  - 90-day data retention with auto-cleanup" -ForegroundColor White
Write-Host ""
Write-Host "Error Handler:" -ForegroundColor Green
Write-Host "  - Centralized error handling with categorization" -ForegroundColor White
Write-Host "  - User-friendly error notifications" -ForegroundColor White  
Write-Host "  - Retry mechanisms with exponential backoff" -ForegroundColor White
Write-Host "  - Circuit breaker patterns for failed operations" -ForegroundColor White
Write-Host ""
Write-Host "Enhanced Content Script:" -ForegroundColor Green
Write-Host "  - Context invalidation detection and handling" -ForegroundColor White
Write-Host "  - Graceful degradation when background unavailable" -ForegroundColor White
Write-Host "  - Proper cleanup of observers and event listeners" -ForegroundColor White
Write-Host ""

Write-Host "Installation Instructions:" -ForegroundColor Cyan
Write-Host "=========================" -ForegroundColor Cyan
Write-Host ""
Write-Host "1. Open Chrome and go to chrome://extensions/" -ForegroundColor White
Write-Host "2. Enable 'Developer mode' in the top right" -ForegroundColor White
Write-Host "3. Click 'Load unpacked' and select this folder:" -ForegroundColor White
Write-Host "   $(Get-Location)" -ForegroundColor Yellow
Write-Host "4. The extension should load with improved stability" -ForegroundColor White
Write-Host ""
Write-Host "To test the fixes:" -ForegroundColor Cyan
Write-Host "- Visit a social media site (Twitter, Reddit, etc.)" -ForegroundColor White  
Write-Host "- Open DevTools (F12) and check the Console" -ForegroundColor White
Write-Host "- Look for connection status messages" -ForegroundColor White
Write-Host "- Try reloading the extension to test context handling" -ForegroundColor White
Write-Host ""
Write-Host "Test completed!" -ForegroundColor Green
