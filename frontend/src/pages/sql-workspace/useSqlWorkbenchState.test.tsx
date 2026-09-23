import React, { useEffect } from 'react'
import { render, waitFor, act } from '@testing-library/react'
import { describe, it, beforeEach, expect, vi } from 'vitest'

import { useSqlWorkbenchState } from './useSqlWorkbenchState'
import { SqlWorkspaceService } from '@/services/sqlWorkspaceService'
import { SchedulerService } from '@/services/schedulerService'
import { GitService } from '@/services/gitService'

vi.mock('@/hooks/useAutoRefresh', () => ({
  useAutoRefresh: () => ({
    checkNow: vi.fn(),
    getCurrentVersions: vi.fn(),
    getVersionInfo: vi.fn(),
  }),
}))

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({
    isLoading: false,
    isAuthEnabled: false,
    user: { id: 1, username: 'dev', role: 'developer' },
    activeWorkspace: { id: 1, key: 'demo', name: 'Demo', artifacts_path: '/tmp/artifacts' },
    workspaces: [{ id: 1, key: 'demo', name: 'Demo', artifacts_path: '/tmp/artifacts' }],
    switchWorkspace: vi.fn(),
    logout: vi.fn(),
  }),
}))

vi.mock('@/context/AiContext', () => ({
  useAi: () => ({
    openPanel: vi.fn(),
    settings: {
      enabled: true,
      ai_system_enabled: true,
    },
  }),
  AiProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

vi.mock('@/services/sqlWorkspaceService', () => ({
  SqlWorkspaceService: {
    executeQuery: vi.fn(),
    executeModel: vi.fn(),
    getMetadata: vi.fn(),
    getHistory: vi.fn(),
    getCompiledSql: vi.fn(),
    deleteHistoryEntry: vi.fn(),
  },
}))

vi.mock('@/services/schedulerService', () => ({
  SchedulerService: {
    listEnvironments: vi.fn(),
  },
}))

vi.mock('@/services/gitService', () => ({
  GitService: {
    status: vi.fn(),
    files: vi.fn(),
    readFile: vi.fn(),
    writeFile: vi.fn(),
  },
}))

const mockedSqlService = vi.mocked(SqlWorkspaceService)
const mockedScheduler = vi.mocked(SchedulerService)
const mockedGit = vi.mocked(GitService)

function HookHarness({ onState }: { onState: (state: any) => void }) {
  const state = useSqlWorkbenchState()

  useEffect(() => {
    onState(state)
  }, [onState, state])

  return null
}

describe('useSqlWorkbenchState', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.localStorage.clear()

    const now = new Date().toISOString()

    mockedScheduler.listEnvironments.mockResolvedValue([
      { id: 1, name: 'Dev', description: 'dev env', variables: {}, created_at: now, updated_at: now },
    ])

    mockedSqlService.getMetadata.mockResolvedValue({
      models: [
        {
          unique_id: 'model.project.example',
          name: 'example',
          relation_name: 'analytics.example',
          resource_type: 'model',
          columns: [],
          tags: [],
          meta: {},
          original_file_path: 'models/example.sql',
        },
      ],
      sources: [],
      schemas: {},
    })

    mockedSqlService.getHistory.mockResolvedValue({ items: [], total_count: 0, page: 1, page_size: 20 })
    mockedSqlService.getCompiledSql.mockResolvedValue({
      model_unique_id: 'model.project.example',
      compiled_sql: 'select 1 as value',
      source_sql: 'select {{ 1 }} as value',
      compiled_sql_checksum: 'checksum',
      environment_id: 1,
      target_name: 'dev',
      original_file_path: 'models/example.sql',
    })

    mockedSqlService.executeQuery.mockResolvedValue({
      query_id: 'run-1',
      rows: [],
      columns: [],
      execution_time_ms: 8,
      row_count: 0,
      truncated: false,
      profiling: { row_count: 0, columns: [] },
    })

    mockedSqlService.executeModel.mockResolvedValue({
      query_id: 'model-run-1',
      rows: [],
      columns: [],
      execution_time_ms: 10,
      row_count: 0,
      truncated: false,
      profiling: { row_count: 0, columns: [] },
    })

    mockedGit.status.mockResolvedValue({
      branch: 'main',
      is_clean: true,
      ahead: 0,
      behind: 0,
      changes: [],
      has_conflicts: false,
      configured: true,
    })
    mockedGit.files.mockResolvedValue([])
  })

  it('executes SQL with profiling enabled and no row_limit override', async () => {
    let latestState: any = null
    render(<HookHarness onState={(state) => (latestState = state)} />)

    await waitFor(() => expect(mockedSqlService.getMetadata).toHaveBeenCalled())

    act(() => {
      latestState.setActiveTabSqlText('select 1')
    })

    await act(async () => {
      await latestState.runActiveTab()
    })

    expect(mockedSqlService.executeQuery).toHaveBeenCalled()
    const payload = mockedSqlService.executeQuery.mock.calls[0][0]
    expect(payload.include_profiling).toBe(true)
    expect('row_limit' in payload).toBe(false)
  })

  it('loads history rerun into a tab without auto-executing', async () => {
    let latestState: any = null
    render(<HookHarness onState={(state) => (latestState = state)} />)

    await waitFor(() => expect(latestState).toBeTruthy())

    act(() => {
      latestState.handleRerunHistoryEntry({
        id: 10,
        created_at: new Date().toISOString(),
        query_text: 'select * from foo',
        status: 'success',
        environment_id: 1,
        environment_name: 'Dev',
      })
    })

    await waitFor(() => {
      expect(latestState.tabs.some((tab: any) => tab.sqlText.includes('select * from foo'))).toBe(true)
    })

    expect(mockedSqlService.executeQuery).not.toHaveBeenCalled()
  })

  it('resets stale environmentId to available environment fallback', async () => {
    // Persist a stale environment ID (99)
    window.localStorage.setItem(
      'dbt_sql_workbench_state_demo',
      JSON.stringify({
        version: 2,
        tabs: [],
        activeTabId: 'tab-1',
        environmentId: 99,
        editorTheme: 'dark',
        activeBottomPanel: 'results',
        layout: { leftPaneWidth: 280, bottomPaneHeight: 280, isEditorFocused: false },
      })
    )

    let latestState: any = null
    render(<HookHarness onState={(state) => (latestState = state)} />)

    await waitFor(() => {
      expect(latestState.environmentId).toBe(1)
    })
  })
})
