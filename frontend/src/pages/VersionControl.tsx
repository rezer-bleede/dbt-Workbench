import React, { FormEvent, useEffect, useMemo, useState } from 'react'

import { useAuth } from '../context/AuthContext'
import { GitService } from '../services/gitService'
import {
  AuditRecord,
  GitBranch,
  GitDiff,
  GitFileContent,
  GitFileNode,
  GitHistoryEntry,
  GitRepository,
  GitStatus,
  WorkspaceCreate,
  WorkspaceSummary,
} from '../types'
import { WorkspaceService } from '../services/workspaceService'
import { storeWorkspaceId } from '../storage/workspaceStorage'

function FileTree({ nodes, onSelect }: { nodes: GitFileNode[]; onSelect: (path: string) => void }) {
  const sorted = useMemo(() => nodes.slice().sort((a, b) => a.path.localeCompare(b.path)), [nodes])
  return (
    <div className="space-y-1">
      {sorted.map((node) => (
        <button
          key={node.path}
          onClick={() => onSelect(node.path)}
          className="w-full text-left px-2 py-1 rounded hover:bg-gray-800 text-gray-200 border border-gray-800"
        >
          <span className="font-mono text-xs text-gray-400">{node.category ? `[${node.category}] ` : ''}</span>
          {node.path}
        </button>
      ))}
    </div>
  )
}

function ChangeList({ status }: { status: GitStatus | null }) {
  if (!status) return null
  if (!status.changes.length) return <div className="text-sm text-gray-400">Working tree clean.</div>
  return (
    <ul className="text-sm text-gray-200 space-y-1">
      {status.changes.map((change) => (
        <li key={`${change.path}-${change.change_type}`} className="flex items-center justify-between">
          <span className="font-mono text-xs">{change.path}</span>
          <span className="text-accent text-xs uppercase">{change.change_type}</span>
        </li>
      ))}
    </ul>
  )
}

