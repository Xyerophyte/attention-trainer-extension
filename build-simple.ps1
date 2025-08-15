# Attention Trainer Extension Build Script
param(
    [Parameter(Mandatory=$false)]
    [string]$Version = "1.0.0",
    
    [Parameter(Mandatory=$false)]
    [switch]$Production = $false
)

Write-Host "Building Attention Trainer Extension v$Version" -ForegroundColor Green

# Set paths
$RootPath = $PSScriptRoot
$BuildPath = Join-Path $RootPath "build"
$DistPath = Join-Path $BuildPath "dist"
$ZipPath = Join-Path $BuildPath "attention-trainer-v$Version.zip"

# Clean build directory
Write-Host "Cleaning build directory..." -ForegroundColor Yellow
if (Test-Path $BuildPath) {
    Remove-Item $BuildPath -Recurse -Force
}
New-Item -ItemType Directory -Path $BuildPath -Force | Out-Null
New-Item -ItemType Directory -Path $DistPath -Force | Out-Null

# Copy extension files
Write-Host "Copying extension files..." -ForegroundColor Yellow

# Copy manifest and update version
$ManifestContent = Get-Content (Join-Path $RootPath "manifest.json") -Raw | ConvertFrom-Json
$ManifestContent.version = $Version
$ManifestContent | ConvertTo-Json -Depth 10 | Set-Content (Join-Path $DistPath "manifest.json")

# Copy source files
Copy-Item (Join-Path $RootPath "src") -Destination $DistPath -Recurse

# Copy icons
Copy-Item (Join-Path $RootPath "icons") -Destination $DistPath -Recurse

# Copy documentation
Copy-Item (Join-Path $RootPath "README.md") -Destination $DistPath -ErrorAction SilentlyContinue

# Validate extension structure
Write-Host "Validating extension structure..." -ForegroundColor Yellow

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
        Write-Host "Missing required file: $File" -ForegroundColor Red
    }
}

if ($MissingFiles.Count -gt 0) {
    Write-Host "Build failed: Missing required files" -ForegroundColor Red
    exit 1
}

# Create ZIP package
Write-Host "Creating ZIP package..." -ForegroundColor Yellow
try {
    Compress-Archive -Path (Join-Path $DistPath "*") -DestinationPath $ZipPath -Force
    
    $ZipSize = (Get-Item $ZipPath).Length / 1KB
    Write-Host "ZIP package created: $([math]::Round($ZipSize, 2)) KB" -ForegroundColor Green
} catch {
    Write-Host "Failed to create ZIP package: $_" -ForegroundColor Red
    exit 1
}

# Calculate file sizes
Write-Host ""
Write-Host "Build Statistics:" -ForegroundColor Cyan

$TotalSize = (Get-ChildItem $DistPath -Recurse -File | Measure-Object -Property Length -Sum).Sum
Write-Host "Total uncompressed size: $([math]::Round($TotalSize / 1KB, 2)) KB"

$JSFiles = Get-ChildItem $DistPath -Filter "*.js" -Recurse
$JSSize = ($JSFiles | Measure-Object -Property Length -Sum).Sum
Write-Host "JavaScript files: $($JSFiles.Count) files, $([math]::Round($JSSize / 1KB, 2)) KB"

Write-Host ""
Write-Host "Build completed successfully!" -ForegroundColor Green
Write-Host ""
Write-Host "Build artifacts:" -ForegroundColor White
Write-Host "   Source files: $DistPath"
Write-Host "   ZIP package:  $ZipPath"
Write-Host ""
Write-Host "Next steps for Chrome Web Store submission:" -ForegroundColor White
Write-Host "   1. Test the extension by loading the dist folder"
Write-Host "   2. Create promotional images"
Write-Host "   3. Write store description and privacy policy"
Write-Host "   4. Upload ZIP to Chrome Web Store Developer Dashboard"
Write-Host ""
Write-Host "Ready for Chrome Web Store submission!" -ForegroundColor Green
