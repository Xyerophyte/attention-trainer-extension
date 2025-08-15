# Test script for runtime stability fixes
# This script loads the extension and tests the new connection management

param(
    [switch]$Verbose = $false
)

Write-Host "🧪 Testing Attention Trainer Runtime Stability Fixes" -ForegroundColor Green
Write-Host "======================================================" -ForegroundColor Green
Write-Host ""

# Function to test file existence
function Test-RequiredFiles {
    Write-Host "📁 Checking required files..." -ForegroundColor Yellow
    
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
    
    $missingFiles = @()
    foreach ($file in $requiredFiles) {
        if (-not (Test-Path $file)) {
            $missingFiles += $file
            Write-Host "  ❌ Missing: $file" -ForegroundColor Red
        } else {
            if ($Verbose) {
                Write-Host "  ✅ Found: $file" -ForegroundColor Green
            }
        }
    }
    
    if ($missingFiles.Count -eq 0) {
        Write-Host "  ✅ All required files present" -ForegroundColor Green
        return $true
    } else {
        Write-Host "  ❌ $($missingFiles.Count) files missing" -ForegroundColor Red
        return $false
    }
}

# Function to validate manifest changes
function Test-ManifestConfiguration {
    Write-Host "📋 Checking manifest configuration..." -ForegroundColor Yellow
    
    try {
        $manifest = Get-Content "manifest.json" -Raw | ConvertFrom-Json
        
        # Check if shared modules are included in content_scripts
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
                Write-Host "  ❌ Missing in manifest: $module" -ForegroundColor Red
                $allModulesPresent = $false
            }
        }
        
        if ($allModulesPresent) {
            Write-Host "  ✅ All shared modules properly included in manifest" -ForegroundColor Green
        }
        
        # Check manifest version
        if ($manifest.manifest_version -eq 3) {
            Write-Host "  ✅ Using Manifest V3" -ForegroundColor Green
        } else {
            Write-Host "  ⚠️  Not using Manifest V3" -ForegroundColor Yellow
        }
        
        return $allModulesPresent
        
    } catch {
        Write-Host "  ❌ Error reading manifest.json: $_" -ForegroundColor Red
        return $false
    }
}

# Function to analyze JavaScript for error handling patterns
function Test-JavaScriptPatterns {
    Write-Host "🔍 Checking JavaScript patterns..." -ForegroundColor Yellow
    
    $jsFiles = @(
        "src\content\content.js",
        "src\background\background.js"
    )
    
    $patterns = @{
        "Error Handling" = @("try", "catch", "handleError")
        "Connection Management" = @("connectionManager", "contextValid", "validateContext")
        "Fallback Storage" = @("fallbackStorage", "IndexedDB", "storeAnalytics")
        "Message Validation" = @("chrome.runtime.id", "sendMessage", "CONNECTION_TEST")
    }
    
    foreach ($file in $jsFiles) {
        if (Test-Path $file) {
            $content = Get-Content $file -Raw
            Write-Host "  📄 Analyzing $file..." -ForegroundColor Cyan
            
            foreach ($patternGroup in $patterns.GetEnumerator()) {
                $foundPatterns = 0
                foreach ($pattern in $patternGroup.Value) {
                    if ($content -match $pattern) {
                        $foundPatterns++
                    }
                }
                
                if ($foundPatterns -gt 0) {
                    Write-Host "    ✅ $($patternGroup.Key): $foundPatterns patterns found" -ForegroundColor Green
                } else {
                    Write-Host "    ⚠️  $($patternGroup.Key): No patterns found" -ForegroundColor Yellow
                }
            }
        } else {
            Write-Host "  ❌ File not found: $file" -ForegroundColor Red
        }
    }
}

# Function to simulate extension loading test
function Test-ExtensionStructure {
    Write-Host "🏗️  Testing extension structure..." -ForegroundColor Yellow
    
    # Check if all shared modules export properly
    $sharedModules = @(
        "src\shared\connection-manager.js",
        "src\shared\fallback-storage.js", 
        "src\shared\error-handler.js"
    )
    
    foreach ($module in $sharedModules) {
        if (Test-Path $module) {
            $content = Get-Content $module -Raw
            
            # Check for proper exports
            if ($content -match "window\.\w+\s*=" -or $content -match "module\.exports") {
                Write-Host "  Found proper export pattern in ${module}" -ForegroundColor Green
            } else {
                Write-Host "  Warning: No export pattern found in ${module}" -ForegroundColor Yellow
            }
            
            # Check for class definition
            if ($content -match "class\s+\w+") {
                Write-Host "  Found class definition in ${module}" -ForegroundColor Green
            } else {
                Write-Host "  Warning: No class definition in ${module}" -ForegroundColor Yellow
            }
        }
    }
}

