import { PluginSummary } from '../types/plugins'

interface PluginCardProps {
  plugin: PluginSummary
  onEnable: (name: string) => void
  onDisable: (name: string) => void
}

export function PluginCard({ plugin, onEnable, onDisable }: PluginCardProps) {
  const toggle = () => {
    if (plugin.enabled) {
      onDisable(plugin.name)
    } else {
      onEnable(plugin.name)
    }
  }

  return (
    <div className="border border-gray-800 rounded-lg p-4 bg-panel shadow-sm space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-white">{plugin.name}</h3>
          <p className="text-sm text-gray-400">v{plugin.version}</p>
        </div>
        <button
          onClick={toggle}
          className={`px-3 py-1 rounded text-sm font-medium ${
            plugin.enabled
              ? 'bg-red-500/20 text-red-200 hover:bg-red-500/30'
              : 'bg-emerald-500/20 text-emerald-100 hover:bg-emerald-500/30'
          }`}
        >
          {plugin.enabled ? 'Disable' : 'Enable'}
        </button>
      </div>
      <p className="text-gray-300 text-sm leading-relaxed">{plugin.description}</p>
      <div className="flex flex-wrap gap-2 text-xs text-gray-300">
        {plugin.capabilities.map((capability) => (
          <span key={capability} className="px-2 py-1 rounded bg-gray-800 border border-gray-700">
            {capability}
          </span>
        ))}
      </div>
      <div className="text-xs text-gray-400">
        <div className="flex items-center gap-2">
          <span className="font-semibold">Author:</span>
          <span>{plugin.author}</span>
        </div>
        {!plugin.compatibility_ok && (
          <div className="text-amber-300">Compatibility check failed</div>
        )}
        {plugin.last_error && <div className="text-red-400">{plugin.last_error}</div>}
      </div>
    </div>
  )
}

