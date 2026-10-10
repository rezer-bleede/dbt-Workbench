import { useEffect, useRef } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import {
  BookOpen,
  Boxes,
  CalendarClock,
  FileCode,
  GitBranch,
  Globe,
  History,
  LayoutDashboard,
  type LucideIcon,
  Network,
  PanelLeftClose,
  PanelLeftOpen,
  Puzzle,
  Settings as SettingsIcon,
  Sparkles,
  Terminal,
} from 'lucide-react'
import { cn } from '../../utils/cn'
import { useAuth } from '../../context/AuthContext'
import { useSidebarStore } from '../../stores/sidebarStore'
import { filterNavByRole, NavItem, Role } from '../../config/navigation'

const iconMap: Record<string, LucideIcon> = {
  'layout-dashboard': LayoutDashboard,
  boxes: Boxes,
  network: Network,
  'book-open': BookOpen,
  terminal: Terminal,
  'file-code': FileCode,
  'git-branch': GitBranch,
  history: History,
  'calendar-clock': CalendarClock,
  globe: Globe,
  puzzle: Puzzle,
  settings: SettingsIcon,
}

function NavLinkItem({
  item,
  collapsed,
  onNavigate,
}: {
  item: NavItem
  collapsed: boolean
  onNavigate: () => void
}) {
  const Icon = iconMap[item.icon] || LayoutDashboard

  return (
    <NavLink
      to={item.path}
      end={item.path === '/'}
      onClick={onNavigate}
      className={({ isActive }) =>
        cn(
          'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2',
          isActive
            ? 'bg-gradient-to-r from-brand-primary/15 to-brand-primary/5 text-brand-primary font-semibold shadow-xs border border-brand-primary/20'
            : 'text-sidebar-text hover:bg-sidebar-item-hover hover:text-text-primary',
          collapsed && 'justify-center px-2'
        )
      }
      title={item.label}
    >
      <Icon className="h-5 w-5 flex-shrink-0" strokeWidth={1.75} aria-hidden="true" />
      {!collapsed && <span className="truncate flex-1 text-left">{item.label}</span>}
    </NavLink>
  )
}

function GroupHeader({ label, collapsed }: { label: string; collapsed: boolean }) {
  if (collapsed) return null
  return (
    <div className="px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-text-tertiary">
      {label}
    </div>
  )
}

const BrandMark = () => (
  <svg width="20" height="20" viewBox="0 0 64 64" fill="none" aria-hidden className="text-brand-accent-contrast">
    <rect x="14" y="20" width="10" height="28" rx="4" fill="currentColor" opacity="0.65" />
    <rect x="27" y="14" width="10" height="36" rx="4" fill="currentColor" />
    <rect x="40" y="22" width="10" height="22" rx="4" fill="currentColor" opacity="0.8" />
    <circle cx="46" cy="16" r="4" fill="currentColor" opacity="0.9" />
  </svg>
)

export function Sidebar() {
  const { user, isAuthEnabled } = useAuth()
  const { pathname } = useLocation()
  const collapsed = useSidebarStore((s) => s.collapsed)
  const toggle = useSidebarStore((s) => s.toggle)
  const setCollapsed = useSidebarStore((s) => s.setCollapsed)
  const mobileOpen = useSidebarStore((s) => s.mobileOpen)
  const closeMobile = useSidebarStore((s) => s.closeMobile)

  const isSqlRoute = pathname === '/sql' || pathname.startsWith('/sql/')
  const wasSqlRouteRef = useRef(false)
  const nonSqlCollapsedRef = useRef(collapsed)

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSqlRoute])

  const role: Role | null = (user?.role as Role) || null
  const groups = filterNavByRole(role, isAuthEnabled)

  const handleNavClick = () => {
    if (typeof window !== 'undefined' && window.innerWidth < 1024) {
      closeMobile()
    }
  }

  return (
    <>
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 h-screen flex flex-col transition-all duration-300 ease-in-out',
          'bg-sidebar-bg border-r border-sidebar-border shadow-xs',
          collapsed ? 'w-[72px]' : 'w-[280px]',
          mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        )}
        aria-label="Main navigation"
        data-testid="sidebar"
        data-collapsed={collapsed ? 'true' : 'false'}
      >
        <div className="flex h-14 shrink-0 items-center justify-between px-4 border-b border-sidebar-border">
          {!collapsed ? (
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-xl bg-gradient-to-tr from-brand-primary to-brand-secondary flex items-center justify-center shadow-md shadow-brand-primary/20">
                <BrandMark />
              </div>
              <div>
                <span className="font-bold text-base tracking-tight text-text-primary block leading-none">
                  dbt-Workbench
                </span>
                <span className="text-[11px] font-medium text-brand-primary flex items-center gap-1 mt-0.5">
                  <Sparkles className="h-3 w-3" /> Data Command Center
                </span>
              </div>
            </div>
          ) : (
            <div className="h-9 w-9 mx-auto rounded-xl bg-gradient-to-tr from-brand-primary to-brand-secondary flex items-center justify-center shadow-md shadow-brand-primary/20">
              <BrandMark />
            </div>
          )}

          {!collapsed && (
            <button
              onClick={toggle}
              className="p-1.5 rounded-lg text-text-tertiary hover:text-text-primary hover:bg-bg-hover transition-colors hidden lg:block cursor-pointer"
              title="Collapse sidebar"
              aria-label="Collapse sidebar"
            >
              <PanelLeftClose className="h-4 w-4" />
            </button>
          )}
        </div>

        <nav className="flex-1 overflow-y-auto p-3 space-y-4 scrollbar-thin" aria-label="Sidebar navigation">
          {groups.map((group) => (
            <div key={group.id}>
              <GroupHeader label={group.label} collapsed={collapsed} />
              <div className="space-y-1">
                {group.items.map((item) => (
                  <NavLinkItem key={item.id} item={item} collapsed={collapsed} onNavigate={handleNavClick} />
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div className="p-3 border-t border-sidebar-border bg-bg-secondary/50">
          {!collapsed ? (
            <button
              onClick={toggle}
              className="w-full px-3 py-2 rounded-xl bg-bg-tertiary/60 border border-border-primary text-xs text-text-tertiary flex items-center justify-between hover:bg-bg-hover hover:text-text-primary transition-all cursor-pointer"
              title="Toggle sidebar collapse state"
            >
              <span className="font-medium">Sidebar shortcut</span>
              <kbd className="px-1.5 py-0.5 bg-bg-secondary rounded border border-border-secondary text-[10px] font-mono font-semibold text-text-secondary">
                ⌘B
              </kbd>
            </button>
          ) : (
            <button
              onClick={toggle}
              className="w-full p-2 rounded-xl bg-bg-tertiary/60 border border-border-primary text-text-tertiary hover:text-text-primary hover:bg-bg-hover transition-all flex items-center justify-center cursor-pointer"
              title="Expand sidebar"
              aria-label="Expand sidebar"
            >
              <PanelLeftOpen className="h-4 w-4" />
            </button>
          )}
        </div>
      </aside>

      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-xs lg:hidden"
          onClick={closeMobile}
          aria-hidden="true"
        />
      )}
    </>
  )
}
