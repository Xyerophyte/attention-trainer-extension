# Attention Trainer Extension Build Script
# This script packages the extension for Chrome Web Store submission

param(
    [Parameter(Mandatory=$false)]
    [string]$Version = "1.0.0",
    
    [Parameter(Mandatory=$false)]
    [switch]$Production = $false
)

Write-Host "🚀 Building Attention Trainer Extension v$Version" -ForegroundColor Green
Write-Host ""

# Set paths
$RootPath = $PSScriptRoot
$BuildPath = Join-Path $RootPath "build"
$DistPath = Join-Path $BuildPath "dist"
$ZipPath = Join-Path $BuildPath "attention-trainer-v$Version.zip"

# Clean build directory
Write-Host "🧹 Cleaning build directory..." -ForegroundColor Yellow
if (Test-Path $BuildPath) {
    Remove-Item $BuildPath -Recurse -Force
}
New-Item -ItemType Directory -Path $BuildPath -Force | Out-Null
New-Item -ItemType Directory -Path $DistPath -Force | Out-Null

# Copy extension files
Write-Host "📦 Copying extension files..." -ForegroundColor Yellow

# Copy manifest and update version
$ManifestContent = Get-Content (Join-Path $RootPath "manifest.json") -Raw | ConvertFrom-Json
$ManifestContent.version = $Version
$ManifestContent | ConvertTo-Json -Depth 10 | Set-Content (Join-Path $DistPath "manifest.json")

# Copy source files
Copy-Item (Join-Path $RootPath "src") -Destination $DistPath -Recurse

# Copy icons
Copy-Item (Join-Path $RootPath "icons") -Destination $DistPath -Recurse

# Copy documentation (optional for store submission)
Copy-Item (Join-Path $RootPath "README.md") -Destination $DistPath -ErrorAction SilentlyContinue

# Validate extension structure
Write-Host "✅ Validating extension structure..." -ForegroundColor Yellow

$RequiredFiles = @(
    "manifest.json",
    "src/background/background.js",
    "src/content/content.js",
    "src/content/content.css",
    "src/popup/popup.html",
    "src/popup/popup.js",
    "src/dashboard/dashboard.html",
    "src/dashboard/dashboard.js",
    "icons/icon16.png",
    "icons/icon32.png",
    "icons/icon48.png",
    "icons/icon128.png"
)

$MissingFiles = @()
foreach ($File in $RequiredFiles) {
    $FilePath = Join-Path $DistPath $File
    if (-not (Test-Path $FilePath)) {
        $MissingFiles += $File
        Write-Host "❌ Missing required file: $File" -ForegroundColor Red
    }
}

if ($MissingFiles.Count -gt 0) {
    Write-Host ""
    Write-Host "❌ Build failed: Missing required files" -ForegroundColor Red
    exit 1
}

# Validate manifest.json
Write-Host "📋 Validating manifest..." -ForegroundColor Yellow
try {
    $Manifest = Get-Content (Join-Path $DistPath "manifest.json") | ConvertFrom-Json
    
    # Check required fields
    $RequiredFields = @("manifest_version", "name", "version", "description", "permissions", "background", "content_scripts", "action")
    foreach ($Field in $RequiredFields) {
        if (-not $Manifest.$Field) {
            Write-Host "❌ Missing required manifest field: $Field" -ForegroundColor Red
            exit 1
        }
    }
    
    # Validate manifest version
    if ($Manifest.manifest_version -ne 3) {
        Write-Host "❌ Invalid manifest version. Must be 3 for Chrome extensions." -ForegroundColor Red
        exit 1
    }
    
    Write-Host "✅ Manifest validation passed" -ForegroundColor Green
} catch {
    Write-Host "❌ Manifest validation failed: $_" -ForegroundColor Red
    exit 1
}

