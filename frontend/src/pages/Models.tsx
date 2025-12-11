import { useEffect, useMemo, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import { ModelSummary } from '../types'
import { Table } from '../components/Table'
import { useAutoRefresh } from '../hooks/useAutoRefresh'

function ModelsPage() {
  const [models, setModels] = useState<ModelSummary[]>([])
  const [query, setQuery] = useState('')
  const navigate = useNavigate()

  const loadModels = useCallback(() => {
    api.get<ModelSummary[]>('/models').then((res) => setModels(res.data)).catch(() => setModels([]))
  }, [])

  useEffect(() => {
    loadModels()
  }, [loadModels])

  // Auto-refresh when manifest updates (models depend on manifest)
  useAutoRefresh({
    onManifestUpdate: loadModels,
    onAnyUpdate: (updatedArtifacts) => {
      console.log('Models page: artifacts updated:', updatedArtifacts)
    }
  })

  // Listen for global refresh events
  useEffect(() => {
    const handleArtifactsUpdated = (event: CustomEvent) => {
      const { updatedArtifacts } = event.detail
      if (updatedArtifacts.includes('manifest')) {
        loadModels()
      }
    }

    window.addEventListener('artifactsUpdated', handleArtifactsUpdated as EventListener)
    return () => {
      window.removeEventListener('artifactsUpdated', handleArtifactsUpdated as EventListener)
    }
  }, [loadModels])

  const filtered = useMemo(() => {
    return models.filter((model) => model.name.toLowerCase().includes(query.toLowerCase()))
  }, [models, query])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Models</h1>
        <input
          className="bg-gray-900 border border-gray-800 rounded-md px-3 py-2 text-sm text-gray-200"
          placeholder="Search models"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <Table
        columns={[
          { key: 'name', header: 'Name' },
          { key: 'resource_type', header: 'Resource Type' },
          { key: 'database', header: 'Database' },
          { key: 'schema', header: 'Schema' },
          { key: 'alias', header: 'Alias' },
          { key: 'depends_on', header: 'Depends On', render: (m) => m.depends_on.length },
        ]}
        data={filtered}
        onRowClick={(model) => navigate(`/models/${model.unique_id}`)}
      />
    </div>
  )
}

export default ModelsPage
