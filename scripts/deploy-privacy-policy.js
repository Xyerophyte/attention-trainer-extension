#!/usr/bin/env node

/**
 * Privacy Policy GitHub Pages Deployment
 * Creates a simple deployment for privacy policy hosting
 */

const fs = require('fs-extra')
const path = require('path')

console.log('🔒 Deploying Privacy Policy to GitHub Pages...')

const projectRoot = path.resolve(__dirname, '..')
const deployDir = path.join(projectRoot, 'privacy-policy-deployment')

// Create deployment directory
async function createDeploymentStructure() {
  console.log('📁 Creating deployment structure...')
  
  await fs.ensureDir(deployDir)
  console.log('✅ Deployment directory created')
}

// Copy privacy policy
async function copyPrivacyPolicy() {
  console.log('📄 Copying privacy policy...')
  
  const sourcePolicy = path.join(projectRoot, 'store-assets', 'privacy-policy.html')
  const targetPolicy = path.join(deployDir, 'privacy-policy.html')
  
  if (await fs.pathExists(sourcePolicy)) {
    await fs.copy(sourcePolicy, targetPolicy)
    console.log('✅ privacy-policy.html copied')
  } else {
    throw new Error('Privacy policy not found!')
  }
}

// Create index.html redirect
async function createIndexRedirect() {
  console.log('🔗 Creating index redirect...')
  
  const indexHtml = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Attention Trainer - Privacy Policy</title>
    <meta http-equiv="refresh" content="0; url=privacy-policy.html">
    <link rel="canonical" href="privacy-policy.html">
    <style>
        body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            text-align: center; 
            padding: 50px; 
            background: #f8f9fa;
        }
        .container {
            max-width: 400px;
            margin: 0 auto;
            background: white;
            padding: 30px;
            border-radius: 12px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        .icon { font-size: 48px; margin-bottom: 20px; }
        h1 { color: #333; margin-bottom: 15px; }
        p { color: #666; margin-bottom: 20px; }
        a { 
            color: #667eea; 
            text-decoration: none; 
            font-weight: 500;
            padding: 10px 20px;
            background: #f0f2ff;
            border-radius: 6px;
            display: inline-block;
        }
        a:hover { background: #e0e7ff; }
    </style>
</head>
<body>
    <div class="container">
        <div class="icon">🎯</div>
        <h1>Attention Trainer</h1>
        <p>Redirecting to Privacy Policy...</p>
        <p><a href="privacy-policy.html">Click here if not redirected automatically</a></p>
    </div>
    
    <script>
        // Immediate redirect for browsers that don't support meta refresh
        window.location.href = 'privacy-policy.html';
    </script>
</body>
</html>`

  await fs.writeFile(path.join(deployDir, 'index.html'), indexHtml)
  console.log('✅ index.html created')
}

// Create README for the deployment repo
async function createDeploymentReadme() {
  console.log('📖 Creating deployment README...')
  
  const readme = `# Attention Trainer Privacy Policy

This repository hosts the privacy policy for the Attention Trainer Chrome extension.

## 🔗 Live URL
- **Privacy Policy**: https://[username].github.io/attention-trainer-privacy/privacy-policy.html
- **Direct Link**: https://[username].github.io/attention-trainer-privacy/

## 📄 About
This privacy policy is required for Chrome Web Store submission and explains how the Attention Trainer extension handles user data.

## 🚀 Deployment
This site is automatically deployed via GitHub Pages from the \`main\` branch.

## 🔄 Updates
To update the privacy policy:
1. Edit \`privacy-policy.html\`
2. Commit and push changes
3. GitHub Pages will automatically deploy updates

---

**Extension**: [Attention Trainer Chrome Extension](https://github.com/[username]/attention-trainer-extension)  
**Store Listing**: Chrome Web Store (pending approval)
`

  await fs.writeFile(path.join(deployDir, 'README.md'), readme)
  console.log('✅ README.md created')
}

// Create deployment instructions
async function createDeploymentInstructions() {
  console.log('📋 Creating deployment instructions...')
  
  const instructions = `# GitHub Pages Deployment Instructions

## 🎯 Quick Setup

### Method 1: GitHub CLI (Recommended)
\`\`\`bash
# Navigate to deployment folder
cd privacy-policy-deployment

# Initialize git repository
git init
git add .
git commit -m "Initial privacy policy deployment"

# Create GitHub repository (replace [username] with your GitHub username)
gh repo create attention-trainer-privacy --public --source=. --remote=origin --push

# Enable GitHub Pages
gh api repos/:owner/attention-trainer-privacy/pages \\
  --method POST \\
  --field source.branch=main \\
  --field source.path=/
\`\`\`

### Method 2: Manual Setup
1. **Create GitHub Repository**:
   - Go to https://github.com/new
   - Repository name: \`attention-trainer-privacy\`
   - Make it public
   - Don't initialize with README (we have our own)

2. **Upload Files**:
   - Drag and drop all files from \`privacy-policy-deployment/\` folder
   - Or use git commands:
     \`\`\`bash
     cd privacy-policy-deployment
     git init
     git add .
     git commit -m "Initial privacy policy deployment"
     git branch -M main
     git remote add origin https://github.com/[username]/attention-trainer-privacy.git
     git push -u origin main
     \`\`\`

3. **Enable GitHub Pages**:
   - Go to repository Settings → Pages
   - Source: "Deploy from a branch"
   - Branch: "main"
   - Folder: "/ (root)"
   - Click Save

## 🔗 Final URL
Your privacy policy will be available at:
\`https://[username].github.io/attention-trainer-privacy/privacy-policy.html\`

## ✅ Verification
1. Wait 5-10 minutes for GitHub Pages to build
2. Visit the URL to confirm it works
3. Copy the URL for Chrome Web Store submission

## 📝 Update Chrome Web Store Submission
Once deployed, update:
- \`chrome-store-submission/SUBMISSION_CHECKLIST.md\`
- Chrome Web Store listing form → Privacy Policy URL field

---

**Next Step**: Run the deployment commands above!
`

  await fs.writeFile(path.join(deployDir, 'DEPLOYMENT_INSTRUCTIONS.md'), instructions)
  console.log('✅ Deployment instructions created')
}

// Main deployment function
async function deployPrivacyPolicy() {
  try {
    await createDeploymentStructure()
    await copyPrivacyPolicy()
    await createIndexRedirect()
    await createDeploymentReadme()
    await createDeploymentInstructions()
    
    console.log('\n🎉 Privacy Policy deployment package created!')
    console.log('\n📦 Deployment Contents:')
    console.log('  ├── privacy-policy.html (main policy file)')
    console.log('  ├── index.html (redirect page)')
    console.log('  ├── README.md (repository documentation)')
    console.log('  └── DEPLOYMENT_INSTRUCTIONS.md (setup guide)')
    
    console.log('\n🚀 Next Steps:')
    console.log('  1. Navigate to privacy-policy-deployment/ folder')
    console.log('  2. Follow DEPLOYMENT_INSTRUCTIONS.md')
    console.log('  3. Create GitHub repository and enable Pages')
    console.log('  4. Copy the live URL to Chrome Web Store submission')
    
    console.log('\n🔗 Expected Final URL:')
    console.log('  https://[username].github.io/attention-trainer-privacy/privacy-policy.html')
    
    console.log(`\n📁 Deployment folder: ${deployDir}`)
    
  } catch (error) {
    console.error('❌ Privacy policy deployment preparation failed:', error)
    process.exit(1)
  }
}

// Run if called directly
if (require.main === module) {
  deployPrivacyPolicy()
}

module.exports = { deployPrivacyPolicy }
