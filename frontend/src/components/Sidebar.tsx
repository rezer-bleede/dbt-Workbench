import { NavLink } from 'react-router-dom'

const navItems = [
  { label: 'Dashboard', to: '/' },
  { label: 'Models', to: '/models' },
  { label: 'Lineage', to: '/lineage' },
  { label: 'Runs', to: '/runs' },
  { label: 'Run History', to: '/run-history' },
  { label: 'Schedules', to: '/schedules' },
  { label: 'Docs', to: '/docs' },
  { label: 'Settings', to: '/settings' },
]

export function Sidebar() {
  return (
    <aside className="w-64 bg-panel border-r border-gray-800 min-h-screen p-6 sticky top-0">
      <div className="text-2xl font-semibold text-accent mb-8">dbt-Workbench</div>
      <nav className="space-y-2">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `block px-3 py-2 rounded-md transition ${isActive ? 'bg-accent/10 text-white' : 'text-gray-300 hover:bg-gray-800'}`
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
