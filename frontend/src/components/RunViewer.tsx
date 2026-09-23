import React, { useState, useEffect, useRef } from 'react';
import { RunDetail, RunStatus, LogMessage } from '../types';
import { ExecutionService } from '../services/executionService';
import { StatusBadge } from './StatusBadge';
import { useAi } from '../context/AiContext';

interface RunViewerProps {
  runId: string;
  onClose?: () => void;
}

export const RunViewer: React.FC<RunViewerProps> = ({ runId, onClose }) => {
  const { openPanel } = useAi()
  const [runDetail, setRunDetail] = useState<RunDetail | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  
  const logsEndRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  const scrollToBottom = () => {
    if (autoScroll && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [logs]);

  useEffect(() => {
    const fetchRunDetail = async () => {
      try {
        const detail = await ExecutionService.getRunDetail(runId);
        setRunDetail(detail);
        setLogs(detail.log_lines || []);
        setIsLoading(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load run details');
        setIsLoading(false);
      }
    };

    fetchRunDetail();

    // Set up log streaming
    const eventSource = ExecutionService.createLogStream(runId);
    eventSourceRef.current = eventSource;

    const handleLog = (event: MessageEvent) => {
      try {
        const logMessage: LogMessage = JSON.parse(event.data);
        setLogs(prev => [...prev, logMessage.message]);
      } catch (err) {
        console.error('Failed to parse log message:', err);
      }
    };

    eventSource.addEventListener('log', handleLog as EventListener);

    eventSource.onerror = (event) => {
      console.error('Log stream error:', event);
    };

    // Poll for run status updates
    const statusInterval = setInterval(async () => {
      try {
        const status = await ExecutionService.getRunStatus(runId);
        setRunDetail(prev => prev ? { ...prev, ...status } : null);
        
        // Stop polling if run is complete
        if (['succeeded', 'failed', 'cancelled'].includes(status.status)) {
          clearInterval(statusInterval);
          eventSource.removeEventListener('log', handleLog as EventListener);
          eventSource.close();
        }
      } catch (err) {
        console.error('Failed to update run status:', err);
      }
    }, 2000);

    return () => {
      clearInterval(statusInterval);
      if (eventSourceRef.current) {
        eventSourceRef.current.removeEventListener('log', handleLog as EventListener);
        eventSourceRef.current.close();
      }
    };
  }, [runId]);

  const handleCancel = async () => {
    if (!runDetail || !['queued', 'running'].includes(runDetail.status)) {
      return;
    }

    try {
      await ExecutionService.cancelRun(runId);
      // Status will be updated by the polling interval
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to cancel run');
    }
  };

  const getStatusColor = (status: RunStatus): string => {
    switch (status) {
      case 'queued': return 'bg-gray-100 text-gray-800';
      case 'running': return 'bg-blue-100 text-blue-800';
      case 'succeeded': return 'bg-green-100 text-green-800';
      case 'failed': return 'bg-red-100 text-red-800';
      case 'cancelled': return 'bg-yellow-100 text-yellow-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const handleAiTroubleshoot = () => {
    if (!runDetail) return
    const recentLogs = logs.slice(-60).join('\n')
    const prompt = [
      `Troubleshoot this dbt run and suggest fixes.`,
      `Run id: ${runDetail.run_id}`,
      `Command: dbt ${runDetail.command}`,
      `Status: ${runDetail.status}`,
      runDetail.error_message ? `Error: ${runDetail.error_message}` : '',
      recentLogs ? `Recent logs:\\n${recentLogs}` : '',
    ]
      .filter(Boolean)
      .join('\\n\\n')

    openPanel({
      prompt,
      context: {
        run_id: runDetail.run_id,
        run_logs: true,
      },
    })
  }

  const formatDuration = (seconds?: number): string => {
    if (!seconds) return 'N/A';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}m ${secs}s`;
  };

  if (isLoading) {
    return (
      <div className="panel-gradient rounded-lg p-6">
        <div className="animate-pulse">
          <div className="mb-4 h-4 w-1/4 rounded bg-surface-muted"></div>
          <div className="mb-2 h-4 w-1/2 rounded bg-surface-muted"></div>
          <div className="h-4 w-3/4 rounded bg-surface-muted"></div>
        </div>
      </div>
    );
  }

  if (error || !runDetail) {
    return (
      <div className="panel-gradient rounded-lg p-6">
        <div className="rounded-md border border-rose-400/40 bg-rose-500/12 p-4">
          <p className="text-rose-300">{error || 'Run not found'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="panel-gradient rounded-lg">
      {/* Header */}
      <div className="panel-divider border-b px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <h2 className="text-xl font-semibold text-text">
              dbt {runDetail.command}
            </h2>
            <StatusBadge status={runDetail.status} />
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={handleAiTroubleshoot}
              className="panel-gradient-subtle rounded border border-border px-3 py-1 text-sm text-text hover:bg-panel/80"
            >
              AI troubleshoot
            </button>
            {['queued', 'running'].includes(runDetail.status) && (
              <button
                onClick={handleCancel}
                className="rounded border border-rose-400/40 bg-rose-500/20 px-3 py-1 text-sm text-rose-100 hover:bg-rose-500/28"
              >
                Cancel
              </button>
            )}
            {onClose && (
              <button
                onClick={onClose}
                className="panel-gradient-subtle rounded border border-border px-3 py-1 text-sm text-text hover:bg-panel/80"
              >
                Close
              </button>
            )}
          </div>
        </div>
        
        {/* Run Info */}
        <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <span className="text-muted">Run ID:</span>
            <p className="font-mono text-xs text-muted">{runDetail.run_id}</p>
          </div>
          <div>
            <span className="text-muted">Started:</span>
            <p className="text-muted">{new Date(runDetail.start_time).toLocaleString()}</p>
          </div>
          <div>
            <span className="text-muted">Duration:</span>
            <p className="text-muted">{formatDuration(runDetail.duration_seconds)}</p>
          </div>
          <div>
            <span className="text-muted">Artifacts:</span>
            <p className="text-muted">{runDetail.artifacts_available ? 'Available' : 'None'}</p>
          </div>
        </div>

        {runDetail.description && (
          <div className="mt-2">
            <span className="text-sm text-muted">Description:</span>
            <p className="text-sm">{runDetail.description}</p>
          </div>
        )}

        {runDetail.error_message && (
          <div className="mt-2 rounded border border-rose-400/40 bg-rose-500/12 p-2">
            <p className="text-sm text-rose-300">{runDetail.error_message}</p>
          </div>
        )}
      </div>

      {/* Logs */}
      <div className="px-6 py-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-medium text-muted">Logs</h3>
          <div className="flex items-center space-x-2">
            <label className="flex items-center text-sm">
              <input
                type="checkbox"
                checked={autoScroll}
                onChange={(e) => setAutoScroll(e.target.checked)}
                className="mr-1"
              />
              Auto-scroll
            </label>
          </div>
        </div>

        <div className="panel-gradient-subtle max-h-96 overflow-y-auto rounded-lg p-4 font-mono text-sm text-emerald-300">
          {logs.length === 0 ? (
            <p className="text-muted">No logs available</p>
          ) : (
            logs.map((line, index) => (
              <div key={index} className="whitespace-pre-wrap">
                {line}
              </div>
            ))
          )}
          <div ref={logsEndRef} />
        </div>
      </div>
    </div>
  );
};
