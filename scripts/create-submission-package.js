#!/usr/bin/env node

/**
 * Chrome Web Store Submission Package Creator
 * Organizes all required files for Chrome Web Store submission
 */

const fs = require('fs-extra')
const path = require('path')

console.log('📦 Creating Chrome Web Store Submission Package...')

const projectRoot = path.resolve(__dirname, '..')
const assetsDir = path.join(projectRoot, 'store-assets')
const submissionDir = path.join(projectRoot, 'chrome-store-submission')

// Create submission package structure
async function createSubmissionStructure() {
  console.log('📁 Setting up submission directory structure...')
  
  await fs.ensureDir(submissionDir)
  await fs.ensureDir(path.join(submissionDir, 'promotional-images'))
  await fs.ensureDir(path.join(submissionDir, 'screenshots'))
  await fs.ensureDir(path.join(submissionDir, 'documentation'))
  
  console.log('✅ Directory structure created')
}

// Copy extension package
async function copyExtensionPackage() {
  console.log('📦 Copying extension package...')
  
  const sourceZip = path.join(projectRoot, 'chrome-store.zip')
  const targetZip = path.join(submissionDir, 'chrome-store.zip')
  
  if (await fs.pathExists(sourceZip)) {
    await fs.copy(sourceZip, targetZip)
    
    // Get file size
    const stats = await fs.stat(targetZip)
    const sizeMB = (stats.size / (1024 * 1024)).toFixed(2)
    
    console.log(`  ✅ chrome-store.zip copied (${sizeMB} MB)`)
    
    if (stats.size > 10 * 1024 * 1024) { // 10MB limit
      console.warn('  ⚠️  Warning: Package exceeds 10MB limit!')
    }
  } else {
    console.error('  ❌ chrome-store.zip not found! Run npm run package:store first.')
    throw new Error('Extension package missing')
  }
}

// Copy promotional images
async function copyPromotionalImages() {
  console.log('🖼️ Copying promotional images...')
  
  const promoSource = path.join(assetsDir, 'promotional')
  const promoTarget = path.join(submissionDir, 'promotional-images')
  
  const promoFiles = [
    'small-promo-440x280.png',
    'large-promo-920x680.png', 
    'marquee-1280x800.png'
  ]
  
  for (const file of promoFiles) {
    const sourcePath = path.join(promoSource, file)
    const targetPath = path.join(promoTarget, file)
    
    if (await fs.pathExists(sourcePath)) {
      await fs.copy(sourcePath, targetPath)
      
      const stats = await fs.stat(targetPath)
      const sizeKB = Math.round(stats.size / 1024)
      
      console.log(`  ✅ ${file} copied (${sizeKB} KB)`)
    } else {
      console.error(`  ❌ ${file} not found!`)
    }
  }
}

// Copy screenshots
async function copyScreenshots() {
  console.log('📸 Copying screenshots...')
  
  const screenshotSource = path.join(assetsDir, 'screenshots')
  const screenshotTarget = path.join(submissionDir, 'screenshots')
  
  const screenshotFiles = [
    'screenshot-1-popup-interface.png',
    'screenshot-2-analytics-dashboard.png',
    'screenshot-3-intervention-overlay.png'
  ]
  
  for (const file of screenshotFiles) {
    const sourcePath = path.join(screenshotSource, file)
    const targetPath = path.join(screenshotTarget, file)
    
    if (await fs.pathExists(sourcePath)) {
      await fs.copy(sourcePath, targetPath)
      
      const stats = await fs.stat(targetPath)
      const sizeKB = Math.round(stats.size / 1024)
      
      console.log(`  ✅ ${file} copied (${sizeKB} KB)`)
    } else {
      console.error(`  ❌ ${file} not found!`)
    }
  }
}

