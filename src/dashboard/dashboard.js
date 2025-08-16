// Dashboard functionality
class AttentionTrainerDashboard {
  constructor () {
    this.settings = {}
    this.charts = {}
    this.init()
  }

  async init () {
    try {
      await this.loadSettings()
      this.setupEventListeners()
      this.renderStats()
      this.renderCharts()
      this.renderSitesTable()
    } catch (error) {
      console.error('Failed to initialize dashboard:', error)
      this.showError('Failed to load dashboard data')
    }
  }

  async loadSettings () {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' })
      this.settings = response || { analytics: { dailyStats: {}, interventions: [] } }
    } catch (error) {
      console.error('Failed to load settings:', error)
      this.settings = { analytics: { dailyStats: {}, interventions: [] } }
      this.showError('Could not connect to extension data')
    }
  }

  setupEventListeners () {
    document.getElementById('timeRange').addEventListener('change', (e) => {
      this.updateTimeRange(Number.parseInt(e.target.value))
    })
  }

  renderStats () {
    const analytics = this.settings.analytics || {}
    const dailyStats = analytics.dailyStats || {}

    // Calculate totals for last 7 days
    const last7Days = this.getLast7Days()
    let totalScrollTime = 0
    let totalInterventions = 0
    const siteStats = {}

    last7Days.forEach((date) => {
      const dayStats = dailyStats[date] || {}
      Object.entries(dayStats).forEach(([site, stats]) => {
        // Handle both new behavioral format and legacy scroll format
        const timeMetric = stats.timeOnPage || stats.scrollTime || 0
        totalScrollTime += timeMetric
        totalInterventions += stats.interventions || 0

        if (!siteStats[site]) {
          siteStats[site] = {
            timeOnPage: 0,
            scrollTime: 0,
            interventions: 0,
            behaviorScore: 0,
            siteType: 'general'
          }
        }
        siteStats[site].timeOnPage += stats.timeOnPage || 0
        siteStats[site].scrollTime += stats.scrollTime || 0
        siteStats[site].interventions += stats.interventions || 0
        siteStats[site].behaviorScore = Math.max(siteStats[site].behaviorScore, stats.behaviorScore || 0)
        siteStats[site].siteType = stats.siteType || 'general'
      })
    })

    // Update UI - handle both time formats
    const totalMinutes = Math.round(totalScrollTime / 60) // Now works for both timeOnPage (minutes) and scrollTime (seconds)
    const displayTime = totalMinutes > 60 ? `${Math.round(totalMinutes / 60)}h ${totalMinutes % 60}m` : `${totalMinutes}m`
    document.getElementById('totalScrollTime').textContent = displayTime
    document.getElementById('totalInterventions').textContent = totalInterventions

    // Calculate focus score based on interventions and average behavior score
    const avgBehaviorScore = Object.values(siteStats).reduce((sum, stats) => sum + stats.behaviorScore, 0) / Math.max(Object.keys(siteStats).length, 1)
    const focusScore = Math.max(0, 100 - (totalInterventions * 2) - (avgBehaviorScore * 0.5))
    document.getElementById('focusScore').textContent = `${Math.round(focusScore)}%`

    // Find most distracting site - prioritize by behavior score, then time
    const topSite = Object.entries(siteStats).sort(([, a], [, b]) => {
      const scoreA = (a.behaviorScore || 0) + (a.timeOnPage || a.scrollTime || 0) / 60
      const scoreB = (b.behaviorScore || 0) + (b.timeOnPage || b.scrollTime || 0) / 60
      return scoreB - scoreA
    })[0]

    if (topSite) {
      document.getElementById('topDistractingSite').textContent = topSite[0]
      const siteTime = Math.round((topSite[1].timeOnPage || topSite[1].scrollTime || 0) / 60)
      const siteType = topSite[1].siteType || 'general'
      document.getElementById('topSiteTime').textContent = `${siteTime} minutes this week (${siteType})`
    } else {
      document.getElementById('topDistractingSite').textContent = 'None'
      document.getElementById('topSiteTime').textContent = 'No data yet'
    }
  }

  renderCharts () {
    this.renderScrollTrendChart()
    this.renderInterventionChart()
  }

  renderScrollTrendChart () {
    try {
      const canvas = document.getElementById('scrollTrendChart')
      const last7Days = this.getLast7Days()
      const dailyStats = this.settings.analytics?.dailyStats || {}

      const data = last7Days.map((date) => {
        const dayStats = dailyStats[date] || {}
        return Object.values(dayStats).reduce((total, stats) => {
          // Handle both timeOnPage (minutes) and scrollTime (seconds)
          const timeMetric = stats.timeOnPage || (stats.scrollTime || 0) / 60
          return total + timeMetric
        }, 0)
      })

      // Create simple text-based chart since Chart.js is not available
      const maxValue = Math.max(...data, 1)
      const chartHtml = `
        <div style="padding: 20px; background: #f8fafc; border-radius: 8px;">
          <h4 style="margin: 0 0 15px 0; color: #374151;">Scroll Time (Last 7 Days)</h4>
          ${last7Days.map((date, index) => {
            const dayName = new Date(date).toLocaleDateString('en-US', { weekday: 'short' })
            const value = data[index]
            const barWidth = (value / maxValue) * 100
            return `
              <div style="margin: 8px 0; display: flex; align-items: center;">
                <div style="width: 30px; font-size: 12px; color: #6b7280;">${dayName}</div>
                <div style="flex: 1; margin: 0 10px; background: #e5e7eb; border-radius: 4px; height: 20px; position: relative;">
                  <div style="background: #3b82f6; height: 100%; width: ${barWidth}%; border-radius: 4px;"></div>
                </div>
                <div style="width: 40px; font-size: 12px; color: #374151; text-align: right;">${Math.round(value)}m</div>
              </div>
            `
          }).join('')}
        </div>
      `

      canvas.outerHTML = `<div id="scrollTrendChart">${chartHtml}</div>`
    } catch (error) {
      console.error('Failed to render scroll trend chart:', error)
      document.getElementById('scrollTrendChart').innerHTML = '<p style="text-align: center; padding: 20px; color: #ef4444;">Chart failed to load</p>'
    }
  }

  renderInterventionChart () {
    try {
      const canvas = document.getElementById('interventionChart')
      const interventions = this.settings.analytics?.interventions || []

      // Count interventions by stage
      const stageCounts = { 1: 0, 2: 0, 3: 0, 4: 0 }
      interventions.forEach((intervention) => {
        stageCounts[intervention.stage]++
      })

      const stageLabels = ['Stage 1 (Dim)', 'Stage 2 (Blur)', 'Stage 3 (Nudge)', 'Stage 4 (Lock)']
      const stageColors = ['#fbbf24', '#f59e0b', '#d97706', '#dc2626']
      const total = Object.values(stageCounts).reduce((sum, count) => sum + count, 0)

      const chartHtml = `
        <div style="padding: 20px; background: #f8fafc; border-radius: 8px;">
          <h4 style="margin: 0 0 15px 0; color: #374151;">Interventions by Stage</h4>
          ${total === 0
            ? '<p style="text-align: center; color: #6b7280; margin: 20px 0;">No interventions yet</p>'
            : Object.entries(stageCounts).map(([_stage, count], index) => {
              const percentage = total > 0 ? Math.round((count / total) * 100) : 0
              return `
                <div style="margin: 10px 0; display: flex; align-items: center;">
                  <div style="width: 15px; height: 15px; background: ${stageColors[index]}; border-radius: 3px; margin-right: 10px;"></div>
                  <div style="flex: 1; font-size: 14px; color: #374151;">${stageLabels[index]}</div>
                  <div style="width: 60px; text-align: right; font-size: 14px; color: #6b7280;">${count} (${percentage}%)</div>
                </div>
              `
            }).join('')
          }
        </div>
      `

      canvas.outerHTML = `<div id="interventionChart">${chartHtml}</div>`
    } catch (error) {
      console.error('Failed to render intervention chart:', error)
      document.getElementById('interventionChart').innerHTML = '<p style="text-align: center; padding: 20px; color: #ef4444;">Chart failed to load</p>'
    }
  }

  renderSitesTable () {
    const dailyStats = this.settings.analytics?.dailyStats || {}
    const last7Days = this.getLast7Days()

    // Aggregate site stats
    const siteStats = {}
    last7Days.forEach((date) => {
      const dayStats = dailyStats[date] || {}
      Object.entries(dayStats).forEach(([site, stats]) => {
        if (!siteStats[site]) {
          siteStats[site] = {
            timeOnPage: 0,
            scrollTime: 0,
            interventions: 0,
            behaviorScore: 0,
            siteType: 'general',
            flags: {}
          }
        }
        siteStats[site].timeOnPage += stats.timeOnPage || 0
        siteStats[site].scrollTime += stats.scrollTime || 0
        siteStats[site].interventions += stats.interventions || 0
        siteStats[site].behaviorScore = Math.max(siteStats[site].behaviorScore, stats.behaviorScore || 0)
        siteStats[site].siteType = stats.siteType || 'general'

        // Merge behavior flags
        if (stats.flags) {
          Object.keys(stats.flags).forEach(flag => {
            siteStats[site].flags[flag] = (siteStats[site].flags[flag] || 0) + (stats.flags[flag] || 0)
          })
        }
      })
    })

    // Sort by engagement metric (behavior score + time)
    const sortedSites = Object.entries(siteStats)
      .sort(([, a], [, b]) => {
        const scoreA = (a.behaviorScore || 0) + (a.timeOnPage || a.scrollTime || 0) / 60
        const scoreB = (b.behaviorScore || 0) + (b.timeOnPage || b.scrollTime || 0) / 60
        return scoreB - scoreA
      })
      .slice(0, 10)

    const tbody = document.getElementById('sitesTableBody')
    tbody.innerHTML = ''

    if (sortedSites.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 20px; color: #6b7280;">No data available yet. Start browsing to see analytics!</td></tr>'
    } else {
      sortedSites.forEach(([site, stats]) => {
        const row = document.createElement('tr')
        const timeMinutes = Math.round((stats.timeOnPage || stats.scrollTime || 0) / (stats.timeOnPage ? 1 : 60))
        const riskLevel = this.calculateRiskLevel(stats.interventions, timeMinutes, stats.behaviorScore || 0)
        const siteType = stats.siteType || 'general'
        const behaviorScore = Math.round(stats.behaviorScore || 0)

        row.innerHTML = `
          <td class="site-name">${site} <span style="font-size: 11px; color: #6b7280;">(${siteType})</span></td>
          <td>${timeMinutes}m <br><small style="color: #6b7280;">Score: ${behaviorScore}</small></td>
          <td>${stats.interventions}</td>
          <td class="risk-${riskLevel.toLowerCase()}">${riskLevel}</td>
        `

        tbody.appendChild(row)
      })
    }
  }

  calculateRiskLevel (interventions, timeMinutes, behaviorScore = 0) {
    const riskScore = interventions + (timeMinutes / 30) + (behaviorScore / 20)
    if (riskScore > 10) {
      return 'High'
    }
    if (riskScore > 5) {
      return 'Medium'
    }
    return 'Low'
  }

  getLast7Days () {
    const dates = []
    for (let i = 6; i >= 0; i--) {
      const date = new Date()
      date.setDate(date.getDate() - i)
      dates.push(date.toISOString().split('T')[0])
    }
    return dates
  }

  async updateTimeRange (_days) {
    // Update charts with new time range
    this.renderStats()
    this.renderCharts()
    this.renderSitesTable()
  }

  showError (message) {
    const container = document.querySelector('.container')
    const errorDiv = document.createElement('div')
    errorDiv.style.cssText = `
      background: #fee;
      color: #c53030;
      padding: 12px;
      border-radius: 8px;
      margin-bottom: 20px;
      text-align: center;
    `
    errorDiv.textContent = message
    container.insertBefore(errorDiv, container.firstChild)

    setTimeout(() => {
      if (errorDiv.parentNode) {
        errorDiv.parentNode.removeChild(errorDiv)
      }
    }, 5000)
  }
}

// Initialize dashboard
const dashboardInstance = new AttentionTrainerDashboard()
window.attentionTrainerDashboard = dashboardInstance
