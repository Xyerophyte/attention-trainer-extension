#!/usr/bin/env node

/**
 * Chrome Web Store Asset Generator
 * Creates promotional images and prepares store listing materials
 */

const fs = require('fs-extra')
const path = require('path')

console.log('🎨 Generating Chrome Web Store Assets...')

const projectRoot = path.resolve(__dirname, '..')
const assetsDir = path.join(projectRoot, 'store-assets')
const promotionalDir = path.join(assetsDir, 'promotional')
const screenshotsDir = path.join(assetsDir, 'screenshots')

// Ensure directories exist
async function setupDirectories() {
  await fs.ensureDir(promotionalDir)
  await fs.ensureDir(screenshotsDir)
  console.log('📁 Asset directories ready')
}

// Create HTML templates for promotional images
function createPromoTemplate(size, title, subtitle, features) {
  const [width, height] = size.split('x').map(Number)
  
  return `<!DOCTYPE html>
<html>
<head>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { 
      width: ${width}px; 
      height: ${height}px; 
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      color: white;
      text-align: center;
      padding: 40px;
      position: relative;
      overflow: hidden;
    }
    
    .background-pattern {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      opacity: 0.1;
      background-image: repeating-linear-gradient(
        45deg,
        transparent,
        transparent 10px,
        rgba(255,255,255,0.1) 10px,
        rgba(255,255,255,0.1) 20px
      );
    }
    
    .content {
      position: relative;
      z-index: 2;
      max-width: 80%;
    }
    
    .icon {
      width: ${Math.min(width/4, 120)}px;
      height: ${Math.min(width/4, 120)}px;
      background: rgba(255,255,255,0.2);
      border-radius: 20px;
      margin-bottom: 30px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: ${Math.min(width/8, 60)}px;
      border: 3px solid rgba(255,255,255,0.3);
    }
    
    .title {
      font-size: ${Math.min(width/12, 48)}px;
      font-weight: bold;
      margin-bottom: 15px;
      text-shadow: 2px 2px 4px rgba(0,0,0,0.3);
    }
    
    .subtitle {
      font-size: ${Math.min(width/20, 24)}px;
      opacity: 0.9;
      margin-bottom: 30px;
      line-height: 1.4;
    }
    
    .features {
      display: flex;
      flex-wrap: wrap;
      gap: 15px;
      justify-content: center;
    }
    
    .feature {
      background: rgba(255,255,255,0.2);
      padding: 8px 16px;
      border-radius: 20px;
      font-size: ${Math.min(width/25, 16)}px;
      backdrop-filter: blur(5px);
    }
    
    .chrome-badge {
      position: absolute;
      bottom: 20px;
      right: 20px;
      font-size: ${Math.min(width/30, 14)}px;
      opacity: 0.7;
    }
  </style>
</head>
<body>
  <div class="background-pattern"></div>
  <div class="content">
    <div class="icon">🎯</div>
    <div class="title">${title}</div>
    <div class="subtitle">${subtitle}</div>
    <div class="features">
      ${features.map(f => `<div class="feature">${f}</div>`).join('')}
    </div>
  </div>
  <div class="chrome-badge">Available for Chrome</div>
</body>
</html>`
}

// Generate promotional image HTML files
async function generatePromoImages() {
  console.log('🖼️ Generating promotional image templates...')
  
  const promoConfigs = [
    {
      size: '440x280',
      name: 'small-promo-440x280.html',
      title: 'Attention Trainer',
      subtitle: 'Combat doom scrolling with smart interventions',
      features: ['Smart Detection', 'Gentle Nudges', '100% Private']
    },
    {
      size: '920x680', 
      name: 'large-promo-920x680.html',
      title: 'Attention Trainer',
      subtitle: 'Stop mindless scrolling. Build better digital habits.',
      features: ['Progressive Interventions', 'Detailed Analytics', 'Focus Modes', 'Privacy First']
    },
    {
      size: '1280x800',
      name: 'marquee-1280x800.html', 
      title: 'Attention Trainer',
      subtitle: 'Transform your browsing habits with gentle, science-based interventions',
      features: ['Smart Scroll Detection', 'Progressive Interventions', 'Detailed Analytics', 'Three Focus Modes', '100% Private & Local']
    }
  ]
  
  for (const config of promoConfigs) {
    const html = createPromoTemplate(config.size, config.title, config.subtitle, config.features)
    const filepath = path.join(promotionalDir, config.name)
    await fs.writeFile(filepath, html)
    console.log(`  ✅ Generated ${config.name}`)
  }
}

