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
    <div className="border border-widget-border rounded-xl p-4 bg-widget-bg shadow-2xs hover:shadow-xs hover:border-brand-primary/30 transition-all space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-text-primary">{plugin.name}</h3>
          <p className="text-sm text-text-tertiary">v{plugin.version}</p>
        </div>
        <button
          onClick={toggle}
          className={`px-3 py-1 rounded-lg text-sm font-semibold ${
            plugin.enabled
              ? 'bg-brand-danger/15 text-brand-danger border border-brand-danger/30 hover:bg-brand-danger/25'
              : 'bg-brand-success/15 text-brand-success border border-brand-success/30 hover:bg-brand-success/25'
          }`}
        >
          {plugin.enabled ? 'Disable' : 'Enable'}
        </button>
      </div>
      <p className="text-text-secondary text-sm leading-relaxed">{plugin.description}</p>
      <div className="flex flex-wrap gap-2 text-xs text-text-secondary">
        {plugin.capabilities.map((capability) => (
          <span key={capability} className="px-2 py-1 rounded-full bg-brand-primary/10 border border-brand-primary/20 text-brand-primary font-semibold">
            {capability}
          </span>
        ))}
      </div>
      <div className="text-xs text-text-tertiary">
        <div className="flex items-center gap-2">
          <span className="font-semibold">Author:</span>
          <span>{plugin.author}</span>
        </div>
        {!plugin.compatibility_ok && (
          <div className="text-brand-warning">Compatibility check failed</div>
        )}
        {plugin.last_error && <div className="text-brand-danger">{plugin.last_error}</div>}
      </div>
    </div>
  )
}

