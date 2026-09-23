import React, { FormEvent, useEffect, useState } from 'react'

import { FileTree } from '../components/FileTree'
import { FileEditorPanel } from '../components/FileEditorPanel'
import { useAuth } from '../context/AuthContext'
import { GitService } from '../services/gitService'
import { GitDiff, GitFileContent, GitFileNode } from '../types'

export default function FileEditorPage() {
  const { activeWorkspace } = useAuth()
  const workspaceId = activeWorkspace?.id ?? null

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
  const [loading, setLoading] = useState(false)
  const [repoMissing, setRepoMissing] = useState(false)

  const reload = async () => {
    setLoading(true)
    try {
      const newStatus = await GitService.status()
      if (newStatus.configured === false) {
        setRepoMissing(true)
        setFiles([])
        return
      }
      const fileList = await GitService.files()
      setFiles(fileList)
      setRepoMissing(false)
    } catch (err: any) {
      const detail = err?.response?.data?.detail
      if (err?.response?.status === 404 || detail?.error === 'git_not_configured') {
        setRepoMissing(true)
        setFiles([])
      } else {
        console.error('Failed to load project files', err)
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    setFiles([])
    setSelectedPath('')
    setFileContent(null)
    setFileEditContent('')
    setFileSaveError(null)
    setFileSaveStatus(null)
    setDiffs([])
    setRepoMissing(false)

    if (workspaceId == null) {
      setRepoMissing(true)
      return
    }

    reload().catch((err) => console.error(err))
  }, [workspaceId])

  const loadFile = async (path: string) => {
    try {
      const content = await GitService.readFile(path)
      setSelectedPath(path)
      setFileContent(content)
      setFileEditContent(content.content)
      setFileSaveError(null)
      setFileSaveStatus(null)
      const diff = await GitService.diff(path)
      setDiffs(diff)
    } catch (err: any) {
      const message = err?.response?.data?.detail?.message || err?.message || 'Failed to read file'
      setFileSaveError(message)
    }
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

  const handleCommit = async () => {
    if (!commitMessage.trim()) return
    try {
      await GitService.commit(commitMessage)
      setCommitMessage('')
      if (selectedPath) {
        const diff = await GitService.diff(selectedPath)
        setDiffs(diff)
      }
      await reload()
    } catch (err: any) {
      const message = err?.response?.data?.detail?.message || err?.message || 'Failed to commit changes'
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

  const actionsDisabled = repoMissing || loading

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-text">File Editor</h1>
          <p className="text-sm text-muted mt-1">
            File Browsing & Editing: Browse, edit, and create project files
          </p>
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
                  storageKey={`file-editor-${workspaceId ?? 'none'}`}
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
    </div>
  )
}
