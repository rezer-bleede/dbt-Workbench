import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api } from '../api/client'
import { ModelDetail } from '../types'
import { StatusBadge } from '../components/StatusBadge'

function ModelDetailPage() {
  const { modelId } = useParams()
  const [model, setModel] = useState<ModelDetail | null>(null)
  const navigate = useNavigate()

  useEffect(() => {
    if (!modelId) return
    api.get<ModelDetail>(`/models/${encodeURIComponent(modelId)}`).then((res) => setModel(res.data)).catch(() => setModel(null))
  }, [modelId])

  if (!model) {
    return <div className="text-muted">Model not found.</div>
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm text-muted">{model.unique_id}</div>
          <h1 className="text-2xl font-semibold text-text">{model.name}</h1>
          <div className="text-muted text-sm">{[model.database, model.schema, model.alias].filter(Boolean).join('.')}</div>
        </div>
        <StatusBadge status={model.resource_type} />
      </div>

      <div className="bg-panel border border-border rounded-lg p-4">
        <h2 className="text-lg font-semibold mb-2 text-text">Description</h2>
        <p className="text-text text-sm leading-relaxed">{model.description || 'No description provided.'}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-panel border border-border rounded-lg p-4">
          <h3 className="text-lg font-semibold mb-2 text-text">Columns</h3>
          <ul className="text-sm text-text space-y-2">
            {Object.entries(model.columns).map(([key, col]) => (
              <li key={key}>
                <div className="font-semibold text-text">{col.name || key}</div>
                <div className="text-muted text-xs">{col.description || 'No description'}</div>
              </li>
            ))}
          </ul>
        </div>
        <div className="bg-panel border border-border rounded-lg p-4 space-y-2">
          <h3 className="text-lg font-semibold text-text">Dependencies</h3>
          <div>
            <div className="text-sm text-muted">Parents</div>
            <div className="flex flex-wrap gap-2">
              {model.depends_on.map((parent) => (
                <button key={parent} className="text-accent text-sm underline" onClick={() => navigate(`/models/${parent}`)}>
                  {parent}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="text-sm text-muted">Children</div>
            <div className="flex flex-wrap gap-2">
              {model.children.map((child) => (
                <button key={child} className="text-accent text-sm underline" onClick={() => navigate(`/models/${child}`)}>
                  {child}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default ModelDetailPage
