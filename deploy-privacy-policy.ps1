# Privacy Policy Deployment Script for Windows
# Deploys privacy policy to GitHub Pages

Write-Host "🔒 Deploying Privacy Policy to GitHub Pages..." -ForegroundColor Cyan

# Check if we're in the right directory
$currentDir = Get-Location
$expectedPath = "*attention-trainer-extension"
if (-not ($currentDir.Path -like $expectedPath)) {
    Write-Host "❌ Please run this script from the attention-trainer-extension directory" -ForegroundColor Red
    exit 1
}

# Check if privacy-policy-deployment directory exists
if (-not (Test-Path "privacy-policy-deployment")) {
    Write-Host "❌ privacy-policy-deployment directory not found!" -ForegroundColor Red
    exit 1
}

# Navigate to deployment directory
Set-Location "privacy-policy-deployment"

Write-Host "📁 Current directory: $(Get-Location)" -ForegroundColor Green

# Check if git is available
try {
    git --version | Out-Null
    Write-Host "✅ Git is available" -ForegroundColor Green
} catch {
    Write-Host "❌ Git not found. Please install Git for Windows: https://git-scm.com/download/win" -ForegroundColor Red
    exit 1
}

# Check if GitHub CLI is available (optional)
$ghAvailable = $false
try {
    gh --version | Out-Null
    $ghAvailable = $true
    Write-Host "✅ GitHub CLI is available" -ForegroundColor Green
} catch {
    Write-Host "⚠️ GitHub CLI not found. Will use manual method." -ForegroundColor Yellow
}

# List files to be deployed
Write-Host "`n📦 Files to be deployed:" -ForegroundColor Yellow
Get-ChildItem -Name

# Prompt for GitHub username
$username = Read-Host "`n🔑 Enter your GitHub username"
if ([string]::IsNullOrWhiteSpace($username)) {
    Write-Host "❌ GitHub username is required!" -ForegroundColor Red
    exit 1
}

$repoName = "attention-trainer-privacy"
$repoUrl = "https://github.com/$username/$repoName.git"
$pagesUrl = "https://$username.github.io/$repoName/privacy-policy.html"

Write-Host "`n🎯 Target Repository: $repoUrl" -ForegroundColor Cyan
Write-Host "🌐 Future Privacy Policy URL: $pagesUrl" -ForegroundColor Cyan

# Initialize git repository
Write-Host "`n📝 Initializing git repository..." -ForegroundColor Yellow
try {
    git init
    git add .
    git commit -m "Initial privacy policy deployment for Attention Trainer Chrome Extension"
    git branch -M main
    Write-Host "✅ Git repository initialized" -ForegroundColor Green
} catch {
    Write-Host "❌ Failed to initialize git repository" -ForegroundColor Red
    exit 1
}

if ($ghAvailable) {
    Write-Host "`n🚀 Using GitHub CLI for automated setup..." -ForegroundColor Cyan
    
    try {
        # Create repository and push
        gh repo create $repoName --public --source=. --remote=origin --push --description "Privacy policy for Attention Trainer Chrome Extension"
        Write-Host "✅ Repository created and pushed!" -ForegroundColor Green
        
        # Enable GitHub Pages
        Start-Sleep -Seconds 3
        gh api "repos/$username/$repoName/pages" --method POST --field source.branch=main --field source.path=/
        Write-Host "✅ GitHub Pages enabled!" -ForegroundColor Green
        
        Write-Host "`n🎉 Deployment complete! Your privacy policy will be available at:" -ForegroundColor Green
        Write-Host "$pagesUrl" -ForegroundColor White -BackgroundColor DarkGreen
        
    } catch {
        Write-Host "⚠️ GitHub CLI method failed. Falling back to manual method..." -ForegroundColor Yellow
        $ghAvailable = $false
    }
}

if (-not $ghAvailable) {
    Write-Host "`n📋 Manual deployment steps required:" -ForegroundColor Yellow
    Write-Host "1. Go to: https://github.com/new" -ForegroundColor White
    Write-Host "2. Repository name: $repoName" -ForegroundColor White
    Write-Host "3. Make it Public" -ForegroundColor White
    Write-Host "4. Don't initialize with README" -ForegroundColor White
    Write-Host "5. Click 'Create repository'" -ForegroundColor White
    
    Read-Host "`nPress Enter after creating the repository..."
    
    Write-Host "`n📤 Pushing files to GitHub..." -ForegroundColor Yellow
    try {
        git remote add origin $repoUrl
        git push -u origin main
        Write-Host "✅ Files pushed successfully!" -ForegroundColor Green
    } catch {
        Write-Host "❌ Failed to push to GitHub. Please check your repository URL and permissions." -ForegroundColor Red
        Write-Host "Manual commands to run:" -ForegroundColor Yellow
        Write-Host "git remote add origin $repoUrl" -ForegroundColor White
        Write-Host "git push -u origin main" -ForegroundColor White
        exit 1
    }
    
    Write-Host "`n⚙️ Enable GitHub Pages manually:" -ForegroundColor Yellow
    Write-Host "1. Go to: https://github.com/$username/$repoName/settings/pages" -ForegroundColor White
    Write-Host "2. Source: 'Deploy from a branch'" -ForegroundColor White
    Write-Host "3. Branch: 'main'" -ForegroundColor White
    Write-Host "4. Folder: '/ (root)'" -ForegroundColor White
    Write-Host "5. Click 'Save'" -ForegroundColor White
    
    Read-Host "`nPress Enter after enabling GitHub Pages..."
}

Write-Host "`n⏳ GitHub Pages build time: 5-10 minutes" -ForegroundColor Yellow
Write-Host "🔗 Your privacy policy URL will be:" -ForegroundColor Green
Write-Host "$pagesUrl" -ForegroundColor White -BackgroundColor DarkGreen

Write-Host "`n📝 Next steps:" -ForegroundColor Cyan
Write-Host "1. Wait 5-10 minutes for GitHub Pages to build" -ForegroundColor White
Write-Host "2. Visit $pagesUrl to verify" -ForegroundColor White
Write-Host "3. Copy the URL for Chrome Web Store submission" -ForegroundColor White
Write-Host "4. Update chrome-store-submission/SUBMISSION_CHECKLIST.md" -ForegroundColor White

# Update submission checklist with the URL
Set-Location ".."
$checklistPath = "chrome-store-submission\SUBMISSION_CHECKLIST.md"
if (Test-Path $checklistPath) {
    Write-Host "`n📋 Updating submission checklist..." -ForegroundColor Yellow
    $checklistContent = Get-Content $checklistPath -Raw
    $updatedContent = $checklistContent -replace "Privacy policy deployed to public URL \(currently local file\)", "Privacy policy deployed to public URL: $pagesUrl"
    $updatedContent = $updatedContent -replace "\[ \] Privacy policy deployed to public URL", "[x] Privacy policy deployed to public URL: $pagesUrl"
    Set-Content $checklistPath $updatedContent
    Write-Host "✅ Submission checklist updated!" -ForegroundColor Green
}

Write-Host "`n🎉 Privacy Policy Deployment Complete!" -ForegroundColor Green -BackgroundColor Black
Write-Host "🚀 Ready for Chrome Web Store submission!" -ForegroundColor Green

# Open the submission checklist
Write-Host "`n📖 Opening submission checklist..." -ForegroundColor Yellow
Start-Process notepad.exe -ArgumentList "chrome-store-submission\SUBMISSION_CHECKLIST.md"
