#!/usr/bin/env node

/**
 * Chrome Web Store Packaging Script
 * Creates a .zip file ready for Chrome Web Store submission
 */

const fs = require('fs');
const path = require('path');
const archiver = require('archiver');

const BUILD_DIR = path.join(__dirname, '..', 'dist');
const OUTPUT_FILE = path.join(__dirname, '..', 'chrome-store.zip');

console.log('📦 Creating Chrome Web Store package...');

// Check if build directory exists
if (!fs.existsSync(BUILD_DIR)) {
  console.error('❌ Build directory not found. Run "npm run build:prod" first.');
  process.exit(1);
}

// Remove existing zip file
if (fs.existsSync(OUTPUT_FILE)) {
  fs.unlinkSync(OUTPUT_FILE);
  console.log('🗑️ Removed existing zip file');
}

// Create zip file
const output = fs.createWriteStream(OUTPUT_FILE);
const archive = archiver('zip', { zlib: { level: 9 } }); // Maximum compression

output.on('close', () => {
  const sizeBytes = archive.pointer();
  const sizeMB = (sizeBytes / 1024 / 1024).toFixed(2);
  
  console.log('✅ Chrome Web Store package created successfully!');
  console.log(`📁 File: ${OUTPUT_FILE}`);
  console.log(`📦 Size: ${sizeMB} MB (${sizeBytes} bytes)`);
  
  if (sizeBytes > 10 * 1024 * 1024) {
    console.log('⚠️ Warning: Package exceeds Chrome Web Store limit (10MB)');
  } else {
    console.log('✅ Package size is within Chrome Web Store limits');
  }
  
  console.log('\n🚀 Ready for Chrome Web Store submission!');
  console.log('Next steps:');
  console.log('1. Go to https://chrome.google.com/webstore/developer/dashboard');
  console.log('2. Click "New Item" and upload chrome-store.zip');
  console.log('3. Fill in store listing details');
  console.log('4. Submit for review');
});

output.on('error', (err) => {
  console.error('❌ Error creating zip file:', err);
  process.exit(1);
});

archive.on('error', (err) => {
  console.error('❌ Archive error:', err);
  process.exit(1);
});

// Pipe archive data to the file
archive.pipe(output);

// Add files from build directory
console.log('📁 Adding files to package...');
archive.directory(BUILD_DIR, false);

// Finalize the archive
archive.finalize();
