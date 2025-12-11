import React, { useState } from 'react';
import { DbtCommand, RunRequest } from '../types';
import { ExecutionService } from '../services/executionService';

interface RunCommandProps {
  onRunStarted?: (runId: string) => void;
}

export const RunCommand: React.FC<RunCommandProps> = ({ onRunStarted }) => {
  const [command, setCommand] = useState<DbtCommand>('run');
  const [description, setDescription] = useState('');
  const [parameters, setParameters] = useState<Record<string, any>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Parameter form state
  const [selectModels, setSelectModels] = useState('');
  const [excludeModels, setExcludeModels] = useState('');
  const [target, setTarget] = useState('');
  const [fullRefresh, setFullRefresh] = useState(false);
  const [failFast, setFailFast] = useState(false);
  const [storeFailures, setStoreFailures] = useState(false);
  const [noCompile, setNoCompile] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      // Build parameters object
      const params: Record<string, any> = {};
      if (selectModels) params.select = selectModels;
      if (excludeModels) params.exclude = excludeModels;
      if (target) params.target = target;
      if (fullRefresh) params.full_refresh = true;
      if (failFast) params.fail_fast = true;
      if (storeFailures && command === 'test') params.store_failures = true;
      if (noCompile && command === 'docs generate') params.no_compile = true;

      const request: RunRequest = {
        command,
        parameters: params,
        description: description || undefined,
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
    }
  };

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-xl font-semibold mb-4">Run dbt Command</h2>
      
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Command Selection */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Command
          </label>
          <select
            value={command}
            onChange={(e) => setCommand(e.target.value as DbtCommand)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="run">dbt run</option>
            <option value="test">dbt test</option>
            <option value="seed">dbt seed</option>
            <option value="docs generate">dbt docs generate</option>
          </select>
        </div>

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
            <input
              type="text"
              value={selectModels}
              onChange={(e) => setSelectModels(e.target.value)}
              placeholder="e.g., my_model+, tag:daily"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Exclude Models
            </label>
            <input
              type="text"
              value={excludeModels}
              onChange={(e) => setExcludeModels(e.target.value)}
              placeholder="e.g., tag:deprecated"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Target
            </label>
            <input
              type="text"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              placeholder="e.g., dev, prod"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
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

          {command === 'test' && (
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={storeFailures}
                onChange={(e) => setStoreFailures(e.target.checked)}
                className="mr-2"
              />
              <span className="text-sm text-gray-700">Store Failures</span>
            </label>
          )}

          {command === 'docs generate' && (
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={noCompile}
                onChange={(e) => setNoCompile(e.target.checked)}
                className="mr-2"
              />
              <span className="text-sm text-gray-700">No Compile</span>
            </label>
          )}
        </div>

        {/* Error Display */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-md p-3">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        {/* Submit Button */}
        <button
          type="submit"
          disabled={isLoading}
          className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? 'Starting...' : `Run ${command}`}
        </button>
      </form>
    </div>
  );
};