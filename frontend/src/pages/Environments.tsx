import React, { useEffect, useMemo, useState } from 'react';
import yaml from 'js-yaml';
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
  const [isProfileEditorOpen, setIsProfileEditorOpen] = useState(false);
  const [profileEditorContent, setProfileEditorContent] = useState('');
  const [profileEditorError, setProfileEditorError] = useState<string | null>(null);
  const [editingProfileName, setEditingProfileName] = useState<string | null>(null);

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

  const parsedProfiles = useMemo(() => {
    try {
      const parsed = yaml.load(profileContent) as Record<string, unknown> | undefined;
      if (parsed && typeof parsed === 'object') {
        return parsed as Record<string, unknown>;
      }
    } catch (err) {
      console.error('Failed to parse profiles', err);
    }
    return {};
  }, [profileContent]);

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

  const buildProfileTemplate = () => `new_profile:\n  target: dev\n  outputs:\n    dev:\n      type: postgres\n      host: localhost\n      user: user\n      password: pass\n      dbname: db\n      schema: public\n`;

  const openProfileEditor = (profileName?: string) => {
    setProfileEditorError(null);
    const scopedProfile: Record<string, unknown> = {};

    if (profileName && parsedProfiles[profileName]) {
      scopedProfile[profileName] = parsedProfiles[profileName];
      setEditingProfileName(profileName);
      setProfileEditorContent(yaml.dump(scopedProfile, { lineWidth: 120 }));
    } else {
      setEditingProfileName(null);
      setProfileEditorContent(buildProfileTemplate());
    }
    setIsProfileEditorOpen(true);
  };

  const handleSaveProfileEditor = async () => {
    if (!isDeveloperOrAdmin) return;
    setIsSavingProfile(true);
    setProfileEditorError(null);
    try {
      const parsedSnippet = yaml.load(profileEditorContent);
      if (!parsedSnippet || typeof parsedSnippet !== 'object' || Array.isArray(parsedSnippet)) {
        throw new Error('Profile definition must be a YAML object');
      }

      const merged = { ...parsedProfiles } as Record<string, unknown>;
      Object.entries(parsedSnippet as Record<string, unknown>).forEach(([key, value]) => {
        if (key !== 'config') {
          merged[key] = value;
        }
      });

      const updatedContent = yaml.dump(merged, { lineWidth: 120 });
      const response = await ProfileService.update(updatedContent);
      setProfiles(response.profiles);
      setProfileContent(response.content);
      setIsProfileEditorOpen(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save profile';
      setProfileEditorError(message);
    } finally {
      setIsSavingProfile(false);
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

  const inputClassName = "panel-input mt-1 block h-10 w-full rounded-xl px-3 text-sm";
  const selectClassName = `${inputClassName} pr-8`;
  const labelClassName = "text-sm font-medium text-muted";
  const helperTextClassName = "text-xs text-muted";
  const textareaClassName = "panel-input mt-1 block min-h-[160px] w-full resize-y rounded-xl px-3 py-2 text-sm font-mono";
  const secondaryButtonClassName = "panel-gradient-subtle inline-flex items-center justify-center gap-2 rounded-xl border border-border px-4 py-2 text-sm font-medium text-text hover:bg-panel/70";
  const subtleButtonClassName = "panel-gradient-subtle inline-flex items-center justify-center gap-2 rounded-xl border border-border px-3 py-1.5 text-xs font-medium text-muted hover:bg-panel/70";
  const primaryButtonClassName = "inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:opacity-50";

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-text">Environments</h1>
          <p className="text-sm text-muted">
            Manage dbt profiles, targets, and variables per environment.
          </p>
        </div>
        {isDeveloperOrAdmin && (
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => openProfileEditor()}
              className={secondaryButtonClassName}
            >
              New Profile
            </button>
            <button
              onClick={handleManageProfiles}
              className={secondaryButtonClassName}
            >
              Manage Profiles
            </button>
            <button
              onClick={handleCreateClick}
              className={primaryButtonClassName}
            >
              New Environment
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className="rounded-xl border border-status-danger/35 bg-status-danger/15 p-4 text-sm text-status-danger">
          {error}
        </div>
      )}

      <div className="panel-gradient rounded-2xl p-5">
        <div className="panel-divider flex flex-col gap-3 border-b pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-text">Default dbt Project</h2>
            <p className="text-sm text-muted">Profiles and targets configured for this project.</p>
          </div>
          {isDeveloperOrAdmin && (
            <button
              onClick={handleManageProfiles}
              className={subtleButtonClassName}
            >
              Edit full profiles.yml
            </button>
          )}
        </div>
        {profiles.length === 0 ? (
          <p className="pt-4 text-sm text-muted">No profiles configured yet.</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 pt-4 md:grid-cols-2">
            {profiles.map(profile => (
              <div key={profile.name} className="panel-gradient-subtle rounded-xl p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-text">{profile.name}</p>
                    <p className={helperTextClassName}>{profile.targets.length} target{profile.targets.length === 1 ? '' : 's'}</p>
                  </div>
                  {isDeveloperOrAdmin && (
                    <button
                      onClick={() => openProfileEditor(profile.name)}
                      className={subtleButtonClassName}
                    >
                      Edit
                    </button>
                  )}
                </div>
                {profile.targets.length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {profile.targets.map(target => (
                      <span
                        key={target}
                        className="inline-flex items-center rounded-full border border-border bg-surface-muted/55 px-2.5 py-1 text-xs font-medium text-muted"
                      >
                        {target}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className={`mt-3 ${helperTextClassName}`}>No targets defined.</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Editor Modal */}
      {isProfileModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 px-4 py-6">
          <div className="panel-gradient flex h-[80vh] w-full max-w-4xl flex-col rounded-2xl p-6 shadow-xl">
            <h2 className="text-xl font-semibold text-text">Manage Profiles (profiles.yml)</h2>
            <p className="mt-1 text-sm text-muted">Update profiles and targets for all environments.</p>
            <div className="mt-4 flex-1">
              <textarea
                className="panel-input h-full w-full rounded-xl p-4 text-sm font-mono"
                value={profileContent}
                onChange={(e) => setProfileContent(e.target.value)}
              />
            </div>
            <div className="mt-4 flex justify-end gap-3">
              <button
                onClick={() => setIsProfileModalOpen(false)}
                className={secondaryButtonClassName}
              >
                Cancel
              </button>
              <button
                onClick={handleSaveProfile}
                disabled={isSavingProfile}
                className={primaryButtonClassName}
              >
                {isSavingProfile ? 'Saving...' : 'Save Profiles'}
              </button>
            </div>
          </div>
        </div>
      )}

      {isProfileEditorOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 px-4 py-6">
          <div className="panel-gradient flex h-[70vh] w-full max-w-3xl flex-col rounded-2xl p-6 shadow-xl">
            <h2 className="text-xl font-semibold text-text">{editingProfileName ? `Edit ${editingProfileName}` : 'Add Profile'}</h2>
            <p className="mt-1 text-sm text-muted">Provide a YAML snippet for a single profile. It will be merged into profiles.yml.</p>
            {profileEditorError && (
              <div className="mt-3 rounded-lg border border-status-danger/35 bg-status-danger/15 p-2 text-sm text-status-danger">{profileEditorError}</div>
            )}
            <div className="mt-4 flex-1">
              <textarea
                className="panel-input h-full w-full rounded-xl p-4 text-sm font-mono"
                value={profileEditorContent}
                onChange={(e) => setProfileEditorContent(e.target.value)}
              />
            </div>
            <div className="mt-4 flex justify-end gap-3">
              <button
                onClick={() => setIsProfileEditorOpen(false)}
                className={secondaryButtonClassName}
              >
                Cancel
              </button>
              <button
                onClick={handleSaveProfileEditor}
                disabled={isSavingProfile}
                className={primaryButtonClassName}
              >
                {isSavingProfile ? 'Saving...' : 'Save Profile'}
              </button>
            </div>
          </div>
        </div>
      )}

      {(mode === 'create' || mode === 'edit') && form && (
        <div className="panel-gradient rounded-2xl p-6">
          <div>
            <h2 className="text-lg font-semibold text-text">
              {mode === 'create' ? 'Create Environment' : 'Edit Environment'}
            </h2>
            <p className="mt-1 text-sm text-muted">
              {mode === 'create'
                ? 'Define a new environment for this project.'
                : 'Update settings for the selected environment.'}
            </p>
          </div>

          <div className="panel-divider mt-6 border-t pt-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-text">Basics</h3>
                <p className={helperTextClassName}>Name and describe this environment.</p>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label className={labelClassName}>Name</label>
                <input
                  type="text"
                  value={form.name || ''}
                  onChange={e => handleFormChange('name', e.target.value)}
                  className={inputClassName}
                  placeholder="Production"
                />
              </div>
              <div>
                <label className={labelClassName}>Description</label>
                <input
                  type="text"
                  value={form.description || ''}
                  onChange={e => handleFormChange('description', e.target.value)}
                  className={inputClassName}
                  placeholder="Primary analytics environment"
                />
              </div>
            </div>
          </div>

          <div className="panel-divider mt-6 border-t pt-6">
            <div>
              <h3 className="text-sm font-semibold text-text">dbt settings</h3>
              <p className={helperTextClassName}>Choose the profile and target used for runs.</p>
            </div>
            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label className={labelClassName}>Profile</label>
                <select
                  value={form.connection_profile_reference || ''}
                  onChange={e => handleFormChange('connection_profile_reference', e.target.value)}
                  className={selectClassName}
                >
                  <option value="">Select Profile...</option>
                  {profiles.map(p => (
                    <option key={p.name} value={p.name}>{p.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelClassName}>Target</label>
                <select
                  value={form.dbt_target_name || ''}
                  onChange={e => handleFormChange('dbt_target_name', e.target.value)}
                  disabled={!form.connection_profile_reference}
                  className={`${selectClassName} disabled:cursor-not-allowed disabled:opacity-60`}
                >
                  <option value="">Select Target...</option>
                  {availableTargets.map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="panel-divider mt-6 border-t pt-6">
            <div>
              <h3 className="text-sm font-semibold text-text">Variables</h3>
              <p className={helperTextClassName}>Provide environment-specific variables in JSON.</p>
            </div>
            <div className="mt-4">
              <label className={labelClassName}>Variables (JSON)</label>
              <textarea
                value={form.variables ? JSON.stringify(form.variables, null, 2) : ''}
                onChange={e => {
                  try {
                    handleFormChange('variables', JSON.parse(e.target.value));
                  } catch {
                    // ignore parse error
                  }
                }}
                className={textareaClassName}
                placeholder='{"key": "value"}'
              />
              <p className={`mt-2 ${helperTextClassName}`}>Valid JSON. Example: {`{ "key": "value" }`}</p>
            </div>
          </div>

          <div className="panel-divider mt-6 flex flex-wrap items-center justify-end gap-3 border-t pt-6">
            <button
              type="button"
              onClick={() => setMode('list')}
              className={secondaryButtonClassName}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className={primaryButtonClassName}
            >
              {isSaving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      )}

      <div className="panel-gradient rounded-2xl">
        <div className="panel-table overflow-x-auto">
          <table className="min-w-full divide-y divide-border">
            <thead>
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted">Name</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted">Description</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted">Profile</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted">Target</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {environments.map(env => (
                <tr key={env.id} className="hover:bg-panel/70">
                  <td className="px-4 py-3 text-sm font-medium text-text">{env.name}</td>
                  <td className="px-4 py-3 text-sm text-muted">{env.description}</td>
                  <td className="px-4 py-3 text-sm text-muted">{env.connection_profile_reference}</td>
                  <td className="px-4 py-3 text-sm text-muted">{env.dbt_target_name}</td>
                  <td className="px-4 py-3 text-right text-sm">
                    {isDeveloperOrAdmin && (
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleEditClick(env)}
                          className="panel-gradient-subtle inline-flex items-center rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-muted hover:bg-panel/70"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(env.id)}
                          className="inline-flex items-center rounded-lg border border-status-danger/35 bg-status-danger/15 px-2.5 py-1.5 text-xs font-semibold text-status-danger hover:bg-status-danger/25"
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {environments.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-sm text-muted">
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
