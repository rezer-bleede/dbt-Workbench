import { useEffect, useMemo, useState } from 'react'
import { api } from '../api/client'
import { ArtifactSummary, HealthResponse, ModelSummary, RunSummary, GitRepository } from '../types'
import KPICard from '../components/ui/KPICard'
import ChartWidget from '../components/ui/ChartWidget'
import { useAuth } from '../context/AuthContext'
import { ExecutionService } from '../services/executionService'
import { cn } from '../utils/cn'

const dayKey = (iso: string) => {
  const d = new Date(iso)
  return `${d.getMonth() + 1}/${d.getDate()}`
}

function DashboardPage() {
  const [health, setHealth] = useState<HealthResponse | null>(null)
  const [artifacts, setArtifacts] = useState<ArtifactSummary | null>(null)
  const [models, setModels] = useState<ModelSummary[]>([])
  const [runs, setRuns] = useState<RunSummary[]>([])
  const [repo, setRepo] = useState<GitRepository | null>(null)
  const [runsLoading, setRunsLoading] = useState(true)
  const { activeWorkspace, workspaces, switchWorkspace } = useAuth()

  useEffect(() => {
    setArtifacts(null)
    setModels([])
    setRuns([])
    setRepo(null)
    setRunsLoading(true)
    api.get<HealthResponse>('/health').then((res) => setHealth(res.data)).catch(() => setHealth(null))
    api.get<ArtifactSummary>('/artifacts').then((res) => setArtifacts(res.data)).catch(() => setArtifacts(null))
    api.get<ModelSummary[]>('/models').then((res) => setModels(res.data)).catch(() => setModels([]))
    ExecutionService.getRunHistory(1, 20)
      .then((res) => setRuns(res.runs))
      .catch(() => setRuns([]))
      .finally(() => setRunsLoading(false))
    api.get<GitRepository>('/git/repository').then((res) => setRepo(res.data)).catch(() => setRepo(null))
  }, [activeWorkspace?.id])

  const lastRun = runs[0]

  const modelStats = useMemo(
    () =>
      models.reduce((acc, model) => {
        const type = model.resource_type
        acc[type] = (acc[type] || 0) + 1
        return acc
      }, {} as Record<string, number>),
    [models]
  )

  const runTimeline = useMemo(() => {
    const byDay = new Map<string, { day: string; succeeded: number; failed: number; other: number }>()
    runs.forEach((run) => {
      if (!run.start_time) return
      const key = dayKey(run.start_time)
      const row = byDay.get(key) ?? { day: key, succeeded: 0, failed: 0, other: 0 }
      if (run.status === 'succeeded') row.succeeded += 1
      else if (run.status === 'failed') row.failed += 1
      else row.other += 1
      byDay.set(key, row)
    })
    return Array.from(byDay.values()).reverse()
  }, [runs])

  const resourceMix = useMemo(
    () =>
      Object.entries(modelStats)
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value),
    [modelStats]
  )

  const succeededCount = runs.filter((r) => r.status === 'succeeded').length
  const successRate = runs.length > 0 ? Math.round((succeededCount / runs.length) * 100) : null

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-bold tracking-tight text-text-primary truncate">
            {activeWorkspace?.name || 'Project Pulse'}
          </h1>
          <p className="text-xs text-text-tertiary mt-0.5">
            {workspaces.length} workspace{workspaces.length === 1 ? '' : 's'} · dbt command center
          </p>
        </div>
        <div className="flex items-center gap-2">
          {workspaces.length > 1 && (
            <select
              className="bg-bg-tertiary/80 border border-border-primary/60 rounded-lg px-2 py-1.5 text-xs font-semibold text-text-primary focus:outline-none focus:border-brand-primary cursor-pointer"
              value={activeWorkspace?.id ?? ''}
              onChange={(e) => {
                const id = Number(e.target.value)
                if (!Number.isNaN(id)) switchWorkspace(id)
              }}
              aria-label="Switch workspace"
            >
              {workspaces.map((ws) => (
                <option key={ws.id} value={ws.id}>
                  {ws.name}
                </option>
              ))}
            </select>
          )}
          {health && (
            <span
              className={cn(
                'px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border',
                health.status === 'ok'
                  ? 'bg-brand-success/15 text-brand-success border-brand-success/30'
                  : 'bg-brand-danger/15 text-brand-danger border-brand-danger/30'
              )}
            >
              System: {health.status}
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          title="Total Models"
          value={models.length}
          subtitle={`${modelStats['model'] || 0} models · ${modelStats['seed'] || 0} seeds · ${modelStats['snapshot'] || 0} snapshots`}
          definitionTooltip="Resources discovered in the latest manifest.json for this workspace."
          footerNote="Manifest"
        />
        <KPICard
          title="Sources"
          value={modelStats['source'] || 0}
          subtitle="Upstream tables registered in dbt sources"
          definitionTooltip="Source assets defined in your dbt project's schema files."
          footerNote="Manifest"
        />
        <KPICard
          title="Tests"
          value={modelStats['test'] || 0}
          subtitle={successRate !== null ? `${successRate}% run success rate (last ${runs.length})` : 'No test runs yet'}
          interpretationTag={successRate === null ? undefined : successRate >= 80 ? 'Healthy' : successRate >= 50 ? 'Watch' : 'Failing'}
          interpretationColor={successRate === null ? 'neutral' : successRate >= 80 ? 'success' : successRate >= 50 ? 'warning' : 'danger'}
          definitionTooltip="Generic and singular tests collected from the manifest."
          footerNote="Manifest"
        />
        <KPICard
          title="Latest Run"
          value={lastRun ? (lastRun.status === 'succeeded' ? 'Passed' : lastRun.status === 'failed' ? 'Failed' : lastRun.status) : '—'}
          interpretationTag={lastRun ? lastRun.command : undefined}
          interpretationColor={lastRun?.status === 'succeeded' ? 'success' : lastRun?.status === 'failed' ? 'danger' : 'neutral'}
          subtitle={lastRun ? new Date(lastRun.start_time).toLocaleString() : 'No runs recorded yet'}
          definitionTooltip="The most recent dbt invocation tracked by the workbench."
          footerNote="Run history"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <ChartWidget
            title="Run Outcomes"
            subtitle={`dbt invocations grouped by day (last ${runs.length} runs)`}
            data={runTimeline}
            type="stackedBar"
            xKey="day"
            series={[
              { key: 'succeeded', label: 'Succeeded', color: 'var(--chart-3)' },
              { key: 'failed', label: 'Failed', color: 'var(--chart-5)' },
              { key: 'other', label: 'Other', color: 'var(--chart-4)' },
            ]}
            loading={runsLoading}
            height={260}
          />

          <div className="bg-widget-bg border border-widget-border rounded-xl p-6 shadow-2xs">
            <h3 className="mb-4 text-sm font-semibold text-text-primary">Recent Activity</h3>
            <div className="flow-root">
              <ul className="-mb-8">
                {runs.slice(0, 5).map((run, runIdx) => (
                  <li key={run.run_id}>
                    <div className="relative pb-8">
                      {runIdx !== runs.slice(0, 5).length - 1 ? (
                        <span className="absolute top-4 left-4 -ml-px h-full w-0.5 bg-border-primary" aria-hidden="true" />
                      ) : null}
                      <div className="relative flex space-x-3">
                        <div>
                          <span
                            className={cn(
                              'flex h-8 w-8 items-center justify-center rounded-full ring-4 ring-widget-bg border',
                              run.status === 'succeeded'
                                ? 'bg-brand-success border-transparent'
                                : run.status === 'failed'
                                ? 'bg-brand-danger border-transparent'
                                : 'bg-bg-tertiary border-border-primary'
                            )}
                          >
                            <span className="text-brand-accent-contrast font-bold text-xs">{run.status?.[0]?.toUpperCase() ?? '·'}</span>
                          </span>
                        </div>
                        <div className="min-w-0 flex-1 pt-1.5 flex justify-between space-x-4">
                          <div>
                            <p className="text-sm text-text-secondary">
                              Run <span className="font-semibold text-text-primary">#{run.run_id.substring(0, 8)}</span>{' '}
                              <span className="text-xs text-text-tertiary">({run.command})</span>
                            </p>
                          </div>
                          <div className="text-right text-xs whitespace-nowrap text-text-tertiary">
                            {new Date(run.start_time).toLocaleString()}
                          </div>
                        </div>
                      </div>
                    </div>
                  </li>
                ))}
                {runs.length === 0 && <li className="text-sm text-text-tertiary">No recent activity.</li>}
              </ul>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <ChartWidget
            title="Resource Mix"
            subtitle="Manifest resources by type"
            data={resourceMix}
            type="donut"
            xKey="name"
            series={[{ key: 'value' }]}
            height={240}
          />

          <div className="bg-widget-bg border border-widget-border rounded-xl p-6 shadow-2xs space-y-4">
            <h3 className="text-sm font-semibold text-text-primary">Project Overview</h3>
            <dl className="space-y-3">
              <div className="flex justify-between">
                <dt className="text-xs text-text-tertiary">Models</dt>
                <dd className="text-sm font-bold text-text-primary tabular-nums">{modelStats['model'] || 0}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-xs text-text-tertiary">Seeds</dt>
                <dd className="text-sm font-bold text-text-primary tabular-nums">{modelStats['seed'] || 0}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-xs text-text-tertiary">Snapshots</dt>
                <dd className="text-sm font-bold text-text-primary tabular-nums">{modelStats['snapshot'] || 0}</dd>
              </div>
              <div className="border-t border-border-primary pt-4 space-y-2">
                <dt className="text-[11px] font-bold text-text-tertiary uppercase tracking-wider">Artifacts Status</dt>
                {[
                  { label: 'Manifest', present: artifacts?.manifest },
                  { label: 'Catalog', present: artifacts?.catalog },
                  { label: 'Run Results', present: artifacts?.run_results },
                  { label: 'Docs', present: artifacts?.docs },
                ].map((item) => (
                  <div key={item.label} className="flex justify-between text-sm">
                    <span className="text-xs text-text-secondary">{item.label}</span>
                    <span
                      className={cn(
                        'text-[10px] font-bold uppercase tracking-wider',
                        item.present ? 'text-brand-success' : 'text-brand-danger'
                      )}
                    >
                      {item.present ? 'Present' : 'Missing'}
                    </span>
                  </div>
                ))}
              </div>
            </dl>
            {repo && (
              <div className="border-t border-border-primary pt-4">
                <p className="text-[11px] font-bold text-text-tertiary uppercase tracking-wider mb-1">Connected Remote</p>
                <p className="text-xs font-mono text-text-secondary break-all">{repo.remote_url}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default DashboardPage
