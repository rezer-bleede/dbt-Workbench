import React, { useState, useEffect } from 'react';
import { DbtCommand, RunRequest, ModelSummary, Environment } from '../types';
import { ExecutionService } from '../services/executionService';
import { api } from '../api/client';
import { EnvironmentService } from '../services/environmentService';
import { useAuth } from '../context/AuthContext';
import { Autocomplete } from './Autocomplete';

export const RunCommand: React.FC<RunCommandProps> = ({ onRunStarted }) => {
  const { activeWorkspace } = useAuth();
  const [description, setDescription] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingCommand, setPendingCommand] = useState<DbtCommand | null>(null);

  // Suggestion data
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [availableTargets, setAvailableTargets] = useState<string[]>([]);
  const [environments, setEnvironments] = useState<Environment[]>([]);

  // Parameter form state
  const [selectModels, setSelectModels] = useState('');
  const [excludeModels, setExcludeModels] = useState('');
  const [target, setTarget] = useState('');
  const [fullRefresh, setFullRefresh] = useState(false);
  const [failFast, setFailFast] = useState(false);
  const [storeFailures, setStoreFailures] = useState(false);
  const [noCompile, setNoCompile] = useState(false);

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

  const handleSubmit = async (e?: React.FormEvent, activeCommand: DbtCommand = 'run') => {
    e?.preventDefault();
    if (!target) {
      setError('Select a Target before running a dbt command.');
      return;
    }
    setIsLoading(true);
    setPendingCommand(activeCommand);
    setError(null);

    try {
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
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start run');
    } finally {
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
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-xl font-semibold mb-4">Run dbt Command</h2>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Description */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Description (optional)
          </label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Brief description of this run"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Parameters */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Select Models
            </label>
            <Autocomplete
              options={availableModels}
              value={selectModels}
              onChange={setSelectModels}
              placeholder="e.g., my_model"
              strict={true}
            />
            <p className="mt-1 text-xs text-gray-500">Only configured models allowed.</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Exclude Models
            </label>
            <Autocomplete
              options={availableModels}
              value={excludeModels}
              onChange={setExcludeModels}
              placeholder="e.g., my_model"
              strict={true}
            />
            <p className="mt-1 text-xs text-gray-500">Only configured models allowed.</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
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
            <p className="mt-1 text-xs text-gray-500">Must match a scheduled environment target.</p>
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
            <span className="text-sm text-gray-700">Full Refresh</span>
          </label>

          <label className="flex items-center">
            <input
              type="checkbox"
              checked={failFast}
              onChange={(e) => setFailFast(e.target.checked)}
              className="mr-2"
            />
            <span className="text-sm text-gray-700">Fail Fast</span>
          </label>

          <label className="flex items-center">
            <input
              type="checkbox"
              checked={storeFailures}
              onChange={(e) => setStoreFailures(e.target.checked)}
              className="mr-2"
            />
            <span className="text-sm text-gray-700">Store Failures (dbt test only)</span>
          </label>

          <label className="flex items-center">
            <input
              type="checkbox"
              checked={noCompile}
              onChange={(e) => setNoCompile(e.target.checked)}
              className="mr-2"
            />
            <span className="text-sm text-gray-700">No Compile (dbt docs generate only)</span>
          </label>
        </div>

        {/* Error Display */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-md p-3">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        {/* Execute Buttons */}
        <div className="grid grid-cols-2 gap-3">
          {commands.map((cmd) => (
            <button
              key={cmd.id}
              type="button"
              data-testid={`${cmd.id}-execute`}
              onClick={() => void handleSubmit(undefined, cmd.id)}
              disabled={isLoading}
              className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading && pendingCommand === cmd.id ? 'Starting...' : cmd.label}
            </button>
          ))}
        </div>
      </form>
    </div>
  );
};
