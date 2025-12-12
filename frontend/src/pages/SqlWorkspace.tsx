import { useCallback, useEffect, useMemo, useState } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { sql as sqlLang } from '@codemirror/lang-sql';
import { autocompletion, Completion, CompletionContext, CompletionResult } from '@codemirror/autocomplete';
import { vscodeDark, vscodeLight } from '@uiw/codemirror-themes';

import { Table } from '../components/Table';
import { StatusBadge } from '../components/StatusBadge';
import { useAutoRefresh } from '../hooks/useAutoRefresh';
import { SchedulerService } from '../services/schedulerService';
import { SqlWorkspaceService } from '../services/sqlWorkspaceService';
import {
  EnvironmentConfig,
  ModelPreviewResponse,
  SqlAutocompleteMetadata,
  SqlQueryHistoryEntry,
  SqlQueryRequest,
  SqlQueryResult,
} from '../types';

type WorkspaceMode = 'sql' | 'preview';

interface PersistedState {
  sqlText: string;
  environmentId: number | null;
  mode: WorkspaceMode;
  rowLimit: number;
  profilingEnabled: boolean;
  editorTheme: 'dark' | 'light';
  selectedModelId: string | null;
}

const STORAGE_KEY = 'dbt-workbench-sql-workspace';

function loadPersistedState(): PersistedState | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedState;
    return parsed;
  } catch {
    return null;
  }
}

function persistState(state: PersistedState) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
}

