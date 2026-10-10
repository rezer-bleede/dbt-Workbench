import React from 'react'
import { GitBranch, GitHistoryEntry } from '../types'

interface BranchSelectorProps {
  branches: GitBranch[]
  history: GitHistoryEntry[]
  currentBranch: string
  onBranchChange: (branch: string) => void
  disabled?: boolean
}

export function BranchSelector({
  branches,
  history,
  currentBranch,
  onBranchChange,
  disabled = false,
}: BranchSelectorProps) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-text font-semibold">Branch</h3>
        <p className="text-sm text-muted">Switch and manage branches</p>
      </div>

      <div className="panel-gradient-subtle border border-border rounded-lg p-4 space-y-3">
        <select
          value={currentBranch}
          onChange={(e) => onBranchChange(e.target.value)}
          disabled={disabled}
          className="w-full panel-input rounded px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
        >
          {branches.map((branch) => (
            <option key={branch.name} value={branch.name}>
              {branch.name} {branch.is_active ? '(current)' : ''}
            </option>
          ))}
        </select>

        {history.length > 0 && (
          <div className="border-t border-border pt-3">
            <div className="text-xs text-muted mb-2">Recent commits</div>
            <div className="space-y-2">
              {history.slice(0, 5).map((entry) => (
                <div
                  key={entry.commit_hash}
                  className="flex items-start gap-2 text-xs group"
                >
                  <div className="mt-1 w-2 h-2 rounded-full bg-brand-primary/60 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-text font-medium truncate group-hover:text-text transition-colors">
                      {entry.message}
                    </div>
                    <div className="text-muted">
                      {entry.commit_hash.substring(0, 7)} • {entry.author}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
