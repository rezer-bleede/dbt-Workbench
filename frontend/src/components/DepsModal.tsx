import React, { useState, useEffect, useRef } from 'react';
import { RunDetail, LogMessage, PackagesCheckResponse, RunSummary } from '../types';
import { ExecutionService } from '../services/executionService';
import { StatusBadge } from './StatusBadge';

interface DepsModalProps {
  packagesCheck: PackagesCheckResponse;
  projectPath?: string;
  onInstallComplete: () => void;
  onCancel: () => void;
}

export const DepsModal: React.FC<DepsModalProps> = ({
  packagesCheck,
  projectPath,
  onInstallComplete,
  onCancel,
}) => {
  const [installing, setInstalling] = useState(false);
  const [runDetail, setRunDetail] = useState<RunSummary | RunDetail | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  const logsEndRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const statusIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const scrollToBottom = () => {
    if (autoScroll && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [logs]);

  useEffect(() => {
    return () => {
      if (statusIntervalRef.current) {
        clearInterval(statusIntervalRef.current);
      }
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, []);

  const handleInstall = async () => {
    setInstalling(true);
    setError(null);

    if (statusIntervalRef.current) {
      clearInterval(statusIntervalRef.current);
    }
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    try {
      const result = await ExecutionService.installPackages(projectPath);
      setRunDetail(result);

      // Set up log streaming
      const eventSource = ExecutionService.createLogStream(result.run_id);
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

      // Poll for completion
      statusIntervalRef.current = setInterval(async () => {
        try {
          const status = await ExecutionService.getRunStatus(result.run_id);
          setRunDetail(prev => prev ? { ...prev, ...status } : status);

          if (['succeeded', 'failed', 'cancelled'].includes(status.status)) {
            if (statusIntervalRef.current) {
              clearInterval(statusIntervalRef.current);
              statusIntervalRef.current = null;
            }
            eventSource.removeEventListener('log', handleLog as EventListener);
            eventSource.close();
            eventSourceRef.current = null;

            setInstalling(false);
            if (status.status !== 'succeeded') {
              setError(status.error_message || 'Installation failed');
            }
          }
        } catch (err) {
          console.error('Failed to update status:', err);
        }
      }, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start installation');
      setInstalling(false);
    }
  };

  const primaryButtonClassName = "inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:opacity-50";
  const secondaryButtonClassName = "panel-gradient-subtle inline-flex items-center justify-center gap-2 rounded-xl border border-border px-4 py-2 text-sm font-medium text-text hover:bg-panel/70";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 px-4 py-6">
      <div className="panel-gradient flex h-[80vh] w-full max-w-4xl flex-col rounded-2xl p-6 shadow-xl">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-text">
              Missing dbt Packages
            </h2>
            <p className="mt-1 text-sm text-muted">
              {packagesCheck.missing_packages.length} of {packagesCheck.packages_required.length} required packages are not installed
            </p>
          </div>
          <button
            onClick={onCancel}
            className="text-muted hover:text-text"
            disabled={installing}
          >
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {!runDetail && (
          <>
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <div>
                <h3 className="mb-3 text-sm font-medium text-text">Missing Packages</h3>
                <ul className="space-y-2">
                  {packagesCheck.missing_packages.map((pkg) => (
                    <li key={pkg} className="flex items-center gap-2 text-sm">
                      <span className="inline-flex h-2 w-2 rounded-full bg-red-500" />
                      <span className="text-text">{pkg}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h3 className="mb-3 text-sm font-medium text-text">Installed Packages</h3>
                <ul className="space-y-2">
                  {packagesCheck.packages_installed.map((pkg) => (
                    <li key={pkg} className="flex items-center gap-2 text-sm">
                      <span className="inline-flex h-2 w-2 rounded-full bg-green-500" />
                      <span className="text-text">{pkg}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {error && (
              <div className="mt-4 rounded-lg border border-rose-400/40 bg-rose-500/12 p-3 text-sm text-rose-300">
                {error}
              </div>
            )}

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={onCancel}
                className={secondaryButtonClassName}
                disabled={installing}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleInstall}
                disabled={installing}
                className={primaryButtonClassName}
              >
                {installing ? 'Starting...' : 'Install Packages'}
              </button>
            </div>
          </>
        )}

        {runDetail && (
          <>
            <div className="mt-4 flex items-center gap-3">
              <StatusBadge status={runDetail.status} />
              <span className="text-sm text-muted">
                {['queued', 'running'].includes(runDetail.status)
                  ? 'Installing dbt packages...'
                  : runDetail.status === 'succeeded'
                  ? 'dbt packages installed successfully'
                  : 'Package installation failed'}
              </span>
            </div>

            <div className="mt-4 flex-1 overflow-hidden">
              <div className="flex h-full flex-col">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-medium text-text">Installation Logs</h3>
                  <label className="flex items-center text-sm text-muted">
                    <input
                      type="checkbox"
                      checked={autoScroll}
                      onChange={(e) => setAutoScroll(e.target.checked)}
                      className="mr-1"
                    />
                    Auto-scroll
                  </label>
                </div>
                <div className="panel-gradient-subtle flex-1 overflow-y-auto rounded-lg p-4 font-mono text-sm text-emerald-300">
                  {logs.length === 0 ? (
                    <p className="text-muted">Waiting for logs...</p>
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

            {(error || runDetail.error_message) && (
              <div className="mt-4 rounded-lg border border-rose-400/40 bg-rose-500/12 p-3 text-sm text-rose-300">
                {error || runDetail.error_message}
              </div>
            )}

            <div className="mt-4 flex justify-end gap-3">
              {['failed', 'cancelled'].includes(runDetail.status) && (
                <>
                  <button
                    type="button"
                    onClick={onCancel}
                    className={secondaryButtonClassName}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleInstall}
                    className={primaryButtonClassName}
                  >
                    Retry
                  </button>
                </>
              )}

              {runDetail.status === 'succeeded' && (
                <button
                  type="button"
                  onClick={onInstallComplete}
                  className={primaryButtonClassName}
                >
                  Continue
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};