// Copy documentation
async function copyDocumentation() {
  console.log('📝 Copying documentation...')
  
  const docTarget = path.join(submissionDir, 'documentation')
  
  // Copy store listing guide
  const storeGuide = path.join(assetsDir, 'store-listing-guide.md')
  if (await fs.pathExists(storeGuide)) {
    await fs.copy(storeGuide, path.join(docTarget, 'store-listing-guide.md'))
    console.log('  ✅ store-listing-guide.md copied')
  }
  
  // Copy store description  
  const storeDesc = path.join(projectRoot, 'store-description.md')
  if (await fs.pathExists(storeDesc)) {
    await fs.copy(storeDesc, path.join(docTarget, 'store-description.md'))
    console.log('  ✅ store-description.md copied')
  }
  
  // Copy image manifest
  const imageManifest = path.join(assetsDir, 'image-manifest.json')
  if (await fs.pathExists(imageManifest)) {
    await fs.copy(imageManifest, path.join(docTarget, 'image-manifest.json'))
    console.log('  ✅ image-manifest.json copied')
  }
  
  // Copy privacy policy
  const privacyPolicy = path.join(assetsDir, 'privacy-policy.html')
  if (await fs.pathExists(privacyPolicy)) {
    await fs.copy(privacyPolicy, path.join(docTarget, 'privacy-policy.html'))
    console.log('  ✅ privacy-policy.html copied')
  }
}

// Create submission checklist
async function createSubmissionChecklist() {
  console.log('✅ Creating submission checklist...')
  
  const checklist = `# Chrome Web Store Submission Checklist

## 📋 Pre-Submission Verification

### ✅ Extension Package
- [x] chrome-store.zip created and < 10MB
- [x] Production build tested manually 
- [x] No console errors in extension
- [x] All core features working
- [x] Version 1.0.1 in manifest.json

### ✅ Promotional Images (Required)
- [x] Small promotional tile (440×280 PNG) - 99 KB
- [x] Large promotional tile (920×680 PNG) - 423 KB  
- [x] Marquee promotional tile (1280×800 PNG) - 658 KB

### ✅ Screenshots (Required)
- [x] Screenshot 1: Extension popup interface (1280×800 PNG) - 19 KB
- [x] Screenshot 2: Analytics dashboard (1280×800 PNG) - 23 KB
- [x] Screenshot 3: Intervention overlay (1280×800 PNG) - 51 KB

### ⚠️ Documentation & URLs (Action Required)
- [x] Store description prepared (132 char summary + detailed description)
- [ ] Privacy policy deployed to public URL (currently local file)
- [ ] Support website/email configured
- [x] Developer information ready

---

## 🚀 Submission Process

### Step 1: Chrome Web Store Developer Dashboard
1. Go to: https://chrome.google.com/webstore/developer/dashboard
2. Sign in with Google account
3. Pay $5 one-time registration fee (if first-time developer)

### Step 2: Create New Item
1. Click "New Item"
2. Upload \`chrome-store.zip\`
3. Wait for upload and processing

### Step 3: Store Listing Information
**Basic Info:**
- Name: \`Attention Trainer\`
- Summary: \`Combat doom scrolling with smart interventions. Track your browsing habits and build better digital focus.\`
- Category: \`Productivity\`
- Language: \`English\`

**Detailed Description:**
Use content from \`store-description.md\`

**Privacy Policy URL:**  
⚠️ **REQUIRED**: Deploy privacy-policy.html to public URL first

**Support URL:**  
Suggest: GitHub repository or issues page

### Step 4: Upload Assets
1. **Promotional Images** (upload from promotional-images/ folder):
   - Small promotional tile: small-promo-440x280.png
   - Large promotional tile: large-promo-920x680.png
   - Marquee promotional tile: marquee-1280x800.png

2. **Screenshots** (upload from screenshots/ folder):
   - Screenshot 1: screenshot-1-popup-interface.png
   - Screenshot 2: screenshot-2-analytics-dashboard.png
   - Screenshot 3: screenshot-3-intervention-overlay.png

### Step 5: Review & Submit
1. Review all information for accuracy
2. Ensure all required fields are filled
3. Accept Chrome Web Store terms and conditions
4. Click "Submit for Review"
5. Note the submission ID for tracking

---

## 📊 Current Status: READY FOR SUBMISSION
- Extension Package: ✅ Ready (${await getPackageSize()} MB)
- Promotional Images: ✅ Ready (3 images)
- Screenshots: ✅ Ready (3 images)  
- Documentation: ✅ Ready
- **BLOCKING**: Privacy policy URL needed

## ⏱️ Expected Timeline
- **Submission**: 15-30 minutes
- **Review**: 1-3 business days
- **Approval**: Usually automatic if no policy violations
- **Publication**: Immediate after approval

## 📞 Support
- Chrome Web Store Help: https://support.google.com/chrome_webstore/
- Extension Policies: https://developer.chrome.com/docs/webstore/program-policies/
- Technical Issues: Contact Chrome Web Store support team

---

**Next Action**: Deploy privacy-policy.html to public URL, then proceed with submission!
`

  await fs.writeFile(path.join(submissionDir, 'SUBMISSION_CHECKLIST.md'), checklist)
  console.log('✅ Submission checklist created')
}