// Create screenshot templates 
async function generateScreenshotTemplates() {
  console.log('📸 Generating screenshot templates...')
  
  const screenshotTemplates = [
    {
      name: 'popup-interface.html',
      title: 'Extension Popup Interface',
      content: `
        <div style="width: 300px; margin: 40px auto; background: white; border-radius: 12px; box-shadow: 0 8px 32px rgba(0,0,0,0.1); padding: 20px;">
          <div style="display: flex; align-items: center; margin-bottom: 20px;">
            <div style="width: 32px; height: 32px; background: linear-gradient(135deg, #667eea, #764ba2); border-radius: 8px; display: flex; align-items: center; justify-content: center; color: white; margin-right: 12px;">🎯</div>
            <h2 style="margin: 0; color: #333;">Attention Trainer</h2>
          </div>
          <div style="margin-bottom: 15px;">
            <label style="display: block; margin-bottom: 5px; color: #666; font-size: 14px;">Focus Mode</label>
            <select style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 6px;">
              <option>Gentle</option>
              <option>Strict</option>
              <option>Gamified</option>
            </select>
          </div>
          <div style="margin-bottom: 15px;">
            <label style="display: block; margin-bottom: 5px;">
              <input type="checkbox" checked style="margin-right: 8px;">
              Enable scroll monitoring
            </label>
          </div>
          <div style="display: flex; gap: 8px;">
            <button style="flex: 1; padding: 8px; background: #667eea; color: white; border: none; border-radius: 6px; cursor: pointer;">Dashboard</button>
            <button style="flex: 1; padding: 8px; background: #f3f4f6; color: #333; border: none; border-radius: 6px; cursor: pointer;">Settings</button>
          </div>
        </div>
      `
    },
    {
      name: 'analytics-dashboard.html', 
      title: 'Analytics Dashboard',
      content: `
        <div style="max-width: 800px; margin: 40px auto; background: #f8fafc; padding: 30px; border-radius: 12px;">
          <h2 style="color: #1e293b; margin-bottom: 30px;">📊 Your Browsing Analytics</h2>
          <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; margin-bottom: 30px;">
            <div style="background: white; padding: 20px; border-radius: 8px; text-align: center;">
              <div style="font-size: 32px; font-weight: bold; color: #667eea;">2.5h</div>
              <div style="color: #64748b;">Today's Browse Time</div>
            </div>
            <div style="background: white; padding: 20px; border-radius: 8px; text-align: center;">
              <div style="font-size: 32px; font-weight: bold; color: #10b981;">12</div>
              <div style="color: #64748b;">Interventions</div>
            </div>
            <div style="background: white; padding: 20px; border-radius: 8px; text-align: center;">
              <div style="font-size: 32px; font-weight: bold; color: #f59e0b;">5</div>
              <div style="color: #64748b;">Focus Sessions</div>
            </div>
          </div>
          <div style="background: white; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
            <h3 style="margin-bottom: 15px; color: #374151;">Top Sites This Week</h3>
            <div style="margin-bottom: 10px;">
              <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                <span>YouTube</span><span style="font-weight: bold;">45 min</span>
              </div>
              <div style="width: 100%; height: 8px; background: #e5e7eb; border-radius: 4px;">
                <div style="width: 60%; height: 100%; background: #ef4444; border-radius: 4px;"></div>
              </div>
            </div>
            <div style="margin-bottom: 10px;">
              <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                <span>Twitter</span><span style="font-weight: bold;">32 min</span>
              </div>
              <div style="width: 100%; height: 8px; background: #e5e7eb; border-radius: 4px;">
                <div style="width: 40%; height: 100%; background: #3b82f6; border-radius: 4px;"></div>
              </div>
            </div>
          </div>
        </div>
      `
    },
    {
      name: 'intervention-overlay.html',
      title: 'Intervention Overlay in Action',
      content: `
        <div style="position: relative; width: 800px; height: 600px; margin: 40px auto; background: linear-gradient(to bottom, #f3f4f6, #e5e7eb); border-radius: 12px; overflow: hidden;">
          <div style="position: absolute; inset: 0; background: rgba(0,0,0,0.1);"></div>
          <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); background: white; padding: 40px; border-radius: 16px; box-shadow: 0 20px 60px rgba(0,0,0,0.2); text-align: center; max-width: 400px;">
            <div style="font-size: 48px; margin-bottom: 20px;">🎯</div>
            <h3 style="color: #1e293b; margin-bottom: 10px;">Take a mindful pause</h3>
            <p style="color: #64748b; margin-bottom: 30px;">You've been scrolling for a while. What were you looking for?</p>
            <div style="display: flex; gap: 12px; justify-content: center;">
              <button style="padding: 12px 24px; background: #667eea; color: white; border: none; border-radius: 8px; cursor: pointer;">✨ Start Focus Mode</button>
              <button style="padding: 12px 24px; background: #f3f4f6; color: #374151; border: none; border-radius: 8px; cursor: pointer;">Continue Browsing</button>
            </div>
          </div>
        </div>
      `
    }
  ]
  
  for (const template of screenshotTemplates) {
    const html = `<!DOCTYPE html>
<html>
<head>
  <style>
    body { 
      font-family: 'Segoe UI', sans-serif; 
      margin: 0; 
      padding: 20px; 
      background: #fafafa;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
    }
  </style>
</head>
<body>
  ${template.content}
</body>
</html>`
    
    const filepath = path.join(screenshotsDir, template.name)
    await fs.writeFile(filepath, html)
    console.log(`  ✅ Generated ${template.name}`)
  }
}

