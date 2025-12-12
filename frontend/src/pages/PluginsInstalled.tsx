import { useEffect, useState } from 'react'
import { PluginCard } from '../components/PluginCard'
import { disablePlugin, enablePlugin, listInstalledPlugins, reloadPlugins } from '../services/pluginService'
import { PluginSummary } from '../types/plugins'

export default function PluginsInstalledPage() {
  const [plugins, setPlugins] = useState<PluginSummary[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadPlugins = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const installed = await listInstalledPlugins()
      setPlugins(installed)
    } catch (err) {
      setError('Failed to load plugins')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadPlugins()
  }, [])

  const handleEnable = async (name: string) => {
    await enablePlugin(name)
    loadPlugins()
  }

  const handleDisable = async (name: string) => {
    await disablePlugin(name)
    loadPlugins()
  }

  const handleReload = async () => {
    await reloadPlugins()
    loadPlugins()
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Installed Plugins</h1>
          <p className="text-gray-400 text-sm">
            Manage enablement, hot reload, and diagnostics for installed extensions.
          </p>
        </div>
        <button
          onClick={handleReload}
          className="px-3 py-2 rounded bg-accent/20 text-accent hover:bg-accent/30 text-sm"
        >
          Reload Plugins
        </button>
      </div>
      {isLoading && <div className="text-gray-300">Loading plugins…</div>}
      {error && <div className="text-red-400">{error}</div>}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {plugins.map((plugin) => (
          <PluginCard key={plugin.name} plugin={plugin} onEnable={handleEnable} onDisable={handleDisable} />
        ))}
      </div>
      {!plugins.length && !isLoading && (
        <div className="text-gray-400 text-sm">No plugins discovered in the configured directory.</div>
      )}
    </div>
  )
}

