import { useEffect, useState } from 'react'
import { api } from '../api/client'
import { ArtifactSummary, HealthResponse, ModelSummary, RunRecord, ProjectInfo } from '../types'
import { Card } from '../components/Card'
import { useAuth } from '../context/AuthContext'

function DashboardPage() {
  const { activeWorkspace, isAuthEnabled, switchWorkspace } = useAuth()
  const [health, setHealth] = useState<HealthResponse | null>(null)
  const [artifacts, setArtifacts] = useState<ArtifactSummary | null>(null)
  const [models, setModels] = useState<ModelSummary[]>([])
  const [runs, setRuns] = useState<RunRecord[]>([])
  const [projects, setProjects] = useState<ProjectInfo[]>([])

  useEffect(() => {
    api.get<HealthResponse>('/health').then((res) => setHealth(res.data)).catch(() => setHealth(null))
    api.get<ArtifactSummary>('/artifacts').then((res) => setArtifacts(res.data)).catch(() => setArtifacts(null))
    api.get<ModelSummary[]>('/models').then((res) => setModels(res.data)).catch(() => setModels([]))
    api.get<RunRecord[]>('/runs').then((res) => setRuns(res.data)).catch(() => setRuns([]))
    api.get<ProjectInfo[]>('/projects').then((res) => setProjects(res.data)).catch(() => setProjects([]))
  }, [])

  const lastRun = runs[0]

  const modelStats = models.reduce((acc, model) => {
    const type = model.resource_type
    acc[type] = (acc[type] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        {health && (
          <span className={`px-2 py-1 rounded text-xs font-medium ${health.status === 'ok' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
            System: {health.status}
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card title="Total Models">{models.length}</Card>
        <Card title="Sources">{modelStats['source'] || 0}</Card>
        <Card title="Tests">{modelStats['test'] || 0}</Card>
        <Card title="Latest Run">
          <span
            className={`${
              lastRun?.status === 'success'
                ? 'text-green-600'
                : lastRun?.status === 'failed'
                ? 'text-red-600'
                : 'text-gray-600'
            }`}
          >
            {lastRun?.status || 'No runs yet'}
          </span>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white shadow rounded-lg p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Recent Activity</h3>
            <div className="flow-root">
              <ul className="-mb-8">
                {runs.slice(0, 5).map((run, runIdx) => (
                  <li key={run.run_id}>
                    <div className="relative pb-8">
                      {runIdx !== runs.slice(0, 5).length - 1 ? (
                        <span className="absolute top-4 left-4 -ml-px h-full w-0.5 bg-gray-200" aria-hidden="true" />
                      ) : null}
                      <div className="relative flex space-x-3">
                        <div>
                          <span className={`h-8 w-8 rounded-full flex items-center justify-center ring-8 ring-white ${run.status === 'success' ? 'bg-green-500' : run.status === 'failed' ? 'bg-red-500' : 'bg-gray-500'
                            }`}>
                            <span className="text-white text-xs">{run.status?.[0]?.toUpperCase()}</span>
                          </span>
                        </div>
                        <div className="min-w-0 flex-1 pt-1.5 flex justify-between space-x-4">
                          <div>
                            <p className="text-sm text-gray-500">
                              Run <span className="font-medium text-gray-900">#{run.run_id.substring(0, 8)}</span>
                            </p>
                          </div>
                          <div className="text-right text-sm whitespace-nowrap text-gray-500">
                            {new Date(run.start_time).toLocaleString()}
                          </div>
                        </div>
                      </div>
                    </div>
                  </li>
                ))}
                {runs.length === 0 && <li className="text-sm text-gray-500">No recent activity.</li>}
              </ul>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-white shadow rounded-lg p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Project Overview</h3>
            <dl className="space-y-4">
              <div className="flex justify-between">
                <dt className="text-sm text-gray-500">Total Projects</dt>
                <dd className="text-sm font-medium text-gray-900">{projects.length || 1}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-sm text-gray-500">Models (current project)</dt>
                <dd className="text-sm font-medium text-gray-900">{modelStats['model'] || 0}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-sm text-gray-500">Seeds</dt>
                <dd className="text-sm font-medium text-gray-900">{modelStats['seed'] || 0}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-sm text-gray-500">Snapshots</dt>
                <dd className="text-sm font-medium text-gray-900">{modelStats['snapshot'] || 0}</dd>
              </div>
              <div className="border-t border-gray-200 pt-4">
                <div className="flex justify-between">
                  <dt className="text-sm text-gray-500">Artifacts Status</dt>
                  <dd className="text-sm font-medium">
                    {artifacts?.manifest ? (
                      <span className="text-green-600">Ready</span>
                    ) : (
                      <span className="text-red-600">Missing</span>
                    )}
                  </dd>
                </div>
              </div>
            </dl>
          </div>

          {projects.length > 0 && (
            <div className="bg-white shadow rounded-lg p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Projects</h3>
              <ul className="space-y-3 text-sm">
                {projects.map((project) => {
                  const isActive =
                    project.is_active ?? project.id === String(activeWorkspace?.id ?? activeWorkspace?.key)
                  return (
                    <li key={project.id} className="flex items-center justify-between">
                      <div>
                        <div className="font-medium text-gray-900">
                          {project.name}
                          {isActive && <span className="ml-2 text-xs text-green-600">(active)</span>}
                        </div>
                        <div className="text-xs text-gray-500">
                          {project.status ? `Status: ${project.status}` : 'Status: unknown'}
                          {project.last_activity && (
                            <>
                              {' • Last activity: '}
                              {new Date(project.last_activity).toLocaleString()}
                            </>
                          )}
                        </div>
                      </div>
                      {isAuthEnabled && !isActive && project.id && (
                        <button
                          type="button"
                          className="text-xs px-2 py-1 rounded border border-gray-300 text-gray-700 hover:bg-gray-50"
                          onClick={() => {
                            const numericId = Number(project.id)
                            if (!Number.isNaN(numericId)) {
                              switchWorkspace(numericId)
                            }
                          }}
                        >
                          Switch
                        </button>
                      )}
                    </li>
                  )
                })}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default DashboardPage
