import React, { useEffect, useState } from 'react'
import { api } from '../api/client'
import { ArtifactSummary, GitRepository } from '../types'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import { ThemeColorKey, ThemeMode } from '../utils/theme'
import { AiService } from '../services/aiService'
import { AiMcpServer, AiSettings } from '../types/ai'

interface ConfigResponse {
  execution: {
    dbt_project_path: string
  }
  artifacts_path: string
  auth: {
    enabled: boolean
  }
  artifact_watcher: {
    max_versions: number
    monitored_files: string[]
    polling_interval: number
  }
}

function SettingsPage() {
  const { user } = useAuth()
  const { mode, resolved, setColor, resetTheme } = useTheme()
  const [artifacts, setArtifacts] = useState<ArtifactSummary | null>(null)
  const [config, setConfig] = useState<ConfigResponse | null>(null)
  const [repo, setRepo] = useState<GitRepository | null>(null)
  const [editingMode, setEditingMode] = useState<ThemeMode>(mode)
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [aiSettings, setAiSettings] = useState<AiSettings | null>(null)
  const [mcpServers, setMcpServers] = useState<AiMcpServer[]>([])
  const [aiSecrets, setAiSecrets] = useState<Record<string, string>>({
    openai_api_key: '',
    anthropic_api_key: '',
    gemini_api_key: '',
  })
  const [newMcpName, setNewMcpName] = useState('')
  const [newMcpMode, setNewMcpMode] = useState<'remote_http' | 'remote_sse' | 'local_stdio'>('remote_http')
  const [newMcpUrl, setNewMcpUrl] = useState('')
  const [aiSaveMessage, setAiSaveMessage] = useState<string | null>(null)
  const [aiError, setAiError] = useState<string | null>(null)

  useEffect(() => {
    api.get<ArtifactSummary>('/artifacts').then((res) => setArtifacts(res.data)).catch(() => setArtifacts(null))
    api.get<ConfigResponse>('/config').then((res) => setConfig(res.data)).catch(() => setConfig(null))
    api.get<GitRepository>('/git/repository').then((res) => setRepo(res.data)).catch(() => setRepo(null))
    AiService.getSettings().then(setAiSettings).catch(() => setAiSettings(null))
    AiService.listMcpServers().then(setMcpServers).catch(() => setMcpServers([]))
  }, [])

  useEffect(() => {
    setEditingMode(mode)
  }, [mode])

  const activeTheme = resolved[editingMode]
  const previewStyle = activeTheme.variables as React.CSSProperties
  const colorFields: Array<{ key: ThemeColorKey; label: string; description: string }> = [
    { key: 'primary', label: 'Primary', description: 'Buttons, highlights, key actions.' },
    { key: 'secondary', label: 'Secondary', description: 'Accent elements and secondary actions.' },
    { key: 'background', label: 'Background', description: 'Page background.' },
    { key: 'surface', label: 'Surface', description: 'Cards, panels, tables.' },
    { key: 'text', label: 'Text', description: 'Default text color.' },
  ]

  const handleDraftChange = (modeKey: ThemeMode, key: ThemeColorKey, value: string) => {
    const draftKey = `${modeKey}-${key}`
    setDrafts((prev) => ({ ...prev, [draftKey]: value }))
    if (/^#?[0-9a-fA-F]{6}$/.test(value.trim())) {
      const normalized = value.startsWith('#') ? value : `#${value}`
      setColor(modeKey, key, normalized)
    }
  }

  const handleDraftBlur = (modeKey: ThemeMode, key: ThemeColorKey) => {
    const draftKey = `${modeKey}-${key}`
    setDrafts((prev) => ({ ...prev, [draftKey]: activeTheme.colors[key] }))
  }

  const handleSaveAiSettings = async () => {
    if (!aiSettings) return
    setAiSaveMessage(null)
    setAiError(null)
    try {
      const updated = await AiService.updateSettings({
        enabled: aiSettings.enabled,
        default_mode: aiSettings.default_mode,
        default_direct_provider: aiSettings.default_direct_provider,
        allow_session_provider_override: aiSettings.allow_session_provider_override,
        allow_data_context_results: aiSettings.allow_data_context_results,
        allow_data_context_run_logs: aiSettings.allow_data_context_run_logs,
      })
      setAiSettings(updated)
      setAiSaveMessage('AI settings saved.')
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'Failed to save AI settings')
    }
  }

  const handleSaveAiSecrets = async () => {
    const filtered = Object.fromEntries(Object.entries(aiSecrets).filter(([, value]) => value.trim()))
    if (Object.keys(filtered).length === 0) {
      setAiError('Provide at least one secret value to save.')
      return
    }
    setAiSaveMessage(null)
    setAiError(null)
    try {
      await AiService.updateSecrets({ secrets: filtered })
      setAiSecrets({ openai_api_key: '', anthropic_api_key: '', gemini_api_key: '' })
      setAiSaveMessage('AI secrets saved.')
      const refreshed = await AiService.getSettings()
      setAiSettings(refreshed)
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'Failed to save AI secrets')
    }
  }

  const handleCreateMcpServer = async () => {
    if (!newMcpName.trim()) {
      setAiError('MCP server name is required.')
      return
    }
    if ((newMcpMode === 'remote_http' || newMcpMode === 'remote_sse') && !newMcpUrl.trim()) {
      setAiError('MCP server URL is required for remote mode.')
      return
    }

    setAiSaveMessage(null)
    setAiError(null)
    try {
      const config = newMcpMode === 'local_stdio' ? { template_key: newMcpName.trim() } : { url: newMcpUrl.trim() }
      await AiService.createMcpServer({
        name: newMcpName.trim(),
        mode: newMcpMode,
        enabled: true,
        config,
        secret_refs: [],
      })
      const rows = await AiService.listMcpServers()
      setMcpServers(rows)
      setNewMcpName('')
      setNewMcpUrl('')
      setAiSaveMessage('MCP server added.')
      const refreshed = await AiService.getSettings()
      setAiSettings(refreshed)
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'Failed to create MCP server')
    }
  }

  const handleDeleteMcpServer = async (serverId: number) => {
    setAiSaveMessage(null)
    setAiError(null)
    try {
      await AiService.deleteMcpServer(serverId)
      const rows = await AiService.listMcpServers()
      setMcpServers(rows)
      setAiSaveMessage('MCP server removed.')
      const refreshed = await AiService.getSettings()
      setAiSettings(refreshed)
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'Failed to delete MCP server')
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-text">Settings</h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Theme Selector */}
        <div className="panel-gradient md:col-span-2 rounded-lg p-6 space-y-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h3 className="text-lg font-medium text-text">Color Theme</h3>
              <p className="text-sm text-muted">Edit each color and the UI updates instantly with WCAG contrast checks.</p>
            </div>
            <button
              onClick={() => resetTheme()}
              className="panel-gradient-subtle inline-flex items-center justify-center rounded-md border border-border px-3 py-2 text-sm font-medium text-text hover:bg-panel/70"
            >
              Reset to default theme
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setEditingMode('light')}
              className={`px-3 py-1.5 rounded-md text-sm border ${editingMode === 'light'
                ? 'bg-primary text-primary-foreground border-primary'
                : 'panel-gradient-subtle text-text border-border'
                }`}
            >
              Light
            </button>
            <button
              onClick={() => setEditingMode('dark')}
              className={`px-3 py-1.5 rounded-md text-sm border ${editingMode === 'dark'
                ? 'bg-primary text-primary-foreground border-primary'
                : 'panel-gradient-subtle text-text border-border'
                }`}
            >
              Dark
            </button>
            <span className="text-xs text-muted">Currently applied: {mode} mode</span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,360px)] gap-6">
            <div className="space-y-4">
              {colorFields.map((field) => {
                const draftKey = `${editingMode}-${field.key}`
                const value = drafts[draftKey] ?? activeTheme.colors[field.key]
                return (
                  <div key={field.key} className="panel-gradient-subtle rounded-md border border-border p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm font-medium text-text">{field.label}</div>
                        <div className="text-xs text-muted">{field.description}</div>
                      </div>
                      <input
                        type="color"
                        value={activeTheme.colors[field.key]}
                        onChange={(event) => {
                          const next = event.target.value
                          const draftKey = `${editingMode}-${field.key}`
                          setDrafts((prev) => ({ ...prev, [draftKey]: next }))
                          setColor(editingMode, field.key, next)
                        }}
                        className="panel-input h-10 w-14 rounded border border-border"
                        aria-label={`${field.label} color`}
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={value}
                        onChange={(event) => handleDraftChange(editingMode, field.key, event.target.value)}
                        onBlur={() => handleDraftBlur(editingMode, field.key)}
                        className="panel-input h-9 w-28 rounded border border-border bg-bg px-3 text-sm text-text font-mono"
                      />
                      <span className="text-xs text-muted uppercase">Hex</span>
                    </div>
                  </div>
                )
              })}

              {activeTheme.validation.adjustments.length > 0 && (
                <div className="panel-gradient-subtle rounded-md border border-border p-3 text-sm text-text">
                  <div className="font-medium">Contrast adjustments applied</div>
                  <div className="text-xs text-muted mt-1">
                    {activeTheme.validation.adjustments.map((adjustment) => (
                      <div key={`${adjustment.key}-${adjustment.to}`}>
                        {adjustment.reason} ({adjustment.from} → {adjustment.to})
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {!activeTheme.validation.isValid && (
                <div className="panel-gradient-subtle rounded-md border border-border p-3 text-sm text-text">
                  <div className="font-medium">Theme cannot be saved yet</div>
                  <div className="text-xs text-muted mt-1">
                    {activeTheme.validation.violations.map((violation) => (
                      <div key={`${violation.id}-${violation.label}`}>
                        {violation.label} needs {violation.minRatio}:1 (current {violation.ratio.toFixed(2)}:1)
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-4">
              <div className="panel-gradient-subtle rounded-lg border border-border p-4 space-y-4" style={previewStyle}>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs text-muted uppercase tracking-wide">Preview</div>
                  <div className="text-sm font-semibold text-text">Theme snapshot</div>
                </div>
                <span className="inline-flex items-center rounded-full bg-primary/20 px-3 py-1 text-xs font-medium text-primary">
                  Primary
                </span>
              </div>
              <div className="panel-gradient-subtle rounded-md border border-border p-4 space-y-2">
                <div className="text-sm font-medium text-text">Panel heading</div>
                <div className="text-xs text-muted">This is how surface + text colors combine.</div>
                <button className="inline-flex items-center justify-center rounded-md bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground shadow-sm">
                  Primary action
                </button>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted">
                <span className="h-2 w-2 rounded-full bg-secondary" />
                Secondary accent preview
              </div>
              </div>

              <div className="panel-gradient-subtle rounded-lg border border-border p-4 space-y-3">
                <div className="text-sm font-semibold text-text">Contrast status</div>
                <div className="space-y-2 text-xs text-muted">
                  {activeTheme.validation.checks.map((check) => (
                    <div key={check.id} className="flex items-center justify-between">
                      <span>{check.label}</span>
                      <span className={check.pass ? 'text-primary' : 'text-secondary'}>
                        {check.ratio.toFixed(2)}:1 {check.pass ? 'Pass' : 'Fail'}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="text-[11px] text-muted">
                  Minimum 4.5:1 for text, 3:1 for UI accents.
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="panel-gradient md:col-span-2 rounded-lg p-6 space-y-4">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <h3 className="text-lg font-medium text-text">AI Copilot</h3>
              <p className="text-sm text-muted">Configure workspace defaults, API secrets, and MCP connectivity.</p>
            </div>
            <div className="text-xs text-muted">
              {aiSettings?.ai_system_enabled ? 'System enabled' : 'System disabled by env'}
            </div>
          </div>

          {aiSaveMessage && <div className="rounded border border-primary/30 bg-primary/10 px-3 py-2 text-sm text-primary">{aiSaveMessage}</div>}
          {aiError && <div className="rounded border border-secondary/30 bg-secondary/10 px-3 py-2 text-sm text-secondary">{aiError}</div>}

          {!aiSettings ? (
            <div className="text-sm text-muted">Loading AI settings…</div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <label className="space-y-1 text-sm">
                  <div className="text-muted">Default mode</div>
                  <select
                    value={aiSettings.default_mode}
                    onChange={(e) => setAiSettings((prev) => (prev ? { ...prev, default_mode: e.target.value as 'direct' | 'mcp' } : prev))}
                    className="panel-input w-full rounded border border-border px-3 py-2 text-sm text-text"
                  >
                    <option value="direct">Direct API</option>
                    <option value="mcp">MCP</option>
                  </select>
                </label>
                <label className="space-y-1 text-sm">
                  <div className="text-muted">Direct provider</div>
                  <select
                    value={aiSettings.default_direct_provider}
                    onChange={(e) =>
                      setAiSettings((prev) =>
                        prev ? { ...prev, default_direct_provider: e.target.value as 'openai' | 'anthropic' | 'gemini' } : prev,
                      )
                    }
                    className="panel-input w-full rounded border border-border px-3 py-2 text-sm text-text"
                  >
                    <option value="openai">OpenAI</option>
                    <option value="anthropic">Anthropic</option>
                    <option value="gemini">Gemini</option>
                  </select>
                </label>
                <label className="space-y-1 text-sm">
                  <div className="text-muted">Session override</div>
                  <select
                    value={aiSettings.allow_session_provider_override ? 'on' : 'off'}
                    onChange={(e) =>
                      setAiSettings((prev) =>
                        prev ? { ...prev, allow_session_provider_override: e.target.value === 'on' } : prev,
                      )
                    }
                    className="panel-input w-full rounded border border-border px-3 py-2 text-sm text-text"
                  >
                    <option value="on">Allowed</option>
                    <option value="off">Disabled</option>
                  </select>
                </label>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <label className="space-y-1 text-sm">
                  <div className="text-muted">OpenAI API key</div>
                  <input
                    type="password"
                    value={aiSecrets.openai_api_key}
                    onChange={(e) => setAiSecrets((prev) => ({ ...prev, openai_api_key: e.target.value }))}
                    className="panel-input w-full rounded border border-border px-3 py-2 text-sm text-text"
                    placeholder={aiSettings.has_direct_credentials?.openai ? 'Configured (enter to rotate)' : 'sk-...'}
                  />
                </label>
                <label className="space-y-1 text-sm">
                  <div className="text-muted">Anthropic API key</div>
                  <input
                    type="password"
                    value={aiSecrets.anthropic_api_key}
                    onChange={(e) => setAiSecrets((prev) => ({ ...prev, anthropic_api_key: e.target.value }))}
                    className="panel-input w-full rounded border border-border px-3 py-2 text-sm text-text"
                    placeholder={aiSettings.has_direct_credentials?.anthropic ? 'Configured (enter to rotate)' : 'sk-ant-...'}
                  />
                </label>
                <label className="space-y-1 text-sm">
                  <div className="text-muted">Gemini API key</div>
                  <input
                    type="password"
                    value={aiSecrets.gemini_api_key}
                    onChange={(e) => setAiSecrets((prev) => ({ ...prev, gemini_api_key: e.target.value }))}
                    className="panel-input w-full rounded border border-border px-3 py-2 text-sm text-text"
                    placeholder={aiSettings.has_direct_credentials?.gemini ? 'Configured (enter to rotate)' : 'AIza...'}
                  />
                </label>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleSaveAiSettings}
                  className="rounded bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
                >
                  Save AI settings
                </button>
                <button
                  type="button"
                  onClick={handleSaveAiSecrets}
                  className="rounded border border-border px-3 py-2 text-sm text-text hover:bg-panel"
                >
                  Save API secrets
                </button>
              </div>

              <div className="panel-gradient-subtle rounded border border-border p-4 space-y-3">
                <div className="text-sm font-medium text-text">MCP Servers</div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                  <input
                    value={newMcpName}
                    onChange={(e) => setNewMcpName(e.target.value)}
                    placeholder="Server name"
                    className="panel-input rounded border border-border bg-bg px-3 py-2 text-sm text-text"
                  />
                  <select
                    value={newMcpMode}
                    onChange={(e) => setNewMcpMode(e.target.value as 'remote_http' | 'remote_sse' | 'local_stdio')}
                    className="panel-input rounded border border-border bg-bg px-3 py-2 text-sm text-text"
                  >
                    <option value="remote_http">remote_http</option>
                    <option value="remote_sse">remote_sse</option>
                    <option value="local_stdio">local_stdio</option>
                  </select>
                  <input
                    value={newMcpUrl}
                    onChange={(e) => setNewMcpUrl(e.target.value)}
                    placeholder={newMcpMode === 'local_stdio' ? 'Template key optional' : 'https://mcp-host/endpoint'}
                    className="panel-input rounded border border-border bg-bg px-3 py-2 text-sm text-text"
                    disabled={newMcpMode === 'local_stdio'}
                  />
                </div>
                <button
                  type="button"
                  onClick={handleCreateMcpServer}
                  className="rounded border border-border px-3 py-2 text-sm text-text hover:bg-bg"
                >
                  Add MCP server
                </button>

                <div className="space-y-2">
                  {mcpServers.map((server) => (
                    <div key={server.id} className="panel-gradient-subtle flex items-center justify-between rounded border border-border px-3 py-2 text-sm">
                      <div>
                        <div className="font-medium text-text">{server.name}</div>
                        <div className="text-xs text-muted">{server.mode}</div>
                      </div>
                      <button
                        type="button"
                        className="text-xs text-secondary hover:underline"
                        onClick={() => handleDeleteMcpServer(server.id)}
                      >
                        Delete
                      </button>
                    </div>
                  ))}
                  {mcpServers.length === 0 && <div className="text-sm text-muted">No MCP servers configured.</div>}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Project Configuration */}
        <div className="panel-gradient rounded-lg p-6 space-y-4">
          <h3 className="text-lg font-medium text-text border-b border-border pb-2">Project Configuration</h3>
          <dl className="grid grid-cols-1 gap-x-4 gap-y-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <dt className="text-sm font-medium text-muted">Project Path</dt>
              <dd className="panel-gradient-subtle mt-1 rounded p-1 text-sm font-mono text-text">
                {repo?.directory || config?.execution.dbt_project_path || 'Loading...'}
              </dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-sm font-medium text-muted">Artifacts Path</dt>
              <dd className="panel-gradient-subtle mt-1 rounded p-1 text-sm font-mono text-text">
                {/* Artifacts are stored in runs/ but displayed path often refers to where we look for them initially */}
                {config?.artifacts_path || 'Loading...'}
              </dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-sm font-medium text-muted">API URL</dt>
              <dd className="panel-gradient-subtle mt-1 rounded p-1 text-sm font-mono text-text">
                {(import.meta as any).env.VITE_API_BASE_URL || 'http://localhost:8000'}
              </dd>
            </div>
          </dl>
        </div>

        {/* Artifact Status */}
        <div className="panel-gradient rounded-lg p-6 space-y-4">
          <h3 className="text-lg font-medium text-text border-b border-border pb-2">Artifact Status</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted">Manifest</span>
              <span className={`px-2 py-1 text-xs font-semibold rounded-full border ${artifacts?.manifest ? 'border-status-success/35 bg-status-success/15 text-status-success' : 'border-status-danger/35 bg-status-danger/15 text-status-danger'
                }`}>
                {artifacts?.manifest ? 'Present' : 'Missing'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted">Run Results</span>
              <span className={`px-2 py-1 text-xs font-semibold rounded-full border ${artifacts?.run_results ? 'border-status-success/35 bg-status-success/15 text-status-success' : 'border-status-danger/35 bg-status-danger/15 text-status-danger'
                }`}>
                {artifacts?.run_results ? 'Present' : 'Missing'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted">Catalog</span>
              <span className={`px-2 py-1 text-xs font-semibold rounded-full border ${artifacts?.catalog ? 'border-status-success/35 bg-status-success/15 text-status-success' : 'border-status-danger/35 bg-status-danger/15 text-status-danger'
                }`}>
                {artifacts?.catalog ? 'Present' : 'Missing'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted">Docs</span>
              <span className={`px-2 py-1 text-xs font-semibold rounded-full border ${artifacts?.docs ? 'border-status-success/35 bg-status-success/15 text-status-success' : 'border-status-danger/35 bg-status-danger/15 text-status-danger'
                }`}>
                {artifacts?.docs ? 'Available' : 'Missing'}
              </span>
            </div>
            <p className="text-xs text-muted mt-2">
              Artifacts are monitored automatically.
              Watcher checks every {config?.artifact_watcher.polling_interval || '?'}s.
            </p>
          </div>
        </div>

        {/* User Info */}
        <div className="panel-gradient rounded-lg p-6 space-y-4">
          <h3 className="text-lg font-medium text-text border-b border-border pb-2">User Information</h3>
          <dl className="grid grid-cols-1 gap-x-4 gap-y-4">
            <div>
              <dt className="text-sm font-medium text-muted">Current User</dt>
              <dd className="mt-1 text-sm text-text">{user?.username || 'Guest'}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-muted">Role</dt>
              <dd className="mt-1 text-sm text-text">{user?.role || 'Viewer'}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-muted">Auth Status</dt>
              <dd className="mt-1 text-sm text-text">
                {config?.auth.enabled ? 'Enabled' : 'Disabled (Single User)'}
              </dd>
            </div>
          </dl>
        </div>

        {/* About */}
        <div className="panel-gradient rounded-lg p-6 space-y-4">
          <h3 className="text-lg font-medium text-text border-b border-border pb-2">About</h3>
          <p className="text-sm text-muted">
            dbt-Workbench is a developer tool for inspecting and managing dbt projects.
          </p>
          <div className="text-xs text-muted">
            <p>Monitored Files: {config?.artifact_watcher.monitored_files.join(', ') || 'manifest.json, ...'}</p>
            <p>Max Versions Kept: {config?.artifact_watcher.max_versions || 10}</p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default SettingsPage
