import React, { useState, useEffect, useRef } from 'react';
import { DbtCommand, RunRequest, ModelSummary, Environment, RunStatus, PackagesCheckResponse, GitRepository } from '../types';
import { ExecutionService } from '../services/executionService';
import { ArtifactService } from '../services/artifactService';
import { api } from '../api/client';
import { EnvironmentService } from '../services/environmentService';
import { useAuth } from '../context/AuthContext';
import { Autocomplete } from './Autocomplete';
import { DepsModal } from './DepsModal';

export const RunCommand: React.FC<RunCommandProps> = ({ onRunStarted }) => {
  const { activeWorkspace } = useAuth();
  const [description, setDescription] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [pendingCommand, setPendingCommand] = useState<DbtCommand | null>(null);
  const [packagesCheck, setPackagesCheck] = useState<PackagesCheckResponse | null>(null);
  const [showDepsModal, setShowDepsModal] = useState(false);
  const isMountedRef = useRef(true);

  // Suggestion data
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [availableTargets, setAvailableTargets] = useState<string[]>([]);
  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [repo, setRepo] = useState<GitRepository | null>(null);

  // Parameter form state
  const [selectModels, setSelectModels] = useState('');
  const [excludeModels, setExcludeModels] = useState('');
  const [target, setTarget] = useState('');
  const [fullRefresh, setFullRefresh] = useState(false);
  const [failFast, setFailFast] = useState(false);
  const [storeFailures, setStoreFailures] = useState(false);
  const [noCompile, setNoCompile] = useState(false);
  const [runRowLineage, setRunRowLineage] = useState(false);

  useEffect(() => {
    // Fetch models for autocomplete
    api.get<ModelSummary[]>('/models')
      .then(res => {
        setAvailableModels(res.data.map(m => m.name));
      })
      .catch(err => console.error('Failed to fetch models for autocomplete', err));

    // Fetch environments for target autocomplete
    EnvironmentService.list()
      .then(envs => {
        setEnvironments(envs);
        const targets = envs
          .map(e => e.dbt_target_name)
          .filter((t): t is string => !!t); // Filter out null/undefined
        // Dedup targets
        setAvailableTargets(Array.from(new Set(targets)));
      })
      .catch(err => console.error('Failed to fetch environments for autocomplete', err));
  }, []);

  useEffect(() => {
    api.get<GitRepository>('/git/repository')
      .then(res => setRepo(res.data))
      .catch(() => setRepo(null));
  }, [activeWorkspace?.id]);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const handleDepsComplete = async () => {
    setShowDepsModal(false);
    setIsLoading(true);

    // Re-run the original command
    if (pendingCommand) {
      await handleSubmit(undefined, pendingCommand);
    }
  };

  const handleDepsCancel = () => {
    setShowDepsModal(false);
    setPendingCommand(null);
    setIsLoading(false);
  };

  const waitForRunCompletion = async (runId: string, initialStatus?: RunStatus) => {
    let status: RunStatus | undefined = initialStatus;
    const isTerminal = (state?: RunStatus) =>
      state === 'succeeded' || state === 'failed' || state === 'cancelled';

    while (!isTerminal(status)) {
      await new Promise(resolve => setTimeout(resolve, 1500));
      if (!isMountedRef.current) {
        return;
      }
      try {
        const updated = await ExecutionService.getRunStatus(runId);
        status = updated.status;
      } catch (err) {
        if (isMountedRef.current) {
          setError('Failed to monitor run status');
          setIsLoading(false);
          setPendingCommand(null);
        }
        return;
      }
    }

    if (isMountedRef.current) {
      setIsLoading(false);
      setPendingCommand(null);
    }
  };

  const handleSubmit = async (e?: React.FormEvent, activeCommand: DbtCommand = 'run') => {
    e?.preventDefault();
    if (!target) {
      setError('Select a Target before running a dbt command.');
      return;
    }
    setIsLoading(true);
    setPendingCommand(activeCommand);
    setError(null);
    setWarning(null);

    try {
      // Check for missing packages
      const check = await ExecutionService.checkPackages(repo?.directory);
      setPackagesCheck(check);

      if (check.has_missing) {
        setShowDepsModal(true);
        setIsLoading(false);
        return;
      }

      if (activeCommand !== 'seed') {
        const seedStatus = await ArtifactService.getSeedStatus();
        if (seedStatus.warning) {
          setWarning(
            'Seeds are required for downstream models. Run dbt seed before running other commands.'
          );
          setIsLoading(false);
          setPendingCommand(null);
          return;
        }
      }

      // Build parameters object
      const params: Record<string, any> = {};
      if (selectModels) params.select = selectModels;
      if (excludeModels) params.exclude = excludeModels;

      if (target) {
        params.target = target;
        // Lookup profile from environment with this target
        const matchingEnv = environments.find(e => e.dbt_target_name === target);
        if (matchingEnv && matchingEnv.connection_profile_reference) {
          params.profile = matchingEnv.connection_profile_reference;
        }
      }

      if (fullRefresh) params.full_refresh = true;
      if (failFast) params.fail_fast = true;
      if (storeFailures && activeCommand === 'test') params.store_failures = true;
      if (noCompile && activeCommand === 'docs generate') params.no_compile = true;

      const request: RunRequest = {
        command: activeCommand,
        parameters: params,
        description: description || undefined,
        workspace_id: activeWorkspace?.id,
        run_row_lineage: runRowLineage,
      };

      const result = await ExecutionService.startRun(request);
      onRunStarted?.(result.run_id);

      // Reset form
      setDescription('');
      setSelectModels('');
      setExcludeModels('');
      setTarget('');
      setFullRefresh(false);
      setFailFast(false);
      setStoreFailures(false);
      setNoCompile(false);
      setRunRowLineage(false);
      void waitForRunCompletion(result.run_id, result.status);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start run');
      setIsLoading(false);
      setPendingCommand(null);
    }
  };

  const commands: { id: DbtCommand; label: string }[] = [
    { id: 'run', label: 'Run' },
    { id: 'test', label: 'Test' },
    { id: 'seed', label: 'Seed' },
    { id: 'docs generate', label: 'Docs' },
  ];

  return (
    <div className="panel-gradient rounded-lg p-6 text-text">
      <h2 className="mb-4 text-xl font-semibold text-text">Run dbt Command</h2>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Description */}
        <div>
          <label className="mb-2 block text-sm font-medium text-muted">
            Description (optional)
          </label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Brief description of this run"
            className="panel-input w-full rounded-md px-3 py-2 text-sm"
          />
        </div>

        {/* Parameters */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="mb-2 block text-sm font-medium text-muted">
              Select Models
            </label>
            <Autocomplete
              options={availableModels}
              value={selectModels}
              onChange={setSelectModels}
              placeholder="e.g., my_model"
              strict={true}
            />
            <p className="mt-1 text-xs text-muted">Only configured models allowed.</p>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-muted">
              Exclude Models
            </label>
            <Autocomplete
              options={availableModels}
              value={excludeModels}
              onChange={setExcludeModels}
              placeholder="e.g., my_model"
              strict={true}
            />
            <p className="mt-1 text-xs text-muted">Only configured models allowed.</p>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-muted">
              Target
            </label>
            <Autocomplete
              options={availableTargets}
              value={target}
              onChange={(value) => {
                setTarget(value);
                setError(null);
              }}
              placeholder="e.g., dev"
              strict={true}
            />
            <p className="mt-1 text-xs text-muted">Must match a scheduled environment target.</p>
          </div>
        </div>

        {/* Boolean Options */}
        <div className="space-y-2">
          <label className="flex items-center">
            <input
              type="checkbox"
              checked={fullRefresh}
              onChange={(e) => setFullRefresh(e.target.checked)}
              className="mr-2"
            />
            <span className="text-sm text-muted">Full Refresh</span>
          </label>

          <label className="flex items-center">
            <input
              type="checkbox"
              checked={failFast}
              onChange={(e) => setFailFast(e.target.checked)}
              className="mr-2"
            />
            <span className="text-sm text-muted">Fail Fast</span>
          </label>

          <label className="flex items-center">
            <input
              type="checkbox"
              checked={storeFailures}
              onChange={(e) => setStoreFailures(e.target.checked)}
              className="mr-2"
            />
            <span className="text-sm text-muted">Store Failures (dbt test only)</span>
          </label>

          <label className="flex items-center">
            <input
              type="checkbox"
              checked={noCompile}
              onChange={(e) => setNoCompile(e.target.checked)}
              className="mr-2"
            />
            <span className="text-sm text-muted">No Compile (dbt docs generate only)</span>
          </label>

          <label className="flex items-center">
            <input
              type="checkbox"
              checked={runRowLineage}
              onChange={(e) => setRunRowLineage(e.target.checked)}
              className="mr-2"
              data-testid="run-row-lineage"
            />
            <span className="text-sm text-muted">Run Row Lineage (dbt-rowlineage)</span>
          </label>
        </div>

        {/* Error Display */}
        {error && (
          <div className="rounded-md border border-rose-400/40 bg-rose-500/12 p-3">
            <p className="text-sm text-rose-300">{error}</p>
          </div>
        )}

        {warning && (
          <div className="rounded-md border border-amber-400/40 bg-amber-500/12 p-3">
            <p className="text-sm text-amber-300">{warning}</p>
          </div>
        )}

        {/* Execute Buttons */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {commands.map((cmd) => (
            <button
              key={cmd.id}
              type="button"
              data-testid={`${cmd.id}-execute`}
              onClick={() => void handleSubmit(undefined, cmd.id)}
              disabled={isLoading}
              className="flex h-10 w-full items-center justify-center rounded-md bg-primary px-2 py-2 text-xs sm:text-sm font-medium text-primary-foreground hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
              aria-busy={isLoading && pendingCommand === cmd.id}
            >
              {isLoading && pendingCommand === cmd.id ? (
                <span className="inline-flex items-center justify-center gap-1.5 min-w-0">
                  <svg
                    className="h-4 w-4 shrink-0 animate-spin text-current"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  <span className="truncate">Executing...</span>
                </span>
              ) : (
                <span className="truncate">{cmd.label}</span>
              )}
            </button>
          ))}
        </div>
      </form>

      {showDepsModal && packagesCheck && (
        <DepsModal
          packagesCheck={packagesCheck}
          projectPath={repo?.directory}
          onInstallComplete={handleDepsComplete}
          onCancel={handleDepsCancel}
        />
      )}
    </div>
  );
};
