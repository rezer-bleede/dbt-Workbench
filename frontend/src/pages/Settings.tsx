import { useEffect, useState } from 'react'
import { api } from '../api/client'
import { ArtifactSummary } from '../types'
import { useAuth } from '../context/AuthContext'

interface ConfigResponse {
  execution: {
    dbt_project_path: string
  }
  artifacts_path: string
  auth: {
    enabled: boolean
  }
  artifact_watcher: {
    max_versions: number
    monitored_files: string[]
    polling_interval: number
  }
}

function SettingsPage() {
  const { user, activeWorkspace } = useAuth()
  const [artifacts, setArtifacts] = useState<ArtifactSummary | null>(null)
  const [config, setConfig] = useState<ConfigResponse | null>(null)

  useEffect(() => {
    api.get<ArtifactSummary>('/artifacts').then((res) => setArtifacts(res.data)).catch(() => setArtifacts(null))
    api.get<ConfigResponse>('/config').then((res) => setConfig(res.data)).catch(() => setConfig(null))
  }, [])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Project Configuration */}
        <div className="bg-white shadow rounded-lg p-6 space-y-4">
          <h3 className="text-lg font-medium text-gray-900 border-b pb-2">Project Configuration</h3>
          <dl className="grid grid-cols-1 gap-x-4 gap-y-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <dt className="text-sm font-medium text-gray-500">Project Path</dt>
              <dd className="mt-1 text-sm text-gray-900 font-mono bg-gray-50 p-1 rounded">
                {config?.execution.dbt_project_path || 'Loading...'}
              </dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-sm font-medium text-gray-500">Artifacts Path</dt>
              <dd className="mt-1 text-sm text-gray-900 font-mono bg-gray-50 p-1 rounded">
                {activeWorkspace?.artifacts_path || config?.artifacts_path || 'Loading...'}
              </dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-sm font-medium text-gray-500">API URL</dt>
              <dd className="mt-1 text-sm text-gray-900 font-mono bg-gray-50 p-1 rounded">
                {import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'}
              </dd>
            </div>
          </dl>
        </div>

        {/* Artifact Status */}
        <div className="bg-white shadow rounded-lg p-6 space-y-4">
          <h3 className="text-lg font-medium text-gray-900 border-b pb-2">Artifact Status</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-700">Manifest</span>
              <span className={`px-2 py-1 text-xs font-medium rounded-full ${artifacts?.manifest ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                }`}>
                {artifacts?.manifest ? 'Present' : 'Missing'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-700">Run Results</span>
              <span className={`px-2 py-1 text-xs font-medium rounded-full ${artifacts?.run_results ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                }`}>
                {artifacts?.run_results ? 'Present' : 'Missing'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-700">Catalog</span>
              <span className={`px-2 py-1 text-xs font-medium rounded-full ${artifacts?.catalog ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                }`}>
                {artifacts?.catalog ? 'Present' : 'Missing'}
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              Artifacts are monitored automatically.
              Watcher checks every {config?.artifact_watcher.polling_interval || '?'}s.
            </p>
          </div>
        </div>

        {/* User Info */}
        <div className="bg-white shadow rounded-lg p-6 space-y-4">
          <h3 className="text-lg font-medium text-gray-900 border-b pb-2">User Information</h3>
          <dl className="grid grid-cols-1 gap-x-4 gap-y-4">
            <div>
              <dt className="text-sm font-medium text-gray-500">Current User</dt>
              <dd className="mt-1 text-sm text-gray-900">{user?.username || 'Guest'}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-gray-500">Role</dt>
              <dd className="mt-1 text-sm text-gray-900">{user?.role || 'Viewer'}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-gray-500">Auth Status</dt>
              <dd className="mt-1 text-sm text-gray-900">
                {config?.auth.enabled ? 'Enabled' : 'Disabled (Single User)'}
              </dd>
            </div>
          </dl>
        </div>

        {/* About */}
        <div className="bg-white shadow rounded-lg p-6 space-y-4">
          <h3 className="text-lg font-medium text-gray-900 border-b pb-2">About</h3>
          <p className="text-sm text-gray-600">
            dbt-Workbench is a developer tool for inspecting and managing dbt projects.
          </p>
          <div className="text-xs text-gray-500">
            <p>Monitored Files: {config?.artifact_watcher.monitored_files.join(', ') || 'manifest.json, ...'}</p>
            <p>Max Versions Kept: {config?.artifact_watcher.max_versions || 10}</p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default SettingsPage
