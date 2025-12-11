import { useEffect, useState, useCallback } from 'react'
import { api } from '../api/client'
import { RunRecord } from '../types'
import { StatusBadge } from '../components/StatusBadge'
import { Table } from '../components/Table'
import { useAutoRefresh } from '../hooks/useAutoRefresh'

function RunsPage() {
  const [runs, setRuns] = useState<RunRecord[]>([])

  const loadRuns = useCallback(() => {
    api.get<RunRecord[]>('/runs').then((res) => setRuns(res.data)).catch(() => setRuns([]))
  }, [])

  useEffect(() => {
    loadRuns()
  }, [loadRuns])

  // Auto-refresh when run_results updates
  useAutoRefresh({
    onRunResultsUpdate: loadRuns,
    onAnyUpdate: (updatedArtifacts) => {
      console.log('Runs page: artifacts updated:', updatedArtifacts)
    }
  })

  // Listen for global refresh events
  useEffect(() => {
    const handleArtifactsUpdated = (event: CustomEvent) => {
      const { updatedArtifacts } = event.detail
      if (updatedArtifacts.includes('run_results')) {
        loadRuns()
      }
    }

    window.addEventListener('artifactsUpdated', handleArtifactsUpdated as EventListener)
    return () => {
      window.removeEventListener('artifactsUpdated', handleArtifactsUpdated as EventListener)
    }
  }, [loadRuns])

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Runs</h1>
      <Table
        columns={[
          { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
          { key: 'start_time', header: 'Start' },
          { key: 'end_time', header: 'End' },
          { key: 'duration', header: 'Duration (s)' },
          { key: 'model_unique_id', header: 'Model ID' },
        ]}
        data={runs}
      />
    </div>
  )
}

export default RunsPage
