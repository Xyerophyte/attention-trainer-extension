/**
 * Performance Test Script
 * Analyzes bundle size, memory usage, and performance metrics
 */

const fs = require('fs')
const path = require('path')

const EXTENSION_PATH = path.resolve(__dirname, '../../')
const DIST_PATH = path.join(EXTENSION_PATH, 'dist')

// Simple test to make Jest happy
describe('Performance Analysis', () => {
  test('module exports required functions', () => {
    expect(typeof analyzeBundle).toBe('function')
    expect(typeof runPerformanceTests).toBe('function')
  })
})

async function analyzeBundle () {
  console.log('🔍 Analyzing extension bundle...')

  if (!fs.existsSync(DIST_PATH)) {
    console.error('❌ Build not found. Run npm run build:prod first.')
    process.exit(1)
  }

  const results = {
    totalSize: 0,
    files: [],
    performance: {
      bundleSize: 'unknown',
      status: 'unknown'
    }
  }

  // Analyze files
  function analyzeDirectory (dirPath, basePath = '') {
    const items = fs.readdirSync(dirPath)

    items.forEach(item => {
      const fullPath = path.join(dirPath, item)
      const relativePath = path.join(basePath, item)
      const stats = fs.statSync(fullPath)

      if (stats.isDirectory()) {
        analyzeDirectory(fullPath, relativePath)
      } else {
        const size = stats.size
        results.totalSize += size
        results.files.push({
          path: relativePath,
          size,
          sizeKB: (size / 1024).toFixed(2),
          sizeMB: (size / (1024 * 1024)).toFixed(3)
        })
      }
    })
  }

  analyzeDirectory(DIST_PATH)

  // Sort files by size
  results.files.sort((a, b) => b.size - a.size)

  // Calculate performance metrics
  const totalMB = results.totalSize / (1024 * 1024)
  const chromeWebStoreLimit = 5 * 1024 * 1024 // 5MB

  results.performance = {
    bundleSize: totalMB.toFixed(2) + ' MB',
    status: results.totalSize < chromeWebStoreLimit ? 'PASS' : 'FAIL',
    percentOfLimit: ((results.totalSize / chromeWebStoreLimit) * 100).toFixed(1) + '%',
    remainingSpace: ((chromeWebStoreLimit - results.totalSize) / (1024 * 1024)).toFixed(2) + ' MB'
  }

  return results
}

async function runPerformanceTests () {
  console.log('🚀 Running Performance Tests\n')

  try {
    const bundleAnalysis = await analyzeBundle()

    // Display results
    console.log('📊 Bundle Analysis:')
    console.log(`Total Size: ${bundleAnalysis.performance.bundleSize}`)
    console.log(`Status: ${bundleAnalysis.performance.status}`)
    console.log(`Chrome Web Store Limit Usage: ${bundleAnalysis.performance.percentOfLimit}`)
    console.log(`Remaining Space: ${bundleAnalysis.performance.remainingSpace}\n`)

    console.log('📂 Largest Files:')
    bundleAnalysis.files.slice(0, 10).forEach((file, index) => {
      console.log(`${index + 1}. ${file.path} - ${file.sizeKB} KB`)
    })

    console.log('\n📋 Performance Summary:')
    console.log(`✅ Total Files: ${bundleAnalysis.files.length}`)
    console.log(`✅ Bundle Size: ${bundleAnalysis.performance.bundleSize}`)
    console.log(`${bundleAnalysis.performance.status === 'PASS' ? '✅' : '❌'} Chrome Web Store Compliance: ${bundleAnalysis.performance.status}`)

    // Performance recommendations
    console.log('\n💡 Recommendations:')

    if (bundleAnalysis.totalSize > 3 * 1024 * 1024) { // Over 3MB
      console.log('⚠️  Bundle size is getting large. Consider:')
      console.log('   - Code splitting for optional features')
      console.log('   - Lazy loading of non-critical components')
      console.log('   - Image optimization and compression')
    }

    const jsFiles = bundleAnalysis.files.filter(f => f.path.endsWith('.js'))
    const totalJSSize = jsFiles.reduce((sum, f) => sum + f.size, 0)

    if (totalJSSize > 1 * 1024 * 1024) { // Over 1MB of JS
      console.log('⚠️  JavaScript bundle is large. Consider:')
      console.log('   - Tree shaking unused code')
      console.log('   - Minification optimization')
      console.log('   - Removing unused dependencies')
    }

    // Generate performance report
    const reportPath = path.join(EXTENSION_PATH, 'performance-report.json')
    fs.writeFileSync(reportPath, JSON.stringify({
      timestamp: new Date().toISOString(),
      results: bundleAnalysis,
      recommendations: bundleAnalysis.performance.status === 'PASS'
        ? ['Bundle size is within acceptable limits']
        : ['Reduce bundle size to meet Chrome Web Store requirements']
    }, null, 2))

    console.log(`\n📄 Performance report saved to: ${reportPath}`)

    // Exit with appropriate code
    if (bundleAnalysis.performance.status === 'FAIL') {
      console.log('\n❌ Performance tests failed due to bundle size limit')
      process.exit(1)
    } else {
      console.log('\n✅ All performance tests passed')
      process.exit(0)
    }
  } catch (error) {
    console.error('❌ Performance analysis failed:', error.message)
    process.exit(1)
  }
}

// Run if called directly
if (require.main === module) {
  runPerformanceTests()
}

module.exports = {
  analyzeBundle,
  runPerformanceTests
}
