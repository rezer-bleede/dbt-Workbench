import {
  LegacySqlWorkspaceState,
  SqlBottomPanelTab,
  SqlEditorTheme,
  SqlWorkbenchLayoutState,
  SqlWorkbenchPersistedStateV2,
} from './types'

const LEGACY_KEY = 'dbt-workbench-sql-workspace'
const STORAGE_KEY_PREFIX = 'dbt_workbench_sql_workspace_v2_'

const DEFAULT_LAYOUT: SqlWorkbenchLayoutState = {
  leftPaneWidth: 320,
  bottomPaneHeight: 280,
  isEditorFocused: false,
}

const DEFAULT_PANEL: SqlBottomPanelTab = 'results'

/** Follows the active app theme (set on <html> by the anti-flash script / theme store). */
const themeFromDom = (): SqlEditorTheme =>
  typeof document !== 'undefined' && document.documentElement.classList.contains('dark') ? 'dark' : 'light'

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

const ensureLayout = (layout: Partial<SqlWorkbenchLayoutState> | null | undefined): SqlWorkbenchLayoutState => ({
  leftPaneWidth: clamp(Number(layout?.leftPaneWidth ?? DEFAULT_LAYOUT.leftPaneWidth), 220, 520),
  bottomPaneHeight: clamp(Number(layout?.bottomPaneHeight ?? DEFAULT_LAYOUT.bottomPaneHeight), 180, 520),
  isEditorFocused: Boolean(layout?.isEditorFocused),
})

const ensureBottomPanel = (value: unknown): SqlBottomPanelTab => {
  if (value === 'results' || value === 'profiling' || value === 'history' || value === 'output') {
    return value
  }
  return DEFAULT_PANEL
}

const ensureEditorTheme = (value: unknown): SqlEditorTheme =>
  value === 'light' ? 'light' : value === 'dark' ? 'dark' : themeFromDom()

const sanitizeV2 = (raw: Partial<SqlWorkbenchPersistedStateV2>): SqlWorkbenchPersistedStateV2 | null => {
  if (!Array.isArray(raw.tabs) || raw.tabs.length === 0) return null

  const tabs = raw.tabs
    .map((tab, index) => {
      if (!tab?.id) return null
      const mode: 'sql' | 'model' = tab.mode === 'model' ? 'model' : 'sql'
      return {
        id: String(tab.id),
        title: String(tab.title || `SQL ${index + 1}`),
        mode,
        sqlText: String(tab.sqlText || ''),
        sourceFilePath: tab.sourceFilePath || null,
        selectedModelId: tab.selectedModelId || null,
        isDirty: Boolean(tab.isDirty),
        isReadonly: Boolean(tab.isReadonly),
        lastUsedAt: Number(tab.lastUsedAt || Date.now()),
      }
    })
    .filter((tab): tab is NonNullable<typeof tab> => Boolean(tab))

  if (tabs.length === 0) return null

  const activeTabId = tabs.some((tab) => tab.id === raw.activeTabId) ? String(raw.activeTabId) : tabs[0].id
  const environmentId = typeof raw.environmentId === 'number' ? raw.environmentId : null

  return {
    version: 2,
    tabs,
    activeTabId,
    environmentId,
    editorTheme: ensureEditorTheme(raw.editorTheme),
    activeBottomPanel: ensureBottomPanel(raw.activeBottomPanel),
    layout: ensureLayout(raw.layout),
  }
}

const migrateLegacyState = (raw: LegacySqlWorkspaceState): SqlWorkbenchPersistedStateV2 => {
  const mode = raw.mode === 'model' || raw.mode === 'preview' ? 'model' : 'sql'
  const now = Date.now()
  const id = `sql-tab-${now}`

  return {
    version: 2,
    tabs: [
      {
        id,
        title: mode === 'model' ? 'Model SQL' : 'SQL 1',
        mode,
        sqlText: String(raw.sqlText || ''),
        sourceFilePath: null,
        selectedModelId: raw.selectedModelId || null,
        isDirty: false,
        isReadonly: false,
        lastUsedAt: now,
      },
    ],
    activeTabId: id,
    environmentId: typeof raw.environmentId === 'number' ? raw.environmentId : null,
    editorTheme: ensureEditorTheme(raw.editorTheme),
    activeBottomPanel: DEFAULT_PANEL,
    layout: DEFAULT_LAYOUT,
  }
}

export const getSqlWorkspaceStorageKey = (workspaceId?: number | null) =>
  `${STORAGE_KEY_PREFIX}${workspaceId == null ? 'global' : workspaceId}`

export const loadSqlWorkspaceState = (workspaceId?: number | null): SqlWorkbenchPersistedStateV2 | null => {
  if (typeof window === 'undefined') return null
  const key = getSqlWorkspaceStorageKey(workspaceId)

  try {
    const v2Raw = window.localStorage.getItem(key)
    if (v2Raw) {
      const parsed = JSON.parse(v2Raw) as Partial<SqlWorkbenchPersistedStateV2>
      if (parsed?.version === 2) {
        return sanitizeV2(parsed)
      }
      return null
    }

    const legacyRaw = window.localStorage.getItem(LEGACY_KEY)
    if (!legacyRaw) return null

    const legacyParsed = JSON.parse(legacyRaw) as LegacySqlWorkspaceState
    const migrated = migrateLegacyState(legacyParsed)
    window.localStorage.setItem(key, JSON.stringify(migrated))
    return migrated
  } catch {
    return null
  }
}

export const saveSqlWorkspaceState = (workspaceId: number | null | undefined, state: SqlWorkbenchPersistedStateV2) => {
  if (typeof window === 'undefined') return

  try {
    const key = getSqlWorkspaceStorageKey(workspaceId)
    window.localStorage.setItem(key, JSON.stringify(state))
  } catch {
    // ignore storage failures
  }
}

export const getDefaultSqlWorkbenchLayout = (): SqlWorkbenchLayoutState => ({ ...DEFAULT_LAYOUT })

export const getDefaultSqlWorkbenchPanel = (): SqlBottomPanelTab => DEFAULT_PANEL

export const getDefaultSqlWorkbenchTheme = (): SqlEditorTheme => themeFromDom()
