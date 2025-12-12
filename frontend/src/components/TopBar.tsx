import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { WorkspaceService } from '../services/workspaceService'
import { WorkspaceSummary } from '../types'

interface TopBarProps {
  projectName?: string
  environment?: string
}

export function TopBar({ projectName, environment }: TopBarProps) {
  const { activeWorkspace, user, logout, isAuthEnabled, switchWorkspace } = useAuth()
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([])

  useEffect(() => {
    const load = async () => {
      try {
        const data = await WorkspaceService.listWorkspaces()
        setWorkspaces(data)
      } catch {
        setWorkspaces([])
      }
    }
    load()
  }, [])

  const displayProject = projectName || activeWorkspace?.name || 'Default dbt Project'
  const displayEnv = environment || (user ? `${user.role} · ${user.username}` : 'Local')

  return (
    <header className="flex items-center justify-between border-b border-gray-800 px-6 py-4 bg-panel sticky top-0 z-10">
      <div>
        <div className="text-sm uppercase text-gray-400">Workspace</div>
        <div className="flex items-center space-x-3">
          <div className="text-lg font-semibold text-white">{displayProject}</div>
          {isAuthEnabled && user && workspaces.length > 1 && (
            <select
              className="bg-gray-900 border border-gray-700 text-xs text-gray-200 rounded px-2 py-1"
              value={activeWorkspace?.id ?? ''}
              onChange={e => {
                const id = Number(e.target.value)
                if (!Number.isNaN(id)) {
                  switchWorkspace(id)
                }
              }}
            >
              {workspaces.map(ws => (
                <option key={ws.id} value={ws.id}>
                  {ws.name}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>
      <div className="flex items-center space-x-3">
        <div className="text-sm text-gray-300 bg-gray-800 px-3 py-1 rounded-full">
          {displayEnv}
        </div>
        {isAuthEnabled && user && (
          <button
            type="button"
            onClick={logout}
            className="text-xs text-gray-300 hover:text-white border border-gray-700 px-3 py-1 rounded-md"
          >
            Sign out
          </button>
        )}
      </div>
    </header>
  )
}