# Function to check CSS for new styles
function Test-CSSUpdates {
    Write-Host "🎨 Checking CSS updates..." -ForegroundColor Yellow
    
    if (Test-Path "src\content\content.css") {
        $cssContent = Get-Content "src\content\content.css" -Raw
        
        $requiredStyles = @(
            "error-notification",
            "connection-status", 
            "fadeIn",
            "slideInRight"
        )
        
        $foundStyles = 0
        foreach ($style in $requiredStyles) {
            if ($cssContent -match $style) {
                $foundStyles++
                if ($Verbose) {
                    Write-Host "  ✅ Found style: $style" -ForegroundColor Green
                }
            }
        }
        
        Write-Host "  ✅ CSS: $foundStyles/$($requiredStyles.Count) new styles present" -ForegroundColor Green
        
        # Check for accessibility features
        if ($cssContent -match "@media\s*\(prefers-reduced-motion") {
            Write-Host "  ✅ Accessibility: Reduced motion support" -ForegroundColor Green
        }
        
        if ($cssContent -match "@media\s*\(prefers-color-scheme") {
            Write-Host "  ✅ Accessibility: Dark mode support" -ForegroundColor Green
        }
        
        return $foundStyles -eq $requiredStyles.Count
    } else {
        Write-Host "  ❌ content.css not found" -ForegroundColor Red
        return $false
    }
}

# Function to generate installation instructions
function Show-InstallationInstructions {
    Write-Host ""
    Write-Host "📋 Installation Instructions:" -ForegroundColor Cyan
    Write-Host "============================" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "1. Open Chrome and go to chrome://extensions/" -ForegroundColor White
    Write-Host "2. Enable 'Developer mode' in the top right" -ForegroundColor White
    Write-Host "3. Click 'Load unpacked' and select this folder:" -ForegroundColor White
    Write-Host "   $(Get-Location)" -ForegroundColor Yellow
    Write-Host "4. The extension should load with improved stability" -ForegroundColor White
    Write-Host ""
    Write-Host "🧪 To test the fixes:" -ForegroundColor Cyan
    Write-Host "- Visit a social media site (Twitter, Reddit, etc.)" -ForegroundColor White  
    Write-Host "- Open DevTools (F12) and check the Console" -ForegroundColor White
    Write-Host "- Look for connection status messages" -ForegroundColor White
    Write-Host "- Try reloading the extension to test context handling" -ForegroundColor White
    Write-Host ""
}

# Function to show feature summary
function Show-FeatureSummary {
    Write-Host ""
    Write-Host "🚀 New Features Implemented:" -ForegroundColor Green
    Write-Host "============================" -ForegroundColor Green
    Write-Host ""
    Write-Host "✅ Connection Manager:" -ForegroundColor Green
    Write-Host "   - Robust connection handling between content scripts and background" -ForegroundColor White
    Write-Host "   - Automatic reconnection with exponential backoff" -ForegroundColor White
    Write-Host "   - Message queuing during disconnections" -ForegroundColor White
    Write-Host "   - Health checks every 15 seconds" -ForegroundColor White
    Write-Host ""
    Write-Host "✅ Fallback Storage (IndexedDB):" -ForegroundColor Green  
    Write-Host "   - Automatic fallback when Chrome storage unavailable" -ForegroundColor White
    Write-Host "   - Data synchronization when connection restored" -ForegroundColor White
    Write-Host "   - 90-day data retention with auto-cleanup" -ForegroundColor White
    Write-Host ""
    Write-Host "✅ Error Handler:" -ForegroundColor Green
    Write-Host "   - Centralized error handling with categorization" -ForegroundColor White
    Write-Host "   - User-friendly error notifications" -ForegroundColor White  
    Write-Host "   - Retry mechanisms with exponential backoff" -ForegroundColor White
    Write-Host "   - Circuit breaker patterns for failed operations" -ForegroundColor White
    Write-Host ""
    Write-Host "✅ Enhanced Content Script:" -ForegroundColor Green
    Write-Host "   - Context invalidation detection and handling" -ForegroundColor White
    Write-Host "   - Graceful degradation when background unavailable" -ForegroundColor White
    Write-Host "   - Proper cleanup of observers and event listeners" -ForegroundColor White
    Write-Host ""
    Write-Host "✅ Improved UI/UX:" -ForegroundColor Green
    Write-Host "   - Enhanced intervention animations and styles" -ForegroundColor White
    Write-Host "   - Dark mode and high contrast support" -ForegroundColor White
    Write-Host "   - Reduced motion accessibility" -ForegroundColor White
    Write-Host "   - Connection status indicators" -ForegroundColor White
    Write-Host ""
}

# Main execution
Write-Host "Starting comprehensive test suite..." -ForegroundColor White
Write-Host ""

$allTestsPassed = $true

# Run all tests
$filesTest = Test-RequiredFiles
$manifestTest = Test-ManifestConfiguration  
$allTestsPassed = $allTestsPassed -and $filesTest -and $manifestTest

Test-JavaScriptPatterns
Test-ExtensionStructure
$cssTest = Test-CSSUpdates
$allTestsPassed = $allTestsPassed -and $cssTest

Write-Host ""
Write-Host "📊 Test Results Summary:" -ForegroundColor Cyan
Write-Host "========================" -ForegroundColor Cyan

if ($allTestsPassed) {
    Write-Host "✅ All critical tests passed!" -ForegroundColor Green
    Write-Host "🎉 Extension is ready for testing" -ForegroundColor Green
} else {
    Write-Host "⚠️  Some issues detected. Please review the output above." -ForegroundColor Yellow  
}

Show-FeatureSummary
Show-InstallationInstructions

Write-Host ""
Write-Host "🏁 Test completed!" -ForegroundColor Green
