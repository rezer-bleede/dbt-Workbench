import React, { useEffect, useState } from 'react';
import { PluginSummary, AdapterSuggestion, PluginService } from '../services/pluginService';
import { useAuth } from '../context/AuthContext';

export default function PluginsInstalled() {
  const { user, isAuthEnabled } = useAuth();
  const isAdmin = !isAuthEnabled || user?.role === 'admin';

  const [plugins, setPlugins] = useState<PluginSummary[]>([]);
  const [adapters, setAdapters] = useState<AdapterSuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [processingPackage, setProcessingPackage] = useState<string | null>(null);

  const loadData = async () => {
    try {
      const [pluginsData, adaptersData] = await Promise.all([
        PluginService.list(),
        PluginService.getAdapterSuggestions()
      ]);
      setPlugins(pluginsData);
      setAdapters(adaptersData);
    } catch (err) {
      setError('Failed to load plugins');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleInstall = async (pkg: string) => {
    setProcessingPackage(pkg);
    try {
      await PluginService.installPackage(pkg);
      await loadData(); // Reload to update status
    } catch (err) {
      setError(`Failed to install ${pkg}`);
    } finally {
      setProcessingPackage(null);
    }
  };

  const handleUpgrade = async (pkg: string) => {
    setProcessingPackage(pkg);
    try {
      await PluginService.upgradePackage(pkg);
      await loadData();
    } catch (err) {
      setError(`Failed to upgrade ${pkg}`);
    } finally {
      setProcessingPackage(null);
    }
  };

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="panel-gradient-subtle inline-flex items-center gap-3 rounded-full px-4 py-2">
          <svg className="h-5 w-5 animate-spin text-accent" viewBox="0 0 24 24" fill="none">
            <circle
              className="opacity-20"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="3"
            />
            <path
              className="opacity-80"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V2.5C6.2 2.5 2.5 6.2 2.5 12H4z"
            />
          </svg>
          <span className="text-sm text-muted">loading plugins..</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted">
            Installed Plugins: Manage system plugins and dbt adapters.
          </p>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-status-danger/35 bg-status-danger/15 p-4 text-sm text-status-danger">
          {error}
        </div>
      )}

      {/* Adapter Suggestions Section */}
      <div className="panel-gradient rounded-lg">
        <div className="panel-divider border-b px-6 py-4">
          <h2 className="text-lg font-medium text-text">dbt Adapters</h2>
          <p className="text-sm text-muted">Adapters required by your profiles or installed on the system.</p>
        </div>
        <div className="panel-table overflow-x-auto">
          <table className="min-w-full divide-y divide-border">
            <thead>
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted">Type</th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted">Package</th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted">Version</th>
                <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {adapters.map((adapter) => (
                <tr key={adapter.package}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm capitalize text-text">{adapter.type}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-muted">{adapter.package}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    {adapter.installed ? (
                      <span className="inline-flex rounded-full border border-status-success/35 bg-status-success/15 px-2 text-xs font-semibold leading-5 text-status-success">
                        Installed
                      </span>
                    ) : adapter.required_by_profile ? (
                      <span className="inline-flex rounded-full border border-status-warning/35 bg-status-warning/15 px-2 text-xs font-semibold leading-5 text-status-warning">
                        Missing
                      </span>
                    ) : (
                      <span className="inline-flex rounded-full border border-border bg-surface-muted/60 px-2 text-xs font-semibold leading-5 text-muted">
                        Available
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-muted">{adapter.current_version || '-'}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    {processingPackage === adapter.package ? (
                      <span className="text-muted">Processing...</span>
                    ) : (
                      <>
                        {!adapter.installed && (
                          <button
                            onClick={() => handleInstall(adapter.package)}
                            className="text-primary hover:text-primary-hover"
                          >
                            Install
                          </button>
                        )}
                        {adapter.installed && (
                          <button
                            onClick={() => handleUpgrade(adapter.package)}
                            className="text-accent hover:text-accent/80 ml-4"
                          >
                            Upgrade
                          </button>
                        )}
                      </>
                    )}
                  </td>
                </tr>
              ))}
              {adapters.length === 0 && (
                <tr><td colSpan={5} className="px-6 py-4 text-center text-muted">No adapters found or required.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="panel-gradient rounded-lg">
        <div className="panel-divider border-b px-6 py-4">
          <h2 className="text-lg font-medium text-text">System Plugins</h2>
        </div>
        <div className="panel-table overflow-x-auto">
          <table className="min-w-full divide-y divide-border">
            <thead>
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted">Name</th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted">Version</th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted">Description</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {plugins.map((plugin) => (
                <tr key={plugin.name}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-text">{plugin.name}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-muted">{plugin.version}</td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex rounded-full px-2 text-xs font-semibold leading-5 ${plugin.enabled ? 'border border-status-success/35 bg-status-success/15 text-status-success' : 'border border-status-danger/35 bg-status-danger/15 text-status-danger'
                      }`}>
                      {plugin.enabled ? 'Enabled' : 'Disabled'}
                    </span>
                  </td>
                  <td className="max-w-sm truncate px-6 py-4 text-sm text-muted">{plugin.description}</td>
                </tr>
              ))}
              {plugins.length === 0 && (
                <tr><td colSpan={4} className="px-6 py-4 text-center text-muted">No system plugins found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
