import React, { useState, useEffect, useRef } from 'react';
import { RunDetail, RunStatus, LogMessage } from '../types';
import { ExecutionService } from '../services/executionService';
import { StatusBadge } from './StatusBadge';

interface RunViewerProps {
  runId: string;
  onClose?: () => void;
}

export const RunViewer: React.FC<RunViewerProps> = ({ runId, onClose }) => {
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

    eventSource.onmessage = (event) => {
      if (event.type === 'log') {
        try {
          const logMessage: LogMessage = JSON.parse(event.data);
          setLogs(prev => [...prev, logMessage.message]);
        } catch (err) {
          console.error('Failed to parse log message:', err);
        }
      }
    };

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
          eventSource.close();
        }
      } catch (err) {
        console.error('Failed to update run status:', err);
      }
    }, 2000);

    return () => {
      clearInterval(statusInterval);
      if (eventSourceRef.current) {
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

  const formatDuration = (seconds?: number): string => {
    if (!seconds) return 'N/A';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}m ${secs}s`;
  };

  if (isLoading) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-1/4 mb-4"></div>
          <div className="h-4 bg-gray-200 rounded w-1/2 mb-2"></div>
          <div className="h-4 bg-gray-200 rounded w-3/4"></div>
        </div>
      </div>
    );
  }

  if (error || !runDetail) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <p className="text-red-600">{error || 'Run not found'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <h2 className="text-xl font-semibold">
              dbt {runDetail.command}
            </h2>
            <StatusBadge status={runDetail.status} />
          </div>
          <div className="flex items-center space-x-2">
            {['queued', 'running'].includes(runDetail.status) && (
              <button
                onClick={handleCancel}
                className="px-3 py-1 text-sm bg-red-600 text-white rounded hover:bg-red-700"
              >
                Cancel
              </button>
            )}
            {onClose && (
              <button
                onClick={onClose}
                className="px-3 py-1 text-sm bg-gray-600 text-white rounded hover:bg-gray-700"
              >
                Close
              </button>
            )}
          </div>
        </div>
        
        {/* Run Info */}
        <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <span className="text-gray-500">Run ID:</span>
            <p className="font-mono text-xs">{runDetail.run_id}</p>
          </div>
          <div>
            <span className="text-gray-500">Started:</span>
            <p>{new Date(runDetail.start_time).toLocaleString()}</p>
          </div>
          <div>
            <span className="text-gray-500">Duration:</span>
            <p>{formatDuration(runDetail.duration_seconds)}</p>
          </div>
          <div>
            <span className="text-gray-500">Artifacts:</span>
            <p>{runDetail.artifacts_available ? 'Available' : 'None'}</p>
          </div>
        </div>

        {runDetail.description && (
          <div className="mt-2">
            <span className="text-gray-500 text-sm">Description:</span>
            <p className="text-sm">{runDetail.description}</p>
          </div>
        )}

        {runDetail.error_message && (
          <div className="mt-2 bg-red-50 border border-red-200 rounded p-2">
            <p className="text-sm text-red-600">{runDetail.error_message}</p>
          </div>
        )}
      </div>

      {/* Logs */}
      <div className="px-6 py-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-medium">Logs</h3>
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

        <div className="bg-gray-900 text-green-400 p-4 rounded-lg font-mono text-sm max-h-96 overflow-y-auto">
          {logs.length === 0 ? (
            <p className="text-gray-500">No logs available</p>
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