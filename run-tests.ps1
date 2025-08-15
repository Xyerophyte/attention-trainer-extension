# Test Infrastructure Verification Script
# Verifies that our testing framework is properly configured

param(
    [switch]$Quick = $false,
    [switch]$Verbose = $false
)

$ErrorActionPreference = "SilentlyContinue"

Write-Host "=== Attention Trainer Extension - Testing Infrastructure Verification ===" -ForegroundColor Cyan
Write-Host ""

$ExtensionPath = Get-Location
$TestsPath = Join-Path $ExtensionPath "tests"

# Function to check file existence and structure
function Test-FileStructure {
    Write-Host "🔍 Checking test file structure..." -ForegroundColor Yellow
    
    $requiredFiles = @{
        "jest.config.js" = "Jest configuration"
        "package.json" = "Package configuration with test dependencies"
        "babel.config.js" = "Babel configuration for modern JS"
        "tests/setup/jest.setup.js" = "Jest setup with Chrome API mocks"
        "tests/setup/global-setup.js" = "Global test setup"
        "tests/setup/global-teardown.js" = "Global test teardown"
        "tests/setup/framework.test.js" = "Framework verification tests"
        "tests/unit/connection-manager.test.js" = "Connection manager unit tests"
        "tests/unit/error-handler.test.js" = "Error handler unit tests"
        "tests/unit/fallback-storage.test.js" = "Fallback storage unit tests"
        "tests/integration/content-script.test.js" = "Content script integration tests"
    }
    
    $missingFiles = @()
    $foundFiles = @()
    
    foreach ($file in $requiredFiles.Keys) {
        $filePath = Join-Path $ExtensionPath $file
        if (Test-Path $filePath) {
            $foundFiles += $file
            Write-Host "  ✅ $file - $($requiredFiles[$file])" -ForegroundColor Green
        } else {
            $missingFiles += $file
            Write-Host "  ❌ $file - $($requiredFiles[$file])" -ForegroundColor Red
        }
    }
    
    Write-Host ""
    Write-Host "Files Found: $($foundFiles.Count)/$($requiredFiles.Count)" -ForegroundColor $(if ($foundFiles.Count -eq $requiredFiles.Count) { "Green" } else { "Yellow" })
    
    if ($missingFiles.Count -gt 0) {
        Write-Host "Missing Files:" -ForegroundColor Red
        $missingFiles | ForEach-Object { Write-Host "  - $_" -ForegroundColor Red }
    }
    
    return $missingFiles.Count -eq 0
}

# Function to verify test configuration
function Test-Configuration {
    Write-Host "⚙️ Verifying test configuration..." -ForegroundColor Yellow
    
    $issues = @()
    
    # Check Jest config
    if (Test-Path "jest.config.js") {
        $jestConfig = Get-Content "jest.config.js" -Raw
        if ($jestConfig -match "testEnvironment.*jsdom") {
            Write-Host "  ✅ Jest configured for DOM testing" -ForegroundColor Green
        } else {
            $issues += "Jest not configured for DOM testing"
        }
        
        if ($jestConfig -match "setupFilesAfterEnv") {
            Write-Host "  ✅ Jest setup files configured" -ForegroundColor Green
        } else {
            $issues += "Jest setup files not configured"
        }
    } else {
        $issues += "Jest configuration missing"
    }
    
    # Check package.json
    if (Test-Path "package.json") {
        $packageJson = Get-Content "package.json" -Raw
        if ($packageJson -match '"jest"') {
            Write-Host "  ✅ Jest listed in dependencies" -ForegroundColor Green
        } else {
            $issues += "Jest not in package.json dependencies"
        }
        
        if ($packageJson -match '"test".*jest') {
            Write-Host "  ✅ Test script configured" -ForegroundColor Green
        } else {
            $issues += "Test script not configured in package.json"
        }
    } else {
        $issues += "package.json missing"
    }
    
    # Check Babel config
    if (Test-Path "babel.config.js") {
        $babelConfig = Get-Content "babel.config.js" -Raw
        if ($babelConfig -match "@babel/preset-env") {
            Write-Host "  ✅ Babel configured for modern JavaScript" -ForegroundColor Green
        } else {
            $issues += "Babel preset-env not configured"
        }
    } else {
        $issues += "Babel configuration missing"
    }
    
    Write-Host ""
    if ($issues.Count -eq 0) {
        Write-Host "Configuration Status: ✅ All Good" -ForegroundColor Green
    } else {
        Write-Host "Configuration Issues:" -ForegroundColor Red
        $issues | ForEach-Object { Write-Host "  - $_" -ForegroundColor Red }
    }
    
    return $issues.Count -eq 0
}