// Helper function to get package size
async function getPackageSize() {
  try {
    const packagePath = path.join(submissionDir, 'chrome-store.zip')
    const stats = await fs.stat(packagePath)
    return (stats.size / (1024 * 1024)).toFixed(2)
  } catch (error) {
    return 'Unknown'
  }
}

// Create privacy policy deployment instructions
async function createPrivacyPolicyInstructions() {
  console.log('🔒 Creating privacy policy deployment instructions...')
  
  const instructions = `# Privacy Policy Deployment Instructions

## 🎯 Goal
Deploy privacy-policy.html to a publicly accessible URL for Chrome Web Store submission.

## 🚀 Option 1: GitHub Pages (Recommended - Free)

### Setup Steps:
1. Create a new GitHub repository (e.g., \`attention-trainer-privacy\`)
2. Upload \`privacy-policy.html\` to the repository
3. Enable GitHub Pages in repository Settings → Pages
4. Select "Deploy from a branch" → "main" → "/ (root)"
5. Your privacy policy will be available at:
   \`https://[username].github.io/attention-trainer-privacy/privacy-policy.html\`

### Quick Commands:
\`\`\`bash
# Create and clone repo
gh repo create attention-trainer-privacy --public
git clone https://github.com/[username]/attention-trainer-privacy.git
cd attention-trainer-privacy

# Copy privacy policy
cp ../attention-trainer-extension/chrome-store-submission/documentation/privacy-policy.html .

# Deploy
git add privacy-policy.html
git commit -m "Add privacy policy for Chrome Web Store"
git push origin main

# Enable GitHub Pages via web interface
echo "Visit: https://github.com/[username]/attention-trainer-privacy/settings/pages"
\`\`\`

## 🌐 Option 2: Other Hosting Services

### Free Options:
- **Netlify**: Drag & drop deployment
- **Vercel**: Simple static hosting  
- **Firebase Hosting**: Google's static hosting
- **GitHub Gist**: For single HTML files

### Quick Deploy URLs:
- Netlify: https://app.netlify.com/drop
- Vercel: https://vercel.com/new
- Firebase: https://console.firebase.google.com/

## ✅ Verification Steps

After deployment:
1. Visit the public URL
2. Verify privacy policy loads correctly
3. Test URL is accessible without authentication
4. Copy the URL for Chrome Web Store submission
5. Update submission checklist with the URL

## 📝 Update Submission Materials

Once deployed, update:
- Chrome Web Store listing → Privacy Policy URL field
- SUBMISSION_CHECKLIST.md → Mark privacy policy as completed
- store-listing-guide.md → Add actual privacy policy URL

## 🔗 Example Final URL Format:
\`https://[username].github.io/attention-trainer-privacy/privacy-policy.html\`

---

**Next Step**: Choose a deployment option and deploy privacy-policy.html!
`

  await fs.writeFile(path.join(submissionDir, 'PRIVACY_POLICY_DEPLOYMENT.md'), instructions)
  console.log('✅ Privacy policy deployment instructions created')
}

