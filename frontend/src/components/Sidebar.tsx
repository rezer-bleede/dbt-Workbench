import { NavLink, useLocation } from 'react-router-dom'
import { type ReactNode, useEffect, useRef, useState } from 'react'
import { useAuth } from '../context/AuthContext'

type Role = 'viewer' | 'developer' | 'admin'

type NavItem = {
  label: string
  to: string
  minRole?: Role
  icon: ReactNode
}

const iconClasses = 'h-5 w-5 flex-shrink-0 text-muted transition-colors'

function DashboardIcon() {
  return (
    <svg className={iconClasses} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M4 4h7v7H4zM13 4h7v4h-7zM13 11h7v9h-7zM4 13h7v7H4z" />
    </svg>
  )
}

function ModelsIcon() {
  return (
    <svg className={iconClasses} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <rect x="4" y="4" width="6" height="6" rx="1" />
      <rect x="14" y="4" width="6" height="6" rx="1" />
      <rect x="4" y="14" width="6" height="6" rx="1" />
      <rect x="14" y="14" width="6" height="6" rx="1" />
    </svg>
  )
}

function LineageIcon() {
  return (
    <svg className={iconClasses} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <circle cx="6" cy="6" r="2.5" />
      <circle cx="18" cy="6" r="2.5" />
      <circle cx="12" cy="18" r="2.5" />
      <path d="M8 6h8M12 8.5V13" />
    </svg>
  )
}

function SqlIcon() {
  return (
    <svg className={iconClasses} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <rect x="4" y="5" width="16" height="14" rx="2" />
      <path d="M8 9h8M8 13h4" />
    </svg>
  )
}

function RunsIcon() {
  return (
    <svg className={iconClasses} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <circle cx="12" cy="12" r="8" />
      <path d="M12 7v5l3 2" />
    </svg>
  )
}

function VersionControlIcon() {
  return (
    <svg className={iconClasses} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M7 3v4a3 3 0 0 0 3 3h4" />
      <circle cx="7" cy="3" r="2" />
      <circle cx="17" cy="21" r="2" />
      <path d="M17 21v-4a3 3 0 0 0-3-3h-4" />
      <circle cx="7" cy="13" r="2" />
    </svg>
  )
}

function FileEditorIcon() {
  return (
    <svg className={iconClasses} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="12" y1="18" x2="12" y2="12" />
      <line x1="9" y1="15" x2="15" y2="15" />
    </svg>
  )
}

function SchedulesIcon() {
  return (
    <svg className={iconClasses} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <rect x="4" y="5" width="16" height="15" rx="2" />
      <path d="M9 3v4M15 3v4M4 10h16" />
      <path d="M12 14v3l2 1" />
    </svg>
  )
}

