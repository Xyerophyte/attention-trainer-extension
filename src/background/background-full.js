// Background service worker for Attention Trainer
console.log('Attention Trainer background script loading...')

class AttentionTrainerBackground {
  constructor () {
    this.pendingStorageUpdates = new Map()
    this.storageUpdateTimeout = null
    this.STORAGE_BATCH_DELAY = 1000 // Batch storage updates for 1 second
    this.DATA_RETENTION_DAYS = 90 // Keep data for 90 days

    this.setupEventListeners()
    this.initializeStorage()

    // Schedule periodic cleanup
    this.schedulePeriodicCleanup()

    console.log('Attention Trainer background service initialized')
  }

  setupEventListeners () {
    // Handle extension installation
    chrome.runtime.onInstalled.addListener(() => {
      this.initializeStorage()
    })

    // Handle messages from content scripts
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      this.handleMessage(message, sender, sendResponse)
      return true // Keep message channel open for async response
    })

    // Handle tab updates to reset scroll tracking
    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      if (changeInfo.status === 'complete' && tab.url) {
        this.resetTabScrollData(tabId, tab.url)
      }
    })
  }

  async initializeStorage () {
    try {
      const defaultSettings = {
        isEnabled: true,
        focusMode: 'gentle', // gentle, strict, gamified
        thresholds: {
          stage1: 30, // seconds of scrolling
          stage2: 60,
          stage3: 120,
          stage4: 180
        },
        whitelist: [],
        blacklist: [],
        analytics: {
          dailyStats: {},
          weeklyStats: {},
          interventions: []
        },
        gamification: {
          points: 0,
          streak: 0,
          achievements: []
        }
      }

      const stored = await chrome.storage.local.get(Object.keys(defaultSettings))
      const settings = { ...defaultSettings, ...stored }
      await chrome.storage.local.set(settings)
      console.log('Storage initialized successfully')
    } catch (error) {
      console.error('Failed to initialize storage:', error)
      // Fallback to basic functionality without analytics
      chrome.storage.local.set({ isEnabled: true, focusMode: 'gentle' })
    }
  }

  async handleMessage (message, sender, sendResponse) {
    try {
      switch (message.type) {
        case 'SCROLL_EVENT':
          await this.handleScrollEvent(message.data, sender.tab)
          break
        case 'INTERVENTION_TRIGGERED':
          await this.logIntervention(message.data, sender.tab)
          break
        case 'GET_SETTINGS':
          const settings = await chrome.storage.local.get()
          sendResponse(settings)
          break
        case 'UPDATE_SETTINGS':
          await chrome.storage.local.set(message.data)
          sendResponse({ success: true })
          break
        case 'OPEN_DASHBOARD':
          await this.openDashboard()
          break
        default:
          console.warn('Unknown message type:', message.type)
      }
    } catch (error) {
      console.error('Error handling message:', message.type, error)
      sendResponse({ success: false, error: error.message })
    }
  }

  async handleScrollEvent (data, tab) {
    try {
      if (!tab || !tab.url) {
        return
      }

      const settings = await chrome.storage.local.get()
      if (!settings.isEnabled) {
        return
      }

      // Validate data
      if (!data || typeof data.scrollTime !== 'number') {
        console.warn('Invalid scroll event data:', data)
        return
      }

      // Check if site is whitelisted
      const domain = new URL(tab.url).hostname
      if (settings.whitelist && settings.whitelist.includes(domain)) {
        return
      }

      // Update analytics
      await this.updateScrollAnalytics(domain, data)

      // Determine intervention stage
      const stage = this.calculateInterventionStage(data.scrollTime, settings.thresholds || {})

      if (stage > 0) {
        // Send intervention command to content script
        try {
          await chrome.tabs.sendMessage(tab.id, {
            type: 'TRIGGER_INTERVENTION',
            stage,
            focusMode: settings.focusMode || 'gentle'
          })
        } catch (messageError) {
          // Tab might be closed or navigating - silently ignore
        }
      }
    } catch (error) {
      console.error('Error handling scroll event:', error)
    }
  }

  calculateInterventionStage (scrollTime, thresholds) {
    if (scrollTime >= thresholds.stage4) {
      return 4
    }
    if (scrollTime >= thresholds.stage3) {
      return 3
    }
    if (scrollTime >= thresholds.stage2) {
      return 2
    }
    if (scrollTime >= thresholds.stage1) {
      return 1
    }
    return 0
  }

  async updateScrollAnalytics (domain, data) {
    try {
      const key = `analytics_${domain}_${new Date().toISOString().split('T')[0]}`

      // Add to pending updates
      if (!this.pendingStorageUpdates.has(key)) {
        this.pendingStorageUpdates.set(key, {
          domain,
          scrollTime: 0,
          scrollDistance: 0,
          interventions: 0
        })
      }

      const pending = this.pendingStorageUpdates.get(key)
      pending.scrollTime += data.deltaTime || 0
      pending.scrollDistance += data.scrollDistance || 0

      // Schedule batched update
      this.scheduleBatchedStorageUpdate()
    } catch (error) {
      console.error('Error updating scroll analytics:', error)
    }
  }

  scheduleBatchedStorageUpdate () {
    if (this.storageUpdateTimeout) {
      return
    }

    this.storageUpdateTimeout = setTimeout(async () => {
      await this.flushPendingStorageUpdates()
      this.storageUpdateTimeout = null
    }, this.STORAGE_BATCH_DELAY)
  }

  async flushPendingStorageUpdates () {
    if (this.pendingStorageUpdates.size === 0) {
      return
    }

    try {
      const settings = await chrome.storage.local.get(['analytics'])
      const today = new Date().toISOString().split('T')[0]

      if (!settings.analytics) {
        settings.analytics = { dailyStats: {}, interventions: [] }
      }

      if (!settings.analytics.dailyStats[today]) {
        settings.analytics.dailyStats[today] = {}
      }

      // Apply all pending updates
      for (const [_key, pending] of this.pendingStorageUpdates) {
        const domain = pending.domain

        if (!settings.analytics.dailyStats[today][domain]) {
          settings.analytics.dailyStats[today][domain] = {
            scrollTime: 0,
            scrollDistance: 0,
            interventions: 0
          }
        }

        settings.analytics.dailyStats[today][domain].scrollTime += pending.scrollTime
        settings.analytics.dailyStats[today][domain].scrollDistance += pending.scrollDistance
        settings.analytics.dailyStats[today][domain].interventions += pending.interventions
      }

      // Save to storage
      await chrome.storage.local.set({ analytics: settings.analytics })

      // Clear pending updates
      this.pendingStorageUpdates.clear()
    } catch (error) {
      console.error('Error flushing storage updates:', error)
    }
  }

  async logIntervention (data, tab) {
    try {
      const settings = await chrome.storage.local.get(['analytics'])
      const domain = new URL(tab.url).hostname
      const today = new Date().toISOString().split('T')[0]

      settings.analytics.interventions.push({
        domain,
        stage: data.stage,
        timestamp: Date.now(),
        date: today
      })

      // Update daily stats
      if (settings.analytics.dailyStats[today] && settings.analytics.dailyStats[today][domain]) {
        settings.analytics.dailyStats[today][domain].interventions++
      }

      await chrome.storage.local.set({ analytics: settings.analytics })
    } catch (error) {
      console.error('Error logging intervention:', error)
    }
  }

  async resetTabScrollData (tabId, _url) {
    chrome.tabs
      .sendMessage(tabId, {
        type: 'RESET_SCROLL_DATA'
      })
      .catch(() => {
        // Ignore errors for tabs that don't have content script loaded
      })
  }

  async openDashboard () {
    try {
      const url = chrome.runtime.getURL('src/dashboard/dashboard.html')
      await chrome.tabs.create({ url })
    } catch (error) {
      console.error('Error opening dashboard:', error)
    }
  }

  schedulePeriodicCleanup () {
    // Run cleanup every 24 hours
    setInterval(() => {
      this.cleanupOldData()
    }, 24 * 60 * 60 * 1000)

    // Run initial cleanup after 5 minutes
    setTimeout(() => {
      this.cleanupOldData()
    }, 5 * 60 * 1000)
  }

  async cleanupOldData () {
    try {
      const settings = await chrome.storage.local.get(['analytics'])
      if (!settings.analytics) {
        return
      }

      const cutoffDate = new Date()
      cutoffDate.setDate(cutoffDate.getDate() - this.DATA_RETENTION_DAYS)
      const cutoffString = cutoffDate.toISOString().split('T')[0]

      // Clean up old daily stats
      let hasChanges = false
      const dailyStats = settings.analytics.dailyStats || {}

      for (const date in dailyStats) {
        if (date < cutoffString) {
          delete dailyStats[date]
          hasChanges = true
        }
      }

      // Clean up old interventions
      const cutoffTimestamp = cutoffDate.getTime()
      const interventions = settings.analytics.interventions || []
      const filteredInterventions = interventions.filter(
        intervention => intervention.timestamp > cutoffTimestamp
      )

      if (filteredInterventions.length !== interventions.length) {
        settings.analytics.interventions = filteredInterventions
        hasChanges = true
      }

      if (hasChanges) {
        await chrome.storage.local.set({ analytics: settings.analytics })
        console.log(`Cleaned up data older than ${this.DATA_RETENTION_DAYS} days`)
      }
    } catch (error) {
      console.error('Error during data cleanup:', error)
    }
  }
}

// Initialize background service
const backgroundService = new AttentionTrainerBackground()
export default backgroundService
