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
    return <div className="p-6">Loading plugins...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-100">Installed Plugins</h1>
          <p className="text-sm text-gray-400">
            Manage system plugins and dbt adapters.
          </p>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Adapter Suggestions Section */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-medium text-gray-900">dbt Adapters</h2>
          <p className="text-sm text-gray-500">Adapters required by your profiles or installed on the system.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Package</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Version</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {adapters.map((adapter) => (
                <tr key={adapter.package}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 capitalize">{adapter.type}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{adapter.package}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    {adapter.installed ? (
                      <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">
                        Installed
                      </span>
                    ) : adapter.required_by_profile ? (
                      <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-yellow-100 text-yellow-800">
                        Missing
                      </span>
                    ) : (
                      <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-gray-100 text-gray-800">
                        Available
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{adapter.current_version || '-'}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    {processingPackage === adapter.package ? (
                      <span className="text-gray-500">Processing...</span>
                    ) : (
                      <>
                        {!adapter.installed && (
                          <button
                            onClick={() => handleInstall(adapter.package)}
                            className="text-blue-600 hover:text-blue-900"
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
                <tr><td colSpan={5} className="px-6 py-4 text-center text-gray-500">No adapters found or required.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-medium text-gray-900">System Plugins</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Version</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Description</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {plugins.map((plugin) => (
                <tr key={plugin.name}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{plugin.name}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{plugin.version}</td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${plugin.enabled ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                      }`}>
                      {plugin.enabled ? 'Enabled' : 'Disabled'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500 max-w-sm truncate">{plugin.description}</td>
                </tr>
              ))}
              {plugins.length === 0 && (
                <tr><td colSpan={4} className="px-6 py-4 text-center text-gray-500">No system plugins found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
