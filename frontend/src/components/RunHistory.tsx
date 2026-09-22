import React, { useState, useEffect } from 'react';
import { RunSummary, RunHistoryResponse } from '../types';
import { ExecutionService } from '../services/executionService';
import { StatusBadge } from './StatusBadge';

interface RunHistoryProps {
  onRunSelect?: (runId: string) => void;
  refreshTrigger?: number;
}

export const RunHistory: React.FC<RunHistoryProps> = ({ onRunSelect, refreshTrigger }) => {
  const [history, setHistory] = useState<RunHistoryResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  const fetchHistory = async (page: number = 1) => {
    try {
      setIsLoading(true);
      const response = await ExecutionService.getRunHistory(page, pageSize);
      setHistory(response);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load run history');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory(currentPage);
  }, [currentPage, refreshTrigger]);

  const formatDuration = (seconds?: number): string => {
    if (!seconds) return 'N/A';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}m ${secs}s`;
  };

  const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleString();
  };

  const totalPages = history ? Math.ceil(history.total_count / pageSize) : 0;

  if (isLoading && !history) {
    return (
      <div className="panel-gradient rounded-lg p-6">
        <div className="animate-pulse">
          <div className="mb-4 h-4 w-1/4 rounded bg-surface-muted"></div>
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-4 rounded bg-surface-muted"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="panel-gradient rounded-lg p-6">
        <div className="rounded-md border border-status-danger/35 bg-status-danger/15 p-4">
          <p className="text-status-danger font-medium">{error}</p>
          <button
            onClick={() => fetchHistory(currentPage)}
            className="mt-2 text-sm text-status-danger underline hover:opacity-80"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="panel-gradient rounded-lg">
      <div className="panel-divider border-b px-6 py-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-text">Run History</h2>
          <button
            onClick={() => fetchHistory(currentPage)}
            className="text-sm text-primary hover:text-primary-hover"
          >
            Refresh
          </button>
        </div>
        {history && (
          <p className="mt-1 text-sm text-muted">
            {history.total_count} total runs
          </p>
        )}
      </div>

      <div className="panel-table overflow-x-auto">
        <table className="min-w-full divide-y divide-border">
          <thead>
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted">
                Command
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted">
                Started
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted">
                Duration
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted">
                Description
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {history?.runs.map((run) => (
              <tr key={run.run_id} className="hover:bg-panel/70">
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm font-medium text-text">
                    dbt {run.command}
                  </div>
                  <div className="font-mono text-xs text-muted">
                    {run.run_id.substring(0, 8)}...
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <StatusBadge status={run.status} />
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-text">
                  {formatDate(run.start_time)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-text">
                  {formatDuration(run.duration_seconds)}
                </td>
                <td className="max-w-xs truncate px-6 py-4 text-sm text-text">
                  {run.description || '-'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                  <button
                    onClick={() => onRunSelect?.(run.run_id)}
                    className="mr-3 text-primary hover:text-primary-hover"
                  >
                    View
                  </button>
                  {run.artifacts_available && (
                    <span className="text-xs text-status-success font-semibold">
                      Artifacts
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="panel-divider border-t px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="text-sm text-muted">
              Page {currentPage} of {totalPages}
            </div>
            <div className="flex space-x-2">
              <button
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
                className="panel-gradient-subtle rounded px-3 py-1 text-sm text-text hover:bg-panel/80 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Previous
              </button>
              <button
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                disabled={currentPage === totalPages}
                className="panel-gradient-subtle rounded px-3 py-1 text-sm text-text hover:bg-panel/80 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      )}

      {history?.runs.length === 0 && (
        <div className="px-6 py-8 text-center">
          <p className="text-muted">No runs found</p>
        </div>
      )}
    </div>
  );
};