# Create production build optimizations
if ($Production) {
    Write-Host "⚡ Applying production optimizations..." -ForegroundColor Yellow
    
    # Note: Since we're using vanilla JS, we'll focus on file size optimization
    # Remove console.log statements from production builds
    Get-ChildItem $DistPath -Filter "*.js" -Recurse | ForEach-Object {
        $Content = Get-Content $_.FullName -Raw
        # Remove console.log and console.warn statements
        $Content = $Content -replace "console\.(log|warn)\([^)]*\);?", ""
        # Remove extra whitespace and empty lines
        $Content = $Content -replace "(?m)^\s*$\n", ""
        Set-Content $_.FullName -Value $Content
    }
    
    Write-Host "✅ Production optimizations applied" -ForegroundColor Green
}

# Create ZIP package
Write-Host "📦 Creating ZIP package..." -ForegroundColor Yellow
try {
    Compress-Archive -Path (Join-Path $DistPath "*") -DestinationPath $ZipPath -Force
    
    $ZipSize = (Get-Item $ZipPath).Length / 1KB
    Write-Host "✅ ZIP package created: $([math]::Round($ZipSize, 2)) KB" -ForegroundColor Green
} catch {
    Write-Host "❌ Failed to create ZIP package: $_" -ForegroundColor Red
    exit 1
}

# Calculate file sizes
Write-Host ""
Write-Host "📊 Build Statistics:" -ForegroundColor Cyan
Write-Host "===================" -ForegroundColor Cyan

$TotalSize = (Get-ChildItem $DistPath -Recurse -File | Measure-Object -Property Length -Sum).Sum
Write-Host "Total uncompressed size: $([math]::Round($TotalSize / 1KB, 2)) KB"

$JSFiles = Get-ChildItem $DistPath -Filter "*.js" -Recurse
$JSSize = ($JSFiles | Measure-Object -Property Length -Sum).Sum
Write-Host "JavaScript files: $($JSFiles.Count) files, $([math]::Round($JSSize / 1KB, 2)) KB"

$HTMLFiles = Get-ChildItem $DistPath -Filter "*.html" -Recurse
$HTMLSize = ($HTMLFiles | Measure-Object -Property Length -Sum).Sum
Write-Host "HTML files: $($HTMLFiles.Count) files, $([math]::Round($HTMLSize / 1KB, 2)) KB"

$CSSFiles = Get-ChildItem $DistPath -Filter "*.css" -Recurse
if ($CSSFiles) {
    $CSSSize = ($CSSFiles | Measure-Object -Property Length -Sum).Sum
    Write-Host "CSS files: $($CSSFiles.Count) files, $([math]::Round($CSSSize / 1KB, 2)) KB"
}

$IconFiles = Get-ChildItem (Join-Path $DistPath "icons") -Filter "*.png"
$IconSize = ($IconFiles | Measure-Object -Property Length -Sum).Sum
Write-Host "Icon files: $($IconFiles.Count) files, $([math]::Round($IconSize / 1KB, 2)) KB"

# Final validation
Write-Host ""
Write-Host "🔍 Final Validation:" -ForegroundColor Cyan
Write-Host "====================" -ForegroundColor Cyan

# Check ZIP size limit (Chrome Web Store has size limits)
$ZipSizeMB = (Get-Item $ZipPath).Length / 1MB
if ($ZipSizeMB -gt 50) {
    Write-Host "⚠️  Warning: ZIP file is larger than 50MB (Chrome Web Store limit)" -ForegroundColor Yellow
}

# Check for potential issues
if ($TotalSize -gt 20MB) {
    Write-Host "⚠️  Warning: Extension size is quite large. Consider optimization." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "🎉 Build completed successfully!" -ForegroundColor Green
Write-Host ""
Write-Host "📁 Build artifacts:" -ForegroundColor White
Write-Host "   Source files: $DistPath"
Write-Host "   ZIP package:  $ZipPath"
Write-Host ""
Write-Host "📋 Next steps for Chrome Web Store submission:" -ForegroundColor White
Write-Host "   1. Test the extension by loading the '$DistPath' folder"
Write-Host "   2. Create promotional images (440x280, 920x680, 1280x800)"
Write-Host "   3. Write store description and privacy policy"
Write-Host "   4. Upload '$ZipPath' to Chrome Web Store Developer Dashboard"
Write-Host ""
Write-Host "Ready for Chrome Web Store submission!" -ForegroundColor Green
