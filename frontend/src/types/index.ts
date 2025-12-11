export interface HealthResponse {
  status: string
  backend: string
  version: string
}

export interface ArtifactSummary {
  manifest: boolean
  run_results: boolean
  catalog: boolean
}

export interface ModelSummary {
  unique_id: string
  name: string
  resource_type: string
  depends_on: string[]
  database?: string
  schema?: string
  alias?: string
}

export interface ModelDetail extends ModelSummary {
  description?: string
  columns: Record<string, { name?: string; description?: string }>
  children: string[]
}

export interface LineageNode {
  id: string
  label: string
  type: string
}

export interface LineageEdge {
  source: string
  target: string
}

export interface LineageGraph {
  nodes: LineageNode[]
  edges: LineageEdge[]
}

export interface RunRecord {
  status?: string
  start_time?: string
  end_time?: string
  duration?: number
  invocation_id?: string
  model_unique_id?: string
}

export interface ArtifactVersionInfo {
  current_version: number
  timestamp: string | null
  checksum: string | null
  available_versions: number[]
  status: {
    healthy: boolean
    last_error: string | null
    last_check: string | null
  }
}

export interface VersionCheckResponse {
  updates_available: Record<string, boolean>
  any_updates: boolean
  current_versions: Record<string, number>
  version_info: Record<string, ArtifactVersionInfo>
}