export default function VersionControlPage() {
  const { activeWorkspace, switchWorkspace } = useAuth()

  const extractRepoName = (url: string) => {
    try {
      const parts = url.split('/').filter(Boolean)
      const last = parts[parts.length - 1] || ''
      return last.replace(/\.git$/, '') || 'project'
    } catch {
      return 'project'
    }
  }

  const slugify = (value: string) =>
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'workspace'

  const defaultProjectKey = slugify('demo-project')
  const defaultProjectName = 'Demo Project'

  const [status, setStatus] = useState<GitStatus | null>(null)
  const [branches, setBranches] = useState<GitBranch[]>([])
  const [files, setFiles] = useState<GitFileNode[]>([])
  const [selectedPath, setSelectedPath] = useState<string>('')
  const [fileContent, setFileContent] = useState<GitFileContent | null>(null)
  const [commitMessage, setCommitMessage] = useState('')
  const [diffs, setDiffs] = useState<GitDiff[]>([])
  const [history, setHistory] = useState<GitHistoryEntry[]>([])
  const [auditRecords, setAuditRecords] = useState<AuditRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [repoMissing, setRepoMissing] = useState(false)
  const [repository, setRepository] = useState<GitRepository | null>(null)
  const [connectError, setConnectError] = useState<string | null>(null)
  const [connectSuccess, setConnectSuccess] = useState<string | null>(null)
  const [projects, setProjects] = useState<WorkspaceSummary[]>([])
  const [projectsError, setProjectsError] = useState<string | null>(null)
  const [projectsLoading, setProjectsLoading] = useState(false)
  const [remoteUrl, setRemoteUrl] = useState('')
  const [isLocalOnly, setIsLocalOnly] = useState(true)
  const [branch, setBranch] = useState('main')
  const [projectRoot, setProjectRoot] = useState(`/app/data/${defaultProjectKey}`)
  const [provider, setProvider] = useState('')
  const [workspaceName, setWorkspaceName] = useState(defaultProjectName)
  const [userEditedWorkspaceName, setUserEditedWorkspaceName] = useState(false)
  const [userEditedProjectRoot, setUserEditedProjectRoot] = useState(false)
  const [showCloneForm, setShowCloneForm] = useState(false)
  const workspaceId = activeWorkspace?.id ?? null

  const reload = async () => {
    setLoading(true)
    try {
      const [repoInfo, newStatus] = await Promise.all([
        GitService.getRepository(),
        GitService.status(),
      ])
      setRepository(repoInfo)
      if (newStatus.configured === false) {
        setRepoMissing(true)
        setStatus(newStatus)
        setBranches([])
        setFiles([])
        setHistory([])
        setDiffs([])
        return
      }
      const [branchList, fileList, historyEntries, audits] = await Promise.all([
        GitService.branches(),
        GitService.files(),
        GitService.history(),
        GitService.audit(),
      ])
      setStatus(newStatus)
      setBranches(branchList)
      setFiles(fileList)
      setHistory(historyEntries)
      setAuditRecords(audits)
      setRepoMissing(false)
    } catch (err: any) {
      const detail = err?.response?.data?.detail
      if (err?.response?.status === 404 || detail?.error === 'git_not_configured') {
        setRepoMissing(true)
        setStatus(null)
        setBranches([])
        setFiles([])
        setHistory([])
        setDiffs([])
      } else {
        console.error('Failed to load git status', err)
      }
    } finally {
      setLoading(false)
    }
  }

  const loadProjects = async () => {
    setProjectsLoading(true)
    setProjectsError(null)
    try {
      const items = await WorkspaceService.listWorkspaces()
      setProjects(items)
    } catch (err: any) {
      const message = err?.response?.data?.detail?.message || err?.message || 'Failed to load projects'
      setProjectsError(message)
    } finally {
      setProjectsLoading(false)
    }
  }

  useEffect(() => {
    setStatus(null)
    setBranches([])
    setFiles([])
    setHistory([])
    setDiffs([])
    setSelectedPath('')
    setFileContent(null)
    setRepoMissing(false)
    setRepository(null)
    setConnectError(null)
    setConnectSuccess(null)
    setShowCloneForm(false)

    if (workspaceId == null) {
      setRepoMissing(true)
      return
    }

    reload().catch((err) => console.error(err))
  }, [workspaceId])

  useEffect(() => {
    loadProjects().catch((err) => console.error(err))
  }, [activeWorkspace?.id])

  const loadFile = async (path: string) => {
    const content = await GitService.readFile(path)
    setSelectedPath(path)
    setFileContent(content)
    const diff = await GitService.diff(path)
    setDiffs(diff)
  }

  const handleCommit = async () => {
    if (!commitMessage.trim()) return
    await GitService.commit(commitMessage)
    setCommitMessage('')
    await reload()
  }

  const handleBranchChange = async (branch: string) => {
    await GitService.switchBranch(branch)
    await reload()
  }

  const handleProjectCreate = async (event: FormEvent) => {
    event.preventDefault()
    setConnectError(null)
    setConnectSuccess(null)

    if (!isLocalOnly && !remoteUrl.trim()) {
      setConnectError('Remote URL is required when connecting to a remote repository.')
      return
    }

    const repoName = remoteUrl ? extractRepoName(remoteUrl) : workspaceName
    const nameToUse = (workspaceName || repoName || 'project').trim()
    const workspaceKey = slugify(nameToUse)
    const artifactsPath = `${projectRoot.replace(/[\\/]+$/, '')}/artifacts`

    try {
      const payload: WorkspaceCreate = { key: workspaceKey, name: nameToUse, artifacts_path: artifactsPath }
      let targetWorkspaceId: number

      try {
        const created = await WorkspaceService.createWorkspace(payload)
        targetWorkspaceId = created.id
      } catch (err: any) {
        const detail = err?.response?.data?.detail
        const isConflict = err?.response?.status === 409 || detail?.error === 'workspace_exists'
        if (!isConflict) throw err
        // Workspace already exists; reuse it
        const existing = (await WorkspaceService.listWorkspaces()).find((w) => w.key === workspaceKey)
        if (!existing) throw err
        targetWorkspaceId = existing.id
      }

      storeWorkspaceId(targetWorkspaceId)
      try {
        await switchWorkspace(targetWorkspaceId)
      } catch {
        // If switch fails (e.g., unauthenticated), rely on stored workspace id
      }

      await GitService.connect({
        workspace_id: targetWorkspaceId,
        remote_url: isLocalOnly ? undefined : remoteUrl,
        branch: branch || 'main',
        directory: projectRoot,
        provider: provider || (isLocalOnly ? 'local' : undefined),
      })

      setConnectSuccess(isLocalOnly ? 'Local project initialized.' : 'Repository cloned and connected.')
      setRepoMissing(false)
      setShowCloneForm(false)
      await Promise.all([reload(), loadProjects()])
    } catch (err: any) {
      console.error('Connect failed:', err)
      const message =
        err?.response?.data?.detail?.message ||
        err?.response?.data?.detail ||
        err?.message ||
        'Failed to connect repository.'
      setConnectError(message)
    }
  }

  const handleSwitchProject = async (projectId: number) => {
    try {
      await switchWorkspace(projectId)
      storeWorkspaceId(projectId)
      await Promise.all([reload(), loadProjects()])
    } catch (err: any) {
      const message =
        err?.response?.data?.detail?.message || err?.message || 'Unable to activate the selected project.'
      setConnectError(message)
    }
  }

  const handleDisconnect = async () => {
    if (!confirm('Are you sure you want to disconnect this repository?')) return
    try {
      await GitService.disconnect(false)
      setRepository(null)
      setRepoMissing(true)
      setShowCloneForm(false)
      setConnectSuccess(null)
      await reload()
    } catch (err: any) {
      console.error('Disconnect failed:', err)
      setConnectError(
        err?.response?.data?.detail?.message ||
        err?.response?.data?.detail ||
        'Failed to disconnect repository.'
      )
    }
  }

  const actionsDisabled = repoMissing || loading

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-2xl font-semibold text-white">Projects & Version Control</div>
          <div className="text-sm text-gray-400">
            Manage projects (one git repo each), initialize local starters, and inspect branch health.
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-panel border border-gray-800 rounded p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-white font-semibold">Projects</div>
              <div className="text-sm text-gray-400">One project per git repo. Local starters are supported.</div>
            </div>
            <button className="btn btn-sm" onClick={() => setShowCloneForm((prev) => !prev)}>
              {showCloneForm || repoMissing ? 'Close form' : 'New Project'}
            </button>
          </div>
          {projectsLoading && <div className="text-sm text-gray-400">Loading projects...</div>}
          {projectsError && <div className="text-sm text-red-400">{projectsError}</div>}
          <div className="space-y-2">
            {projects.map((project) => (
              <div
                key={project.id}
                className={`border border-gray-800 rounded p-3 ${
                  project.id === workspaceId ? 'bg-black/30 border-accent/60' : 'bg-black/20'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-white font-semibold">{project.name}</div>
                    <div className="text-xs text-gray-400">Key: {project.key}</div>
                    <div className="text-xs text-gray-400">Artifacts: {project.artifacts_path}</div>
                  </div>
                  {workspaceId === project.id ? (
                    <span className="text-accent text-xs font-semibold">Active</span>
                  ) : (
                    <button className="btn btn-sm" onClick={() => handleSwitchProject(project.id)}>
                      Activate
                    </button>
                  )}
                </div>
              </div>
            ))}
            {!projects.length && !projectsLoading && (
              <div className="text-sm text-gray-400">No projects yet. Create one to get started.</div>
            )}
          </div>
        </div>

        <div className="lg:col-span-2 space-y-4">
          {repository && !repoMissing && (
            <div className="bg-panel border border-gray-800 rounded p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="text-white font-semibold">Connected Repository</div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => setShowCloneForm(!showCloneForm)}
                  >
                    {showCloneForm ? 'Cancel' : 'Add Project'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm bg-red-600 hover:bg-red-700"
                    onClick={handleDisconnect}
                    disabled={loading}
                  >
                    Disconnect
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                <div>
                  <div className="text-gray-400 text-xs">Remote URL</div>
                  <div className="text-gray-200 font-mono truncate">
                    {repository.remote_url || 'Local project (no remote)'}
                  </div>
                </div>
                <div>
                  <div className="text-gray-400 text-xs">Default Branch</div>
                  <div className="text-gray-200">{repository.default_branch}</div>
                </div>
                <div>
                  <div className="text-gray-400 text-xs">Last Synced</div>
                  <div className="text-gray-200">
                    {repository.last_synced_at
                      ? new Date(repository.last_synced_at).toLocaleString()
                      : 'Never'}
                  </div>
                </div>
                <div>
                  <div className="text-gray-400 text-xs">Project Root</div>
                  <div className="text-gray-200 font-mono truncate">{repository.directory}</div>
                </div>
              </div>
              {connectError && <div className="mt-2 text-sm text-red-400">{connectError}</div>}
            </div>
          )}

          {(repoMissing || showCloneForm) && (
            <div className="bg-panel border border-gray-800 rounded p-4">
              <div className="text-white font-semibold mb-2">Create or connect a project</div>
              <p className="text-sm text-gray-400 mb-3">
                Start with a local git repo or link a remote. Each project maintains its own isolated state.
              </p>
              <form className="grid grid-cols-1 md:grid-cols-2 gap-3" onSubmit={handleProjectCreate}>
                <div className="md:col-span-2 flex items-center gap-2">
                  <input
                    id="local-only"
                    type="checkbox"
                    className="h-4 w-4"
                    checked={isLocalOnly}
                    onChange={(e) => {
                      const next = e.target.checked
                      setIsLocalOnly(next)
                      if (!next && !remoteUrl) {
                        setRemoteUrl('https://github.com/dbt-labs/jaffle-shop-classic.git')
                      }
                    }}
                  />
                  <label htmlFor="local-only" className="text-sm text-gray-300">
                    Create a local-only project (no remote)
                  </label>
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs text-gray-400 mb-1">Remote URL</label>
                  <input
                    type="url"
                    className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm text-gray-100"
                    value={remoteUrl}
                    disabled={isLocalOnly}
                    onChange={(e) => {
                      const newUrl = e.target.value
                      setRemoteUrl(newUrl)
                      if (!isLocalOnly) {
                        const name = extractRepoName(newUrl)
                        if (!userEditedWorkspaceName) {
                          setWorkspaceName(name)
                        }
                        if (!userEditedProjectRoot) {
                          setProjectRoot(`/app/data/${slugify(name)}`)
                        }
                      }
                    }}
                    placeholder="https://github.com/org/project.git"
                    required={!isLocalOnly}
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs text-gray-400 mb-1">Project Name</label>
                  <input
                    type="text"
                    className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm text-gray-100"
                    value={workspaceName}
                    onChange={(e) => {
                      const newName = e.target.value
                      setWorkspaceName(newName)
                      setUserEditedWorkspaceName(true)
                      if (!userEditedProjectRoot) {
                        setProjectRoot(`/app/data/${slugify(newName)}`)
                      }
                    }}
                    placeholder="Project workspace name"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Branch</label>
                  <input
                    type="text"
                    className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm text-gray-100"
                    value={branch}
                    onChange={(e) => setBranch(e.target.value)}
                    placeholder="main"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Project Root</label>
                  <input
                    type="text"
                    className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm text-gray-100"
                    value={projectRoot}
                    onChange={(e) => {
                      setProjectRoot(e.target.value)
                      setUserEditedProjectRoot(true)
                    }}
                    placeholder="/app/data/project-name"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs text-gray-400 mb-1">Provider (optional)</label>
                  <input
                    type="text"
                    className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm text-gray-100"
                    value={provider}
                    onChange={(e) => setProvider(e.target.value)}
                    placeholder="github | gitlab | local"
                  />
                </div>
                <div className="md:col-span-2 flex justify-end gap-2">
                  <button type="submit" className="btn" disabled={loading}>
                    {loading ? 'Connecting...' : isLocalOnly ? 'Create local project' : 'Connect repository'}
                  </button>
                  {connectError && <div className="text-sm text-red-400">{connectError}</div>}
                  {connectSuccess && <div className="text-sm text-green-400">{connectSuccess}</div>}
                </div>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>

    <div className="flex items-start gap-4">
      <div className="bg-panel border border-gray-800 rounded p-4 flex-1">
        <div className="flex items-center justify-between mb-2">
          <div>
            <div className="text-lg font-semibold text-white">Git status</div>
            <div className="text-sm text-gray-400">Branch: {repoMissing ? 'not connected' : status?.branch || 'unknown'}</div>
          </div>
          <div className="flex gap-2">
            <button className="btn" onClick={() => GitService.pull().then(reload)} disabled={actionsDisabled}>
              Pull
            </button>
            <button className="btn" onClick={() => GitService.push().then(reload)} disabled={actionsDisabled}>
              Push
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2 text-sm text-gray-300">
          <span>Ahead: {status?.ahead ?? 0}</span>
          <span>Behind: {status?.behind ?? 0}</span>
          {status?.has_conflicts && <span className="text-red-400">Conflicts detected</span>}
        </div>
        <div className="mt-3">
          <ChangeList status={status} />
        </div>
      </div>
      <div className="bg-panel border border-gray-800 rounded p-4 w-72">
        <div className="text-lg text-white font-semibold mb-2">Branch</div>
        <select
          className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-2 text-sm"
          value={branches.find((b) => b.is_active)?.name || ''}
          onChange={(e) => handleBranchChange(e.target.value)}
          disabled={actionsDisabled}
        >
          {branches.map((branch) => (
            <option key={branch.name} value={branch.name}>
              {branch.name} {branch.is_active ? '(current)' : ''}
            </option>
          ))}
        </select>
        <div className="mt-3 text-xs text-gray-400">
          Recent commits
          <ul className="space-y-1 mt-1">
            {history.slice(0, 5).map((entry) => (
              <li key={entry.commit_hash} className="truncate">
                <span className="font-semibold text-gray-200">{entry.message}</span>
                <div className="text-gray-400 text-[11px]">{entry.commit_hash.substring(0, 7)} – {entry.author}</div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>

    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className="bg-panel border border-gray-800 rounded p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="text-white font-semibold">Project files</div>
            <div className="text-sm text-gray-400">Browse dbt models and configuration</div>
          </div>
        </div>
        {repoMissing ? (
          <div className="text-sm text-gray-500">Connect a repository to browse files.</div>
        ) : (
          <FileTree nodes={files} onSelect={loadFile} />
        )}
      </div>
      <div className="bg-panel border border-gray-800 rounded p-4 col-span-2 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-white font-semibold">File preview</div>
            <div className="text-sm text-gray-400">{selectedPath || 'Select a file to inspect'}</div>
          </div>
          <div className="flex gap-2 items-center">
            <input
              type="text"
              className="bg-gray-900 border border-gray-700 rounded px-2 py-1 text-sm"
              placeholder="Commit message"
              value={commitMessage}
              onChange={(e) => setCommitMessage(e.target.value)}
            />
            <button className="btn" onClick={handleCommit} disabled={!commitMessage.trim() || actionsDisabled}>
              Commit
            </button>
          </div>
        </div>
        {fileContent && (
          <div className="bg-black/40 border border-gray-800 rounded p-3 text-sm text-gray-200">
            <pre className="whitespace-pre-wrap text-xs font-mono overflow-auto max-h-[320px]">
              {fileContent.content || 'Empty file'}
            </pre>
          </div>
        )}
        <div className="bg-gray-900 border border-gray-800 rounded p-3 text-sm text-gray-200">
          <div className="font-semibold mb-2">Diff preview</div>
          {repoMissing ? (
            <div className="text-sm text-gray-500">Connect a repository to view diffs.</div>
          ) : (
            diffs.map((diff) => (
              <pre key={diff.path} className="text-xs whitespace-pre-wrap bg-black/40 p-2 rounded border border-gray-800 overflow-auto">
                {diff.diff || 'No changes'}
              </pre>
            ))
          )}
        </div>
      </div>
    </div>

    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div className="bg-panel border border-gray-800 rounded p-4">
        <div className="text-white font-semibold mb-2">Audit log</div>
        <div className="space-y-2 max-h-64 overflow-auto text-sm text-gray-200">
          {auditRecords.map((record) => (
            <div key={record.id} className="border border-gray-800 rounded p-2">
              <div className="flex items-center justify-between text-xs text-gray-400">
                <span>{record.action}</span>
                <span>{new Date(record.created_at).toLocaleString()}</span>
              </div>
              <div className="text-sm text-white">{record.resource}</div>
              {record.commit_hash && <div className="text-xs text-accent">Commit {record.commit_hash.substring(0, 7)}</div>}
            </div>
          ))}
        </div>
      </div>
      <div className="bg-panel border border-gray-800 rounded p-4">
        <div className="text-white font-semibold mb-2">Guidance</div>
        <ul className="list-disc list-inside text-sm text-gray-300 space-y-1">
          <li>Editing core configuration files will prompt for confirmation.</li>
          <li>Use the Save button to persist changes without running dbt.</li>
          <li>Review diffs before committing to keep branches clean.</li>
          <li>Switch branches carefully when uncommitted changes exist.</li>
        </ul>
      </div>
    </div>
  </div>
)
}
