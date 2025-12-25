import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import CodeMirror from '@uiw/react-codemirror';
import { sql as sqlLang } from '@codemirror/lang-sql';
import { autocompletion, Completion, CompletionContext, CompletionResult } from '@codemirror/autocomplete';
import { vscodeDark, vscodeLight } from '@uiw/codemirror-theme-vscode';

import { Table } from '../components/Table';
import { StatusBadge } from '../components/StatusBadge';
import { useAutoRefresh } from '../hooks/useAutoRefresh';
import { GitService } from '../services/gitService';
import { SchedulerService } from '../services/schedulerService';
import { SqlWorkspaceService } from '../services/sqlWorkspaceService';
import {
  EnvironmentConfig,
  GitFileContent,
  GitFileNode,
  ModelPreviewResponse,
  SqlAutocompleteMetadata,
  SqlQueryHistoryEntry,
  SqlQueryRequest,
  SqlQueryResult,
} from '../types';

type WorkspaceMode = 'sql' | 'model';

interface PersistedState {
  sqlText: string;
  environmentId: number | null;
  mode: WorkspaceMode;
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
  const [editorTheme, setEditorTheme] = useState<'dark' | 'light'>('dark');

  const [metadata, setMetadata] = useState<SqlAutocompleteMetadata | null>(null);
  const [result, setResult] = useState<SqlQueryResult | null>(null);
  const [previewResult, setPreviewResult] = useState<ModelPreviewResponse | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [compiledSql, setCompiledSql] = useState<string>('');
  const [compiledChecksum, setCompiledChecksum] = useState<string>('');
  const [compiledTarget, setCompiledTarget] = useState<string>('');
  const [compileError, setCompileError] = useState<string | null>(null);
  const [isLoadingCompiled, setIsLoadingCompiled] = useState(false);

  const profilingEnabled = true;
  const [resultsPage, setResultsPage] = useState(1);
  const rowsPerPage = 50;