function EnvironmentsIcon() {
  return (
    <svg className={iconClasses} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <circle cx="12" cy="12" r="7" />
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}

function PluginsIcon() {
  return (
    <svg className={iconClasses} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M9 3h6v6H9z" />
      <path d="M9 15v3a3 3 0 0 1-3 3H5a2 2 0 0 1-2-2v-1a3 3 0 0 1 3-3z" />
      <path d="M15 9h3a3 3 0 0 1 3 3v1a2 2 0 0 1-2 2h-1a3 3 0 0 1-3-3z" />
    </svg>
  )
}

function DocsIcon() {
  return (
    <svg className={iconClasses} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <rect x="5" y="3" width="14" height="18" rx="2" />
      <path d="M9 7h6M9 11h6M9 15h3" />
    </svg>
  )
}

function SettingsIcon() {
  return (
    <svg className={iconClasses} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <circle cx="12" cy="12" r="3" />
      <path d="M4.5 9h2l1-2  -1-2h-2l-1 2zm13 0h2l1-2-1-2h-2l-1 2zm-13 6h2l1 2-1 2h-2l-1-2zm13 0h2l1 2-1 2h-2l-1-2z" />
    </svg>
  )
}

const baseNavItems: NavItem[] = [
  { label: 'Dashboard', to: '/', icon: <DashboardIcon /> },
  { label: 'Models', to: '/models', icon: <ModelsIcon /> },
  { label: 'Lineage', to: '/lineage', icon: <LineageIcon /> },
  { label: 'SQL Workspace', to: '/sql', minRole: 'viewer', icon: <SqlIcon /> },
  { label: 'Runs', to: '/runs', minRole: 'developer', icon: <RunsIcon /> },
  { label: 'Version Control', to: '/version-control', minRole: 'developer', icon: <VersionControlIcon /> },
  { label: 'File Editor', to: '/file-editor', minRole: 'developer', icon: <FileEditorIcon /> },
  { label: 'Schedules', to: '/schedules', minRole: 'developer', icon: <SchedulesIcon /> },
  { label: 'Environments', to: '/environments', minRole: 'developer', icon: <EnvironmentsIcon /> },
  { label: 'Plugins', to: '/plugins/installed', minRole: 'admin', icon: <PluginsIcon /> },
  { label: 'Docs', to: '/docs', icon: <DocsIcon /> },
  { label: 'Settings', to: '/settings', minRole: 'admin', icon: <SettingsIcon /> },
]

const BrandMark = ({ size = 20 }: { size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 64 64"
    fill="none"
    aria-hidden
  >
    <rect width="64" height="64" rx="14" fill="#0F172A" />

    <rect x="14" y="20" width="10" height="28" rx="4" fill="#7DD3FC" />
    <rect x="27" y="14" width="10" height="36" rx="4" fill="#38BDF8" />
    <rect x="40" y="22" width="10" height="22" rx="4" fill="#0EA5E9" />

    <circle cx="46" cy="16" r="4" fill="#22D3EE" />
  </svg>
);


export function Sidebar() {
  const { user, isAuthEnabled } = useAuth()
  const { pathname } = useLocation()
  const isSqlRoute = pathname === '/sql' || pathname.startsWith('/sql/')
  const [collapsed, setCollapsed] = useState(() => isSqlRoute)
  const wasSqlRouteRef = useRef(isSqlRoute)
  const nonSqlCollapsedRef = useRef(false)

  useEffect(() => {
    const wasSqlRoute = wasSqlRouteRef.current
    if (!isSqlRoute && !wasSqlRoute) {
      nonSqlCollapsedRef.current = collapsed
    }
  }, [collapsed, isSqlRoute])

  useEffect(() => {
    const wasSqlRoute = wasSqlRouteRef.current

    if (!wasSqlRoute && isSqlRoute) {
      nonSqlCollapsedRef.current = collapsed
      setCollapsed(true)
    } else if (wasSqlRoute && !isSqlRoute) {
      setCollapsed(nonSqlCollapsedRef.current)
    }

    wasSqlRouteRef.current = isSqlRoute
  }, [collapsed, isSqlRoute])

  const toggleCollapsed = () => setCollapsed((prev) => !prev)

  const role: Role = (user?.role as Role) || 'admin'
  const allowedItems = baseNavItems.filter((item) => {
    if (!isAuthEnabled) return true
    if (!item.minRole) return true
    const order: Record<Role, number> = { viewer: 0, developer: 1, admin: 2 }
    return order[role] >= order[item.minRole]
  })

  return (
    <aside
      className={`panel-gradient panel-divider border-r h-screen sticky top-0 flex shrink-0 flex-col overflow-y-auto transition-all duration-200 ${
        collapsed ? 'w-20 px-3 py-4' : 'w-64 px-4 py-6'
      }`}
      data-testid="sidebar"
      data-collapsed={collapsed ? 'true' : 'false'}
    >
      <div className="flex items-center justify-between mb-8">
        <button
          type="button"
          onClick={toggleCollapsed}
          className="flex items-center gap-3 focus:outline-none"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {/* Logo box (always visible) */}
          <div className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-accent/40 bg-accent/10">
            <BrandMark size={22} />
          </div>

          {!collapsed && (
            <div className="text-left">
              <div className="text-lg font-semibold text-accent leading-tight">
                dbt-Workbench
              </div>
            </div>
          )}
        </button>

        <button
          type="button"
          onClick={toggleCollapsed}
          className="hidden md:inline-flex items-center justify-center h-8 w-8 rounded-md border border-border text-muted hover:bg-panel/70 hover:text-text"
          aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
        >
          <svg
            className="h-4 w-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
          >
            {collapsed ? (
              <path d="M10 6l4 6-4 6M6 6h2M6 18h2" />
            ) : (
              <path d="M14 6l-4 6 4 6M16 6h2M16 18h2" />
            )}
          </svg>
        </button>
      </div>
      <nav className="space-y-1 flex-1">
        {allowedItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 rounded-md text-sm border transition-colors ${
                isActive
                  ? 'bg-primary/15 text-text border-primary/35'
                  : 'text-muted border-transparent hover:bg-panel/60 hover:text-text'
              } ${collapsed ? 'justify-center' : ''}`
            }
            end={item.to === '/'}
            title={item.label}
          >
            <span>{item.icon}</span>
            {!collapsed && <span className="truncate">{item.label}</span>}
          </NavLink>
        ))}
      </nav>
    </aside>
  )
}
