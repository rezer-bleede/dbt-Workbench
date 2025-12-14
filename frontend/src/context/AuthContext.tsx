import React, { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { api } from '../api/client'
import {
  LoginResponse,
  UserSummary,
  WorkspaceSummary,
} from '../types'
import { WorkspaceService } from '../services/workspaceService'
import { loadWorkspaceId, storeWorkspaceId } from '../storage/workspaceStorage'

interface AuthState {
  isLoading: boolean
  isAuthEnabled: boolean
  user: UserSummary | null
  accessToken: string | null
  refreshToken: string | null
  activeWorkspace: WorkspaceSummary | null
  workspaces: WorkspaceSummary[]
}

interface AuthContextValue extends AuthState {
  login: (username: string, password: string) => Promise<void>
  logout: () => void
  switchWorkspace: (workspaceId: number) => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

const STORAGE_KEY = 'dbt_workbench_auth'

interface StoredAuth {
  accessToken: string
  refreshToken: string
  user: UserSummary
  activeWorkspace: WorkspaceSummary | null
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<AuthState>({
    isLoading: true,
    isAuthEnabled: false,
    user: null,
    accessToken: null,
    refreshToken: null,
    activeWorkspace: null,
    workspaces: [],
  })

  useEffect(() => {
    const initialize = async () => {
      try {
        const configRes = await api.get('/config')
        const authConfig = configRes.data?.auth || {}
        const isAuthEnabled = !!authConfig.enabled

        if (!isAuthEnabled) {
          // No auth; still try to get active workspace for display
          try {
            const available = await WorkspaceService.listWorkspaces()
            const requestedId = loadWorkspaceId()
            const selected = available.find(w => w.id === requestedId) || available[0] || null
            if (selected) {
              storeWorkspaceId(selected.id)
            }
            setState({
              isLoading: false,
              isAuthEnabled: false,
              user: null,
              accessToken: null,
              refreshToken: null,
              activeWorkspace: selected,
              workspaces: available,
            })
          } catch {
            setState({
              isLoading: false,
              isAuthEnabled: false,
              user: null,
              accessToken: null,
              refreshToken: null,
              activeWorkspace: null,
              workspaces: [],
            })
          }
          return
        }

        const storedRaw = window.localStorage.getItem(STORAGE_KEY)
        if (!storedRaw) {
          setState(prev => ({ ...prev, isLoading: false, isAuthEnabled: true }))
          return
        }

        let stored: StoredAuth | null = null
        try {
          stored = JSON.parse(storedRaw) as StoredAuth
        } catch {
          stored = null
        }

        if (!stored?.accessToken || !stored?.refreshToken) {
          setState(prev => ({ ...prev, isLoading: false, isAuthEnabled: true }))
          return
        }

        try {
          const refreshRes = await api.post<LoginResponse>('/auth/refresh', {
            refresh_token: stored.refreshToken,
          })
          const login = refreshRes.data
          applyLogin(login)
        } catch {
          window.localStorage.removeItem(STORAGE_KEY)
          setState(prev => ({ ...prev, isLoading: false, isAuthEnabled: true }))
        }
      } catch {
        setState(prev => ({ ...prev, isLoading: false }))
      }
    }

    initialize()
  }, [])

  const applyLogin = (login: LoginResponse) => {
    const { tokens, user, active_workspace } = login
    const stored: StoredAuth = {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      user,
      activeWorkspace: active_workspace || null,
    }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(stored))
    setState({
      isLoading: false,
      isAuthEnabled: true,
      user,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      activeWorkspace: active_workspace || null,
      workspaces: user?.workspaces || [],
    })
  }

  const login = async (username: string, password: string) => {
    const res = await api.post<LoginResponse>('/auth/login', { username, password })
    applyLogin(res.data)
  }

  const logout = () => {
    window.localStorage.removeItem(STORAGE_KEY)
    setState(prev => ({
      ...prev,
      user: null,
      accessToken: null,
      refreshToken: null,
      activeWorkspace: null,
      workspaces: [],
    }))
  }

  const switchWorkspace = async (workspaceId: number) => {
    if (!state.isAuthEnabled) {
      const available = await WorkspaceService.listWorkspaces()
      const selected = available.find(w => w.id === workspaceId)
      if (!selected) {
        throw new Error('Workspace not found')
      }
      storeWorkspaceId(selected.id)
      setState(prev => ({
        ...prev,
        activeWorkspace: selected,
        workspaces: available,
      }))
      return
    }
    const res = await api.post<LoginResponse>('/auth/switch-workspace', null, {
      params: { workspace_id: workspaceId },
    })
    storeWorkspaceId(workspaceId)
    applyLogin(res.data)
  }

  const value = useMemo<AuthContextValue>(
    () => ({
      ...state,
      login,
      logout,
      switchWorkspace,
    }),
    [state],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export const useAuth = (): AuthContextValue => {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return ctx
}