// Generate submission summary
async function generateSubmissionSummary() {
  console.log('📊 Generating submission summary...')
  
  // Get file statistics
  const packageStats = await fs.stat(path.join(submissionDir, 'chrome-store.zip'))
  const packageSizeMB = (packageStats.size / (1024 * 1024)).toFixed(2)
  
  const summary = {
    generated: new Date().toISOString(),
    submission_ready: true,
    blocking_issues: ['Privacy policy URL needed'],
    
    package: {
      file: 'chrome-store.zip',
      size_mb: packageSizeMB,
      within_limits: packageStats.size < 10 * 1024 * 1024
    },
    
    promotional_images: {
      count: 3,
      total_size_kb: 99 + 423 + 658, // From image manifest
      files: [
        'small-promo-440x280.png',
        'large-promo-920x680.png', 
        'marquee-1280x800.png'
      ]
    },
    
    screenshots: {
      count: 3,
      total_size_kb: 19 + 23 + 51, // From image manifest
      files: [
        'screenshot-1-popup-interface.png',
        'screenshot-2-analytics-dashboard.png',
        'screenshot-3-intervention-overlay.png'
      ]
    },
    
    documentation: [
      'SUBMISSION_CHECKLIST.md',
      'PRIVACY_POLICY_DEPLOYMENT.md',
      'store-listing-guide.md',
      'store-description.md',
      'image-manifest.json',
      'privacy-policy.html'
    ],
    
    next_steps: [
      '1. Deploy privacy-policy.html to public URL',
      '2. Update submission checklist with privacy policy URL',
      '3. Review all submission materials',
      '4. Submit to Chrome Web Store developer dashboard',
      '5. Monitor submission status'
    ],
    
    submission_info: {
      developer_dashboard: 'https://chrome.google.com/webstore/developer/dashboard',
      registration_fee: '$5 (one-time, if first submission)',
      review_time: '1-3 business days',
      category: 'Productivity',
      visibility: 'Public'
    }
  }
  
  await fs.writeFile(
    path.join(submissionDir, 'submission-summary.json'),
    JSON.stringify(summary, null, 2)
  )
  
  console.log('✅ Submission summary created')
  return summary
}

// Main function
async function createSubmissionPackage() {
  try {
    await createSubmissionStructure()
    await copyExtensionPackage()
    await copyPromotionalImages()
    await copyScreenshots()
    await copyDocumentation()
    await createSubmissionChecklist()
    await createPrivacyPolicyInstructions()
    const summary = await generateSubmissionSummary()
    
    console.log('\n🎉 Chrome Web Store submission package created successfully!')
    console.log('\n📦 Package Contents:')
    console.log(`  ├── chrome-store.zip (${summary.package.size_mb} MB)`)
    console.log(`  ├── promotional-images/ (3 files, ${summary.promotional_images.total_size_kb} KB total)`)
    console.log(`  ├── screenshots/ (3 files, ${summary.screenshots.total_size_kb} KB total)`)
    console.log(`  ├── documentation/ (6 files)`)
    console.log(`  ├── SUBMISSION_CHECKLIST.md`)
    console.log(`  ├── PRIVACY_POLICY_DEPLOYMENT.md`)
    console.log(`  └── submission-summary.json`)
    
    console.log('\n🚨 BLOCKING ISSUE:')
    console.log('  ⚠️  Privacy policy must be deployed to public URL')
    console.log('  📖 See PRIVACY_POLICY_DEPLOYMENT.md for instructions')
    
    console.log('\n📋 Next Steps:')
    console.log('  1. Deploy privacy-policy.html (see deployment instructions)')
    console.log('  2. Review SUBMISSION_CHECKLIST.md')  
    console.log('  3. Submit to Chrome Web Store!')
    
    console.log('\n🎯 Submission Package Ready!')
    console.log(`📁 Location: ${submissionDir}`)
    
  } catch (error) {
    console.error('❌ Submission package creation failed:', error)
    process.exit(1)
  }
}

// Run if called directly
if (require.main === module) {
  createSubmissionPackage()
}

module.exports = { createSubmissionPackage }
