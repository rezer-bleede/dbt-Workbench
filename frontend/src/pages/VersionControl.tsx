import React, { FormEvent, useEffect, useMemo, useState } from 'react'

import { FileTree } from '../components/FileTree'
import { ProjectCard } from '../components/ProjectCard'
import { RepoStatusCard } from '../components/RepoStatusCard'
import { BranchSelector } from '../components/BranchSelector'
import { CommitTimeline } from '../components/CommitTimeline'
import { FileEditorPanel } from '../components/FileEditorPanel'
import { AuditLogList } from '../components/AuditLogList'
import { GitChanges } from '../components/GitChanges'

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
  const [fileEditContent, setFileEditContent] = useState('')
  const [fileSaveStatus, setFileSaveStatus] = useState<string | null>(null)
  const [fileSaveError, setFileSaveError] = useState<string | null>(null)
  const [newFilePath, setNewFilePath] = useState('')
  const [newFileContent, setNewFileContent] = useState('')
  const [newFileMessage, setNewFileMessage] = useState('')
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
  const [showAdvanced, setShowAdvanced] = useState(false)
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
        setShowCloneForm(true)
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
      setShowCloneForm(true)
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
    setFileEditContent(content.content)
    setFileSaveError(null)
    setFileSaveStatus(null)
    const diff = await GitService.diff(path)
    setDiffs(diff)
  }

  const handleCommit = async () => {
    if (!commitMessage.trim()) return
    await GitService.commit(commitMessage)
    setCommitMessage('')
    await reload()
  }

  const handleBranchChange = async (branchName: string) => {
    await GitService.switchBranch(branchName)
    setBranch(branchName)
    await reload()
  }

  const handleSaveFile = async () => {
    if (!selectedPath || !fileContent || fileContent.readonly) return
    setFileSaveError(null)
    setFileSaveStatus(null)
    try {
      await GitService.writeFile({ path: selectedPath, content: fileEditContent, message: commitMessage || undefined })
      const updated = await GitService.readFile(selectedPath)
      setFileContent(updated)
      setFileEditContent(updated.content)
      const diff = await GitService.diff(selectedPath)
      setDiffs(diff)
      setFileSaveStatus('File saved successfully.')
    } catch (err: any) {
      const message = err?.response?.data?.detail?.message || err?.message || 'Failed to save file'
      setFileSaveError(message)
    }
  }

  const handleCreateFile = async (event: FormEvent) => {
    event.preventDefault()
    if (!newFilePath.trim()) {
      setFileSaveError('Provide a file path before creating a file.')
      return
    }
    setFileSaveError(null)
    setFileSaveStatus(null)
    try {
      await GitService.createFile({ path: newFilePath, content: newFileContent, message: newFileMessage || undefined })
      setNewFilePath('')
      setNewFileContent('')
      setNewFileMessage('')
      await reload()
      setFileSaveStatus('File created successfully.')
    } catch (err: any) {
      const message = err?.response?.data?.detail?.message || err?.message || 'Failed to create file'
      setFileSaveError(message)
    }
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
        const existing = (await WorkspaceService.listWorkspaces()).find((w) => w.key === workspaceKey)
        if (!existing) throw err
        targetWorkspaceId = existing.id
      }

      storeWorkspaceId(targetWorkspaceId)
      try {
        await switchWorkspace(targetWorkspaceId)
      } catch {
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

  const currentBranch = status?.branch || ''

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <p className="text-sm text-muted mt-1">
            Projects & Version Control: Manage projects, git operations, and version control
          </p>
        </div>
        {!showCloneForm && (
          <button
            className="btn"
            onClick={() => setShowCloneForm(true)}
          >
            New Project
          </button>
        )}
      </div>

      {showCloneForm && (
        <div className="panel-gradient rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold text-text">Create or connect a project</h2>
              <p className="text-sm text-muted mt-1">
                Start with a local git repo or link a remote repository
              </p>
            </div>
            <button
              onClick={() => setShowCloneForm(false)}
              className="text-muted hover:text-text transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {connectSuccess && (
            <div className="mb-4 p-3 bg-status-success/15 border border-status-success/35 rounded text-sm text-status-success">
              {connectSuccess}
            </div>
          )}

          {connectError && (
            <div className="mb-4 p-3 bg-status-danger/15 border border-status-danger/35 rounded text-sm text-status-danger">
              {connectError}
            </div>
          )}

          <form className="space-y-4" onSubmit={handleProjectCreate}>
            <div className="flex items-center gap-2">
              <input
                id="local-only"
                type="checkbox"
                className="h-4 w-4 rounded border-border bg-surface text-accent focus:ring-accent"
                checked={isLocalOnly}
                onChange={(e) => setIsLocalOnly(e.target.checked)}
              />
              <label htmlFor="local-only" className="text-sm text-muted">
                Create a local-only project (no remote)
              </label>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-muted mb-1.5">Remote URL</label>
                <input
                  type="url"
                  className="panel-input w-full rounded px-3 py-2 text-sm"
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

              <div>
                <label className="block text-xs text-muted mb-1.5">Project Name</label>
                <input
                  type="text"
                  className="panel-input w-full rounded px-3 py-2 text-sm"
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
                <label className="block text-xs text-muted mb-1.5">Branch</label>
                <input
                  type="text"
                  className="panel-input w-full rounded px-3 py-2 text-sm"
                  value={branch}
                  onChange={(e) => setBranch(e.target.value)}
                  placeholder="main"
                />
              </div>

              <div>
                <label className="block text-xs text-muted mb-1.5">Project Root</label>
                <input
                  type="text"
                  className="panel-input w-full rounded px-3 py-2 text-sm"
                  value={projectRoot}
                  onChange={(e) => {
                    setProjectRoot(e.target.value)
                    setUserEditedProjectRoot(true)
                  }}
                  placeholder="/app/data/project-name"
                />
              </div>
            </div>

            <div>
              <button
                type="button"
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="text-xs text-muted transition-colors hover:text-text"
              >
                {showAdvanced ? 'Hide' : 'Show'} advanced options
              </button>

              {showAdvanced && (
                <div className="mt-3">
                  <label className="block text-xs text-muted mb-1.5">Provider (optional)</label>
                  <input
                    type="text"
                    className="panel-input w-full rounded px-3 py-2 text-sm"
                    value={provider}
                    onChange={(e) => setProvider(e.target.value)}
                    placeholder="github | gitlab | local"
                  />
                </div>
              )}
            </div>

            <div className="flex justify-end">
              <button type="submit" className="btn" disabled={loading}>
                {loading ? 'Connecting...' : isLocalOnly ? 'Create local project' : 'Connect repository'}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-semibold text-text mb-4">Projects</h2>
              <p className="text-sm text-muted mb-4">One project per git repository</p>

              {projectsLoading && (
                <div className="panel-gradient-subtle rounded-lg p-8 text-center">
                  <div className="text-muted text-sm">Loading projects...</div>
                </div>
              )}

              {projectsError && (
                <div className="bg-status-danger/15 border border-status-danger/35 rounded-lg p-4 text-sm text-status-danger">
                  {projectsError}
                </div>
              )}

              {!projectsLoading && !projectsError && (
                <div className="space-y-3">
                  {projects.map((project) => (
                    <ProjectCard
                      key={project.id}
                      project={project}
                      isActive={project.id === workspaceId}
                      onActivate={() => handleSwitchProject(project.id)}
                    />
                  ))}

                  {!projects.length && (
                    <div className="panel-gradient-subtle rounded-lg p-8 text-center">
                      <svg className="w-12 h-12 mx-auto text-gray-600 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                      </svg>
                      <div className="text-muted text-sm mb-2">No projects yet</div>
                      <p className="text-xs text-muted">Create a project to get started with version control</p>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div>
              <h2 className="text-lg font-semibold text-text mb-4">Working Changes</h2>
              <div className="panel-gradient-subtle rounded-lg p-4">
                <GitChanges status={status} />
              </div>
            </div>
          </div>

          <div className="lg:col-span-2 space-y-6">
            {repository && !repoMissing && (
              <RepoStatusCard
                repository={repository}
                status={status}
                onPull={() => GitService.pull().then(reload)}
                onPush={() => GitService.push().then(reload)}
                onDisconnect={handleDisconnect}
                onAddProject={() => setShowCloneForm(true)}
                loading={loading}
                disabled={actionsDisabled}
              />
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <BranchSelector
                branches={branches}
                history={history}
                currentBranch={currentBranch}
                onBranchChange={handleBranchChange}
                disabled={actionsDisabled}
              />

              <div>
                <h2 className="text-lg font-semibold text-text mb-4">Recent Commits</h2>
                <div className="panel-gradient-subtle rounded-lg p-4">
                  <CommitTimeline history={history} maxEntries={5} />
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1">
            <h2 className="text-lg font-semibold text-text mb-4">Project Files</h2>
            <p className="text-sm text-muted mb-4">Browse and manage dbt files</p>

            {repoMissing ? (
              <div className="panel-gradient-subtle rounded-lg p-8 text-center">
                <svg className="w-12 h-12 mx-auto text-gray-600 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <div className="text-muted text-sm">Connect a repository to browse files</div>
              </div>
            ) : (
              <>
                <div className="panel-gradient-subtle rounded-lg p-4">
                  <FileTree
                    nodes={files}
                    onSelect={loadFile}
                    selectedPath={selectedPath}
                    storageKey={`version-control-${workspaceId ?? 'none'}`}
                    emptyMessage="No project files found."
                  />
                </div>

                <div className="mt-4 panel-gradient-subtle rounded-lg p-4">
                  <h3 className="text-text font-semibold mb-3">Create File</h3>
                  <form className="space-y-3" onSubmit={handleCreateFile}>
                    <input
                      type="text"
                      className="panel-input w-full rounded px-3 py-2 text-sm"
                      placeholder="models/new_file.sql"
                      value={newFilePath}
                      onChange={(e) => setNewFilePath(e.target.value)}
                    />
                    <textarea
                      className="panel-input min-h-[120px] w-full resize-y rounded px-3 py-2 text-xs font-mono"
                      placeholder="File contents"
                      value={newFileContent}
                      onChange={(e) => setNewFileContent(e.target.value)}
                    />
                    <input
                      type="text"
                      className="panel-input w-full rounded px-3 py-2 text-sm"
                      placeholder="Commit message (optional)"
                      value={newFileMessage}
                      onChange={(e) => setNewFileMessage(e.target.value)}
                    />
                    <button type="submit" className="btn btn-sm w-full" disabled={actionsDisabled}>
                      Create file
                    </button>
                    {fileSaveError && <div className="text-xs text-status-danger font-semibold">{fileSaveError}</div>}
                    {fileSaveStatus && <div className="text-xs text-status-success font-semibold">{fileSaveStatus}</div>}
                  </form>
                </div>
              </>
            )}
          </div>

          <div className="lg:col-span-2">
            <FileEditorPanel
              selectedPath={selectedPath}
              fileContent={fileContent}
              fileEditContent={fileEditContent}
              onFileEditContentChange={setFileEditContent}
              diffs={diffs}
              commitMessage={commitMessage}
              onCommitMessageChange={setCommitMessage}
              onSave={handleSaveFile}
              onCommit={handleCommit}
              loading={loading}
              disabled={actionsDisabled}
            />
          </div>
        </div>

        <AuditLogList records={auditRecords} />
      </div>
    </div>
  )
}
