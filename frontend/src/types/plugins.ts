export interface PluginSummary {
  name: string
  version: string
  description: string
  author: string
  capabilities: string[]
  permissions: string[]
  enabled: boolean
  last_error?: string | null
  compatibility_ok: boolean
  screenshots?: string[]
  homepage?: string | null
}

export interface PluginToggleResponse {
  plugin: PluginSummary
  action: string
}

export interface PluginReloadResponse {
  reloaded: PluginSummary[]
}
