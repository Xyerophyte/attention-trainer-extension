/**
 * Fallback Storage - IndexedDB-based storage for when Chrome storage is unavailable
 * Provides seamless fallback during extension context invalidation
 */

class FallbackStorage {
  constructor () {
    this.dbName = 'AttentionTrainerFallback'
    this.dbVersion = 1
    this.db = null
    this.initialized = false
    this.storeName = 'analytics'
    this.settingsStore = 'settings'
  }

  /**
   * Initialize IndexedDB
   */
  async init () {
    if (this.initialized) {
      return true
    }

    try {
      return new Promise((resolve, reject) => {
        const request = indexedDB.open(this.dbName, this.dbVersion)

        request.onerror = () => {
          console.error('Failed to open IndexedDB:', request.error)
          reject(request.error)
        }

        request.onsuccess = () => {
          this.db = request.result
          this.initialized = true
          console.log('✅ Fallback storage initialized')
          resolve(true)
        }

        request.onupgradeneeded = (event) => {
          const db = event.target.result

          // Create analytics store
          if (!db.objectStoreNames.contains(this.storeName)) {
            const analyticsStore = db.createObjectStore(this.storeName, { keyPath: 'key' })
            analyticsStore.createIndex('domain', 'domain', { unique: false })
            analyticsStore.createIndex('date', 'date', { unique: false })
            analyticsStore.createIndex('timestamp', 'timestamp', { unique: false })
          }

          // Create settings store
          if (!db.objectStoreNames.contains(this.settingsStore)) {
            db.createObjectStore(this.settingsStore, { keyPath: 'key' })
          }

          console.log('📊 IndexedDB schema created')
        }
      })
    } catch (error) {
      console.error('IndexedDB initialization failed:', error)
      return false
    }
  }

  /**
   * Store analytics data
   */
  async storeAnalytics (domain, date, data) {
    await this.ensureInitialized()

    const key = `analytics_${domain}_${date}`
    const record = {
      key,
      domain,
      date,
      data,
      timestamp: Date.now()
    }

    return this.writeToStore(this.storeName, record)
  }

