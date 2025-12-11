import { api } from '../api/client'
import { VersionCheckResponse } from '../types'

export class VersionService {
  private currentVersions: Record<string, number> = {
    'manifest.json': 0,
    'catalog.json': 0,
    'run_results.json': 0
  }
  
  private pollingInterval: number = 5000 // 5 seconds default
  private intervalId: NodeJS.Timeout | null = null
  private listeners: Array<(hasUpdates: boolean, response: VersionCheckResponse) => void> = []

  constructor(pollingInterval: number = 5000) {
    this.pollingInterval = pollingInterval
  }

  /**
   * Start polling for version updates
   */
  startPolling(): void {
    if (this.intervalId) {
      return // Already polling
    }

    this.intervalId = setInterval(async () => {
      try {
        await this.checkForUpdates()
      } catch (error) {
        console.error('Error checking for version updates:', error)
      }
    }, this.pollingInterval)

    // Initial check
    this.checkForUpdates()
  }

  /**
   * Stop polling for version updates
   */
  stopPolling(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = null
    }
  }

  /**
   * Add a listener for version update events
   */
  addUpdateListener(callback: (hasUpdates: boolean, response: VersionCheckResponse) => void): void {
    this.listeners.push(callback)
  }

  /**
   * Remove a listener for version update events
   */
  removeUpdateListener(callback: (hasUpdates: boolean, response: VersionCheckResponse) => void): void {
    const index = this.listeners.indexOf(callback)
    if (index > -1) {
      this.listeners.splice(index, 1)
    }
  }

  /**
   * Check for updates and notify listeners
   */
  private async checkForUpdates(): Promise<void> {
    try {
      const response = await api.get<VersionCheckResponse>('/artifacts/versions/check', {
        params: {
          manifest_version: this.currentVersions['manifest.json'],
          catalog_version: this.currentVersions['catalog.json'],
          run_results_version: this.currentVersions['run_results.json']
        }
      })

      const versionData = response.data

      // Update current versions if there are updates
      if (versionData.any_updates) {
        this.currentVersions = { ...versionData.current_versions }
      }

      // Notify all listeners
      this.listeners.forEach(listener => {
        try {
          listener(versionData.any_updates, versionData)
        } catch (error) {
          console.error('Error in version update listener:', error)
        }
      })
    } catch (error) {
      console.error('Failed to check for version updates:', error)
    }
  }

  /**
   * Get current version numbers
   */
  getCurrentVersions(): Record<string, number> {
    return { ...this.currentVersions }
  }

  /**
   * Manually trigger a version check
   */
  async checkNow(): Promise<VersionCheckResponse | null> {
    try {
      const response = await api.get<VersionCheckResponse>('/artifacts/versions/check', {
        params: {
          manifest_version: this.currentVersions['manifest.json'],
          catalog_version: this.currentVersions['catalog.json'],
          run_results_version: this.currentVersions['run_results.json']
        }
      })

      const versionData = response.data

      if (versionData.any_updates) {
        this.currentVersions = { ...versionData.current_versions }
      }

      return versionData
    } catch (error) {
      console.error('Failed to check for version updates:', error)
      return null
    }
  }

  /**
   * Get detailed version information for all artifacts
   */
  async getVersionInfo(): Promise<Record<string, any> | null> {
    try {
      const response = await api.get('/artifacts/versions')
      return response.data
    } catch (error) {
      console.error('Failed to get version info:', error)
      return null
    }
  }
}

// Global version service instance
export const versionService = new VersionService()