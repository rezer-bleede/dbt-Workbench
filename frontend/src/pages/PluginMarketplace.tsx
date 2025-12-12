import { useEffect, useState } from 'react'
import { PluginCard } from '../components/PluginCard'
import { disablePlugin, enablePlugin, listInstalledPlugins } from '../services/pluginService'
import { PluginSummary } from '../types/plugins'

export default function PluginMarketplacePage() {
  const [plugins, setPlugins] = useState<PluginSummary[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const loadPlugins = async () => {
    setIsLoading(true)
    const installed = await listInstalledPlugins()
    setPlugins(installed)
    setIsLoading(false)
  }

  useEffect(() => {
    loadPlugins()
  }, [])

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-white">Plugin Marketplace</h1>
        <p className="text-gray-400 text-sm">
          Browse discoverable plugins and review required capabilities before enabling them.
        </p>
      </div>
      {isLoading && <div className="text-gray-300">Loading marketplace…</div>}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {plugins.map((plugin) => (
          <PluginCard
            key={plugin.name}
            plugin={plugin}
            onEnable={enablePlugin}
            onDisable={disablePlugin}
          />
        ))}
      </div>
      {!plugins.length && !isLoading && (
        <div className="text-gray-400 text-sm">No plugins published yet.</div>
      )}
    </div>
  )
}

