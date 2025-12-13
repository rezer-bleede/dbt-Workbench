import { api } from '../api/client';

export interface PluginSummary {
  name: string;
  enabled: boolean;
  version?: string;
  description?: string;
  author?: string;
}

export interface AdapterSuggestion {
  type: string;
  package: string;
  installed: boolean;
  current_version: string | null;
  required_by_profile: boolean;
}

export interface PackageOperationResponse {
  success: boolean;
  message: string;
}

export const PluginService = {
  list: async (): Promise<PluginSummary[]> => {
    const response = await api.get<PluginSummary[]>('/plugins/installed');
    return response.data;
  },

  enable: async (name: string): Promise<PluginSummary> => {
    const response = await api.post<{ plugin: PluginSummary }>(`/plugins/${name}/enable`);
    return response.data.plugin;
  },

  disable: async (name: string): Promise<PluginSummary> => {
    const response = await api.post<{ plugin: PluginSummary }>(`/plugins/${name}/disable`);
    return response.data.plugin;
  },

  reload: async (name?: string): Promise<PluginSummary[]> => {
    const response = await api.post<{ reloaded: PluginSummary[] }>('/plugins/reload', { params: { plugin_name: name } });
    return response.data.reloaded;
  },

  getAdapterSuggestions: async (): Promise<AdapterSuggestion[]> => {
    const response = await api.get<AdapterSuggestion[]>('/plugins/adapters');
    return response.data;
  },

  installPackage: async (packageName: string): Promise<PackageOperationResponse> => {
    const response = await api.post<PackageOperationResponse>('/plugins/packages/install', { package_name: packageName });
    return response.data;
  },

  upgradePackage: async (packageName: string): Promise<PackageOperationResponse> => {
    const response = await api.post<PackageOperationResponse>('/plugins/packages/upgrade', { package_name: packageName });
    return response.data;
  },
};
