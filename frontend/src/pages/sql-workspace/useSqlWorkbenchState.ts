import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Completion, CompletionContext, CompletionResult } from '@codemirror/autocomplete'

import { useAuth } from '@/context/AuthContext'
import { useAi } from '@/context/AiContext'
import { useAutoRefresh } from '@/hooks/useAutoRefresh'
import { GitService } from '@/services/gitService'
import { SchedulerService } from '@/services/schedulerService'
import { SqlWorkspaceService } from '@/services/sqlWorkspaceService'
import {
  EnvironmentConfig,
  GitFileNode,
  SqlAutocompleteMetadata,
  SqlQueryHistoryEntry,
  SqlQueryRequest,
  SqlQueryResult,
} from '../../types'
import {
  getDefaultSqlWorkbenchLayout,
  getDefaultSqlWorkbenchPanel,
  getDefaultSqlWorkbenchTheme,
  loadSqlWorkspaceState,
  saveSqlWorkspaceState,
} from './sqlWorkspaceStorage'
import {
  SqlBottomPanelTab,
  SqlEditorTab,
  SqlOutputEntry,
  SqlResultTab,
  SqlWorkbenchLayoutState,
  WorkspaceMode,
} from './types'

const MAX_TABS = 12
const MAX_RESULT_TABS = 5
const HISTORY_PAGE_SIZE = 20
const ROWS_PER_PAGE = 50

const normalizePath = (path: string) => path.replace(/^\.\/?/, '').replace(/^\/+/, '')

const makeTabId = () => `sql-tab-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

const makeOutputId = () => `output-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

const createDefaultSqlTab = (title = 'SQL 1'): SqlEditorTab => {
  const now = Date.now()
  return {
    id: makeTabId(),
    title,
    mode: 'sql',
    sqlText: '',
    sourceFilePath: null,
    selectedModelId: null,
    compiledSql: '',
    compiledChecksum: '',
    compiledTarget: '',
    compiledForEnvironmentId: null,
    compileError: null,
    isLoadingCompiled: false,
    isDirty: false,
    isReadonly: false,
    lastUsedAt: now,
  }
}

const touchTab = (tab: SqlEditorTab): SqlEditorTab => ({
  ...tab,
  lastUsedAt: Date.now(),
})

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

const mapPersistedTabToRuntime = (tab: {
  id: string
  title: string
  mode: WorkspaceMode
  sqlText: string
  sourceFilePath?: string | null
  selectedModelId?: string | null
  isDirty: boolean
  isReadonly?: boolean
  lastUsedAt?: number
}): SqlEditorTab => ({
  id: tab.id,
  title: tab.title,
  mode: tab.mode,
  sqlText: tab.sqlText,
  sourceFilePath: tab.sourceFilePath || null,
  selectedModelId: tab.selectedModelId || null,
  compiledSql: '',
  compiledChecksum: '',
  compiledTarget: '',
  compiledForEnvironmentId: null,
  compileError: null,
  isLoadingCompiled: false,
  isDirty: Boolean(tab.isDirty),
  isReadonly: Boolean(tab.isReadonly),
  lastUsedAt: Number(tab.lastUsedAt || Date.now()),
})

interface OpenTabOptions {
  mode?: WorkspaceMode
  sqlText?: string
  title?: string
  sourceFilePath?: string | null
  selectedModelId?: string | null
  isReadonly?: boolean
  forceNew?: boolean
}

const truncate = (value: string, max = 80) => (value.length <= max ? value : `${value.slice(0, max)}…`)

