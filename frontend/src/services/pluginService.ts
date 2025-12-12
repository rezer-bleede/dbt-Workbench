import { api } from '../api/client'
import { PluginReloadResponse, PluginSummary, PluginToggleResponse } from '../types/plugins'

export async function listInstalledPlugins(): Promise<PluginSummary[]> {
  const resp = await api.get<PluginSummary[]>('/plugins/installed')
  return resp.data
}

export async function enablePlugin(pluginName: string): Promise<PluginToggleResponse> {
  const resp = await api.post<PluginToggleResponse>(`/plugins/${pluginName}/enable`)
  return resp.data
}

export async function disablePlugin(pluginName: string): Promise<PluginToggleResponse> {
  const resp = await api.post<PluginToggleResponse>(`/plugins/${pluginName}/disable`)
  return resp.data
}

export async function reloadPlugins(pluginName?: string): Promise<PluginReloadResponse> {
  const params = pluginName ? { plugin_name: pluginName } : undefined
  const resp = await api.post<PluginReloadResponse>('/plugins/reload', null, { params })
  return resp.data
}
