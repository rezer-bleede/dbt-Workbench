import { NavLink } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const baseNavItems = [
  { label: 'Dashboard', to: '/' },
  { label: 'Models', to: '/models' },
  { label: 'Lineage', to: '/lineage' },
  { label: 'SQL Workspace', to: '/sql', minRole: 'developer' as const },
  { label: 'Runs', to: '/runs', minRole: 'developer' as const },
  { label: 'Run History', to: '/run-history', minRole: 'viewer' as const },
  { label: 'Schedules', to: '/schedules', minRole: 'developer' as const },
  { label: 'Docs', to: '/docs' },
  { label: 'Settings', to: '/settings', minRole: 'admin' as const },
]

export function Sidebar() {
  const { user, isAuthEnabled } = useAuth()

  const role = user?.role || 'admin'
  const allowedItems = baseNavItems.filter((item) => {
    if (!isAuthEnabled) return true
    if (!item.minRole) return true
    const order: Record<string, number> = { viewer: 0, developer: 1, admin: 2 }
    return order[role] >= order[item.minRole]
  })

  return (
    <aside className="w-64 bg-panel border-r border-gray-800 min-h-screen p-6 sticky top-0">
      <div className="text-2xl font-semibold text-accent mb-8">dbt-Workbench</div>
      <nav className="space-y-2">
        {allowedItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `block px-3 py-2 rounded-md transition ${
                isActive ? 'bg-accent/10 text-white' : 'text-gray-300 hover:bg-gray-800'
              }`
            }
            end={item.to === '/'}
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
    </aside>
  )
}