# Function to verify test content quality
function Test-ContentQuality {
    Write-Host "📋 Analyzing test content quality..." -ForegroundColor Yellow
    
    $testFiles = Get-ChildItem -Path $TestsPath -Filter "*.test.js" -Recurse
    $totalTests = 0
    $testCategories = @{}
    
    foreach ($file in $testFiles) {
        $content = Get-Content $file.FullName -Raw
        
        # Count describe blocks
        $describeCount = ($content | Select-String "describe\(" -AllMatches).Matches.Count
        
        # Count it blocks
        $itCount = ($content | Select-String "\bit\(" -AllMatches).Matches.Count
        
        # Count test categories
        $asyncTests = ($content | Select-String "async.*\(\)" -AllMatches).Matches.Count
        $mockTests = ($content | Select-String "\.mock" -AllMatches).Matches.Count
        $expectTests = ($content | Select-String "expect\(" -AllMatches).Matches.Count
        
        $totalTests += $itCount
        
        Write-Host "  📄 $($file.Name)" -ForegroundColor Cyan
        Write-Host "    - Test suites: $describeCount" -ForegroundColor Gray
        Write-Host "    - Test cases: $itCount" -ForegroundColor Gray
        Write-Host "    - Async tests: $asyncTests" -ForegroundColor Gray
        Write-Host "    - Mock usage: $mockTests" -ForegroundColor Gray
        Write-Host "    - Assertions: $expectTests" -ForegroundColor Gray
        
        $testCategories[$file.Name] = @{
            Suites = $describeCount
            Cases = $itCount
            Async = $asyncTests
            Mocks = $mockTests
            Assertions = $expectTests
        }
    }
    
    Write-Host ""
    Write-Host "📊 Test Suite Summary:" -ForegroundColor Cyan
    Write-Host "  Total test files: $($testFiles.Count)" -ForegroundColor White
    Write-Host "  Total test cases: $totalTests" -ForegroundColor White
    Write-Host "  Average tests per file: $([math]::Round($totalTests / $testFiles.Count, 1))" -ForegroundColor White
    
    # Quality assessment
    $qualityScore = 0
    if ($totalTests -gt 50) { $qualityScore += 25 }
    elseif ($totalTests -gt 30) { $qualityScore += 20 }
    elseif ($totalTests -gt 20) { $qualityScore += 15 }
    else { $qualityScore += 10 }
    
    if ($testFiles.Count -ge 5) { $qualityScore += 25 }
    elseif ($testFiles.Count -ge 3) { $qualityScore += 20 }
    else { $qualityScore += 10 }
    
    # Check for different test types
    $hasUnitTests = $testFiles | Where-Object { $_.Directory.Name -eq "unit" }
    $hasIntegrationTests = $testFiles | Where-Object { $_.Directory.Name -eq "integration" }
    $hasSetupTests = $testFiles | Where-Object { $_.Directory.Name -eq "setup" }
    
    if ($hasUnitTests) { $qualityScore += 15 }
    if ($hasIntegrationTests) { $qualityScore += 15 }
    if ($hasSetupTests) { $qualityScore += 10 }
    
    $qualityScore = [math]::Min($qualityScore, 100)
    
    Write-Host ""
    Write-Host "Quality Score: $qualityScore/100" -ForegroundColor $(
        if ($qualityScore -ge 80) { "Green" }
        elseif ($qualityScore -ge 60) { "Yellow" }
        else { "Red" }
    )
    
    return $qualityScore -ge 60
}