  const [history, setHistory] = useState<SqlQueryHistoryEntry[]>([]);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyStatusFilter, setHistoryStatusFilter] = useState<string>('all');
  const [historyModelFilter, setHistoryModelFilter] = useState<string>('all');
  const [historyDateFrom, setHistoryDateFrom] = useState<string>('');
  const [historyDateTo, setHistoryDateTo] = useState<string>('');
  const [gitFiles, setGitFiles] = useState<GitFileNode[]>([]);
  const [selectedFilePath, setSelectedFilePath] = useState<string>('');
  const [selectedFileContent, setSelectedFileContent] = useState<GitFileContent | null>(null);
  const [fileSaveMessage, setFileSaveMessage] = useState<string>('');
  const [fileValidationErrors, setFileValidationErrors] = useState<string[]>([]);
  const [isSavingFile, setIsSavingFile] = useState(false);
  const [gitLoadError, setGitLoadError] = useState<string | null>(null);
  const [isFullScreenEditor, setIsFullScreenEditor] = useState(false);

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

  const modelFiles = useMemo(
    () =>
      gitFiles
        .filter(
          (file) =>
            file.type === 'file' &&
            file.path.endsWith('.sql') &&
            (file.category === 'models' || file.path.includes('/models/') || file.path.startsWith('models/')),
        )
        .sort((a, b) => a.path.localeCompare(b.path)),
    [gitFiles],
  );

  const loadEnvironments = useCallback(async () => {
    try {
      const envs = await SchedulerService.listEnvironments();
      setEnvironments(envs);
      if (!environmentId && envs.length > 0) {
        setEnvironmentId(envs[0].id);
      }
    } catch (err) {
      console.error('Failed to load environments', err);
      // Provide a fallback default environment to keep the UI functional
      const now = new Date().toISOString();
      const fallback = [
        {
          id: 0,
          name: 'default',
          description: 'Auto-created fallback environment',
          variables: {},
          created_at: now,
          updated_at: now,
        },
      ] as EnvironmentConfig[];
      setEnvironments(fallback);
      setEnvironmentId(0);
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

  const loadGitFiles = useCallback(async () => {
    try {
      const status = await GitService.status();
      if (status.configured === false) {
        setGitLoadError('Repository not connected.');
        setGitFiles([]);
        return;
      }
      const files = await GitService.files();
      setGitFiles(files);
      setGitLoadError(null);
    } catch (err: any) {
      const message =
        err?.response?.data?.detail?.message || err?.response?.data?.detail || err?.message || 'Repository not connected';
      setGitLoadError(message);
      setGitFiles([]);
    }
  }, []);

  const loadCompiledSqlForModel = useCallback(
    async (modelId: string, envId?: number): Promise<string> => {
      if (!modelId) return '';
      setIsLoadingCompiled(true);
      setCompileError(null);
      try {
        const compiled = await SqlWorkspaceService.getCompiledSql(modelId, {
          environment_id: envId,
        });
        setCompiledSql(compiled.compiled_sql);
        setCompiledChecksum(compiled.compiled_sql_checksum);
        setCompiledTarget(compiled.target_name || '');
        setSqlText(compiled.source_sql || '');
        if (compiled.original_file_path) {
          setSelectedFilePath(compiled.original_file_path);
        }
        return compiled.compiled_sql;
      } catch (err: any) {
        const message =
          err?.response?.data?.detail?.message || err?.response?.data?.detail || err?.message || 'Failed to load compiled SQL';
        setCompileError(message);
        setCompiledSql('');
        setCompiledChecksum('');
        return '';
      } finally {
        setIsLoadingCompiled(false);
      }
    },
    [],
  );

  useEffect(() => {
    const persisted = loadPersistedState();
    if (persisted) {
      setSqlText(persisted.sqlText || '');
      if (persisted.environmentId) {
        setEnvironmentId(persisted.environmentId);
      }
      const persistedMode = persisted.mode === 'preview' ? 'model' : persisted.mode;
      setMode(persistedMode || 'sql');
      setEditorTheme(persisted.editorTheme || 'dark');
      if (persisted.selectedModelId) {
        setSelectedModelId(persisted.selectedModelId);
      }
    }
    loadEnvironments();
    loadMetadata();
    loadHistory();
    loadGitFiles();
  }, [loadEnvironments, loadMetadata, loadHistory, loadGitFiles]);

  useEffect(() => {
    persistState({
      sqlText,
      environmentId: typeof environmentId === 'number' ? environmentId : null,
      mode,
      editorTheme,
      selectedModelId: selectedModelId || null,
    });
  }, [editorTheme, environmentId, mode, selectedModelId, sqlText]);

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

  useEffect(() => {
    if (mode === 'model' && selectedModelId) {
      loadCompiledSqlForModel(selectedModelId, typeof environmentId === 'number' ? environmentId : undefined);
    }
    if (mode === 'sql') {
      setCompiledSql('');
      setCompiledChecksum('');
      setCompiledTarget('');
      setCompileError(null);
    }
  }, [environmentId, loadCompiledSqlForModel, mode, selectedModelId]);

  useAutoRefresh({
    onManifestUpdate: () => {
      loadMetadata();
      loadGitFiles();
      if (mode === 'model' && selectedModelId) {
        loadCompiledSqlForModel(selectedModelId, typeof environmentId === 'number' ? environmentId : undefined);
      }
    },
    onCatalogUpdate: () => {
      loadMetadata();
      loadGitFiles();
      if (mode === 'model' && selectedModelId) {
        loadCompiledSqlForModel(selectedModelId, typeof environmentId === 'number' ? environmentId : undefined);
      }
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
    const effectiveResult = previewResult || result;
    if (!effectiveResult) return [];
    const start = (resultsPage - 1) * rowsPerPage;
    const end = start + rowsPerPage;
    return effectiveResult.rows.slice(start, end);
  }, [previewResult, result, resultsPage]);

  const totalResultPages = useMemo(() => {
    const effectiveResult = previewResult || result;
    if (!effectiveResult || effectiveResult.rows.length === 0) return 0;
    return Math.ceil(effectiveResult.rows.length / rowsPerPage);
  }, [previewResult, result]);

  const effectiveColumns = useMemo(() => {
    const effectiveResult = previewResult || result;
    return effectiveResult?.columns ?? [];
  }, [previewResult, result]);

  const effectiveProfiling = useMemo(() => {
    const effectiveResult = previewResult || result;
    return effectiveResult?.profiling ?? null;
  }, [previewResult, result]);

  const effectiveResult = previewResult || result;

  const handleRun = useCallback(async () => {
    if (!isDeveloperOrAdmin) {
      setError('You do not have permission to run SQL queries.');
      return;
    }
    if (!sqlText.trim() && mode === 'sql') {
      setError('Enter a SQL query to run.');
      return;
    }
    if (mode === 'model' && !selectedModelId) {
      setError('Select a dbt model to run.');
      return;
    }
    setIsRunning(true);
    setError(null);
    setResultsPage(1);
    try {
      if (mode === 'model' && selectedModelId) {
        let compiledText = compiledSql;
        if (!compiledText) {
          compiledText = await loadCompiledSqlForModel(
            selectedModelId,
            typeof environmentId === 'number' ? environmentId : undefined,
          );
        }
        if (!compiledText) {
          setError(compileError || 'Compiled SQL is not available for the selected model.');
          setIsRunning(false);
          return;
        }
        const res = await SqlWorkspaceService.executeModel({
          model_unique_id: selectedModelId,
          environment_id: typeof environmentId === 'number' ? environmentId : undefined,
          include_profiling: profilingEnabled,
        });
        setResult(res);
        setPreviewResult(null);
      } else {
        const request: SqlQueryRequest = {
          sql: sqlText,
          environment_id: typeof environmentId === 'number' ? environmentId : undefined,
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
  }, [compileError, compiledSql, environmentId, loadCompiledSqlForModel, loadHistory, mode, selectedModelId, sqlText]);

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
    if (entry.model_ref) {
      setSelectedModelId(entry.model_ref);
      setMode('model');
    } else {
      setMode('sql');
    }
    setPreviewResult(null);
    setResult(null);
  };

  const handleSelectFile = async (path: string) => {
    try {
      const content = await GitService.readFile(path);
      setSelectedFilePath(path);
      setSelectedFileContent(content);
      setSqlText(content.content);
      setMode('sql');
      setFileValidationErrors([]);
      setError(null);
    } catch (err: any) {
      const message =
        err?.response?.data?.detail?.message || err?.response?.data?.detail || err?.message || 'Failed to load file';
      setGitLoadError(message);
    }
  };

  const handleReloadSelectedFile = async () => {
    if (selectedFilePath) {
      await handleSelectFile(selectedFilePath);
    }
  };

  const handleSaveFile = async () => {
    if (!selectedFilePath || selectedFileContent?.readonly) return;
    setIsSavingFile(true);
    setFileValidationErrors([]);
    try {
      const result = await GitService.writeFile({
        path: selectedFilePath,
        content: sqlText,
        message: fileSaveMessage || undefined,
      });
      if (!result.is_valid) {
        setFileValidationErrors(result.errors || ['Validation failed']);
        return;
      }
      const content = await GitService.readFile(selectedFilePath);
      setSelectedFileContent(content);
      setSqlText(content.content);
      setFileSaveMessage('');
      await loadGitFiles();
    } catch (err: any) {
      const message =
        err?.response?.data?.detail?.message || err?.response?.data?.detail || err?.message || 'Failed to save file';
      setFileValidationErrors([message]);
    } finally {
      setIsSavingFile(false);
    }
  };

  const theme = editorTheme === 'dark' ? vscodeDark : vscodeLight;
  const modelEditorHeight = isFullScreenEditor ? '480px' : '280px';
  const compiledEditorHeight = isFullScreenEditor ? '480px' : '280px';
  const sqlEditorHeight = isFullScreenEditor ? '480px' : '260px';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">SQL Workspace</h1>
          <p className="text-sm text-gray-400">
            Run ad-hoc SQL or dbt models against your warehouse with compiled SQL visibility, metadata, and profiling.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <label className="block text-xs text-gray-400">Environment</label>
            <select
              className="mt-1 bg-gray-900 border border-gray-700 rounded-md px-3 py-1 text-sm text-gray-100"
              value={environmentId}
              onChange={(e) => {
                const value = e.target.value
                setEnvironmentId(value ? Number(value) : '')
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
                Custom SQL
              </button>
              <button
                type="button"
                className={`ml-1 px-2 py-1 rounded ${
                  mode === 'model' ? 'bg-accent text-white' : 'text-gray-300'
                }`}
                onClick={() => setMode('model')}
              >
                dbt model
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

      <div className={`grid grid-cols-1 gap-4 ${isFullScreenEditor ? '' : 'xl:grid-cols-3'}`}>
          <div className="xl:col-span-2 space-y-4">
            <div className="bg-panel border border-gray-800 rounded-lg p-3 pb-14 relative">
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs text-gray-400 truncate">
                  {mode === 'model'
                    ? selectedModelId
                      ? `dbt model: ${selectedModelId}${compiledTarget ? ` • target ${compiledTarget}` : ''}`
                      : 'Select a dbt model to view compiled SQL'
                    : selectedFilePath
                      ? `Editing file: ${selectedFilePath}`
                      : 'SQL editor'}
                </div>
                <div className="flex items-center gap-2 text-xs">
                  {mode === 'model' && compiledChecksum && (
                    <span className="text-gray-500">Checksum {compiledChecksum.slice(0, 12)}…</span>
                  )}
                  {selectedFilePath && (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        className="px-2 py-1 rounded border border-gray-700 text-gray-200"
                        onClick={handleReloadSelectedFile}
                      >
                        Reload file
                      </button>
                      <button
                        type="button"
                        className="px-3 py-1 rounded bg-accent text-white disabled:opacity-50"
                        onClick={handleSaveFile}
                        disabled={isSavingFile || !isDeveloperOrAdmin || selectedFileContent?.readonly}
                      >
                        {isSavingFile ? 'Saving…' : 'Save model'}
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {compileError && mode === 'model' && (
                <div className="mb-2 text-xs text-red-200 bg-red-900/50 border border-red-700 rounded px-3 py-2">
                  Compilation error: {compileError}
                </div>
              )}

              {mode === 'model' ? (
                <div className="grid md:grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs text-gray-400">
                      <span>Model source (editable)</span>
                      {isLoadingCompiled && <span className="text-accent">Refreshing…</span>}
                    </div>
                    <div className="border border-gray-800 rounded-md overflow-hidden">
                      <CodeMirror
                        value={sqlText}
                        height={modelEditorHeight}
                        theme={theme}
                        extensions={[sqlLang(), autocompletion({ override: [completionSource] })]}
                        basicSetup={{ lineNumbers: true, highlightActiveLine: true }}
                        onChange={(value) => setSqlText(value)}
                      />
                    </div>
                    <div className="text-[11px] text-gray-500">
                      Edits apply to the dbt model file; compiled SQL refreshes automatically when artifacts update.
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs text-gray-400">
                      <span>Compiled SQL (read-only)</span>
                      {compiledTarget && <span className="text-gray-500">Target {compiledTarget}</span>}
                    </div>
                    <div className="border border-gray-800 rounded-md overflow-hidden bg-gray-950">
                      <CodeMirror
                        value={compiledSql || '-- Compiled SQL not available yet'}
                        height={compiledEditorHeight}
                        theme={theme}
                        extensions={[sqlLang()]}
                        editable={false}
                        basicSetup={{ lineNumbers: true, highlightActiveLine: false }}
                      />
                    </div>
                    <div className="text-[11px] text-gray-500">
                      Executions for dbt models always use the compiled SQL shown here.
                    </div>
                  </div>
                </div>
              ) : (
                <div className="border border-gray-800 rounded-md overflow-hidden">
                  <CodeMirror
                    value={sqlText}
                    height={sqlEditorHeight}
                    theme={theme}
                    extensions={[sqlLang(), autocompletion({ override: [completionSource] })]}
                    basicSetup={{ lineNumbers: true, highlightActiveLine: true }}
                    onChange={(value) => setSqlText(value)}
                  />
                </div>
              )}

              <div
                className="absolute bottom-3 right-3 flex flex-wrap items-center justify-end gap-2"
                data-testid="editor-action-bar"
              >
                <button
                  type="button"
                  onClick={handleRun}
                  disabled={
                    isRunning ||
                    !isDeveloperOrAdmin ||
                    (mode === 'model' && (isLoadingCompiled || !selectedModelId))
                  }
                  className="inline-flex items-center px-4 py-2 rounded-md bg-accent text-white text-sm font-medium shadow disabled:opacity-60"
                >
                  {isRunning ? 'Running…' : 'Run (Ctrl/Cmd+Enter)'}
                </button>
                <button
                  type="button"
                  onClick={() => setIsFullScreenEditor((prev) => !prev)}
                  className="inline-flex items-center px-3 py-2 rounded-md border border-gray-700 text-xs text-gray-200 hover:bg-gray-800"
                >
                  {isFullScreenEditor ? 'Exit full-screen' : 'Full-screen editor'}
                </button>
              </div>
            </div>

            <div className="bg-panel border border-gray-800 rounded-lg p-3 space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold text-gray-100">Results</div>
                <div className="text-xs text-gray-400 flex flex-wrap gap-2 items-center">
                  {mode === 'model' && selectedModelId && (
                    <span>
                      Model <code className="font-mono">{selectedModelId}</code>
                    </span>
                  )}
                  {result?.compiled_sql_checksum && (
                    <span className="text-gray-500">Checksum {result.compiled_sql_checksum.slice(0, 10)}…</span>
                  )}
                  {result && (
                    <span className="mr-2">
                      Query ID <code className="font-mono">{result.query_id}</code>
                    </span>
                  )}
                  {effectiveColumns.length > 0 && (
                    <span className="ml-2">Columns: {effectiveColumns.length}</span>
                  )}
                </div>
              </div>
              {effectiveResult && (
                <div className="flex items-center justify-between text-xs text-gray-400">
                  <div>
                    Rows: {effectiveResult.row_count}{' '}
                    {effectiveResult.truncated && <span className="ml-1 text-yellow-300">results truncated</span>}
                  </div>
                  <div>Execution time: {effectiveResult.execution_time_ms} ms</div>
                </div>
              )}
              {(effectiveResult) && effectiveColumns.length > 0 && (
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
              {!effectiveResult && (
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

        {!isFullScreenEditor && (
          <div className="space-y-4">
            <div className="bg-panel border border-gray-800 rounded-lg p-3 space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-gray-100">Model files</div>
              <button
                type="button"
                className="text-xs text-accent hover:underline"
                onClick={loadGitFiles}
              >
                Refresh
              </button>
            </div>
            {gitLoadError ? (
              <div className="text-xs text-red-300">{gitLoadError}</div>
            ) : (
              <div className="space-y-2 text-xs text-gray-300">
                <div className="text-gray-400">Select a dbt model to load into the SQL editor.</div>
                <div className="max-h-52 overflow-y-auto space-y-1">
                  {modelFiles.map((file) => (
                    <button
                      key={file.path}
                      type="button"
                      className={`w-full text-left px-2 py-1 rounded border border-gray-800 hover:border-gray-600 ${
                        selectedFilePath === file.path ? 'bg-gray-800 text-white' : 'bg-gray-900 text-gray-200'
                      }`}
                      onClick={() => handleSelectFile(file.path)}
                    >
                      <span className="font-mono">{file.path}</span>
                    </button>
                  ))}
                  {modelFiles.length === 0 && (
                    <div className="text-gray-500">No model files found.</div>
                  )}
                </div>
              </div>
            )}
            {selectedFilePath && (
              <div className="space-y-2 text-xs">
                <div className="text-gray-400">Save changes back to git.</div>
                <input
                  type="text"
                  className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-gray-100"
                  placeholder="Optional commit or change note"
                  value={fileSaveMessage}
                  onChange={(e) => setFileSaveMessage(e.target.value)}
                  disabled={!isDeveloperOrAdmin}
                />
                {fileValidationErrors.length > 0 && (
                  <div className="bg-red-900/40 border border-red-700 rounded p-2 text-red-100 space-y-1">
                    {fileValidationErrors.map((err) => (
                      <div key={err}>{err}</div>
                    ))}
                  </div>
                )}
                {selectedFileContent?.readonly && (
                  <div className="text-yellow-300">File is read-only; saving is disabled.</div>
                )}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleSaveFile}
                    disabled={isSavingFile || !isDeveloperOrAdmin || selectedFileContent?.readonly}
                    className="px-3 py-1.5 rounded bg-accent text-white disabled:opacity-60"
                  >
                    {isSavingFile ? 'Saving…' : 'Save file'}
                  </button>
                  <button
                    type="button"
                    onClick={handleReloadSelectedFile}
                    className="px-3 py-1.5 rounded border border-gray-700 text-gray-200"
                  >
                    Reload
                  </button>
                </div>
              </div>
            )}
          </div>

            <div className="bg-panel border border-gray-800 rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold text-gray-100">dbt models</div>
              </div>
              <div className="space-y-2">
                <label className="block text-xs text-gray-400">Model</label>
                <select
                  className="w-full bg-gray-900 border border-gray-700 rounded-md px-2 py-1 text-sm text-gray-100"
                  value={selectedModelId}
                  onChange={(e) => {
                    const modelId = e.target.value;
                    setSelectedModelId(modelId);
                    setMode('model');
                    if (modelId) {
                      loadCompiledSqlForModel(modelId, typeof environmentId === 'number' ? environmentId : undefined);
                    }
                  }}
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
                  onClick={() => {
                    if (selectedModelId) {
                      loadCompiledSqlForModel(
                        selectedModelId,
                        typeof environmentId === 'number' ? environmentId : undefined,
                      );
                    }
                  }}
                  disabled={!selectedModelId || isLoadingCompiled}
                  className="w-full mt-2 inline-flex items-center justify-center px-3 py-1.5 rounded-md bg-gray-800 text-gray-100 text-xs disabled:opacity-60"
                >
                  Refresh compiled SQL
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
                                    setMode('model');
                                    loadCompiledSqlForModel(
                                      rel.unique_id,
                                      typeof environmentId === 'number' ? environmentId : undefined,
                                    );
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
                      setHistoryStatusFilter(e.target.value)
                      setHistoryPage(1)
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
                      setHistoryModelFilter(e.target.value)
                      setHistoryPage(1)
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
                      setHistoryDateFrom(e.target.value)
                      setHistoryPage(1)
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
                      setHistoryDateTo(e.target.value)
                      setHistoryPage(1)
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
                    <th className="px-3 py-2 text-left font-semibold text-gray-300">Mode</th>
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
                        {entry.model_ref ? 'dbt model' : 'custom SQL'}
                      </td>
                      <td className="px-3 py-2 text-gray-300">
                        {entry.environment_name || '-'}
                      </td>
                      <td className="px-3 py-2 text-gray-300 max-w-xs truncate">
                        <div className="space-y-1">
                          <code className="font-mono">
                            {entry.query_text.replace(/\s+/g, ' ').slice(0, 80)}
                            {entry.query_text.length > 80 ? '…' : ''}
                          </code>
                          {entry.model_ref && (
                            <div className="text-[10px] uppercase text-accent">{entry.model_ref}</div>
                          )}
                          {entry.compiled_sql_checksum && (
                            <div className="text-[10px] text-gray-500">
                              checksum {entry.compiled_sql_checksum.slice(0, 12)}…
                            </div>
                          )}
                        </div>
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
                        colSpan={6}
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
      )}
      </div>
    </div>
  );
}

export default SqlWorkspacePage;
