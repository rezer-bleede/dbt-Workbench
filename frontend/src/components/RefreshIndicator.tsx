import React, { useState, useEffect } from 'react'
import { versionService } from '../services/versionService'
import { VersionCheckResponse } from '../types'

interface RefreshIndicatorProps {
  onRefreshNeeded?: (updatedArtifacts: string[]) => void
}

export const RefreshIndicator: React.FC<RefreshIndicatorProps> = ({ onRefreshNeeded }) => {
  const [hasUpdates, setHasUpdates] = useState(false)
  const [updatedArtifacts, setUpdatedArtifacts] = useState<string[]>([])
  const [isRefreshing, setIsRefreshing] = useState(false)

  useEffect(() => {
    const handleVersionUpdate = (hasUpdates: boolean, response: VersionCheckResponse) => {
      setHasUpdates(hasUpdates)
      
      if (hasUpdates) {
        const updated = Object.entries(response.updates_available)
          .filter(([_, hasUpdate]) => hasUpdate)
          .map(([filename, _]) => filename.replace('.json', ''))
        
        setUpdatedArtifacts(updated)
        
        // Auto-refresh after a short delay
        setTimeout(() => {
          handleRefresh(updated)
        }, 1000)
      }
    }

    versionService.addUpdateListener(handleVersionUpdate)
    versionService.startPolling()

    return () => {
      versionService.removeUpdateListener(handleVersionUpdate)
      versionService.stopPolling()
    }
  }, [])

  const handleRefresh = (artifacts: string[]) => {
    setIsRefreshing(true)
    
    // Notify parent component about refresh
    if (onRefreshNeeded) {
      onRefreshNeeded(artifacts)
    }
    
    // Clear the indicator after a brief moment
    setTimeout(() => {
      setHasUpdates(false)
      setUpdatedArtifacts([])
      setIsRefreshing(false)
    }, 2000)
  }

  if (!hasUpdates && !isRefreshing) {
    return null
  }

  return (
    <div className="fixed top-4 right-4 z-50">
      <div className={`
        px-4 py-2 rounded-lg shadow-lg transition-all duration-300 transform
        ${isRefreshing 
          ? 'bg-green-500 text-white scale-100' 
          : 'bg-blue-500 text-white scale-105 animate-pulse'
        }
      `}>
        <div className="flex items-center space-x-2">
          {isRefreshing ? (
            <>
              <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                <circle 
                  className="opacity-25" 
                  cx="12" 
                  cy="12" 
                  r="10" 
                  stroke="currentColor" 
                  strokeWidth="4"
                />
                <path 
                  className="opacity-75" 
                  fill="currentColor" 
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
              <span className="text-sm font-medium">Refreshing...</span>
            </>
          ) : (
            <>
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path 
                  strokeLinecap="round" 
                  strokeLinejoin="round" 
                  strokeWidth={2} 
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" 
                />
              </svg>
              <div className="text-sm">
                <div className="font-medium">Updates available</div>
                <div className="text-xs opacity-90">
                  {updatedArtifacts.join(', ')} updated
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}