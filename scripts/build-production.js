#!/usr/bin/env node

/**
 * Production Build Script for Attention Trainer Extension
 * Creates optimized, minified build ready for Chrome Web Store submission
 */

const fs = require('fs');
const path = require('path');
const { minify } = require('terser');

console.log('🚀 Starting production build for Chrome Web Store...');

// Configuration
const BUILD_DIR = path.join(__dirname, '..', 'dist');
const SRC_DIR = path.join(__dirname, '..', 'src');
const ROOT_DIR = path.join(__dirname, '..');
const ICONS_DIR = path.join(ROOT_DIR, 'icons');

// Ensure build directory exists and is clean
function setupBuildDirectory() {
  console.log('📁 Setting up build directory...');
  
  if (fs.existsSync(BUILD_DIR)) {
    fs.rmSync(BUILD_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(BUILD_DIR, { recursive: true });
  
  console.log('✅ Build directory ready');
}

// Copy and process manifest.json
function buildManifest() {
  console.log('📋 Processing manifest.json...');
  
  const manifestPath = path.join(ROOT_DIR, 'manifest.json');
  const manifestContent = fs.readFileSync(manifestPath, 'utf-8');
  const manifest = JSON.parse(manifestContent);
  
  // Update version for production if needed
  if (process.env.BUILD_VERSION) {
    manifest.version = process.env.BUILD_VERSION;
  }
  
  // Ensure production-ready settings
  manifest.name = "Attention Trainer";
  manifest.description = "Combat doom scrolling with smart interventions. Track your browsing habits and build better digital focus.";
  
  fs.writeFileSync(
    path.join(BUILD_DIR, 'manifest.json'), 
    JSON.stringify(manifest, null, 2)
  );
  
  console.log('✅ Manifest processed');
  return manifest;
}

// Minify JavaScript files
async function minifyJavaScript(filePath, outputPath) {
  const code = fs.readFileSync(filePath, 'utf-8');
  
  const result = await minify(code, {
    compress: {
      dead_code: true,
      drop_console: false, // Keep console for debugging in production
      drop_debugger: true,
      unused: true
    },
    mangle: {
      reserved: ['chrome', 'ErrorHandler', 'FallbackStorage', 'ConnectionManager'] // Preserve extension API names
    },
    format: {
      comments: false
    }
  });

  if (result.error) {
    console.warn(`⚠️ Minification warning for ${filePath}:`, result.error);
    // Fallback to original code if minification fails
    fs.writeFileSync(outputPath, code);
  } else {
    fs.writeFileSync(outputPath, result.code);
  }
}

// Process source files
async function processSourceFiles(manifest) {
  console.log('⚡ Processing and minifying source files...');
  
  // Create directory structure
  const srcSubDirs = ['background', 'content', 'popup', 'dashboard', 'shared'];
  srcSubDirs.forEach(dir => {
    const targetDir = path.join(BUILD_DIR, 'src', dir);
    fs.mkdirSync(targetDir, { recursive: true });
  });
  
  // Process JavaScript files
  const jsFiles = [
    // Background scripts
    'src/background/background.js',
    
    // Content scripts (preserve order from manifest)
    'src/shared/error-handler.js',
    'src/shared/fallback-storage.js', 
    'src/shared/connection-manager.js',
    'src/shared/index.js',
    'src/content/content.js',
    
    // Popup and dashboard
    'src/popup/popup.js',
    'src/dashboard/dashboard.js'
  ];
  
  for (const jsFile of jsFiles) {
    const srcPath = path.join(ROOT_DIR, jsFile);
    const destPath = path.join(BUILD_DIR, jsFile);
    
    if (fs.existsSync(srcPath)) {
      console.log(`🔄 Minifying ${jsFile}...`);
      await minifyJavaScript(srcPath, destPath);
    }
  }
  
  // Copy CSS files
  const cssFiles = [
    'src/content/content.css'
  ];
  
  cssFiles.forEach(cssFile => {
    const srcPath = path.join(ROOT_DIR, cssFile);
    const destPath = path.join(BUILD_DIR, cssFile);
    
    if (fs.existsSync(srcPath)) {
      console.log(`📄 Copying ${cssFile}...`);
      fs.copyFileSync(srcPath, destPath);
    }
  });
  
  // Copy HTML files
  const htmlFiles = [
    'src/popup/popup.html',
    'src/dashboard/dashboard.html'
  ];
  
  htmlFiles.forEach(htmlFile => {
    const srcPath = path.join(ROOT_DIR, htmlFile);
    const destPath = path.join(BUILD_DIR, htmlFile);
    
    if (fs.existsSync(srcPath)) {
      console.log(`🌐 Copying ${htmlFile}...`);
      fs.copyFileSync(srcPath, destPath);
    }
  });
  
  console.log('✅ Source files processed');
}

// Copy icons
function copyIcons() {
  console.log('🎨 Copying icons...');
  
  const iconsDestDir = path.join(BUILD_DIR, 'icons');
  fs.mkdirSync(iconsDestDir, { recursive: true });
  
  if (fs.existsSync(ICONS_DIR)) {
    const iconFiles = fs.readdirSync(ICONS_DIR);
    iconFiles.forEach(file => {
      if (file.endsWith('.png') || file.endsWith('.svg')) {
        fs.copyFileSync(
          path.join(ICONS_DIR, file),
          path.join(iconsDestDir, file)
        );
      }
    });
  }
  
  console.log('✅ Icons copied');
}

// Create README for distribution
function createDistributionReadme() {
  console.log('📝 Creating distribution README...');
  
  const readmeContent = `# Attention Trainer Extension - Production Build

This is the production build of Attention Trainer Extension, ready for Chrome Web Store submission.

## Version Information
- Built on: ${new Date().toISOString()}
- Environment: Production
- Target: Chrome Web Store

## Files Included
- Minified JavaScript files
- Optimized CSS and HTML
- Extension icons (16x16, 32x32, 48x48, 128x128)
- Manifest v3 configuration

## Installation
This build is intended for Chrome Web Store distribution. For development, use the source code in the parent directory.

## Support
For issues or questions, please visit: https://github.com/your-username/attention-trainer-extension
`;

  fs.writeFileSync(path.join(BUILD_DIR, 'README.md'), readmeContent);
  console.log('✅ Distribution README created');
}

// Generate build report
function generateBuildReport() {
  console.log('📊 Generating build report...');
  
  const getDirectorySize = (dirPath) => {
    let size = 0;
    if (fs.existsSync(dirPath)) {
      const files = fs.readdirSync(dirPath, { withFileTypes: true });
      for (const file of files) {
        const filePath = path.join(dirPath, file.name);
        if (file.isDirectory()) {
          size += getDirectorySize(filePath);
        } else {
          size += fs.statSync(filePath).size;
        }
      }
    }
    return size;
  };
  
  const buildSize = getDirectorySize(BUILD_DIR);
  const buildSizeMB = (buildSize / 1024 / 1024).toFixed(2);
  
  const report = {
    buildDate: new Date().toISOString(),
    buildSizeBytes: buildSize,
    buildSizeMB: buildSizeMB,
    chromeWebStoreReady: buildSize < 10 * 1024 * 1024, // Chrome Web Store limit is 10MB
    files: fs.readdirSync(BUILD_DIR, { recursive: true })
  };
  
  fs.writeFileSync(
    path.join(BUILD_DIR, 'build-report.json'), 
    JSON.stringify(report, null, 2)
  );
  
  console.log(`📦 Build size: ${buildSizeMB} MB`);
  console.log(`✅ Build report generated`);
  
  return report;
}

// Main build function
async function buildProduction() {
  try {
    const startTime = Date.now();
    
    setupBuildDirectory();
    const manifest = buildManifest();
    await processSourceFiles(manifest);
    copyIcons();
    createDistributionReadme();
    const report = generateBuildReport();
    
    const buildTime = ((Date.now() - startTime) / 1000).toFixed(2);
    
    console.log('\n🎉 Production build completed successfully!');
    console.log('📁 Build directory:', BUILD_DIR);
    console.log('⏱️ Build time:', buildTime + 's');
    console.log('📦 Package size:', report.buildSizeMB + ' MB');
    console.log('✅ Chrome Web Store ready:', report.chromeWebStoreReady ? 'Yes' : 'No');
    
    if (!report.chromeWebStoreReady) {
      console.log('⚠️ Warning: Build size exceeds Chrome Web Store limit (10MB)');
    }
    
    console.log('\n🚀 Next steps:');
    console.log('1. Load dist/ folder in Chrome to test the build');
    console.log('2. Create .zip file: npm run package:store');
    console.log('3. Submit to Chrome Web Store');
    
  } catch (error) {
    console.error('❌ Build failed:', error);
    process.exit(1);
  }
}

// Run build if called directly
if (require.main === module) {
  buildProduction();
}

module.exports = { buildProduction };
