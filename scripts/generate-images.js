#!/usr/bin/env node

/**
 * Chrome Web Store Image Generator
 * Captures promotional images and screenshots from HTML templates using Puppeteer
 */

const puppeteer = require('puppeteer')
const fs = require('fs-extra')
const path = require('path')

console.log('📸 Generating Chrome Web Store Images...')

const projectRoot = path.resolve(__dirname, '..')
const assetsDir = path.join(projectRoot, 'store-assets')
const promotionalDir = path.join(assetsDir, 'promotional')
const screenshotsDir = path.join(assetsDir, 'screenshots')

// Configuration for promotional images
const promoConfigs = [
  {
    htmlFile: 'small-promo-440x280.html',
    outputFile: 'small-promo-440x280.png',
    width: 440,
    height: 280,
    description: 'Small promotional tile'
  },
  {
    htmlFile: 'large-promo-920x680.html', 
    outputFile: 'large-promo-920x680.png',
    width: 920,
    height: 680,
    description: 'Large promotional tile'
  },
  {
    htmlFile: 'marquee-1280x800.html',
    outputFile: 'marquee-1280x800.png', 
    width: 1280,
    height: 800,
    description: 'Marquee promotional tile'
  }
]

// Configuration for screenshots
const screenshotConfigs = [
  {
    htmlFile: 'popup-interface.html',
    outputFile: 'screenshot-1-popup-interface.png',
    width: 1280,
    height: 800,
    description: 'Extension popup interface'
  },
  {
    htmlFile: 'analytics-dashboard.html',
    outputFile: 'screenshot-2-analytics-dashboard.png',
    width: 1280,
    height: 800,
    description: 'Analytics dashboard'
  },
  {
    htmlFile: 'intervention-overlay.html',
    outputFile: 'screenshot-3-intervention-overlay.png',
    width: 1280,
    height: 800,
    description: 'Intervention overlay in action'
  }
]

// Capture screenshot from HTML file
async function captureScreenshot(browser, config, inputDir, outputDir) {
  const page = await browser.newPage()
  
  try {
    // Set viewport to exact dimensions
    await page.setViewport({
      width: config.width,
      height: config.height,
      deviceScaleFactor: 1
    })
    
    // Load HTML file
    const htmlPath = path.join(inputDir, config.htmlFile)
    const fileUrl = `file://${htmlPath.replace(/\\/g, '/')}`
    
    console.log(`  📷 Capturing ${config.description}...`)
    await page.goto(fileUrl, { waitUntil: 'networkidle0' })
    
    // Wait a moment for any animations
    await page.waitForTimeout(500)
    
    // Take screenshot
    const outputPath = path.join(outputDir, config.outputFile)
    await page.screenshot({
      path: outputPath,
      type: 'png',
      clip: {
        x: 0,
        y: 0,
        width: config.width,
        height: config.height
      }
    })
    
    console.log(`    ✅ Saved ${config.outputFile}`)
    
  } catch (error) {
    console.error(`    ❌ Failed to capture ${config.outputFile}:`, error.message)
    throw error
  } finally {
    await page.close()
  }
}

// Generate all promotional images
async function generatePromotionalImages(browser) {
  console.log('🖼️ Generating promotional images...')
  
  for (const config of promoConfigs) {
    await captureScreenshot(browser, config, promotionalDir, promotionalDir)
  }
}

// Generate all screenshot images  
async function generateScreenshotImages(browser) {
  console.log('📸 Generating screenshot images...')
  
  for (const config of screenshotConfigs) {
    await captureScreenshot(browser, config, screenshotsDir, screenshotsDir)
  }
}

// Create image manifest
async function createImageManifest() {
  console.log('📝 Creating image manifest...')
  
  const manifest = {
    generated: new Date().toISOString(),
    promotional_images: promoConfigs.map(config => ({
      file: config.outputFile,
      dimensions: `${config.width}x${config.height}`,
      description: config.description,
      size_kb: 'TBD'
    })),
    screenshots: screenshotConfigs.map(config => ({
      file: config.outputFile, 
      dimensions: `${config.width}x${config.height}`,
      description: config.description,
      size_kb: 'TBD'
    })),
    requirements: {
      promotional_images: {
        small_tile: '440x280 PNG',
        large_tile: '920x680 PNG', 
        marquee_tile: '1280x800 PNG'
      },
      screenshots: {
        dimensions: '1280x800 PNG',
        count: '1-5 images',
        purpose: 'Show extension functionality'
      }
    },
    next_steps: [
      'Review generated images for quality',
      'Verify file sizes are reasonable (< 1MB each)', 
      'Upload to Chrome Web Store during submission',
      'Test images display correctly in store listing preview'
    ]
  }
  
  // Get actual file sizes
  for (const img of manifest.promotional_images) {
    try {
      const filePath = path.join(promotionalDir, img.file)
      const stats = await fs.stat(filePath)
      img.size_kb = Math.round(stats.size / 1024)
    } catch (error) {
      img.size_kb = 'Error'
    }
  }
  
  for (const img of manifest.screenshots) {
    try {
      const filePath = path.join(screenshotsDir, img.file)
      const stats = await fs.stat(filePath)
      img.size_kb = Math.round(stats.size / 1024)
    } catch (error) {
      img.size_kb = 'Error'
    }
  }
  
  await fs.writeFile(
    path.join(assetsDir, 'image-manifest.json'),
    JSON.stringify(manifest, null, 2)
  )
  
  console.log('✅ Image manifest created')
}

// Main function
async function generateImages() {
  let browser = null
  
  try {
    console.log('🚀 Starting Puppeteer...')
    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--single-process', // For compatibility
        '--disable-gpu'
      ]
    })
    
    await generatePromotionalImages(browser)
    await generateScreenshotImages(browser)
    await createImageManifest()
    
    console.log('\n🎉 All images generated successfully!')
    console.log('\n📋 Generated files:')
    console.log('Promotional images:')
    for (const config of promoConfigs) {
      console.log(`  ✅ ${config.outputFile} (${config.width}x${config.height})`)
    }
    console.log('Screenshots:')
    for (const config of screenshotConfigs) {
      console.log(`  ✅ ${config.outputFile} (${config.width}x${config.height})`)
    }
    console.log('\n🔍 Check image-manifest.json for file details')
    console.log('🚀 Ready for Chrome Web Store submission!')
    
  } catch (error) {
    console.error('❌ Image generation failed:', error)
    process.exit(1)
  } finally {
    if (browser) {
      await browser.close()
    }
  }
}

// Run if called directly
if (require.main === module) {
  generateImages()
}

module.exports = { generateImages }
