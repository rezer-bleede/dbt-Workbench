import React from 'react'
import { GitStatus } from '../types'

interface GitChangesProps {
  status: GitStatus | null
}

export function GitChanges({ status }: GitChangesProps) {
  if (!status) {
    return (
      <div className="text-center py-6">
        <svg className="mb-3 mx-auto h-12 w-12 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        <div className="text-muted text-sm">No repository status available</div>
      </div>
    )
  }

  if (!status.changes.length) {
    return (
      <div className="text-center py-6">
        <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-green-500/10 flex items-center justify-center">
          <svg className="w-6 h-6 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <div className="text-muted text-sm">Working tree clean</div>
      </div>
    )
  }

  const getChangeColor = (type: string) => {
    const lower = type.toLowerCase()
    if (lower === 'added' || lower === 'a') return 'text-brand-success'
    if (lower === 'modified' || lower === 'm') return 'text-brand-primary'
    if (lower === 'deleted' || lower === 'd') return 'text-brand-danger'
    if (lower === 'renamed' || lower === 'r') return 'text-brand-warning'
    return 'text-muted'
  }

  const getChangeIcon = (type: string) => {
    const lower = type.toLowerCase()
    if (lower === 'added' || lower === 'a') {
      return (
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
      )
    }
    if (lower === 'modified' || lower === 'm') {
      return (
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
        </svg>
      )
    }
    if (lower === 'deleted' || lower === 'd') {
      return (
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
        </svg>
      )
    }
    if (lower === 'renamed' || lower === 'r') {
      return (
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
        </svg>
      )
    }
    return <div className="w-3.5 h-3.5" />
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted">Changes</span>
        <span className="text-text">{status.changes.length} file{status.changes.length !== 1 ? 's' : ''}</span>
      </div>
      <div className="space-y-1.5 max-h-64 overflow-auto">
        {status.changes.map((change, index) => (
          <div
            key={`${change.path}-${change.change_type}-${index}`}
            className="flex items-center gap-2 px-3 py-2 panel-gradient-subtle border border-border rounded hover:border-border transition-colors"
          >
            <div className={getChangeColor(change.change_type)}>
              {getChangeIcon(change.change_type)}
            </div>
            <code className="flex-1 text-xs text-text font-mono truncate">
              {change.path}
            </code>
            <span className={`text-xs font-medium uppercase ${getChangeColor(change.change_type)}`}>
              {change.change_type}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
