import { useEffect, useState } from 'react'
import { PluginCard } from '../components/PluginCard'
import { PluginService } from '../services/pluginService'
import { PluginSummary } from '../types/plugins'

export default function PluginMarketplacePage() {
  const [plugins, setPlugins] = useState<PluginSummary[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const loadPlugins = async () => {
    setIsLoading(true)
    const installed = await PluginService.list()
    setPlugins(installed)
    setIsLoading(false)
  }

  useEffect(() => {
    loadPlugins()
  }, [])

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-text">Plugin Marketplace</h1>
        <p className="text-muted text-sm">
          Browse discoverable plugins and review required capabilities before enabling them.
        </p>
      </div>
      {isLoading && <div className="text-muted">Loading marketplace…</div>}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {plugins.map((plugin) => (
          <PluginCard
            key={plugin.name}
            plugin={plugin}
            onEnable={PluginService.enable}
            onDisable={PluginService.disable}
          />
        ))}
      </div>
      {!plugins.length && !isLoading && (
        <div className="text-muted text-sm">No plugins published yet.</div>
      )}
    </div>
  )
}

