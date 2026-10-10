import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowRight,
  Bell,
  Boxes,
  ChevronDown,
  Command,
  LayoutDashboard,
  type LucideIcon,
  LogOut,
  Menu,
  RefreshCw,
  Search,
  Settings as SettingsIcon,
  Sparkles,
  User,
  X,
} from 'lucide-react'
import { cn } from '../../utils/cn'
import { api } from '../../api/client'
import { useAuth } from '../../context/AuthContext'
import { useAi } from '../../context/AiContext'
import { useSidebarStore } from '../../stores/sidebarStore'
import { filterNavByRole, Role } from '../../config/navigation'
import ThemePicker from './ThemePicker'
import type { ModelSummary, RunSummary } from '../../types'
import { ExecutionService } from '../../services/executionService'

interface SearchResultItem {
  id: string
  title: string
  subtitle: string
  type: 'navigation' | 'model'
  path: string
  icon: LucideIcon
}

const statusTone = (status: string) => {
  const s = status.toLowerCase()
  if (s === 'success' || s === 'pass' || s === 'skipped_xpass') return 'text-brand-success'
  if (s === 'error' || s === 'fail') return 'text-brand-danger'
  if (s === 'warn') return 'text-brand-warning'
  return 'text-text-tertiary'
}

export function TopBar() {
  const navigate = useNavigate()
  const { activeWorkspace, user, logout, isAuthEnabled, switchWorkspace, workspaces } = useAuth()
  const { openPanel, settings } = useAi()
  const { collapsed, toggle, openMobile } = useSidebarStore()

  const [searchQuery, setSearchQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [models, setModels] = useState<ModelSummary[]>([])
  const [runs, setRuns] = useState<RunSummary[]>([])

  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [refreshMenuOpen, setRefreshMenuOpen] = useState(false)

  const searchRef = useRef<HTMLInputElement>(null)
  const searchBoxRef = useRef<HTMLDivElement>(null)
  const notificationsRef = useRef<HTMLDivElement>(null)
  const userMenuRef = useRef<HTMLDivElement>(null)
  const refreshMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    api.get<ModelSummary[]>('/models').then((res) => setModels(res.data)).catch(() => setModels([]))
  }, [activeWorkspace?.id])

  useEffect(() => {
    ExecutionService.getRunHistory(1, 5)
      .then((res) => setRuns(res.runs ?? []))
      .catch(() => setRuns([]))
  }, [activeWorkspace?.id])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setSearchOpen((prev) => !prev)
        searchRef.current?.focus()
      }
      if (e.key === 'Escape') {
        setSearchOpen(false)
        setNotificationsOpen(false)
        setUserMenuOpen(false)
        setRefreshMenuOpen(false)
      }
      if (e.key === 'b' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        toggle()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [toggle])

  useEffect(() => {
    if (searchOpen) {
      searchRef.current?.focus()
    } else {
      setSearchQuery('')
      setSelectedIndex(0)
    }
  }, [searchOpen])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchBoxRef.current && !searchBoxRef.current.contains(e.target as Node)) {
        setSearchOpen(false)
      }
      if (notificationsRef.current && !notificationsRef.current.contains(e.target as Node)) {
        setNotificationsOpen(false)
      }
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false)
      }
      if (refreshMenuRef.current && !refreshMenuRef.current.contains(e.target as Node)) {
        setRefreshMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const role: Role | null = (user?.role as Role) || null

  const searchResults = useMemo<SearchResultItem[]>(() => {
    const items: SearchResultItem[] = []

    const navItems = filterNavByRole(role, isAuthEnabled).flatMap((g) => g.items)
    for (const nav of navItems) {
      items.push({
        id: `nav-${nav.id}`,
        title: nav.label,
        subtitle: `Page (${nav.path})`,
        type: 'navigation',
        path: nav.path,
        icon: LayoutDashboard,
      })
    }

    for (const model of models.slice(0, 80)) {
      items.push({
        id: `model-${model.unique_id}`,
        title: model.name,
        subtitle: `${model.resource_type} · ${model.schema ?? ''}`,
        type: 'model',
        path: `/models/${model.unique_id}`,
        icon: Boxes,
      })
    }

    if (!searchQuery.trim()) {
      return items.filter((i) => i.type === 'navigation').slice(0, 6)
    }

    const q = searchQuery.toLowerCase().trim()
    return items.filter(
      (item) => item.title.toLowerCase().includes(q) || item.subtitle.toLowerCase().includes(q)
    )
  }, [searchQuery, models, role, isAuthEnabled])

  useEffect(() => {
    setSelectedIndex(0)
  }, [searchResults])

  const handleSelectResult = (result: SearchResultItem) => {
    navigate(result.path)
    setSearchOpen(false)
  }

  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (searchResults.length === 0) return

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex((prev) => (prev + 1) % searchResults.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex((prev) => (prev - 1 + searchResults.length) % searchResults.length)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const selected = searchResults[selectedIndex]
      if (selected) handleSelectResult(selected)
    }
  }

  const displayProject = activeWorkspace?.name || 'Default dbt Project'
  const initials = (user?.username || 'DW')
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'DW'
  return (
    <header
      className={cn(
        'flex items-center gap-4 h-14 shrink-0 sticky top-0 z-30 glass-panel px-4 sm:px-5',
        'bg-topbar-bg border-b border-topbar-border shadow-xs'
      )}
      role="banner"
      data-testid="topbar"
    >
      <button
        onClick={openMobile}
        className="lg:hidden p-2 rounded-xl hover:bg-bg-hover text-text-secondary transition-colors cursor-pointer"
        aria-label="Toggle sidebar"
        aria-expanded={!collapsed}
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Workspace selector */}
      <div className="hidden md:flex items-center gap-2 min-w-0">
        <span className="text-[11px] font-bold uppercase tracking-wider text-text-tertiary shrink-0">
          Workspace
        </span>
        {workspaces.length > 1 ? (
          <select
            className="bg-bg-tertiary/80 border border-border-primary/60 rounded-lg px-2 py-1 text-xs font-semibold text-text-primary focus:outline-none focus:border-brand-primary cursor-pointer max-w-[180px]"
            value={activeWorkspace?.id ?? ''}
            onChange={async (e) => {
              const id = Number(e.target.value)
              if (!Number.isNaN(id)) {
                try {
                  await switchWorkspace(id)
                } catch (err) {
                  console.error('Failed to switch workspace', err)
                }
              }
            }}
            aria-label="Switch workspace"
          >
            {workspaces.map((ws) => (
              <option key={ws.id} value={ws.id}>
                {ws.name}
              </option>
            ))}
          </select>
        ) : (
          <span className="text-xs font-bold text-text-primary truncate max-w-[180px]">{displayProject}</span>
        )}
      </div>

      {/* Command palette search */}
      <div className="flex-1 flex items-center gap-4 min-w-0">
        <div className="relative flex-1 max-w-md" ref={searchBoxRef}>
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-text-tertiary z-10" />
          <input
            ref={searchRef}
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onFocus={() => setSearchOpen(true)}
            onKeyDown={handleSearchKeyDown}
            placeholder="Search pages, models, commands..."
            className="w-full pl-10 pr-12 py-2 bg-bg-tertiary/80 border border-border-primary/60 rounded-xl text-sm text-text-primary placeholder-text-tertiary focus:bg-bg-secondary focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20 focus:outline-none transition-all"
            aria-label="Global search"
          />
          <kbd className="absolute right-3 top-1/2 -translate-y-1/2 hidden md:inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-mono font-medium text-text-tertiary bg-bg-secondary rounded border border-border-secondary">
            <Command className="h-3 w-3" />K
          </kbd>

          {searchOpen && (
            <div className="absolute top-full left-0 right-0 mt-2 bg-widget-bg border border-widget-border rounded-2xl shadow-lg p-3 z-[1000] max-h-[380px] overflow-y-auto scrollbar-thin">
              <div className="flex items-center justify-between pb-2 border-b border-border-primary mb-2 px-1">
                <span className="text-[11px] font-bold text-text-tertiary uppercase tracking-wider">
                  {searchQuery ? 'Search Results' : 'Quick Navigation'}
                </span>
                <button
                  onClick={() => setSearchOpen(false)}
                  className="p-1 text-text-tertiary hover:text-text-primary rounded-lg hover:bg-bg-hover cursor-pointer"
                  aria-label="Close search"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {searchResults.length > 0 ? (
                <div className="space-y-1">
                  {searchResults.map((result, idx) => {
                    const IconComponent = result.icon
                    const isSelected = idx === selectedIndex
                    return (
                      <button
                        key={result.id}
                        onClick={() => handleSelectResult(result)}
                        onMouseEnter={() => setSelectedIndex(idx)}
                        className={cn(
                          'w-full text-left px-3 py-2.5 rounded-xl flex items-center justify-between transition-all cursor-pointer',
                          isSelected
                            ? 'bg-brand-primary/10 text-brand-primary font-semibold border border-brand-primary/20'
                            : 'hover:bg-bg-hover text-text-primary border border-transparent'
                        )}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className={cn('p-1.5 rounded-lg', isSelected ? 'bg-brand-primary/20' : 'bg-bg-tertiary')}>
                            <IconComponent className="h-4 w-4 flex-shrink-0" />
                          </div>
                          <div className="truncate">
                            <p className="text-xs font-bold truncate leading-tight">{result.title}</p>
                            <p className="text-[10px] text-text-tertiary truncate">{result.subtitle}</p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span
                            className={cn(
                              'text-[10px] px-2 py-0.5 rounded-full font-semibold capitalize',
                              result.type === 'navigation'
                                ? 'bg-brand-primary/10 text-brand-primary'
                                : 'bg-brand-secondary/10 text-brand-secondary'
                            )}
                          >
                            {result.type}
                          </span>
                          <ArrowRight className={cn('h-3.5 w-3.5 opacity-0 transition-opacity', isSelected && 'opacity-100')} />
                        </div>
                      </button>
                    )
                  })}
                </div>
              ) : (
                <div className="py-6 text-center text-xs text-text-tertiary">
                  No matching results for "<span className="font-semibold text-text-secondary">{searchQuery}</span>"
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        {settings.ai_system_enabled && settings.enabled && (
          <button
            type="button"
            onClick={() => openPanel()}
            className="hidden sm:inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-gradient-to-tr from-brand-primary to-brand-secondary text-brand-accent-contrast shadow-md shadow-brand-primary/20 hover:opacity-90 transition-all cursor-pointer"
            title="Open AI Copilot"
          >
            <Sparkles className="h-3.5 w-3.5" />
            AI Copilot
          </button>
        )}

        <div className="relative" ref={refreshMenuRef}>
          <button
            onClick={() => setRefreshMenuOpen(!refreshMenuOpen)}
            className="p-2.5 rounded-xl text-text-secondary hover:bg-bg-hover hover:text-text-primary transition-colors border border-transparent hover:border-border-primary cursor-pointer"
            aria-label="Refresh options"
            aria-expanded={refreshMenuOpen}
          >
            <RefreshCw className="h-4.5 w-4.5" />
          </button>
          {refreshMenuOpen && (
            <div className="absolute right-0 top-full mt-2 bg-widget-bg border border-widget-border rounded-xl shadow-lg py-1.5 min-w-[170px] z-[1000]">
              <button
                onClick={() => window.location.reload()}
                className="w-full px-4 py-2 text-left text-xs font-semibold hover:bg-bg-hover flex items-center justify-between text-text-primary cursor-pointer"
              >
                <span>Reload App</span>
                <kbd className="text-[10px] text-text-tertiary">⌘R</kbd>
              </button>
              <hr className="my-1 border-border-primary" />
              <div className="px-3 py-1 text-[11px] font-bold text-text-tertiary uppercase">Artifacts</div>
              <div className="px-4 py-1.5 text-[11px] text-text-tertiary">
                Artifact watcher polls automatically.
              </div>
            </div>
          )}
        </div>

        <div className="relative" ref={notificationsRef}>
          <button
            onClick={() => setNotificationsOpen(!notificationsOpen)}
            className="p-2.5 rounded-xl text-text-secondary hover:bg-bg-hover hover:text-text-primary transition-colors relative border border-transparent hover:border-border-primary cursor-pointer"
            aria-label="Recent runs"
            aria-expanded={notificationsOpen}
          >
            <Bell className="h-4.5 w-4.5" />
            {runs.length > 0 && (
              <span
                className={cn(
                  'absolute top-2 right-2 h-2 w-2 rounded-full ring-2 ring-topbar-bg',
                  runs[0].status?.toLowerCase() === 'success' ? 'bg-brand-success' : 'bg-brand-primary'
                )}
              />
            )}
          </button>
          {notificationsOpen && (
            <div className="absolute right-0 top-full mt-2 bg-widget-bg border border-widget-border rounded-xl shadow-lg w-80 z-[1000] overflow-hidden">
              <div className="p-3 bg-bg-tertiary/50 border-b border-widget-border flex items-center justify-between">
                <h3 className="font-semibold text-xs text-text-primary uppercase tracking-wider">Recent Runs</h3>
                <button
                  onClick={() => {
                    setNotificationsOpen(false)
                    navigate('/runs')
                  }}
                  className="text-[11px] text-brand-primary font-medium hover:underline cursor-pointer"
                >
                  View all
                </button>
              </div>
              {runs.length === 0 ? (
                <div className="p-4 text-center text-text-tertiary text-xs">
                  <Sparkles className="h-6 w-6 mx-auto mb-2 text-brand-primary opacity-60" />
                  No runs recorded yet.
                </div>
              ) : (
                <div className="divide-y divide-border-primary">
                  {runs.map((run) => (
                    <button
                      key={run.run_id}
                      onClick={() => {
                        setNotificationsOpen(false)
                        navigate('/run-history')
                      }}
                      className="w-full px-3 py-2 text-left hover:bg-bg-hover flex items-center justify-between gap-2 cursor-pointer"
                    >
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-text-primary truncate">{run.command}</p>
                        <p className="text-[10px] text-text-tertiary truncate">{new Date(run.start_time).toLocaleString()}</p>
                      </div>
                      <span className={cn('text-[10px] font-bold uppercase shrink-0', statusTone(String(run.status)))}>
                        {run.status}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <ThemePicker />

        <div className="relative pl-1" ref={userMenuRef}>
          <button
            onClick={() => setUserMenuOpen(!userMenuOpen)}
            className="flex items-center gap-2.5 p-1.5 pr-2.5 rounded-xl hover:bg-bg-hover transition-colors border border-transparent hover:border-border-primary cursor-pointer"
            aria-label="User menu"
            aria-expanded={userMenuOpen}
          >
            <div className="h-8 w-8 rounded-lg bg-gradient-to-tr from-brand-primary to-brand-secondary text-brand-accent-contrast flex items-center justify-center font-bold text-xs shadow-xs">
              {initials}
            </div>
            <div className="hidden lg:block text-left leading-tight">
              <p className="text-xs font-bold text-text-primary">{user?.username || 'Local User'}</p>
              <p className="text-[10px] text-text-tertiary">{user?.role ? `${user.role}` : 'Single-user'}</p>
            </div>
            <ChevronDown className="h-3.5 w-3.5 text-text-tertiary ml-0.5 hidden lg:block" />
          </button>
          {userMenuOpen && (
            <div className="absolute right-0 top-full mt-2 bg-widget-bg border border-widget-border rounded-xl shadow-lg py-1.5 min-w-[190px] z-[1000]">
              <div className="px-4 py-2 border-b border-widget-border">
                <p className="text-xs font-bold text-text-primary">{user?.username || 'Guest'}</p>
                <p className="text-[11px] text-text-tertiary truncate">
                  {isAuthEnabled && user ? `${user.role} role` : 'Auth disabled'}
                </p>
              </div>
              <button
                onClick={() => {
                  setUserMenuOpen(false)
                  navigate('/settings')
                }}
                className="w-full px-4 py-2 text-left text-xs font-medium hover:bg-bg-hover text-text-primary flex items-center gap-2 cursor-pointer"
              >
                <SettingsIcon className="h-3.5 w-3.5 text-text-tertiary" />
                Workspace Settings
              </button>
              <button
                onClick={() => {
                  setUserMenuOpen(false)
                  navigate('/docs')
                }}
                className="w-full px-4 py-2 text-left text-xs font-medium hover:bg-bg-hover text-text-primary flex items-center gap-2 cursor-pointer"
              >
                <User className="h-3.5 w-3.5 text-text-tertiary" />
                Project Docs
              </button>
              {settings.ai_system_enabled && settings.enabled && (
                <button
                  onClick={() => {
                    setUserMenuOpen(false)
                    openPanel()
                  }}
                  className="w-full px-4 py-2 text-left text-xs font-medium hover:bg-bg-hover text-text-primary flex items-center gap-2 cursor-pointer sm:hidden"
                >
                  <Sparkles className="h-3.5 w-3.5 text-text-tertiary" />
                  AI Copilot
                </button>
              )}
              {isAuthEnabled && user && (
                <>
                  <hr className="my-1 border-widget-border" />
                  <button
                    onClick={() => {
                      setUserMenuOpen(false)
                      logout()
                    }}
                    className="w-full px-4 py-2 text-left text-xs font-medium hover:bg-bg-hover text-brand-danger flex items-center gap-2 cursor-pointer"
                  >
                    <LogOut className="h-3.5 w-3.5" />
                    Sign out
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
