class AttentionTrainerPopup {
  constructor () {
    this.settings = {}
    this.init()
  }

  async init () {
    try {
      await this.loadSettings()
      this.setupEventListeners()
      this.updateUI()
      this.loadTodayStats()
    } catch (error) {
      console.error('Failed to initialize popup:', error)
      this.showError('Failed to load extension data')
    }
  }

  async loadSettings () {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' })
      this.settings = response || { isEnabled: true, focusMode: 'gentle', analytics: { dailyStats: {} } }
    } catch (error) {
      console.error('Failed to load settings:', error)
      this.settings = { isEnabled: true, focusMode: 'gentle', analytics: { dailyStats: {} } }
      this.showError('Could not connect to background script')
    }
  }

  setupEventListeners () {
    // Main toggle
    document.getElementById('mainToggle').addEventListener('click', () => {
      this.toggleExtension()
    })

    // Focus mode selection
    document.querySelectorAll('input[name="focusMode"]').forEach((radio) => {
      radio.addEventListener('change', (e) => {
        this.updateFocusMode(e.target.value)
      })
    })

    // Dashboard button
    document.getElementById('openDashboard').addEventListener('click', () => {
      chrome.runtime.sendMessage({ type: 'OPEN_DASHBOARD' })
      window.close()
    })

    // Whitelist management
    document.getElementById('manageWhitelist').addEventListener('click', () => {
      this.showWhitelistDialog()
    })
  }

  updateUI () {
    // Update main toggle
    const toggle = document.getElementById('mainToggle')
    if (this.settings.isEnabled) {
      toggle.classList.add('active')
    } else {
      toggle.classList.remove('active')
    }

    // Update focus mode selection
    document.querySelector(`input[value="${this.settings.focusMode}"]`).checked = true
  }

  async toggleExtension () {
    try {
      this.settings.isEnabled = !this.settings.isEnabled
      const response = await chrome.runtime.sendMessage({
        type: 'UPDATE_SETTINGS',
        data: { isEnabled: this.settings.isEnabled }
      })

      if (response && !response.success) {
        throw new Error(response.error || 'Failed to update settings')
      }

      this.updateUI()
    } catch (error) {
      console.error('Failed to toggle extension:', error)
      // Revert the change
      this.settings.isEnabled = !this.settings.isEnabled
      this.showError('Failed to update extension settings')
    }
  }

  async updateFocusMode (mode) {
    try {
      this.settings.focusMode = mode
      const response = await chrome.runtime.sendMessage({
        type: 'UPDATE_SETTINGS',
        data: { focusMode: mode }
      })

      if (response && !response.success) {
        throw new Error(response.error || 'Failed to update focus mode')
      }
    } catch (error) {
      console.error('Failed to update focus mode:', error)
      this.showError('Failed to update focus mode')
    }
  }

  async loadTodayStats () {
    const today = new Date().toISOString().split('T')[0]
    const dailyStats = this.settings.analytics?.dailyStats?.[today] || {}

    // Calculate total time and interventions
    let totalTime = 0
    let totalInterventions = 0
    let avgBehaviorScore = 0
    let siteCount = 0

    Object.values(dailyStats).forEach((siteStats) => {
      // Handle both new behavioral format and legacy scroll format
      const timeMetric = siteStats.timeOnPage || siteStats.scrollTime || 0
      totalTime += timeMetric
      totalInterventions += siteStats.interventions || 0

      if (siteStats.behaviorScore > 0) {
        avgBehaviorScore += siteStats.behaviorScore
        siteCount++
      }
    })

    // Calculate average behavior score
    avgBehaviorScore = siteCount > 0 ? avgBehaviorScore / siteCount : 0

    // Update UI - handle both time formats
    const displayMinutes = Math.round(totalTime / (totalTime > 60 ? 60 : 1)) // Auto-detect if it's minutes or seconds
    document.getElementById('todayScrollTime').textContent = `${displayMinutes}m`
    document.getElementById('todayInterventions').textContent = totalInterventions

    // Calculate focus score based on interventions and behavior score
    const focusScore = Math.max(0, 100 - (totalInterventions * 8) - (avgBehaviorScore * 0.3))
    document.getElementById('focusScore').textContent = `${Math.round(focusScore)}%`
  }

  showWhitelistDialog () {
    // Get current tab domain
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const currentDomain = new URL(tabs[0].url).hostname
      const isWhitelisted = this.settings.whitelist.includes(currentDomain)

      const action = isWhitelisted ? 'Remove from' : 'Add to'
      const confirmed = confirm(`${action} whitelist: ${currentDomain}?`)

      if (confirmed) {
        this.toggleWhitelist(currentDomain)
      }
    })
  }

  async toggleWhitelist (domain) {
    const whitelist = [...this.settings.whitelist]
    const index = whitelist.indexOf(domain)

    if (index > -1) {
      whitelist.splice(index, 1)
    } else {
      whitelist.push(domain)
    }

    await chrome.runtime.sendMessage({
      type: 'UPDATE_SETTINGS',
      data: { whitelist }
    })

    this.settings.whitelist = whitelist
  }

  showError (message) {
    // Create a simple error display
    const errorDiv = document.createElement('div')
    errorDiv.style.cssText = `
      position: fixed;
      top: 10px;
      left: 10px;
      right: 10px;
      background: #fee;
      color: #c53030;
      padding: 8px;
      border-radius: 4px;
      font-size: 12px;
      z-index: 1000;
    `
    errorDiv.textContent = message
    document.body.appendChild(errorDiv)

    setTimeout(() => {
      if (errorDiv.parentNode) {
        errorDiv.parentNode.removeChild(errorDiv)
      }
    }, 3000)
  }
}

// Initialize popup
new AttentionTrainerPopup()