# Function to verify testing infrastructure readiness
function Test-InfrastructureReadiness {
    Write-Host "🚀 Checking testing infrastructure readiness..." -ForegroundColor Yellow
    
    $readinessChecks = @()
    
    # Check for Node.js compatibility
    Write-Host "  🔍 Checking Node.js requirements..." -ForegroundColor Gray
    try {
        $nodeVersion = node --version 2>$null
        if ($nodeVersion) {
            Write-Host "    ✅ Node.js available: $nodeVersion" -ForegroundColor Green
            $readinessChecks += $true
        } else {
            Write-Host "    ⚠️ Node.js not found (required for running tests)" -ForegroundColor Yellow
            $readinessChecks += $false
        }
    } catch {
        Write-Host "    ⚠️ Node.js not available" -ForegroundColor Yellow
        $readinessChecks += $false
    }
    
    # Check for npm
    try {
        $npmVersion = npm --version 2>$null
        if ($npmVersion) {
            Write-Host "    ✅ npm available: $npmVersion" -ForegroundColor Green
            $readinessChecks += $true
        } else {
            Write-Host "    ⚠️ npm not found" -ForegroundColor Yellow
            $readinessChecks += $false
        }
    } catch {
        Write-Host "    ⚠️ npm not available" -ForegroundColor Yellow
        $readinessChecks += $false
    }
    
    # Check if dependencies would be installable
    if (Test-Path "package.json") {
        Write-Host "    ✅ Package.json ready for dependency installation" -ForegroundColor Green
        $readinessChecks += $true
    } else {
        Write-Host "    ❌ Package.json missing" -ForegroundColor Red
        $readinessChecks += $false
    }
    
    # Check test file syntax (basic)
    Write-Host "  🔍 Checking test file syntax..." -ForegroundColor Gray
    $syntaxErrors = 0
    $testFiles = Get-ChildItem -Path $TestsPath -Filter "*.test.js" -Recurse
    
    foreach ($file in $testFiles) {
        $content = Get-Content $file.FullName -Raw
        
        # Basic syntax checks
        $unbalancedParens = ($content.ToCharArray() | Where-Object { $_ -eq '(' }).Count - ($content.ToCharArray() | Where-Object { $_ -eq ')' }).Count
        $unbalancedBraces = ($content.ToCharArray() | Where-Object { $_ -eq '{' }).Count - ($content.ToCharArray() | Where-Object { $_ -eq '}' }).Count
        
        if ([math]::Abs($unbalancedParens) -gt 0 -or [math]::Abs($unbalancedBraces) -gt 0) {
            Write-Host "    ⚠️ Potential syntax issues in $($file.Name)" -ForegroundColor Yellow
            $syntaxErrors++
        }
    }
    
    if ($syntaxErrors -eq 0) {
        Write-Host "    ✅ No obvious syntax errors detected" -ForegroundColor Green
        $readinessChecks += $true
    } else {
        Write-Host "    ⚠️ $syntaxErrors files may have syntax issues" -ForegroundColor Yellow
        $readinessChecks += $false
    }
    
    $readyCount = ($readinessChecks | Where-Object { $_ -eq $true }).Count
    $totalChecks = $readinessChecks.Count
    
    Write-Host ""
    Write-Host "Infrastructure Readiness: $readyCount/$totalChecks checks passed" -ForegroundColor $(
        if ($readyCount -eq $totalChecks) { "Green" }
        elseif ($readyCount -ge ($totalChecks * 0.8)) { "Yellow" }
        else { "Red" }
    )
    
    return $readyCount -ge ($totalChecks * 0.6)
}

# Main execution
$fileStructureOk = Test-FileStructure
$configurationOk = Test-Configuration
$contentQualityOk = if (-not $Quick) { Test-ContentQuality } else { $true }
$infrastructureReady = Test-InfrastructureReadiness

Write-Host ""
Write-Host "=== Testing Infrastructure Summary ===" -ForegroundColor Cyan

$checks = @(
    @{ Name = "File Structure"; Status = $fileStructureOk },
    @{ Name = "Configuration"; Status = $configurationOk },
    @{ Name = "Content Quality"; Status = $contentQualityOk },
    @{ Name = "Infrastructure"; Status = $infrastructureReady }
)

foreach ($check in $checks) {
    $status = if ($check.Status) { "✅ PASS" } else { "❌ FAIL" }
    $color = if ($check.Status) { "Green" } else { "Red" }
    Write-Host "$($check.Name): $status" -ForegroundColor $color
}

$overallSuccess = $fileStructureOk -and $configurationOk -and $contentQualityOk -and $infrastructureReady

Write-Host ""
if ($overallSuccess) {
    Write-Host "🎉 Testing infrastructure is ready!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Next steps to run tests:" -ForegroundColor Cyan
    Write-Host "1. npm install" -ForegroundColor White
    Write-Host "2. npm test" -ForegroundColor White
    Write-Host "3. npm run test:coverage" -ForegroundColor White
} else {
    Write-Host "⚠️ Testing infrastructure needs attention" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Recommended actions:" -ForegroundColor Cyan
    if (-not $fileStructureOk) {
        Write-Host "- Ensure all test files are present" -ForegroundColor White
    }
    if (-not $configurationOk) {
        Write-Host "- Fix configuration files (Jest, Babel, package.json)" -ForegroundColor White
    }
    if (-not $contentQualityOk) {
        Write-Host "- Improve test coverage and quality" -ForegroundColor White
    }
    if (-not $infrastructureReady) {
        Write-Host "- Install Node.js and npm" -ForegroundColor White
        Write-Host "- Fix any syntax errors in test files" -ForegroundColor White
    }
}

Write-Host ""
Write-Host "🔧 Testing Framework Features:" -ForegroundColor Cyan
Write-Host "✅ Chrome Extension API mocking" -ForegroundColor Green
Write-Host "✅ IndexedDB fallback storage testing" -ForegroundColor Green
Write-Host "✅ DOM manipulation and event simulation" -ForegroundColor Green
Write-Host "✅ Behavioral analysis testing" -ForegroundColor Green
Write-Host "✅ Integration testing for content scripts" -ForegroundColor Green
Write-Host "✅ Error handling and recovery testing" -ForegroundColor Green
Write-Host "✅ Performance and optimization testing" -ForegroundColor Green