export const useSqlWorkbenchState = () => {
  const { user, isAuthEnabled, activeWorkspace } = useAuth()
  const { openPanel } = useAi()
  const isDeveloperOrAdmin = !isAuthEnabled || user?.role === 'developer' || user?.role === 'admin'
  const workspaceId = activeWorkspace?.id ?? null

  const [tabs, setTabs] = useState<SqlEditorTab[]>([createDefaultSqlTab()])
  const [activeTabId, setActiveTabId] = useState<string>('')
  const [editorTheme, setEditorTheme] = useState<'dark' | 'light'>(getDefaultSqlWorkbenchTheme())
  const [environmentId, setEnvironmentId] = useState<number | ''>('')
  const [environments, setEnvironments] = useState<EnvironmentConfig[]>([])
  const [activeBottomPanel, setActiveBottomPanel] = useState<SqlBottomPanelTab>(getDefaultSqlWorkbenchPanel())
  const [layoutState, setLayoutState] = useState<SqlWorkbenchLayoutState>(getDefaultSqlWorkbenchLayout())

  const [metadata, setMetadata] = useState<SqlAutocompleteMetadata | null>(null)
  const [gitFiles, setGitFiles] = useState<GitFileNode[]>([])
  const [gitLoadError, setGitLoadError] = useState<string | null>(null)

  const [history, setHistory] = useState<SqlQueryHistoryEntry[]>([])
  const [historyPage, setHistoryPage] = useState(1)
  const [historyTotal, setHistoryTotal] = useState(0)
  const [historyStatusFilter, setHistoryStatusFilter] = useState('all')
  const [historyModelFilter, setHistoryModelFilter] = useState('all')
  const [historyDateFrom, setHistoryDateFrom] = useState('')
  const [historyDateTo, setHistoryDateTo] = useState('')

  const [resultTabs, setResultTabs] = useState<SqlResultTab[]>([])
  const [activeResultTabId, setActiveResultTabId] = useState<string>('')
  const [resultsPage, setResultsPage] = useState(1)

  const [outputEntries, setOutputEntries] = useState<SqlOutputEntry[]>([])
  const [error, setError] = useState<string | null>(null)
  const [isRunning, setIsRunning] = useState(false)
  const [fileSaveMessage, setFileSaveMessage] = useState('')
  const [fileValidationErrors, setFileValidationErrors] = useState<string[]>([])
  const [isSavingFile, setIsSavingFile] = useState(false)

  const [isHydrated, setIsHydrated] = useState(false)

  const resultCounterRef = useRef(1)
  const tabsRef = useRef<SqlEditorTab[]>(tabs)
  const environmentIdRef = useRef<number | ''>(environmentId)

  useEffect(() => {
    tabsRef.current = tabs
  }, [tabs])

  useEffect(() => {
    environmentIdRef.current = environmentId
  }, [environmentId])

  useEffect(() => {
    const persisted = loadSqlWorkspaceState(workspaceId)
    if (persisted) {
      const loadedTabs = persisted.tabs.map(mapPersistedTabToRuntime)
      const firstTab = loadedTabs[0] || createDefaultSqlTab()
      const safeTabs = loadedTabs.length > 0 ? loadedTabs : [firstTab]
      const safeActiveTabId =
        persisted.activeTabId && safeTabs.some((tab) => tab.id === persisted.activeTabId)
          ? persisted.activeTabId
          : safeTabs[0].id
      setTabs(safeTabs)
      setActiveTabId(safeActiveTabId)
      setEditorTheme(persisted.editorTheme)
      setEnvironmentId(typeof persisted.environmentId === 'number' ? persisted.environmentId : '')
      setActiveBottomPanel(persisted.activeBottomPanel)
      setLayoutState({
        leftPaneWidth: clamp(persisted.layout.leftPaneWidth, 220, 520),
        bottomPaneHeight: clamp(persisted.layout.bottomPaneHeight, 180, 520),
        isEditorFocused: persisted.layout.isEditorFocused,
      })
    } else {
      const defaultTab = createDefaultSqlTab()
      setTabs([defaultTab])
      setActiveTabId(defaultTab.id)
      setEditorTheme(getDefaultSqlWorkbenchTheme())
      setEnvironmentId('')
      setActiveBottomPanel(getDefaultSqlWorkbenchPanel())
      setLayoutState(getDefaultSqlWorkbenchLayout())
    }
    setResultTabs([])
    setActiveResultTabId('')
    setResultsPage(1)
    setOutputEntries([])
    setError(null)
    setIsHydrated(true)
  }, [workspaceId])

  const pushOutput = useCallback((level: 'info' | 'error' | 'warning', message: string) => {
    setOutputEntries((prev) => {
      const next = [
        {
          id: makeOutputId(),
          timestamp: new Date().toISOString(),
          level,
          message,
        },
        ...prev,
      ]
      return next.slice(0, 200)
    })
  }, [])

  const activeTab = useMemo(() => tabs.find((tab) => tab.id === activeTabId) || tabs[0] || null, [tabs, activeTabId])

  useEffect(() => {
    if (!activeTab && tabs.length > 0) {
      setActiveTabId(tabs[0].id)
    }
  }, [activeTab, tabs])

  const setActiveTab = useCallback((tabId: string) => {
    setTabs((prev) => prev.map((tab) => (tab.id === tabId ? touchTab(tab) : tab)))
    setActiveTabId(tabId)
  }, [])

  const updateTab = useCallback((tabId: string, updater: (tab: SqlEditorTab) => SqlEditorTab) => {
    setTabs((prev) => prev.map((tab) => (tab.id === tabId ? updater(tab) : tab)))
  }, [])

  const upsertResultTab = useCallback((result: SqlQueryResult, sourceTabId: string) => {
    const tab: SqlResultTab = {
      id: `result-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      title: `Result ${resultCounterRef.current}`,
      queryId: result.query_id,
      createdAt: new Date().toISOString(),
      sourceTabId,
      result,
    }
    resultCounterRef.current += 1

    setResultTabs((prev) => {
      const next = [...prev, tab]
      return next.length > MAX_RESULT_TABS ? next.slice(next.length - MAX_RESULT_TABS) : next
    })
    setActiveResultTabId(tab.id)
    setActiveBottomPanel('results')
    setResultsPage(1)
  }, [])

  const activeResultTab = useMemo(
    () => resultTabs.find((tab) => tab.id === activeResultTabId) || resultTabs[resultTabs.length - 1] || null,
    [resultTabs, activeResultTabId],
  )

  useEffect(() => {
    if (activeResultTab) {
      setActiveResultTabId(activeResultTab.id)
    }
  }, [activeResultTab])

  const activeResult = activeResultTab?.result || null

  const effectiveColumns = useMemo(() => activeResult?.columns || [], [activeResult])
  const effectiveProfiling = useMemo(() => activeResult?.profiling || null, [activeResult])

  const totalResultPages = useMemo(() => {
    if (!activeResult || activeResult.rows.length === 0) return 0
    return Math.ceil(activeResult.rows.length / ROWS_PER_PAGE)
  }, [activeResult])

  const currentRows = useMemo(() => {
    if (!activeResult) return []
    const start = (resultsPage - 1) * ROWS_PER_PAGE
    const end = start + ROWS_PER_PAGE
    return activeResult.rows.slice(start, end)
  }, [activeResult, resultsPage])

  const allRelations = useMemo(() => {
    if (!metadata) return []
    return [...metadata.models, ...metadata.sources]
  }, [metadata])

  const modelPathMap = useMemo(() => {
    if (!metadata) return {} as Record<string, string>
    const map: Record<string, string> = {}
    for (const model of metadata.models) {
      if (model.unique_id && model.original_file_path) {
        map[normalizePath(model.original_file_path)] = model.unique_id
      }
    }
    return map
  }, [metadata])

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
  )

  const aliasMap = useMemo(() => {
    if (!metadata || !activeTab) return {} as Record<string, string>
    const text = activeTab.sqlText
    const map: Record<string, string> = {}

    const addAliasFromMatch = (match: RegExpExecArray) => {
      const relationToken = match[1]
      const alias = match[2]
      const relation =
        allRelations.find(
          (item) =>
            item.relation_name === relationToken || item.name === relationToken || item.unique_id === relationToken,
        ) || null
      if (relation && alias) {
        map[alias] = relation.unique_id || relation.relation_name
      }
    }

    const fromRegex = /\bfrom\s+([a-zA-Z0-9_."]+)(?:\s+as)?\s+([a-zA-Z0-9_]+)/gi
    let match: RegExpExecArray | null
    // eslint-disable-next-line no-cond-assign
    while ((match = fromRegex.exec(text))) {
      addAliasFromMatch(match)
    }

    const joinRegex = /\bjoin\s+([a-zA-Z0-9_."]+)(?:\s+as)?\s+([a-zA-Z0-9_]+)/gi
    // eslint-disable-next-line no-cond-assign
    while ((match = joinRegex.exec(text))) {
      addAliasFromMatch(match)
    }

    return map
  }, [activeTab, allRelations, metadata])

  const completionSource = useCallback(
    (context: CompletionContext): CompletionResult | null => {
      if (!metadata) return null

      const word = context.matchBefore(/[\w$]+/)
      if (!word || (word.from === word.to && !context.explicit)) {
        return null
      }

      const before = context.state.doc.sliceString(0, context.pos)
      const lowerBefore = before.toLowerCase()
      const options: Completion[] = []

      if (/ref\(\s*["']?[\w]*$/i.test(lowerBefore)) {
        for (const model of metadata.models) {
          options.push({
            label: model.name,
            type: 'variable',
            info: model.unique_id || model.relation_name,
            apply: model.name,
          })
        }
        return { from: word.from, options, validFor: /[\w$]*/ }
      }

      const aliasMatch = /([a-zA-Z0-9_]+)\.\s*[\w$]*$/.exec(before)
      if (aliasMatch) {
        const alias = aliasMatch[1]
        const target = aliasMap[alias]
        if (target) {
          const relation = allRelations.find((item) => item.unique_id === target || item.relation_name === target) || null
          if (relation) {
            for (const col of relation.columns) {
              options.push({
                label: col.name,
                type: 'property',
                info: col.data_type || undefined,
              })
            }
            return { from: word.from, options, validFor: /[\w$]*/ }
          }
        }
      }

      for (const relation of allRelations) {
        options.push({
          label: relation.name,
          type: 'variable',
          info: relation.relation_name,
        })
      }

      const seenColumns = new Set<string>()
      for (const relation of allRelations) {
        for (const col of relation.columns) {
          if (!seenColumns.has(col.name)) {
            seenColumns.add(col.name)
            options.push({
              label: col.name,
              type: 'property',
              info: col.data_type || undefined,
            })
          }
        }
      }

      return { from: word.from, options, validFor: /[\w$]*/ }
    },
    [aliasMap, allRelations, metadata],
  )

  const loadEnvironments = useCallback(async () => {
    try {
      const envs = await SchedulerService.listEnvironments()
      setEnvironments(envs)
      const currentEnvId = environmentIdRef.current
      const exists = typeof currentEnvId === 'number' && envs.some((env) => env.id === currentEnvId)
      if (!exists && envs.length > 0) {
        setEnvironmentId(envs[0].id)
      } else if (!exists && envs.length === 0) {
        setEnvironmentId('')
      }
    } catch (err) {
      console.error('Failed to load environments', err)
      const now = new Date().toISOString()
      const fallback: EnvironmentConfig[] = [
        {
          id: 0,
          name: 'default',
          description: 'Auto-created fallback environment',
          variables: {},
          created_at: now,
          updated_at: now,
        },
      ]
      setEnvironments(fallback)
      const currentEnvId = environmentIdRef.current
      const exists = typeof currentEnvId === 'number' && fallback.some((env) => env.id === currentEnvId)
      if (!exists) {
        setEnvironmentId(0)
      }
    }
  }, [])

  const loadMetadata = useCallback(async () => {
    try {
      const data = await SqlWorkspaceService.getMetadata()
      setMetadata(data)
    } catch (err) {
      console.error('Failed to load SQL metadata', err)
      pushOutput('warning', 'Failed to load metadata; SQL editor remains available.')
    }
  }, [pushOutput])

  const loadGitFiles = useCallback(async () => {
    try {
      const status = await GitService.status()
      if (status.configured === false) {
        setGitLoadError('Repository not connected.')
        setGitFiles([])
        return
      }
      const files = await GitService.files()
      setGitFiles(files)
      setGitLoadError(null)
    } catch (err: any) {
      const message =
        err?.response?.data?.detail?.message || err?.response?.data?.detail || err?.message || 'Repository not connected.'
      setGitLoadError(message)
      setGitFiles([])
    }
  }, [])

  const loadHistory = useCallback(async () => {
    try {
      const filters: {
        page: number
        page_size: number
        environment_id?: number
        status?: string
        model_ref?: string
        start_time?: string
        end_time?: string
      } = {
        page: historyPage,
        page_size: HISTORY_PAGE_SIZE,
      }

      if (environmentId && typeof environmentId === 'number') {
        filters.environment_id = environmentId
      }
      if (historyStatusFilter !== 'all') {
        filters.status = historyStatusFilter
      }
      if (historyModelFilter !== 'all') {
        filters.model_ref = historyModelFilter
      }
      if (historyDateFrom) {
        filters.start_time = new Date(historyDateFrom).toISOString()
      }
      if (historyDateTo) {
        const end = new Date(historyDateTo)
        end.setHours(23, 59, 59, 999)
        filters.end_time = end.toISOString()
      }

      const response = await SqlWorkspaceService.getHistory(filters)
      setHistory(response.items)
      setHistoryTotal(response.total_count)
    } catch (err) {
      console.error('Failed to load query history', err)
      pushOutput('warning', 'Failed to load query history.')
    }
  }, [environmentId, historyDateFrom, historyDateTo, historyModelFilter, historyPage, historyStatusFilter, pushOutput])

  useEffect(() => {
    if (!isHydrated) return
    loadEnvironments()
    loadMetadata()
    loadGitFiles()
  }, [isHydrated, loadEnvironments, loadGitFiles, loadMetadata])

  useEffect(() => {
    if (!isHydrated) return
    loadHistory()
  }, [isHydrated, loadHistory])

  const loadCompiledSqlForTab = useCallback(
    async (
      tabId: string,
      options?: { force?: boolean; hydrateSourceSql?: boolean; modelId?: string | null; environmentId?: number | null },
    ): Promise<string> => {
      const currentTab = tabsRef.current.find((tab) => tab.id === tabId)
      const modelId = options?.modelId ?? currentTab?.selectedModelId ?? null
      const env = options?.environmentId
      const currentEnvironmentId = typeof env === 'number' ? env : typeof environmentIdRef.current === 'number' ? environmentIdRef.current : undefined

      if (!currentTab || !modelId) return ''

      const shouldSkip =
        !options?.force &&
        currentTab.compiledSql &&
        currentTab.compiledForEnvironmentId === (typeof currentEnvironmentId === 'number' ? currentEnvironmentId : null)
      if (shouldSkip) {
        return currentTab.compiledSql || ''
      }

      updateTab(tabId, (tab) => ({ ...tab, isLoadingCompiled: true, compileError: null }))
      try {
        const compiled = await SqlWorkspaceService.getCompiledSql(modelId, {
          environment_id: currentEnvironmentId,
        })

        updateTab(tabId, (tab) => {
          const shouldHydrateSource = options?.hydrateSourceSql !== false
          return {
            ...tab,
            mode: 'model',
            selectedModelId: modelId,
            title: tab.title.startsWith('SQL ') ? compiled.model_unique_id.split('.').pop() || tab.title : tab.title,
            sqlText: shouldHydrateSource ? compiled.source_sql || tab.sqlText : tab.sqlText,
            sourceFilePath: compiled.original_file_path || tab.sourceFilePath || null,
            compiledSql: compiled.compiled_sql,
            compiledChecksum: compiled.compiled_sql_checksum,
            compiledTarget: compiled.target_name || '',
            compiledForEnvironmentId: typeof currentEnvironmentId === 'number' ? currentEnvironmentId : null,
            compileError: null,
            isLoadingCompiled: false,
          }
        })

        return compiled.compiled_sql
      } catch (err: any) {
        const message =
          err?.response?.data?.detail?.message || err?.response?.data?.detail || err?.message || 'Failed to load compiled SQL.'
        updateTab(tabId, (tab) => ({
          ...tab,
          compiledSql: '',
          compiledChecksum: '',
          compiledTarget: '',
          compiledForEnvironmentId: null,
          compileError: message,
          isLoadingCompiled: false,
        }))
        return ''
      }
    },
    [updateTab],
  )

  const openTab = useCallback(
    (options: OpenTabOptions = {}) => {
      const mode = options.mode || 'sql'
      const title = options.title || (mode === 'model' ? 'Model SQL' : `SQL ${tabsRef.current.length + 1}`)

      if (!options.forceNew) {
        const existing = tabsRef.current.find((tab) => {
          if (options.sourceFilePath && tab.sourceFilePath === options.sourceFilePath) return true
          if (mode === 'model' && options.selectedModelId && tab.selectedModelId === options.selectedModelId) return true
          return false
        })
        if (existing) {
          setActiveTab(existing.id)
          if (typeof options.sqlText === 'string') {
            const sqlText = options.sqlText
            updateTab(existing.id, (tab) => ({ ...tab, sqlText, isDirty: false }))
          }
          return existing.id
        }
      }

      let nextTabs = [...tabsRef.current]
      if (nextTabs.length >= MAX_TABS) {
        const removable = [...nextTabs]
          .filter((tab) => !tab.isDirty)
          .sort((a, b) => a.lastUsedAt - b.lastUsedAt)

        const removeTarget = removable[0]
        if (!removeTarget) {
          setError('Cannot open more tabs: all open tabs are dirty. Save or close a tab first.')
          pushOutput('warning', 'Tab limit reached. Save or close a dirty tab before opening a new one.')
          return null
        }
        nextTabs = nextTabs.filter((tab) => tab.id !== removeTarget.id)
      }

      const tab: SqlEditorTab = {
        id: makeTabId(),
        title,
        mode,
        sqlText: options.sqlText || '',
        sourceFilePath: options.sourceFilePath || null,
        selectedModelId: options.selectedModelId || null,
        compiledSql: '',
        compiledChecksum: '',
        compiledTarget: '',
        compiledForEnvironmentId: null,
        compileError: null,
        isLoadingCompiled: false,
        isDirty: false,
        isReadonly: Boolean(options.isReadonly),
        lastUsedAt: Date.now(),
      }

      nextTabs.push(tab)
      setTabs(nextTabs)
      setActiveTabId(tab.id)
      return tab.id
    },
    [pushOutput, setActiveTab, updateTab],
  )

  const closeTab = useCallback(
    (tabId: string) => {
      const tab = tabsRef.current.find((item) => item.id === tabId)
      if (!tab) return

      if (tab.isDirty) {
        const shouldClose = window.confirm(`Close tab "${tab.title}" with unsaved changes?`)
        if (!shouldClose) return
      }

      const nextTabs = tabsRef.current.filter((item) => item.id !== tabId)
      if (nextTabs.length === 0) {
        const fresh = createDefaultSqlTab()
        setTabs([fresh])
        setActiveTabId(fresh.id)
        return
      }

      setTabs(nextTabs)
      if (activeTabId === tabId) {
        setActiveTabId(nextTabs[nextTabs.length - 1].id)
      }
    },
    [activeTabId],
  )

  const setActiveTabMode = useCallback(
    (mode: WorkspaceMode) => {
      if (!activeTab) return
      updateTab(activeTab.id, (tab) => ({ ...tab, mode, lastUsedAt: Date.now() }))
    },
    [activeTab, updateTab],
  )

  const setActiveTabSqlText = useCallback(
    (value: string) => {
      if (!activeTab) return
      updateTab(activeTab.id, (tab) => ({ ...tab, sqlText: value, isDirty: true, lastUsedAt: Date.now() }))
    },
    [activeTab, updateTab],
  )

  const loadFileIntoTab = useCallback(
    async (path: string) => {
      try {
        const content = await GitService.readFile(path)
        const normalized = normalizePath(path)
        const modelIdFromPath = modelPathMap[normalized]
        const mode: WorkspaceMode = modelIdFromPath ? 'model' : 'sql'
        const title = path.split('/').pop() || path

        const openedTabId = openTab({
          mode,
          title,
          sqlText: content.content,
          sourceFilePath: path,
          selectedModelId: modelIdFromPath || null,
          isReadonly: Boolean(content.readonly),
          forceNew: false,
        })

        if (!openedTabId) return

        updateTab(openedTabId, (tab) => ({
          ...tab,
          sqlText: content.content,
          mode,
          sourceFilePath: path,
          selectedModelId: modelIdFromPath || null,
          isReadonly: Boolean(content.readonly),
          isDirty: false,
        }))

        if (modelIdFromPath) {
          await loadCompiledSqlForTab(openedTabId, { force: true, hydrateSourceSql: true, modelId: modelIdFromPath })
        }

        setFileValidationErrors([])
        setError(null)
      } catch (err: any) {
        const message =
          err?.response?.data?.detail?.message || err?.response?.data?.detail || err?.message || 'Failed to load file.'
        setGitLoadError(message)
      }
    },
    [loadCompiledSqlForTab, modelPathMap, openTab, updateTab],
  )

  const selectModelFromMetadata = useCallback(
    async (modelUniqueId: string, modelName: string, originalFilePath?: string | null) => {
      const tabId =
        openTab({
          mode: 'model',
          title: modelName || modelUniqueId,
          selectedModelId: modelUniqueId,
          sourceFilePath: originalFilePath || null,
          forceNew: false,
        }) || ''
      if (!tabId) return
      await loadCompiledSqlForTab(tabId, { force: true, hydrateSourceSql: true, modelId: modelUniqueId })
    },
    [loadCompiledSqlForTab, openTab],
  )

  const handleReloadActiveFile = useCallback(async () => {
    if (!activeTab?.sourceFilePath) return
    await loadFileIntoTab(activeTab.sourceFilePath)
  }, [activeTab?.sourceFilePath, loadFileIntoTab])

  const handleSaveActiveFile = useCallback(async () => {
    if (!activeTab || !activeTab.sourceFilePath || activeTab.isReadonly) return
    if (!isDeveloperOrAdmin) return

    setIsSavingFile(true)
    setFileValidationErrors([])
    try {
      const writeResult = await GitService.writeFile({
        path: activeTab.sourceFilePath,
        content: activeTab.sqlText,
        message: fileSaveMessage || undefined,
      })

      if (!writeResult.is_valid) {
        setFileValidationErrors(writeResult.errors || ['Validation failed'])
        return
      }

      const refreshed = await GitService.readFile(activeTab.sourceFilePath)
      updateTab(activeTab.id, (tab) => ({
        ...tab,
        sqlText: refreshed.content,
        isReadonly: Boolean(refreshed.readonly),
        isDirty: false,
      }))
      setFileSaveMessage('')
      pushOutput('info', `Saved ${activeTab.sourceFilePath}`)
      await loadGitFiles()
    } catch (err: any) {
      const message =
        err?.response?.data?.detail?.message || err?.response?.data?.detail || err?.message || 'Failed to save file.'
      setFileValidationErrors([message])
      pushOutput('error', message)
    } finally {
      setIsSavingFile(false)
    }
  }, [activeTab, fileSaveMessage, isDeveloperOrAdmin, loadGitFiles, pushOutput, updateTab])

  const runActiveTab = useCallback(async () => {
    const tabSnapshot = tabsRef.current.find((tab) => tab.id === activeTabId)
    if (!tabSnapshot) return

    if (!isDeveloperOrAdmin) {
      setError('You do not have permission to run SQL queries.')
      return
    }

    if (tabSnapshot.mode === 'sql' && !tabSnapshot.sqlText.trim()) {
      setError('Enter a SQL query to run.')
      return
    }

    if (tabSnapshot.mode === 'model' && !tabSnapshot.selectedModelId) {
      setError('Select a dbt model to run.')
      return
    }

    setIsRunning(true)
    setError(null)

    const queryContext = {
      tabId: tabSnapshot.id,
      mode: tabSnapshot.mode,
      sqlText: tabSnapshot.sqlText,
      selectedModelId: tabSnapshot.selectedModelId,
      environmentId: typeof environmentIdRef.current === 'number' ? environmentIdRef.current : undefined,
      compiledSql: tabSnapshot.compiledSql,
      compileError: tabSnapshot.compileError,
    }

    try {
      let response: SqlQueryResult
      if (queryContext.mode === 'model' && queryContext.selectedModelId) {
        let compiledText = queryContext.compiledSql
        const tabNow = tabsRef.current.find((tab) => tab.id === queryContext.tabId)
        const environmentMatches = tabNow?.compiledForEnvironmentId === (queryContext.environmentId ?? null)

        if (!compiledText || !environmentMatches) {
          compiledText = await loadCompiledSqlForTab(queryContext.tabId, {
            force: true,
            hydrateSourceSql: false,
            modelId: queryContext.selectedModelId,
            environmentId: queryContext.environmentId ?? null,
          })
        }

        if (!compiledText) {
          const currentTab = tabsRef.current.find((tab) => tab.id === queryContext.tabId)
          setError(
            currentTab?.compileError ||
              'Compiled SQL is not available for the selected model. Run "dbt compile" to generate artifacts, then try again.',
          )
          pushOutput('error', 'Compiled SQL unavailable for selected model.')
          setIsRunning(false)
          return
        }

        response = await SqlWorkspaceService.executeModel({
          model_unique_id: queryContext.selectedModelId,
          environment_id: queryContext.environmentId,
          include_profiling: true,
        })
      } else {
        const request: SqlQueryRequest = {
          sql: queryContext.sqlText,
          environment_id: queryContext.environmentId,
          include_profiling: true,
          mode: 'sql',
        }
        response = await SqlWorkspaceService.executeQuery(request)
      }

      upsertResultTab(response, queryContext.tabId)
      setHistoryPage(1)
      await loadHistory()
      pushOutput('info', `Executed ${queryContext.mode === 'model' ? 'model' : 'SQL'} query ${response.query_id}`)
    } catch (err: any) {
      const message =
        err?.response?.data?.detail?.message || err?.response?.data?.detail || err?.message || 'Failed to execute query.'
      setError(message)
      pushOutput('error', message)
    } finally {
      setIsRunning(false)
    }
  }, [activeTabId, isDeveloperOrAdmin, loadCompiledSqlForTab, loadHistory, pushOutput, upsertResultTab])

  const handleCancelRun = useCallback(() => {
    if (!isRunning) return
    pushOutput('warning', 'Cancel requested. This backend executes synchronously; cancellation may not interrupt the current request.')
  }, [isRunning, pushOutput])

  const handleDeleteHistoryEntry = useCallback(
    async (entryId: number) => {
      try {
        await SqlWorkspaceService.deleteHistoryEntry(entryId)
        pushOutput('info', `Deleted history entry ${entryId}`)
        await loadHistory()
      } catch (err) {
        console.error('Failed to delete history entry', err)
        pushOutput('error', 'Failed to delete history entry.')
      }
    },
    [loadHistory, pushOutput],
  )

  const handleRerunHistoryEntry = useCallback(
    (entry: SqlQueryHistoryEntry) => {
      if (entry.model_ref) {
        const tabId =
          openTab({
            mode: 'model',
            title: entry.model_ref.split('.').pop() || 'Model SQL',
            selectedModelId: entry.model_ref,
            sqlText: entry.query_text,
            forceNew: true,
          }) || ''
        if (!tabId) return
        updateTab(tabId, (tab) => ({ ...tab, mode: 'model', selectedModelId: entry.model_ref, sqlText: entry.query_text }))
      } else {
        openTab({
          mode: 'sql',
          title: 'History SQL',
          sqlText: entry.query_text,
          forceNew: true,
        })
      }
      setActiveBottomPanel('history')
      setError(null)
      pushOutput('info', `Loaded history query into editor: ${truncate(entry.query_text, 64)}`)
    },
    [openTab, pushOutput, updateTab],
  )

  useEffect(() => {
    if (!isHydrated) return
    const currentEnvironmentId = typeof environmentId === 'number' ? environmentId : null
    const alreadyLoadedForEnvironment = activeTab?.compiledForEnvironmentId === currentEnvironmentId
    if (
      !isRunning &&
      activeTab?.mode === 'model' &&
      activeTab.selectedModelId &&
      !activeTab.isLoadingCompiled &&
      !alreadyLoadedForEnvironment
    ) {
      loadCompiledSqlForTab(activeTab.id, {
        force: true,
        hydrateSourceSql: true,
        modelId: activeTab.selectedModelId,
        environmentId: currentEnvironmentId,
      })
    }
  }, [activeTab, environmentId, isHydrated, isRunning, loadCompiledSqlForTab])

  useEffect(() => {
    if (!isHydrated) return
    if (typeof environmentId !== 'number') return

    setTabs((prev) =>
      prev.map((tab) => {
        if (tab.mode !== 'model') return tab
        if (!tab.compiledSql && !tab.compiledChecksum && !tab.compiledTarget && !tab.compileError) return tab
        return {
          ...tab,
          compiledSql: '',
          compiledChecksum: '',
          compiledTarget: '',
          compiledForEnvironmentId: null,
          compileError: null,
          isLoadingCompiled: false,
        }
      }),
    )
  }, [environmentId, isHydrated])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const isMod = event.metaKey || event.ctrlKey
      if (!isMod) return

      if (event.key === 'Enter') {
        event.preventDefault()
        runActiveTab()
        return
      }

      if (event.key.toLowerCase() === 's') {
        event.preventDefault()
        handleSaveActiveFile()
        return
      }

      if (event.shiftKey && event.key.toLowerCase() === 't') {
        event.preventDefault()
        openTab({ mode: 'sql', forceNew: true })
        return
      }

      if (event.key.toLowerCase() === 'w') {
        event.preventDefault()
        if (activeTabId) closeTab(activeTabId)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [activeTabId, closeTab, handleSaveActiveFile, openTab, runActiveTab])

  useAutoRefresh({
    onManifestUpdate: () => {
      loadMetadata()
      loadGitFiles()
      const current = tabsRef.current.find((tab) => tab.id === activeTabId)
      if (current?.mode === 'model' && current.selectedModelId) {
        loadCompiledSqlForTab(current.id, { force: true, hydrateSourceSql: true, modelId: current.selectedModelId })
      }
    },
    onCatalogUpdate: () => {
      loadMetadata()
      loadGitFiles()
    },
  })

  useEffect(() => {
    if (!isHydrated) return

    const persisted = {
      version: 2 as const,
      tabs: tabs.map((tab) => ({
        id: tab.id,
        title: tab.title,
        mode: tab.mode,
        sqlText: tab.sqlText,
        sourceFilePath: tab.sourceFilePath || null,
        selectedModelId: tab.selectedModelId || null,
        isDirty: tab.isDirty,
        isReadonly: tab.isReadonly,
        lastUsedAt: tab.lastUsedAt,
      })),
      activeTabId: activeTabId || tabs[0]?.id || null,
      environmentId: typeof environmentId === 'number' ? environmentId : null,
      editorTheme,
      activeBottomPanel,
      layout: layoutState,
    }

    saveSqlWorkspaceState(workspaceId, persisted)
  }, [activeBottomPanel, activeTabId, editorTheme, environmentId, isHydrated, layoutState, tabs, workspaceId])

  const selectedEnvironmentName = useMemo(() => {
    if (typeof environmentId !== 'number') return 'default'
    return environments.find((env) => env.id === environmentId)?.name || 'default'
  }, [environmentId, environments])

  const selectedModelOptions = useMemo(() => {
    if (!metadata) return []
    return metadata.models.map((model) => ({
      id: model.unique_id || '',
      name: model.name,
      schema: model.schema,
      originalFilePath: model.original_file_path,
    }))
  }, [metadata])

  const openAiCopilot = useCallback(
    (intent: 'explain' | 'generate' | 'optimize' | 'fix') => {
      const sql = activeTab?.sqlText?.trim() || ''
      const modelId = activeTab?.selectedModelId || undefined
      const envId = typeof environmentId === 'number' ? environmentId : undefined
      const fencedSql = sql ? `\`\`\`sql\n${sql}\n\`\`\`` : ''

      let prompt = 'Help me with SQL in dbt-Workbench.'
      if (intent === 'explain') {
        prompt = sql
          ? `Explain this SQL and highlight correctness/performance concerns.\n\n${fencedSql}`
          : 'Explain how to approach writing SQL for this dbt model.'
      } else if (intent === 'generate') {
        prompt = sql
          ? `Generate an improved SQL variant based on this draft and explain key changes.\n\n${fencedSql}`
          : 'Generate SQL for the active dbt model based on available metadata.'
      } else if (intent === 'optimize') {
        prompt = sql
          ? `Optimize this SQL for readability and performance.\n\n${fencedSql}`
          : 'Suggest SQL optimization strategies for the active model.'
      } else if (intent === 'fix') {
        prompt = sql
          ? `Fix likely syntax/logic issues in this SQL and return a corrected query.\n\n${fencedSql}`
          : 'Help me debug SQL issues in the active model.'
      }

      openPanel({
        prompt,
        context: {
          sql_metadata: true,
          sql_history: true,
          compiled_model_id: modelId,
          environment_id: envId,
        },
      })
    },
    [activeTab?.selectedModelId, activeTab?.sqlText, environmentId, openPanel],
  )

  return {
    isDeveloperOrAdmin,
    workspaceId,

    tabs,
    activeTab,
    activeTabId,
    setActiveTab,
    setTabs,
    openTab,
    closeTab,
    setActiveTabMode,
    setActiveTabSqlText,
    updateTab,

    editorTheme,
    setEditorTheme,

    environmentId,
    setEnvironmentId,
    environments,
    selectedEnvironmentName,

    metadata,
    modelFiles,
    selectedModelOptions,
    modelPathMap,
    gitLoadError,
    fileSaveMessage,
    setFileSaveMessage,
    fileValidationErrors,
    isSavingFile,

    history,
    historyPage,
    setHistoryPage,
    historyTotal,
    historyStatusFilter,
    setHistoryStatusFilter,
    historyModelFilter,
    setHistoryModelFilter,
    historyDateFrom,
    setHistoryDateFrom,
    historyDateTo,
    setHistoryDateTo,

    resultTabs,
    activeResultTab,
    activeResultTabId,
    setActiveResultTabId,
    activeResult,
    effectiveColumns,
    effectiveProfiling,
    totalResultPages,
    currentRows,
    resultsPage,
    setResultsPage,

    outputEntries,
    pushOutput,
    clearOutput: () => setOutputEntries([]),

    activeBottomPanel,
    setActiveBottomPanel,

    layoutState,
    setLayoutState,

    isRunning,
    error,
    setError,

    completionSource,

    loadMetadata,
    loadGitFiles,
    loadHistory,
    loadCompiledSqlForTab,
    loadFileIntoTab,
    selectModelFromMetadata,
    handleReloadActiveFile,
    handleSaveActiveFile,
    runActiveTab,
    handleCancelRun,
    handleDeleteHistoryEntry,
    handleRerunHistoryEntry,
    openAiCopilot,
  }
}