  /**
   * Get analytics data
   */
  async getAnalytics (domain = null, dateRange = null) {
    await this.ensureInitialized()

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.storeName], 'readonly')
      const store = transaction.objectStore('analytics')
      const results = []

      let request
      if (domain) {
        const index = store.index('domain')
        request = index.openCursor(IDBKeyRange.only(domain))
      } else {
        request = store.openCursor()
      }

      request.onsuccess = (event) => {
        const cursor = event.target.result
        if (cursor) {
          const record = cursor.value

          // Filter by date range if specified
          if (dateRange) {
            const recordDate = new Date(record.date)
            if (recordDate >= dateRange.start && recordDate <= dateRange.end) {
              results.push(record)
            }
          } else {
            results.push(record)
          }

          cursor.continue()
        } else {
          resolve(results)
        }
      }

      request.onerror = () => {
        console.error('Failed to read analytics:', request.error)
        reject(request.error)
      }
    })
  }

  /**
   * Store settings
   */
  async storeSetting (key, value) {
    await this.ensureInitialized()

    const record = {
      key,
      value,
      timestamp: Date.now()
    }

    return this.writeToStore(this.settingsStore, record)
  }

  /**
   * Get setting
   */
  async getSetting (key) {
    await this.ensureInitialized()

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.settingsStore], 'readonly')
      const store = transaction.objectStore(this.settingsStore)
      const request = store.get(key)

      request.onsuccess = () => {
        const result = request.result
        resolve(result ? result.value : null)
      }

      request.onerror = () => {
        console.error('Failed to read setting:', request.error)
        reject(request.error)
      }
    })
  }

  /**
   * Get all settings
   */
  async getAllSettings () {
    await this.ensureInitialized()

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.settingsStore], 'readonly')
      const store = transaction.objectStore(this.settingsStore)
      const request = store.getAll()

      request.onsuccess = () => {
        const results = request.result || []
        const settings = {}

        results.forEach(record => {
          settings[record.key] = record.value
        })

        resolve(settings)
      }

      request.onerror = () => {
        console.error('Failed to read all settings:', request.error)
        reject(request.error)
      }
    })
  }

  /**
   * Sync data to Chrome storage when connection is restored
   */
  async syncToChrome () {
    if (!chrome?.storage?.local) {
      console.warn('Chrome storage not available for sync')
      return false
    }

    try {
      await this.ensureInitialized()

      // Sync analytics data
      const analytics = await this.getAnalytics()
      if (analytics.length > 0) {
        const chromeAnalytics = await this.getChromeAnalytics()

        // Merge analytics data
        analytics.forEach(record => {
          const { domain, date, data } = record

          if (!chromeAnalytics.dailyStats) {
            chromeAnalytics.dailyStats = {}
          }

          if (!chromeAnalytics.dailyStats[date]) {
            chromeAnalytics.dailyStats[date] = {}
          }

          if (!chromeAnalytics.dailyStats[date][domain]) {
            chromeAnalytics.dailyStats[date][domain] = data
          } else {
            // Merge data (take the most recent values)
            Object.assign(chromeAnalytics.dailyStats[date][domain], data)
          }
        })

        await chrome.storage.local.set({ analytics: chromeAnalytics })
        console.log('✅ Analytics data synced to Chrome storage')
      }

      // Sync settings
      const settings = await this.getAllSettings()
      if (Object.keys(settings).length > 0) {
        await chrome.storage.local.set(settings)
        console.log('✅ Settings synced to Chrome storage')
      }

      return true
    } catch (error) {
      console.error('Failed to sync to Chrome storage:', error)
      return false
    }
  }

  /**
   * Import data from Chrome storage
   */
  async importFromChrome () {
    if (!chrome?.storage?.local) {
      console.warn('Chrome storage not available for import')
      return false
    }

    try {
      await this.ensureInitialized()

      // Import analytics
      const chromeData = await chrome.storage.local.get(['analytics'])
      if (chromeData.analytics?.dailyStats) {
        const dailyStats = chromeData.analytics.dailyStats

        for (const [date, domains] of Object.entries(dailyStats)) {
          for (const [domain, data] of Object.entries(domains)) {
            await this.storeAnalytics(domain, date, data)
          }
        }

        console.log('✅ Analytics imported from Chrome storage')
      }

      // Import settings (all keys except analytics)
      const allChromeData = await chrome.storage.local.get()
      for (const [key, value] of Object.entries(allChromeData)) {
        if (key !== 'analytics') {
          await this.storeSetting(key, value)
        }
      }

      console.log('✅ Settings imported from Chrome storage')
      return true
    } catch (error) {
      console.error('Failed to import from Chrome storage:', error)
      return false
    }
  }

  /**
   * Clean up old data (90 days retention)
   */
  async cleanup (retentionDays = 90) {
    await this.ensureInitialized()

    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays)
    const cutoffTimestamp = cutoffDate.getTime()

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.storeName], 'readwrite')
      const store = transaction.objectStore(this.storeName)
      const index = store.index('timestamp')
      const request = index.openCursor(IDBKeyRange.upperBound(cutoffTimestamp))

      let deletedCount = 0

      request.onsuccess = (event) => {
        const cursor = event.target.result
        if (cursor) {
          cursor.delete()
          deletedCount++
          cursor.continue()
        } else {
          console.log(`🧹 Cleaned up ${deletedCount} old fallback records`)
          resolve(deletedCount)
        }
      }

      request.onerror = () => {
        console.error('Failed to cleanup old data:', request.error)
        reject(request.error)
      }
    })
  }

  /**
   * Get current database statistics
   */
  async getStats () {
    await this.ensureInitialized()

    const analyticsCount = await this.getRecordCount(this.storeName)
    const settingsCount = await this.getRecordCount(this.settingsStore)

    return {
      analyticsRecords: analyticsCount,
      settingsRecords: settingsCount,
      initialized: this.initialized,
      dbName: this.dbName,
      dbVersion: this.dbVersion
    }
  }

  /**
   * Helper methods
   */

  async ensureInitialized () {
    if (!this.initialized) {
      await this.init()
    }

    if (!this.initialized) {
      throw new Error('Fallback storage not available')
    }
  }

  async writeToStore (storeName, record) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([storeName], 'readwrite')
      const store = transaction.objectStore(storeName)
      const request = store.put(record)

      request.onsuccess = () => resolve(true)
      request.onerror = () => {
        console.error('Failed to write to store:', request.error)
        reject(request.error)
      }
    })
  }

  async getRecordCount (storeName) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([storeName], 'readonly')
      const store = transaction.objectStore(storeName)
      const request = store.count()

      request.onsuccess = () => resolve(request.result)
      request.onerror = () => {
        console.error('Failed to count records:', request.error)
        reject(request.error)
      }
    })
  }

  async getChromeAnalytics () {
    try {
      const result = await chrome.storage.local.get(['analytics'])
      return result.analytics || { dailyStats: {}, interventions: [] }
    } catch (error) {
      return { dailyStats: {}, interventions: [] }
    }
  }

  /**
   * Clear all fallback data
   */
  async clear () {
    await this.ensureInitialized()

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.storeName, this.settingsStore], 'readwrite')

      const _clearAnalytics = transaction.objectStore(this.storeName).clear()
      const _clearSettings = transaction.objectStore(this.settingsStore).clear()

      transaction.oncomplete = () => {
        console.log('🧹 All fallback storage cleared')
        resolve(true)
      }

      transaction.onerror = () => {
        console.error('Failed to clear fallback storage:', transaction.error)
        reject(transaction.error)
      }
    })
  }
}

// Export for use in other components
if (typeof module !== 'undefined' && module.exports) {
  module.exports = FallbackStorage
} else {
  window.FallbackStorage = FallbackStorage
}
