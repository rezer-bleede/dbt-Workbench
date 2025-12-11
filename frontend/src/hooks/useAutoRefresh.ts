import { useEffect, useCallback, useRef } from 'react'
import { versionService } from '../services/versionService'
import { VersionCheckResponse } from '../types'

interface UseAutoRefreshOptions {
  onManifestUpdate?: () => void
  onCatalogUpdate?: () => void
  onRunResultsUpdate?: () => void
  onAnyUpdate?: (updatedArtifacts: string[]) => void
}

export const useAutoRefresh = (options: UseAutoRefreshOptions = {}) => {
  const optionsRef = useRef(options)
  optionsRef.current = options

  const handleVersionUpdate = useCallback((hasUpdates: boolean, response: VersionCheckResponse) => {
    if (!hasUpdates) return

    const updatedArtifacts: string[] = []
    const { updates_available } = response

    // Check which artifacts were updated and call appropriate callbacks
    if (updates_available['manifest.json']) {
      updatedArtifacts.push('manifest')
      optionsRef.current.onManifestUpdate?.()
    }

    if (updates_available['catalog.json']) {
      updatedArtifacts.push('catalog')
      optionsRef.current.onCatalogUpdate?.()
    }

    if (updates_available['run_results.json']) {
      updatedArtifacts.push('run_results')
      optionsRef.current.onRunResultsUpdate?.()
    }

    // Call the general update callback
    if (updatedArtifacts.length > 0) {
      optionsRef.current.onAnyUpdate?.(updatedArtifacts)
    }
  }, [])

  useEffect(() => {
    versionService.addUpdateListener(handleVersionUpdate)
    versionService.startPolling()

    return () => {
      versionService.removeUpdateListener(handleVersionUpdate)
    }
  }, [handleVersionUpdate])

  return {
    checkNow: () => versionService.checkNow(),
    getCurrentVersions: () => versionService.getCurrentVersions(),
    getVersionInfo: () => versionService.getVersionInfo()
  }
}