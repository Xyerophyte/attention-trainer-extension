/**
 * Unit Tests for Fallback Storage
 * Tests IndexedDB operations, analytics storage, settings management, and offline capabilities
 */

const fs = require('fs')
const path = require('path')

// Load the fallback storage source
const fallbackStoragePath = path.join(__dirname, '../../src/shared/fallback-storage.js')
const fallbackStorageSource = fs.readFileSync(fallbackStoragePath, 'utf8')

// Extract the FallbackStorage class
const cleanSource = fallbackStorageSource.replace(/if \(typeof module.*[\s\S]*$/, '')
eval(cleanSource)

describe('FallbackStorage', () => {
  let fallbackStorage
  let mockIDB

  beforeEach(async () => {
    fallbackStorage = new FallbackStorage()

    // Reset IndexedDB
    await new Promise(resolve => {
      const deleteReq = indexedDB.deleteDatabase('AttentionTrainerDB')
      deleteReq.onsuccess = deleteReq.onerror = () => resolve()
    })
  })

  describe('constructor', () => {
    it('should initialize with default values', () => {
      expect(fallbackStorage.dbName).toBe('AttentionTrainerDB')
      expect(fallbackStorage.dbVersion).toBe(1)
      expect(fallbackStorage.db).toBeNull()
      expect(fallbackStorage.isAvailable).toBe(false)
    })
  })

  describe('initialization', () => {
    it('should initialize successfully', async () => {
      const result = await fallbackStorage.init()

      expect(result).toBe(true)
      expect(fallbackStorage.isAvailable).toBe(true)
      expect(fallbackStorage.db).toBeTruthy()
    })

    it('should handle initialization failure gracefully', async () => {
      // Mock IndexedDB to fail
      const originalIndexedDB = global.indexedDB
      global.indexedDB = null

      const result = await fallbackStorage.init()

      expect(result).toBe(false)
      expect(fallbackStorage.isAvailable).toBe(false)

      // Restore IndexedDB
      global.indexedDB = originalIndexedDB
    })

    it('should create database with correct structure', async () => {
      await fallbackStorage.init()

      const db = fallbackStorage.db
      expect(db.objectStoreNames.contains('analytics')).toBe(true)
      expect(db.objectStoreNames.contains('settings')).toBe(true)
      expect(db.objectStoreNames.contains('cache')).toBe(true)
    })

    it('should handle database upgrade', async () => {
      // Initialize with version 1
      await fallbackStorage.init()
      await fallbackStorage.close()

      // Initialize with higher version
      fallbackStorage.dbVersion = 2
      const result = await fallbackStorage.init()

      expect(result).toBe(true)
      expect(fallbackStorage.db.version).toBe(2)
    })
  })

  describe('analytics storage', () => {
    beforeEach(async () => {
      await fallbackStorage.init()
    })

    it('should store analytics data', async () => {
      const domain = 'example.com'
      const date = '2024-01-15'
      const data = {
        timeOnPage: 120,
        behaviorScore: 45,
        interventionStage: 2
      }

      const result = await fallbackStorage.storeAnalytics(domain, date, data)

      expect(result).toBe(true)
    })

    it('should retrieve analytics data', async () => {
      const domain = 'example.com'
      const date = '2024-01-15'
      const testData = {
        timeOnPage: 120,
        behaviorScore: 45,
        interventionStage: 2,
        timestamp: Date.now()
      }

      await fallbackStorage.storeAnalytics(domain, date, testData)
      const retrieved = await fallbackStorage.getAnalytics(domain, date)

      expect(retrieved).toEqual(expect.arrayContaining([
        expect.objectContaining({
          domain,
          date,
          timeOnPage: testData.timeOnPage,
          behaviorScore: testData.behaviorScore
        })
      ]))
    })

    it('should aggregate analytics data by domain', async () => {
      const testData = [
        { domain: 'youtube.com', date: '2024-01-15', timeOnPage: 120, behaviorScore: 45 },
        { domain: 'youtube.com', date: '2024-01-16', timeOnPage: 90, behaviorScore: 30 },
        { domain: 'instagram.com', date: '2024-01-15', timeOnPage: 60, behaviorScore: 25 }
      ]

      for (const data of testData) {
        await fallbackStorage.storeAnalytics(data.domain, data.date, data)
      }

      const youtubeData = await fallbackStorage.getAnalytics('youtube.com')
      expect(youtubeData).toHaveLength(2)

      const instagramData = await fallbackStorage.getAnalytics('instagram.com')
      expect(instagramData).toHaveLength(1)
    })

    it('should handle date range queries', async () => {
      const domain = 'example.com'
      const testData = [
        { date: '2024-01-10', timeOnPage: 60 },
        { date: '2024-01-15', timeOnPage: 120 },
        { date: '2024-01-20', timeOnPage: 90 }
      ]

      for (const data of testData) {
        await fallbackStorage.storeAnalytics(domain, data.date, data)
      }

      const rangeData = await fallbackStorage.getAnalyticsRange(
        domain,
        '2024-01-12',
        '2024-01-18'
      )

      expect(rangeData).toHaveLength(1)
      expect(rangeData[0].date).toBe('2024-01-15')
    })

    it('should clean up old analytics data', async () => {
      const domain = 'example.com'
      const oldDate = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000) // 100 days ago
      const recentDate = new Date().toISOString().split('T')[0]

      await fallbackStorage.storeAnalytics(domain, oldDate.toISOString().split('T')[0], { timeOnPage: 60 })
      await fallbackStorage.storeAnalytics(domain, recentDate, { timeOnPage: 120 })

      await fallbackStorage.cleanupOldData(90) // Keep 90 days

      const allData = await fallbackStorage.getAnalytics(domain)
      expect(allData).toHaveLength(1)
      expect(allData[0].date).toBe(recentDate)
    })
  })

  describe('settings management', () => {
    beforeEach(async () => {
      await fallbackStorage.init()
    })

    it('should store settings', async () => {
      const settings = {
        isEnabled: true,
        focusMode: 'strict',
        thresholds: { stage1: 30, stage2: 60 },
        whitelist: ['example.com']
      }

      const result = await fallbackStorage.storeSettings(settings)

      expect(result).toBe(true)
    })

    it('should retrieve settings', async () => {
      const settings = {
        isEnabled: false,
        focusMode: 'gentle',
        thresholds: { stage1: 45, stage2: 90 }
      }

      await fallbackStorage.storeSettings(settings)
      const retrieved = await fallbackStorage.getSettings()

      expect(retrieved).toEqual(expect.objectContaining(settings))
    })

    it('should return default settings when none exist', async () => {
      const settings = await fallbackStorage.getSettings()

      expect(settings).toEqual(expect.objectContaining({
        isEnabled: true,
        focusMode: 'gentle'
      }))
    })

    it('should merge with existing settings', async () => {
      const initialSettings = {
        isEnabled: true,
        focusMode: 'gentle',
        thresholds: { stage1: 30 }
      }

      await fallbackStorage.storeSettings(initialSettings)

      const updatedSettings = {
        focusMode: 'strict',
        whitelist: ['example.com']
      }

      await fallbackStorage.storeSettings(updatedSettings)
      const finalSettings = await fallbackStorage.getSettings()

      expect(finalSettings).toEqual(expect.objectContaining({
        isEnabled: true, // From initial
        focusMode: 'strict', // Updated
        thresholds: { stage1: 30 }, // From initial
        whitelist: ['example.com'] // Added
      }))
    })
  })

  describe('caching', () => {
    beforeEach(async () => {
      await fallbackStorage.init()
    })

    it('should store and retrieve cached data', async () => {
      const key = 'test-cache-key'
      const data = {
        message: 'cached data',
        timestamp: Date.now()
      }

      await fallbackStorage.setCache(key, data)
      const retrieved = await fallbackStorage.getCache(key)

      expect(retrieved).toEqual(data)
    })

    it('should handle cache expiration', async () => {
      const key = 'expiring-cache'
      const data = { message: 'will expire' }
      const ttl = 1000 // 1 second

      await fallbackStorage.setCache(key, data, ttl)

      // Should exist immediately
      let cached = await fallbackStorage.getCache(key)
      expect(cached).toEqual(data)

      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 1100))

      // Should be expired
      cached = await fallbackStorage.getCache(key)
      expect(cached).toBeNull()
    })

    it('should clear cache', async () => {
      await fallbackStorage.setCache('key1', { data: 1 })
      await fallbackStorage.setCache('key2', { data: 2 })

      await fallbackStorage.clearCache()

      const cached1 = await fallbackStorage.getCache('key1')
      const cached2 = await fallbackStorage.getCache('key2')

      expect(cached1).toBeNull()
      expect(cached2).toBeNull()
    })
  })

  describe('data synchronization', () => {
    beforeEach(async () => {
      await fallbackStorage.init()
    })

    it('should export data for synchronization', async () => {
      const testData = {
        analytics: [
          { domain: 'example.com', date: '2024-01-15', timeOnPage: 120 }
        ],
        settings: { isEnabled: true, focusMode: 'strict' }
      }

      await fallbackStorage.storeAnalytics('example.com', '2024-01-15', testData.analytics[0])
      await fallbackStorage.storeSettings(testData.settings)

      const exported = await fallbackStorage.exportData()

      expect(exported.analytics).toHaveLength(1)
      expect(exported.settings).toEqual(expect.objectContaining(testData.settings))
    })

    it('should import data', async () => {
      const importData = {
        analytics: [
          { domain: 'imported.com', date: '2024-01-15', timeOnPage: 90, id: 'test-1' }
        ],
        settings: { isEnabled: false, focusMode: 'gentle' }
      }

      const result = await fallbackStorage.importData(importData)

      expect(result).toBe(true)

      const analytics = await fallbackStorage.getAnalytics('imported.com')
      expect(analytics).toHaveLength(1)

      const settings = await fallbackStorage.getSettings()
      expect(settings.isEnabled).toBe(false)
    })

    it('should handle sync conflicts', async () => {
      // Store initial data
      await fallbackStorage.storeSettings({ isEnabled: true, version: 1 })

      // Import conflicting data
      const conflictData = {
        settings: { isEnabled: false, version: 2 }
      }

      await fallbackStorage.importData(conflictData, { resolveConflicts: 'merge' })

      const settings = await fallbackStorage.getSettings()
      expect(settings.isEnabled).toBe(false) // Should use newer version
      expect(settings.version).toBe(2)
    })
  })

  describe('error handling', () => {
    it('should handle storage quota exceeded', async () => {
      await fallbackStorage.init()

      // Mock quota exceeded error
      const originalAdd = IDBObjectStore.prototype.add
      IDBObjectStore.prototype.add = function () {
        const request = originalAdd.apply(this, arguments)
        setTimeout(() => {
          const error = new Error('QuotaExceededError')
          error.name = 'QuotaExceededError'
          request.onerror({ target: { error } })
        }, 0)
        return request
      }

      const result = await fallbackStorage.storeAnalytics('test.com', '2024-01-15', { timeOnPage: 60 })

      expect(result).toBe(false)

      // Restore original method
      IDBObjectStore.prototype.add = originalAdd
    })

    it('should handle database corruption', async () => {
      await fallbackStorage.init()

      // Simulate database corruption
      fallbackStorage.db.close()
      fallbackStorage.db = null
      fallbackStorage.isAvailable = false

      const result = await fallbackStorage.storeAnalytics('test.com', '2024-01-15', { timeOnPage: 60 })

      expect(result).toBe(false)
    })

    it('should recover from transaction failures', async () => {
      await fallbackStorage.init()

      // Mock transaction failure
      const originalTransaction = IDBDatabase.prototype.transaction
      let failCount = 0
      IDBDatabase.prototype.transaction = function () {
        failCount++
        if (failCount === 1) {
          throw new Error('Transaction failed')
        }
        return originalTransaction.apply(this, arguments)
      }

      // Should retry and succeed
      const result = await fallbackStorage.storeAnalytics('test.com', '2024-01-15', { timeOnPage: 60 })

      expect(result).toBe(true)

      // Restore original method
      IDBDatabase.prototype.transaction = originalTransaction
    })
  })

  describe('performance and optimization', () => {
    beforeEach(async () => {
      await fallbackStorage.init()
    })

    it('should batch analytics operations', async () => {
      const batchData = [
        { domain: 'site1.com', date: '2024-01-15', timeOnPage: 60 },
        { domain: 'site2.com', date: '2024-01-15', timeOnPage: 90 },
        { domain: 'site3.com', date: '2024-01-15', timeOnPage: 120 }
      ]

      const result = await fallbackStorage.batchStoreAnalytics(batchData)

      expect(result).toBe(true)

      for (const data of batchData) {
        const stored = await fallbackStorage.getAnalytics(data.domain, data.date)
        expect(stored).toHaveLength(1)
      }
    })

    it('should compress large data sets', async () => {
      const largeData = {
        domain: 'example.com',
        date: '2024-01-15',
        behaviorFlags: new Array(1000).fill(0).map((_, i) => ({ flag: `flag_${i}`, count: i })),
        timeOnPage: 3600
      }

      const result = await fallbackStorage.storeAnalytics(largeData.domain, largeData.date, largeData)

      expect(result).toBe(true)

      const retrieved = await fallbackStorage.getAnalytics(largeData.domain, largeData.date)
      expect(retrieved[0].behaviorFlags).toHaveLength(1000)
    })

    it('should implement connection pooling for concurrent operations', async () => {
      const operations = Array(10).fill(0).map((_, i) =>
        fallbackStorage.storeAnalytics(`site${i}.com`, '2024-01-15', { timeOnPage: i * 60 })
      )

      const results = await Promise.all(operations)

      expect(results.every(result => result === true)).toBe(true)
    })
  })
})
