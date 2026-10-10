export type Role = 'viewer' | 'developer' | 'admin'

export interface NavItem {
  id: string
  label: string
  path: string
  icon: string
  minRole?: Role
}

export interface NavGroup {
  id: string
  label: string
  items: NavItem[]
}

export const navigationGroups: NavGroup[] = [
  {
    id: 'overview',
    label: 'Overview',
    items: [
      { id: 'dashboard', label: 'Dashboard', path: '/', icon: 'layout-dashboard' },
      { id: 'models', label: 'Models', path: '/models', icon: 'boxes' },
      { id: 'lineage', label: 'Lineage', path: '/lineage', icon: 'network' },
      { id: 'docs', label: 'Docs', path: '/docs', icon: 'book-open' },
    ],
  },
  {
    id: 'develop',
    label: 'Develop',
    items: [
      { id: 'sql', label: 'SQL Workspace', path: '/sql', icon: 'terminal', minRole: 'viewer' },
      { id: 'file-editor', label: 'File Editor', path: '/file-editor', icon: 'file-code', minRole: 'developer' },
      { id: 'version-control', label: 'Version Control', path: '/version-control', icon: 'git-branch', minRole: 'developer' },
    ],
  },
  {
    id: 'operate',
    label: 'Operate',
    items: [
      { id: 'runs', label: 'Runs', path: '/runs', icon: 'history', minRole: 'developer' },
      { id: 'schedules', label: 'Schedules', path: '/schedules', icon: 'calendar-clock', minRole: 'developer' },
      { id: 'environments', label: 'Environments', path: '/environments', icon: 'globe', minRole: 'developer' },
    ],
  },
  {
    id: 'admin',
    label: 'Workspace',
    items: [
      { id: 'plugins', label: 'Plugins', path: '/plugins/installed', icon: 'puzzle', minRole: 'admin' },
      { id: 'settings', label: 'Settings', path: '/settings', icon: 'settings', minRole: 'admin' },
    ],
  },
]

export function getAllNavItems(): NavItem[] {
  return navigationGroups.flatMap((group) => group.items)
}

export function filterNavByRole(role: Role | null, authEnabled: boolean): NavGroup[] {
  if (!authEnabled || !role) return navigationGroups
  const order: Record<Role, number> = { viewer: 0, developer: 1, admin: 2 }
  return navigationGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => !item.minRole || order[role] >= order[item.minRole]),
    }))
    .filter((group) => group.items.length > 0)
}

const sectionMap: NavItem[] = getAllNavItems()

/** Maps a concrete URL to its owning nav section (longest-prefix match). */
export function sectionForPath(pathname: string): NavItem | null {
  const match = sectionMap
    .slice()
    .sort((a, b) => b.path.length - a.path.length)
    .find((item) => (item.path === '/' ? pathname === '/' : pathname === item.path || pathname.startsWith(`${item.path}/`)))
  if (match) return match
  if (pathname.startsWith('/plugins')) {
    return sectionMap.find((i) => i.id === 'plugins') ?? null
  }
  return null
}
