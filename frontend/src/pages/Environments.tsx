import React, { useEffect, useState } from 'react';
import { Environment, EnvironmentCreate, EnvironmentUpdate } from '../types';
import { EnvironmentService } from '../services/environmentService';
import { ProfileService, ProfileInfo } from '../services/profileService';
import { useAuth } from '../context/AuthContext';

type Mode = 'list' | 'create' | 'edit';

function EnvironmentsPage() {
  const { user, isAuthEnabled } = useAuth();
  const isDeveloperOrAdmin = !isAuthEnabled || user?.role === 'developer' || user?.role === 'admin';

  const [mode, setMode] = useState<Mode>('list');
  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [selectedEnvironment, setSelectedEnvironment] = useState<Environment | null>(null);
  const [form, setForm] = useState<EnvironmentCreate | EnvironmentUpdate | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Profiles state
  const [profiles, setProfiles] = useState<ProfileInfo[]>([]);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [profileContent, setProfileContent] = useState('');
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  const loadData = async () => {
    try {
      const envs = await EnvironmentService.list();
      setEnvironments(envs);

      // Load profiles
      const profileResp = await ProfileService.get();
      setProfiles(profileResp.profiles);
      setProfileContent(profileResp.content);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCreateClick = () => {
    if (!isDeveloperOrAdmin) return;
    setForm({
      name: '',
      description: '',
      dbt_target_name: 'dev',
      connection_profile_reference: 'test_project',
      variables: {},
    });
    setSelectedEnvironment(null);
    setMode('create');
    setError(null);
  };

  const handleEditClick = (env: Environment) => {
    if (!isDeveloperOrAdmin) return;
    setSelectedEnvironment(env);
    setForm({
      name: env.name,
      description: env.description || '',
      dbt_target_name: env.dbt_target_name || '',
      connection_profile_reference: env.connection_profile_reference || '',
      variables: env.variables || {},
    });
    setMode('edit');
  };

  const handleFormChange = (field: keyof (EnvironmentCreate | EnvironmentUpdate), value: any) => {
    if (form) {
      setForm((prev: EnvironmentCreate | EnvironmentUpdate | null) => ({ ...prev!, [field]: value }));

      // If profile changes, reset target or auto-select first available
      if (field === 'connection_profile_reference') {
        const selectedProfile = profiles.find((p: ProfileInfo) => p.name === value);
        if (selectedProfile && selectedProfile.targets.length > 0) {
          // Optional: default to first target
          setForm((prev: EnvironmentCreate | EnvironmentUpdate | null) => ({ ...prev!, dbt_target_name: selectedProfile.targets[0] }));
        } else {
          setForm((prev: EnvironmentCreate | EnvironmentUpdate | null) => ({ ...prev!, dbt_target_name: '' }));
        }
      }
    }
  };

  const handleSave = async () => {
    if (!isDeveloperOrAdmin || !form) return;
    if (!form.name) {
      setError('Environment name is required');
      return;
    }
    setIsSaving(true);
    try {
      if (mode === 'create') {
        await EnvironmentService.create(form as EnvironmentCreate);
      } else if (mode === 'edit' && selectedEnvironment) {
        await EnvironmentService.update(selectedEnvironment.id, form as EnvironmentUpdate);
      }
      await loadData();
      setMode('list');
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save environment');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!isDeveloperOrAdmin) return;
    if (!window.confirm('Delete this environment? This cannot be undone.')) {
      return;
    }
    try {
      await EnvironmentService.delete(id);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete environment');
    }
  };

  const handleManageProfiles = async () => {
    try {
      const resp = await ProfileService.get();
      setProfileContent(resp.content);
      setProfiles(resp.profiles);
      setIsProfileModalOpen(true);
    } catch (err) {
      setError("Failed to load profiles");
    }
  };

  const handleSaveProfile = async () => {
    setIsSavingProfile(true);
    try {
      const resp = await ProfileService.update(profileContent);
      setProfiles(resp.profiles);
      setProfileContent(resp.content);
      setIsProfileModalOpen(false);
      await loadData(); // Reload to refresh dropdowns
    } catch (err) {
      alert('Failed to save profile: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setIsSavingProfile(false);
    }
  };

  // Derived state for targets based on selected profile
  const availableTargets = profiles.find(p => p.name === form?.connection_profile_reference)?.targets || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-100">Environments</h1>
          <p className="text-sm text-gray-400">
            Manage your dbt environments.
          </p>
        </div>
        {isDeveloperOrAdmin && (
          <div className="flex space-x-3">
            <button
              onClick={handleManageProfiles}
              className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
            >
              Manage Profiles
            </button>
            <button
              onClick={handleCreateClick}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-accent hover:bg-accent/90"
            >
              New Environment
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Editor Modal */}
      {isProfileModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl h-[80vh] flex flex-col p-6">
            <h2 className="text-xl font-bold mb-4">Manage Profiles (profiles.yml)</h2>
            <div className="flex-1 mb-4">
              <textarea
                className="w-full h-full p-4 border border-gray-300 rounded font-mono text-sm resize-none focus:ring-2 focus:ring-blue-500 focus:outline-none"
                value={profileContent}
                onChange={(e) => setProfileContent(e.target.value)}
              />
            </div>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setIsProfileModalOpen(false)}
                className="px-4 py-2 border border-gray-300 rounded text-gray-700 hover:bg-gray-100"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveProfile}
                disabled={isSavingProfile}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
              >
                {isSavingProfile ? 'Saving...' : 'Save Profiles'}
              </button>
            </div>
          </div>
        </div>
      )}

      {(mode === 'create' || mode === 'edit') && form && (
        <div className="bg-white rounded-lg shadow p-6 space-y-4">
          <h2 className="text-lg font-semibold">
            {mode === 'create' ? 'Create Environment' : 'Edit Environment'}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Name</label>
              <input
                type="text"
                value={form.name || ''}
                onChange={e => handleFormChange('name', e.target.value)}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Description</label>
              <input
                type="text"
                value={form.description || ''}
                onChange={e => handleFormChange('description', e.target.value)}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Profile</label>
              <select
                value={form.connection_profile_reference || ''}
                onChange={e => handleFormChange('connection_profile_reference', e.target.value)}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm text-sm"
              >
                <option value="">Select Profile...</option>
                {profiles.map(p => (
                  <option key={p.name} value={p.name}>{p.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Target</label>
              <select
                value={form.dbt_target_name || ''}
                onChange={e => handleFormChange('dbt_target_name', e.target.value)}
                disabled={!form.connection_profile_reference}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm text-sm disabled:opacity-50 disabled:bg-gray-50"
              >
                <option value="">Select Target...</option>
                {availableTargets.map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700">Variables (JSON)</label>
              <textarea
                value={form.variables ? JSON.stringify(form.variables, null, 2) : ''}
                onChange={e => {
                  try {
                    handleFormChange('variables', JSON.parse(e.target.value));
                  } catch {
                    // ignore parse error
                  }
                }}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm text-sm font-mono"
                rows={5}
              />
            </div>
          </div>
          <div className="flex justify-end space-x-3 pt-4">
            <button
              type="button"
              onClick={() => setMode('list')}
              className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-accent hover:bg-accent/90 disabled:opacity-50"
            >
              {isSaving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-lg shadow">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Description</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Profile</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Target</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {environments.map(env => (
                <tr key={env.id}>
                  <td className="px-4 py-2 text-sm text-gray-900">{env.name}</td>
                  <td className="px-4 py-2 text-sm text-gray-900">{env.description}</td>
                  <td className="px-4 py-2 text-sm text-gray-900">{env.connection_profile_reference}</td>
                  <td className="px-4 py-2 text-sm text-gray-900">{env.dbt_target_name}</td>
                  <td className="px-4 py-2 text-right text-sm">
                    {isDeveloperOrAdmin && (
                      <div className="space-x-2">
                        <button onClick={() => handleEditClick(env)} className="text-accent hover:underline">Edit</button>
                        <button onClick={() => handleDelete(env.id)} className="text-red-600 hover:underline">Delete</button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {environments.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-sm text-gray-500">
                    No environments found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default EnvironmentsPage;