// Create store listing metadata file
async function createStoreListingFile() {
  console.log('📝 Creating store listing metadata...')
  
  const storeDescription = await fs.readFile(path.join(projectRoot, 'store-description.md'), 'utf8')
  
  const listing = `# Chrome Web Store Submission Details

## Extension Information
- Name: Attention Trainer
- Version: 1.0.1
- Category: Productivity
- Language: English

## Short Description (132 chars max)
Combat doom scrolling with smart interventions. Track your browsing habits and build better digital focus.

## Developer Information
- Developer: Attention Trainer Team
- Website: https://github.com/your-username/attention-trainer-extension
- Support Email: support@attentiontrainer.com
- Privacy Policy: https://your-username.github.io/attention-trainer-extension/privacy-policy.html

## Upload Checklist
- [ ] chrome-store.zip (< 10MB) ✅ Ready (33KB)
- [ ] Small promotional tile (440×280) - Generate from HTML template
- [ ] Large promotional tile (920×680) - Generate from HTML template  
- [ ] Marquee promotional tile (1280×800) - Generate from HTML template
- [ ] Screenshots (1280×800) - Generate from HTML templates
- [ ] Detailed description - Use content from store-description.md
- [ ] Privacy policy URL - Deploy privacy-policy.html
- [ ] Support website URL - Set up GitHub Pages or support site

## Promotional Images Required
1. **Small promo tile**: 440×280 PNG (use small-promo-440x280.html)
2. **Large promo tile**: 920×680 PNG (use large-promo-920x680.html)
3. **Marquee promo tile**: 1280×800 PNG (use marquee-1280x800.html)

## Screenshots Required (1-5 screenshots, 1280×800 PNG each)
1. **Popup Interface** - Extension popup with settings (use popup-interface.html)
2. **Analytics Dashboard** - Usage statistics and charts (use analytics-dashboard.html)
3. **Intervention Overlay** - Smart nudge in action (use intervention-overlay.html)
4. **Settings Panel** - Configuration options (optional)
5. **Focus Mode** - Active focus session (optional)

## How to Generate Images
1. Open HTML files in Chrome
2. Set browser zoom to 100%
3. Use browser dev tools to capture screenshot at exact dimensions
4. Or use a screenshot tool to capture at required size
5. Save as PNG format

## Submission Process
1. Go to https://chrome.google.com/webstore/developer/dashboard
2. Sign in with Google account
3. Pay $5 one-time registration fee (if first submission)
4. Click "New Item" 
5. Upload chrome-store.zip
6. Fill in all store listing information
7. Upload promotional images and screenshots
8. Review and submit for approval

## Review Timeline
- Initial review: 1-3 business days
- Updates after approval: Usually within 24 hours
- Policy violations may take longer to resolve

## Post-Submission
- Monitor developer dashboard for review status
- Check email for any feedback from Chrome Web Store team
- Be prepared to address any policy or technical issues
- Plan marketing/announcement once approved

---

${storeDescription}
`
  
  await fs.writeFile(path.join(assetsDir, 'store-listing-guide.md'), listing)
  console.log('✅ Store listing guide created')
}

// Main function
async function generateAssets() {
  try {
    await setupDirectories()
    await generatePromoImages() 
    await generateScreenshotTemplates()
    await createStoreListingFile()
    
    console.log('\n🎉 Chrome Web Store assets generated successfully!')
    console.log('\n📋 Next steps:')
    console.log('1. Open HTML files in store-assets/promotional/ in Chrome')
    console.log('2. Take screenshots at exact dimensions required')
    console.log('3. Save as PNG files with correct names')
    console.log('4. Open HTML files in store-assets/screenshots/ for app screenshots') 
    console.log('5. Deploy privacy-policy.html to a public URL')
    console.log('6. Review store-listing-guide.md for submission details')
    console.log('\n🚀 Then proceed to Chrome Web Store submission!')
    
  } catch (error) {
    console.error('❌ Asset generation failed:', error)
    process.exit(1)
  }
}

// Run if called directly
if (require.main === module) {
  generateAssets()
}

module.exports = { generateAssets }