function SqlWorkspacePage() {
  const { user, isAuthEnabled } = useAuth();
  const isDeveloperOrAdmin = !isAuthEnabled || user?.role === 'developer' || user?.role === 'admin';

  const [sqlText, setSqlText] = useState('');
  const [environmentId, setEnvironmentId] = useState<number | ''>('');
  const [environments, setEnvironments] = useState<EnvironmentConfig[]>([]);
  const [mode, setMode] = useState<WorkspaceMode>('sql');
  const [selectedModelId, setSelectedModelId] = useState<string>('');
  const [rowLimit, setRowLimit] = useState<number>(500);
  const [profilingEnabled, setProfilingEnabled] = useState(false);
  const [editorTheme, setEditorTheme] = useState<'dark' | 'light'>('dark');

  const [metadata, setMetadata] = useState<SqlAutocompleteMetadata | null>(null);
  const [result, setResult] = useState<SqlQueryResult | null>(null);
  const [previewResult, setPreviewResult] = useState<ModelPreviewResponse | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [resultsPage, setResultsPage] = useState(1);
  const rowsPerPage = 50;

  const [history, setHistory] = useState<SqlQueryHistoryEntry[]>([]);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyStatusFilter, setHistoryStatusFilter] = useState<string>('all');
  const [historyModelFilter, setHistoryModelFilter] = useState<string>('all');
  const [historyDateFrom, setHistoryDateFrom] = useState<string>('');
  const [historyDateTo, setHistoryDateTo] = useState<string>('');

  const aliasMap = useMemo(() => {
    if (!metadata) return {} as Record<string, string>;
    const text = sqlText;
    const map: Record<string, string> = {};
    const allRelations = [...metadata.models, ...metadata.sources];

    const addAliasFromMatch = (match: RegExpExecArray) => {
      const relationToken = match[1];
      const alias = match[2];
      const relation =
        allRelations.find(
          (r) =>
            r.relation_name === relationToken ||
            r.name === relationToken ||
            (r.unique_id && r.unique_id === relationToken),
        ) || null;
      if (relation && alias) {
        map[alias] = relation.unique_id || relation.relation_name;
      }
    };

    const fromRegex = /\bfrom\s+([a-zA-Z0-9_."]+)(?:\s+as)?\s+([a-zA-Z0-9_]+)/gi;
    let match: RegExpExecArray | null;
    // eslint-disable-next-line no-cond-assign
    while ((match = fromRegex.exec(text))) {
      addAliasFromMatch(match);
    }

    const joinRegex = /\bjoin\s+([a-zA-Z0-9_."]+)(?:\s+as)?\s+([a-zA-Z0-9_]+)/gi;
    // eslint-disable-next-line no-cond-assign
    while ((match = joinRegex.exec(text))) {
      addAliasFromMatch(match);
    }

    return map;
  }, [metadata, sqlText]);

  const loadEnvironments = useCallback(async () => {
    try {
      const envs = await SchedulerService.listEnvironments();
      setEnvironments(envs);
      if (!environmentId && envs.length > 0) {
        setEnvironmentId(envs[0].id);
      }
    } catch (err) {
      console.error('Failed to load environments', err);
    }
  }, [environmentId]);

  const loadMetadata = useCallback(async () => {
    try {
      const data = await SqlWorkspaceService.getMetadata();
      setMetadata(data);
    } catch (err) {
      console.error('Failed to load SQL metadata', err);
    }
  }, []);

  const loadHistory = useCallback(async () => {
    try {
      const filters: any = {
        page: historyPage,
        page_size: 20,
      };
      if (environmentId && typeof environmentId === 'number') {
        filters.environment_id = environmentId;
      }
      if (historyStatusFilter !== 'all') {
        filters.status = historyStatusFilter;
      }
      if (historyModelFilter && historyModelFilter !== 'all') {
        filters.model_ref = historyModelFilter;
      }
      if (historyDateFrom) {
        filters.start_time = new Date(historyDateFrom).toISOString();
      }
      if (historyDateTo) {
        const end = new Date(historyDateTo);
        end.setHours(23, 59, 59, 999);
        filters.end_time = end.toISOString();
      }
      const response = await SqlWorkspaceService.getHistory(filters);
      setHistory(response.items);
      setHistoryTotal(response.total_count);
    } catch (err) {
      console.error('Failed to load query history', err);
    }
  }, [environmentId, historyDateFrom, historyDateTo, historyModelFilter, historyPage, historyStatusFilter]);

  useEffect(() => {
    const persisted = loadPersistedState();
    if (persisted) {
      setSqlText(persisted.sqlText || '');
      if (persisted.environmentId) {
        setEnvironmentId(persisted.environmentId);
      }
      setMode(persisted.mode || 'sql');
      setRowLimit(persisted.rowLimit || 500);
      setProfilingEnabled(!!persisted.profilingEnabled);
      setEditorTheme(persisted.editorTheme || 'dark');
      if (persisted.selectedModelId) {
        setSelectedModelId(persisted.selectedModelId);
      }
    }
    loadEnvironments();
    loadMetadata();
    loadHistory();
  }, [loadEnvironments, loadMetadata, loadHistory]);

  useEffect(() => {
    persistState({
      sqlText,
      environmentId: typeof environmentId === 'number' ? environmentId : null,
      mode,
      rowLimit,
      profilingEnabled,
      editorTheme,
      selectedModelId: selectedModelId || null,
    });
  }, [editorTheme, environmentId, mode, profilingEnabled, rowLimit, selectedModelId, sqlText]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
        event.preventDefault();
        handleRun();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  });

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  useAutoRefresh({
    onManifestUpdate: () => {
      loadMetadata();
    },
    onCatalogUpdate: () => {
      loadMetadata();
    },
  });

  const completionSource = useCallback(
    (context: CompletionContext): CompletionResult | null => {
      if (!metadata) return null;

      const word = context.matchBefore(/[\w$]+/);
      if (!word || (word.from === word.to && !context.explicit)) {
        return null;
      }

      const before = context.state.doc.sliceString(0, context.pos);
      const lowerBefore = before.toLowerCase();
      const options: Completion[] = [];

      const allRelations = [...metadata.models, ...metadata.sources];

      // ref() helper: suggest dbt model names inside ref()
      if (/ref\(\s*["']?[\w]*$/i.test(lowerBefore)) {
        for (const model of metadata.models) {
          options.push({
            label: model.name,
            type: 'variable',
            info: model.unique_id || model.relation_name,
            apply: model.name,
          });
        }
        return { from: word.from, options, validFor: /[\w$]*/ };
      }

      // Column suggestions when typing alias.column
      const aliasMatch = /([a-zA-Z0-9_]+)\.\s*[\w$]*$/.exec(before);
      if (aliasMatch) {
        const alias = aliasMatch[1];
        const target = aliasMap[alias];
        if (target) {
          const relation =
            allRelations.find((r) => r.unique_id === target || r.relation_name === target) || null;
          if (relation) {
            for (const col of relation.columns) {
              options.push({
                label: col.name,
                type: 'property',
                info: col.data_type || undefined,
              });
            }
            return { from: word.from, options, validFor: /[\w$]*/ };
          }
        }
      }

      // Generic relation suggestions
      for (const rel of allRelations) {
        options.push({
          label: rel.name,
          type: 'variable',
          info: rel.relation_name,
        });
      }

      // Generic column suggestions across all relations
      const seenColumns = new Set<string>();
      for (const rel of allRelations) {
        for (const col of rel.columns) {
          if (!seenColumns.has(col.name)) {
            seenColumns.add(col.name);
            options.push({
              label: col.name,
              type: 'property',
              info: col.data_type || undefined,
            });
          }
        }
      }

      return { from: word.from, options, validFor: /[\w$]*/ };
    },
    [aliasMap, metadata],
  );

  const currentRows = useMemo(() => {
    const effectiveResult = mode === 'preview' && previewResult ? previewResult : result;
    if (!effectiveResult) return [];
    const start = (resultsPage - 1) * rowsPerPage;
    const end = start + rowsPerPage;
    return effectiveResult.rows.slice(start, end);
  }, [mode, previewResult, result, resultsPage]);

  const totalResultPages = useMemo(() => {
    const effectiveResult = mode === 'preview' && previewResult ? previewResult : result;
    if (!effectiveResult || effectiveResult.rows.length === 0) return 0;
    return Math.ceil(effectiveResult.rows.length / rowsPerPage);
  }, [mode, previewResult, result]);

  const effectiveColumns = useMemo(() => {
    const effectiveResult = mode === 'preview' && previewResult ? previewResult : result;
    return effectiveResult?.columns ?? [];
  }, [mode, previewResult, result]);

  const effectiveProfiling = useMemo(() => {
    const effectiveResult = mode === 'preview' && previewResult ? previewResult : result;
    return effectiveResult?.profiling ?? null;
  }, [mode, previewResult, result]);

  const handleRun = useCallback(async () => {
    if (!isDeveloperOrAdmin) {
      setError('You do not have permission to run SQL queries.');
      return;
    }
    if (!sqlText.trim() && mode === 'sql') {
      setError('Enter a SQL query to run.');
      return;
    }
    if (mode === 'preview' && !selectedModelId) {
      setError('Select a model to preview.');
      return;
    }
    setIsRunning(true);
    setError(null);
    setResultsPage(1);
    try {
      if (mode === 'preview') {
        const preview = await SqlWorkspaceService.previewModel({
          model_unique_id: selectedModelId,
          environment_id: typeof environmentId === 'number' ? environmentId : undefined,
          row_limit: rowLimit,
          include_profiling: profilingEnabled,
        });
        setPreviewResult(preview);
        setResult(null);
      } else {
        const request: SqlQueryRequest = {
          sql: sqlText,
          environment_id: typeof environmentId === 'number' ? environmentId : undefined,
          row_limit: rowLimit,
          include_profiling: profilingEnabled,
          mode: 'sql',
        };
        const res = await SqlWorkspaceService.executeQuery(request);
        setResult(res);
        setPreviewResult(null);
      }
      setHistoryPage(1);
      await loadHistory();
    } catch (err: any) {
      const message =
        err?.response?.data?.detail?.message ||
        err?.response?.data?.detail ||
        err?.message ||
        'Failed to execute query';
      setError(message);
    } finally {
      setIsRunning(false);
    }
  }, [environmentId, loadHistory, mode, profilingEnabled, rowLimit, selectedModelId, sqlText]);

  const handleClearError = () => {
    setError(null);
  };

  const handleDeleteHistoryEntry = async (entryId: number) => {
    try {
      await SqlWorkspaceService.deleteHistoryEntry(entryId);
      await loadHistory();
    } catch (err) {
      console.error('Failed to delete history entry', err);
    }
  };

  const handleRerunHistoryEntry = (entry: SqlQueryHistoryEntry) => {
    setSqlText(entry.query_text);
    setMode('sql');
    setPreviewResult(null);
    setResult(null);
  };

  const theme = editorTheme === 'dark' ? vscodeDark : vscodeLight;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">SQL Workspace</h1>
          <p className="text-sm text-gray-400">
            Run ad-hoc SQL against your warehouse with dbt-aware metadata, previews, and profiling.
          </p>
        </div>
        <div className="flex items-center space-x-3">
          <div>
            <label className="block text-xs text-gray-400">Environment</label>
            <select
              className="mt-1 bg-gray-900 border border-gray-700 rounded-md px-3 py-1 text-sm text-gray-100"
              value={environmentId}
              onChange={(e) => {
                const value = e.target.value;
                setEnvironmentId(value ? Number(value) : '');
              }}
            >
              {environments.length === 0 && <option value="">Default</option>}
              {environments.map((env) => (
                <option key={env.id} value={env.id}>
                  {env.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-400">Mode</label>
            <div className="mt-1 inline-flex rounded-md bg-gray-900 border border-gray-700 p-1 text-xs">
              <button
                type="button"
                className={`px-2 py-1 rounded ${
                  mode === 'sql' ? 'bg-accent text-white' : 'text-gray-300'
                }`}
                onClick={() => setMode('sql')}
              >
                Free SQL
              </button>
              <button
                type="button"
                className={`ml-1 px-2 py-1 rounded ${
                  mode === 'preview' ? 'bg-accent text-white' : 'text-gray-300'
                }`}
                onClick={() => setMode('preview')}
              >
                Model preview
              </button>
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-400">Editor theme</label>
            <div className="mt-1 inline-flex rounded-md bg-gray-900 border border-gray-700 p-1 text-xs">
              <button
                type="button"
                className={`px-2 py-1 rounded ${
                  editorTheme === 'dark' ? 'bg-accent text-white' : 'text-gray-300'
                }`}
                onClick={() => setEditorTheme('dark')}
              >
                Dark
              </button>
              <button
                type="button"
                className={`ml-1 px-2 py-1 rounded ${
                  editorTheme === 'light' ? 'bg-accent text-white' : 'text-gray-300'
                }`}
                onClick={() => setEditorTheme('light')}
              >
                Light
              </button>
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-400">Row limit</label>
            <input
              type="number"
              min={1}
              className="mt-1 w-24 bg-gray-900 border border-gray-700 rounded-md px-2 py-1 text-sm text-gray-100"
              value={rowLimit}
              onChange={(e) => setRowLimit(Number(e.target.value) || 1)}
            />
          </div>
          <div className="flex items-center space-x-2 mt-5">
            <input
              id="profiling-toggle"
              type="checkbox"
              className="h-4 w-4 text-accent border-gray-700 rounded"
              checked={profilingEnabled}
              onChange={(e) => setProfilingEnabled(e.target.checked)}
            />
            <label htmlFor="profiling-toggle" className="text-xs text-gray-300">
              Enable profiling
            </label>
          </div>
          <button
            type="button"
            onClick={handleRun}
            disabled={isRunning || !isDeveloperOrAdmin}
            className="mt-5 inline-flex items-center px-4 py-2 rounded-md bg-accent text-white text-sm font-medium disabled:opacity-60"
          >
            {isRunning ? 'Running…' : 'Run (Ctrl/Cmd+Enter)'}
        </  but_codetonewn</>
        </div>
      </div>

      {error && (
        <div className="bg-red-900/40 border border-red-700 text-red-200 text-sm rounded-md px-4 py-3 flex justify-between items-center">
          <div className="pr-4">{error}</div>
          <button
            type="button"
            className="text-xs underline underline-offset-2"
            onClick={handleClearError}
          >
            Clear
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="xl:col-span-2 space-y-4">
          <div className="bg-panel border border-gray-800 rounded-lg p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs text-gray-400">
                SQL editor
              </div>
            </div>
            <div className="border border-gray-800 rounded-md overflow-hidden">
              <CodeMirror
                value={sqlText}
                height="260px"
                theme={theme}
                extensions={[sqlLang(), autocompletion({ override: [completionSource] })]}
                basicSetup={{ lineNumbers: true, highlightActiveLine: true }}
                onChange={(value) => setSqlText(value)}
              />
            </div>
          </div>

          <div className="bg-panel border border-gray-800 rounded-lg p-3 space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-gray-100">Results</div>
              <div className="text-xs text-gray-400">
                {mode === 'preview' && previewResult && (
                  <span className="mr-2">
                    Previewing <code className="font-mono">{previewResult.model_unique_id}</code>
                  </span>
                )}
                {mode === 'sql' && result && (
                  <span className="mr-2">
                    Query ID <code className="font-mono">{result.query_id}</code>
                  </span>
                )}
                {effectiveColumns.length > 0 && (
                  <span className="ml-2">
                    Columns: {effectiveColumns.length}
                  </span>
                )}
              </div>
            </div>
            {mode === 'preview' && previewResult && (
              <div className="flex items-center justify-between text-xs text-gray-400">
                <div>
                  Rows: {previewResult.row_count}{' '}
                  {previewResult.truncated && <span className="ml-1 text-yellow-300">results truncated</span>}
                </div>
                <div>Execution time: {previewResult.execution_time_ms} ms</div>
              </div>
            )}
            {mode === 'sql' && result && (
              <div className="flex items-center justify-between text-xs text-gray-400">
                <div>
                  Rows: {result.row_count}{' '}
                  {result.truncated && <span className="ml-1 text-yellow-300">results truncated</span>}
                </div>
                <div>Execution time: {result.execution_time_ms} ms</div>
              </div>
            )}
            {(result || previewResult) && effectiveColumns.length > 0 && (
              <div className="space-y-2">
                <Table
                  columns={effectiveColumns.map((col) => ({
                    key: col.name,
                    header: col.name,
                    render: (row: Record<string, any>) => {
                      const value = row[col.name];
                      if (value === null || value === undefined) return <span className="text-gray-500">NULL</span>;
                      if (typeof value === 'object') return JSON.stringify(value);
                      return String(value);
                    },
                  }))}
                  data={currentRows}
                />
                {totalResultPages > 1 && (
                  <div className="flex items-center justify-between text-xs text-gray-400">
                    <div>
                      Page {resultsPage} of {totalResultPages}
                    </div>
                    <div className="space-x-2">
                      <button
                        type="button"
                        className="px-2 py-1 rounded border border-gray-700 text-gray-200 disabled:opacity-40"
                        disabled={resultsPage === 1}
                        onClick={() => setResultsPage((p) => Math.max(1, p - 1))}
                      >
                        Previous
                      </button>
                      <button
                        type="button"
                        className="px-2 py-1 rounded border border-gray-700 text-gray-200 disabled:opacity-40"
                        disabled={resultsPage === totalResultPages}
                        onClick={() => setResultsPage((p) => Math.min(totalResultPages, p + 1))}
                      >
                        Next
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
            {!result && !previewResult && (
              <div className="text-xs text-gray-500">
                Run a query to see results here.
              </div>
            )}
          </div>

          {profilingEnabled && effectiveProfiling && (
            <div className="bg-panel border border-gray-800 rounded-lg p-3 space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold text-gray-100">Profiling</div>
                <div className="text-xs text-gray-400">
                  Based on {effectiveProfiling.row_count} rows
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-800 text-xs">
                  <thead className="bg-gray-900">
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold text-gray-300">Column</th>
                      <th className="px-3 py-2 text-left font-semibold text-gray-300">Nulls</th>
                      <th className="px-3 py-2 text-left font-semibold text-gray-300">Distinct</th>
                      <th className="px-3 py-2 text-left font-semibold text-gray-300">Min</th>
                      <th className="px-3 py-2 text-left font-semibold text-gray-300">Max</th>
                      <th className="px-3 py-2 text-left font-semibold text-gray-300">Sample</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800">
                    {effectiveProfiling.columns.map((col) => (
                      <tr key={col.column_name}>
                        <td className="px-3 py-2 text-gray-100 font-mono">{col.column_name}</td>
                        <td className="px-3 py-2 text-gray-100">{col.null_count ?? 0}</td>
                        <td className="px-3 py-2 text-gray-100">{col.distinct_count ?? '-'}</td>
                        <td className="px-3 py-2 text-gray-100 truncate max-w-xs">
                          {col.min_value !== undefined && col.min_value !== null ? String(col.min_value) : '-'}
                        </td>
                        <td className="px-3 py-2 text-gray-100 truncate max-w-xs">
                          {col.max_value !== undefined && col.max_value !== null ? String(col.max_value) : '-'}
                        </td>
                        <td className="px-3 py-2 text-gray-100 truncate max-w-md">
                          {col.sample_values && col.sample_values.length > 0
                            ? col.sample_values.map((v) => String(v)).join(', ')
                            : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="bg-panel border border-gray-800 rounded-lg p-3 space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-gray-100">Model preview</div>
            </div>
            <div className="space-y-2">
              <label className="block text-xs text-gray-400">Model</label>
              <select
                className="w-full bg-gray-900 border border-gray-700 rounded-md px-2 py-1 text-sm text-gray-100"
                value={selectedModelId}
                onChange={(e) => setSelectedModelId(e.target.value)}
              >
                <option value="">Select model</option>
                {metadata?.models.map((m) => (
                  <option key={m.unique_id || m.relation_name} value={m.unique_id || ''}>
                    {m.name} {m.schema ? `(${m.schema})` : ''}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={handleRun}
                disabled={mode !== 'preview' || isRunning || !isDeveloperOrAdmin}
                className="w-full mt-2 inline-flex items-center justify-center px-3 py-1.5 rounded-md bg-gray-800 text-gray-100 text-xs disabled:opacity-60"
              >
                Preview model
              </button>
            </div>
            <div className="mt-3">
              <div className="text-xs font-semibold text-gray-200 mb-1">Schema browser</div>
              <div className="max-h-64 overflow-y-auto text-xs text-gray-300 space-y-2">
                {metadata
                  ? Object.entries(metadata.schemas).map(([schemaKey, relations]) => (
                      <div key={schemaKey}>
                        <div className="text-gray-400 font-semibold">{schemaKey}</div>
                        <ul className="mt-1 space-y-1">
                          {relations.map((rel) => (
                            <li key={rel.unique_id || rel.relation_name}>
                              <button
                                type="button"
                                className="w-full flex items-center justify-between text-left hover:text-accent"
                                onClick={() => {
                                  if (rel.unique_id) {
                                    setSelectedModelId(rel.unique_id);
                                    setMode('preview');
                                  }
                                }}
                              >
                                <span className="truncate">{rel.name}</span>
                                <span className="ml-2 text-[10px] uppercase text-gray-500">
                                  {rel.resource_type}
                                </span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))
                  : 'Loading metadata…'}
              </div>
            </div>
          </div>

          <div className="bg-panel border border-gray-800 rounded-lg p-3 space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-gray-100">Query history</div>
              <div className="text-xs text-gray-400">
                {historyTotal} total
              </div>
            </div>
            <div className="space-y-2 text-xs">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-gray-400 mb-1">Status</label>
                  <select
                    className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-gray-100"
                    value={historyStatusFilter}
                    onChange={(e) => {
                      setHistoryStatusFilter(e.target.value);
                      setHistoryPage(1);
                    }}
                  >
                    <option value="all">All</option>
                    <option value="success">Success</option>
                    <option value="error">Error</option>
                    <option value="cancelled">Cancelled</option>
                    <option value="timeout">Timeout</option>
                  </select>
                </div>
                <div>
                  <label className="block text-gray-400 mb-1">Model</label>
                  <select
                    className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-gray-100"
                    value={historyModelFilter}
                    onChange={(e) => {
                      setHistoryModelFilter(e.target.value);
                      setHistoryPage(1);
                    }}
                  >
                    <option value="all">All</option>
                    {metadata?.models.map((m) => (
                      <option key={m.unique_id || m.relation_name} value={m.unique_id || ''}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-gray-400 mb-1">From</label>
                  <input
                    type="date"
                    className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-gray-100"
                    value={historyDateFrom}
                    onChange={(e) => {
                      setHistoryDateFrom(e.target.value);
                      setHistoryPage(1);
                    }}
                  />
                </div>
                <div>
                  <label className="block text-gray-400 mb-1">To</label>
                  <input
                    type="date"
                    className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-gray-100"
                    value={historyDateTo}
                    onChange={(e) => {
                      setHistoryDateTo(e.target.value);
                      setHistoryPage(1);
                    }}
                  />
                </div>
              </div>
            </div>

            <div className="border border-gray-800 rounded-md max-h-64 overflow-y-auto">
              <table className="min-w-full divide-y divide-gray-800 text-xs">
                <thead className="bg-gray-900">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold text-gray-300">Time</th>
                    <th className="px-3 py-2 text-left font-semibold text-gray-300">Status</th>
                    <th className="px-3 py-2 text-left font-semibold text-gray-300">Env</th>
                    <th className="px-3 py-2 text-left font-semibold text-gray-300">Query</th>
                    <th className="px-3 py-2 text-left font-semibold text-gray-300">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {history.map((entry) => (
                    <tr key={entry.id}>
                      <td className="px-3 py-2 text-gray-300">
                        {new Date(entry.created_at).toLocaleString()}
                      </td>
                      <td className="px-3 py-2">
                        <StatusBadge status={entry.status} />
                      </td>
                      <td className="px-3 py-2 text-gray-300">
                        {entry.environment_name || '-'}
                      </td>
                      <td className="px-3 py-2 text-gray-300 max-w-xs truncate">
                        <code className="font-mono">
                          {entry.query_text.replace(/\s+/g, ' ').slice(0, 80)}
                          {entry.query_text.length > 80 ? '…' : ''}
                        </code>
                      </td>
                      <td className="px-3 py-2 text-gray-300 space-x-2">
                        <button
                          type="button"
                          className="text-xs text-accent hover:underline"
                          onClick={() => handleRerunHistoryEntry(entry)}
                        >
                          Re-run
                        </button>
                        <button
                          type="button"
                          className="text-xs text-red-400 hover:underline"
                          onClick={() => handleDeleteHistoryEntry(entry.id)}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                  {history.length === 0 && (
                    <tr>
                      <td
                        className="px-3 py-3 text-center text-gray-500"
                        colSpan={5}
                      >
                        No queries found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {historyTotal > 20 && (
              <div className="flex items-center justify-between text-xs text-gray-400 mt-2">
                <div>
                  Page {historyPage} of {Math.max(1, Math.ceil(historyTotal / 20))}
                </div>
                <div className="space-x-2">
                  <button
                    type="button"
                    className="px-2 py-1 rounded border border-gray-700 text-gray-200 disabled:opacity-40"
                    disabled={historyPage === 1}
                    onClick={() => setHistoryPage((p) => Math.max(1, p - 1))}
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    className="px-2 py-1 rounded border border-gray-700 text-gray-200 disabled:opacity-40"
                    disabled={historyPage >= Math.ceil(historyTotal / 20)}
                    onClick={() => setHistoryPage((p) => p + 1)}
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default SqlWorkspacePage;