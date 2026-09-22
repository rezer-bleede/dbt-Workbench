import React, { useEffect, useMemo, useState } from 'react'
import { api } from '../api/client'
import { ArtifactSummary, HealthResponse, ModelSummary, RunSummary, GitRepository } from '../types'
import { Card } from '../components/Card'
import { useAuth } from '../context/AuthContext'
import { ExecutionService } from '../services/executionService'

function DashboardPage() {
  const [health, setHealth] = useState<HealthResponse | null>(null)
  const [artifacts, setArtifacts] = useState<ArtifactSummary | null>(null)
  const [models, setModels] = useState<ModelSummary[]>([])
  const [runs, setRuns] = useState<RunSummary[]>([])
  const [repo, setRepo] = useState<GitRepository | null>(null)
  const { activeWorkspace, workspaces, switchWorkspace } = useAuth()

  useEffect(() => {
    setArtifacts(null)
    setModels([])
    setRuns([])
    setRepo(null)
    api.get<HealthResponse>('/health').then((res) => setHealth(res.data)).catch(() => setHealth(null))
    api.get<ArtifactSummary>('/artifacts').then((res) => setArtifacts(res.data)).catch(() => setArtifacts(null))
    api.get<ModelSummary[]>('/models').then((res) => setModels(res.data)).catch(() => setModels([]))
    ExecutionService.getRunHistory(1, 20)
      .then((res) => setRuns(res.runs))
      .catch(() => setRuns([]))
    api.get<GitRepository>('/git/repository').then((res) => setRepo(res.data)).catch(() => setRepo(null))
  }, [activeWorkspace?.id])

  const lastRun = runs[0]

  const lastActivityByWorkspace = useMemo(() => {
    const map: Record<number, string> = {}
    runs.forEach(run => {
      // RunSummary has start_time as required string
      const ts = run.start_time
      if (!ts || activeWorkspace?.id == null) return
      map[activeWorkspace.id] = ts
    })
    return map
  }, [runs, activeWorkspace?.id])

  const modelStats = models.reduce((acc, model) => {
    const type = model.resource_type
    acc[type] = (acc[type] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="text-sm text-muted">Projects: {workspaces.length}</div>
          {health && (
            <span className={`rounded border px-2 py-1 text-xs font-semibold ${health.status === 'ok' ? 'border-status-success/35 bg-status-success/15 text-status-success' : 'border-status-danger/35 bg-status-danger/15 text-status-danger'}`}>
              System: {health.status}
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card title="Total Models">{models.length}</Card>
        <Card title="Sources">{modelStats['source'] || 0}</Card>
        <Card title="Tests">{modelStats['test'] || 0}</Card>
        <Card title="Latest Run">
          <span className={`font-semibold ${lastRun?.status === 'succeeded' ? 'text-status-success' : lastRun?.status === 'failed' ? 'text-status-danger' : 'text-muted'}`}>
            {lastRun?.status || 'No runs yet'}
          </span>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="panel-gradient rounded-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="text-xs uppercase text-muted">Active Project</div>
                <h3 className="text-xl font-semibold text-text">{activeWorkspace?.name || 'No project selected'}</h3>
                {repo && (
                  <p className="text-sm text-muted">Connected to {repo.remote_url}</p>
                )}
              </div>
              {workspaces.length > 1 && (
                <select
                  className="panel-input rounded px-2 py-1 text-xs"
                  value={activeWorkspace?.id ?? ''}
                  onChange={(e) => {
                    const id = Number(e.target.value)
                    if (!Number.isNaN(id)) switchWorkspace(id)
                  }}
                >
                  {workspaces.map((ws) => (
                    <option key={ws.id} value={ws.id}>
                      {ws.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
            <div className="grid grid-cols-2 gap-4 text-sm text-muted">
              <div>
                <div className="text-muted">Project Root</div>
                <div className="font-mono text-xs break-all">
                  {repo?.directory || activeWorkspace?.artifacts_path || 'Not Configured'}
                </div>
              </div>
              <div>
                <div className="text-muted">Last Activity</div>
                <div>{activeWorkspace?.id ? (lastActivityByWorkspace[activeWorkspace.id] ? new Date(lastActivityByWorkspace[activeWorkspace.id]).toLocaleString() : 'No runs yet') : 'N/A'}</div>
              </div>
            </div>
          </div>

          <div className="panel-gradient rounded-lg p-6">
            <h3 className="mb-4 text-lg font-medium text-text">Recent Activity</h3>
            <div className="flow-root">
              <ul className="-mb-8">
                {runs.slice(0, 5).map((run, runIdx) => (
                  <li key={run.run_id}>
                    <div className="relative pb-8">
                      {runIdx !== runs.slice(0, 5).length - 1 ? (
                        <span className="absolute top-4 left-4 -ml-px h-full w-0.5 bg-border" aria-hidden="true" />
                      ) : null}
                      <div className="relative flex space-x-3">
                        <div>
                          <span className={`flex h-8 w-8 items-center justify-center rounded-full ring-8 ring-surface ${run.status === 'succeeded' ? 'bg-status-success' : run.status === 'failed' ? 'bg-status-danger' : 'bg-surface-muted border border-border'
                            }`}>
                            <span className="text-white font-bold text-xs drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)]">{run.status?.[0]?.toUpperCase()}</span>
                          </span>
                        </div>
                        <div className="min-w-0 flex-1 pt-1.5 flex justify-between space-x-4">
                          <div>
                            <p className="text-sm text-muted">
                              Run <span className="font-medium text-text">#{run.run_id.substring(0, 8)}</span>
                            </p>
                          </div>
                          <div className="text-right text-sm whitespace-nowrap text-muted">
                            {new Date(run.start_time).toLocaleString()}
                          </div>
                        </div>
                      </div>
                    </div>
                  </li>
                ))}
                {runs.length === 0 && <li className="text-sm text-muted">No recent activity.</li>}
              </ul>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="panel-gradient rounded-lg p-6">
            <h3 className="mb-4 text-lg font-medium text-text">Project Overview</h3>
            <dl className="space-y-4">
              <div className="flex justify-between">
                <dt className="text-sm text-muted">Models</dt>
                <dd className="text-sm font-medium text-text">{modelStats['model'] || 0}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-sm text-muted">Seeds</dt>
                <dd className="text-sm font-medium text-text">{modelStats['seed'] || 0}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-sm text-muted">Snapshots</dt>
                <dd className="text-sm font-medium text-text">{modelStats['snapshot'] || 0}</dd>
              </div>
              <div className="panel-divider space-y-2 border-t pt-4">
                <dt className="text-sm text-muted">Artifacts Status</dt>
                {[
                  { label: 'Manifest', present: artifacts?.manifest },
                  { label: 'Catalog', present: artifacts?.catalog },
                  { label: 'Run Results', present: artifacts?.run_results },
                  { label: 'Docs', present: artifacts?.docs },
                ].map((item) => (
                  <div key={item.label} className="flex justify-between text-sm">
                    <span className="text-muted">{item.label}</span>
                    <span className={`font-semibold ${item.present ? 'text-status-success' : 'text-status-danger'}`}>
                      {item.present ? 'Present' : 'Missing'}
                    </span>
                  </div>
                ))}
              </div>
            </dl>
          </div>
        </div>
      </div>
    </div>
  )
}

export default DashboardPage
