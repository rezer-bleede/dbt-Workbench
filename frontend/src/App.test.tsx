import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import React from 'react'
import { vi } from 'vitest'
import App from './App'
import { UserSummary } from './types'
import { HOME_TAB, useTabStore } from './stores/tabStore'
import { useSidebarStore } from './stores/sidebarStore'

const authValue = {
  isLoading: false,
  isAuthEnabled: false,
  user: { id: 1, username: 'tester', role: 'admin' } as UserSummary,
  activeWorkspace: { id: 1, key: 'default', name: 'Default', artifacts_path: '/tmp' },
  workspaces: [{ id: 1, key: 'default', name: 'Default', artifacts_path: '/tmp' }],
  accessToken: null,
  refreshToken: null,
  login: vi.fn(),
  logout: vi.fn(),
  switchWorkspace: vi.fn(),
}

vi.mock('./context/AuthContext', () => ({
  useAuth: () => authValue,
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

describe('App layout', () => {
  it('keeps the sidebar fixed while main content scrolls', () => {
    const { container } = render(
      <MemoryRouter>
        <App />
      </MemoryRouter>,
    )

    const appShell = container.firstElementChild as HTMLElement | null
    expect(appShell).not.toBeNull()
    expect(appShell).toHaveClass('overflow-hidden')

    const sidebar = screen.getByTestId('sidebar')
    expect(sidebar).toHaveClass('h-screen')

    const main = screen.getByRole('main')
    expect(main).toHaveClass('overflow-y-auto')
  })
})

describe('App route-synced tabs', () => {
  beforeEach(() => {
    useTabStore.setState({ tabs: [HOME_TAB], activeTabId: HOME_TAB.id })
    useSidebarStore.setState({ collapsed: false, mobileOpen: false })
  })

  it('opens a tab for the section matching the initial route', async () => {
    render(
      <MemoryRouter initialEntries={['/models/some.model.id']}>
        <App />
      </MemoryRouter>,
    )

    await waitFor(() => {
      const { tabs, activeTabId } = useTabStore.getState()
      expect(tabs.map((t) => t.id)).toContain('/models')
      expect(activeTabId).toBe('/models')
    })
  })

  it('adds a tab when navigating via the sidebar', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>,
    )

    await user.click(screen.getByTitle('Lineage'))

    await waitFor(() => {
      const { tabs, activeTabId } = useTabStore.getState()
      expect(tabs.map((t) => t.id)).toEqual(['/', '/lineage'])
      expect(activeTabId).toBe('/lineage')
    })
  })

  it('reuses the existing tab when navigating back to a section', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>,
    )

    await user.click(screen.getByTitle('Models'))
    await user.click(screen.getByTitle('Lineage'))
    await user.click(screen.getByTitle('Models'))

    await waitFor(() => {
      const { tabs, activeTabId } = useTabStore.getState()
      expect(activeTabId).toBe('/models')
      expect(tabs.filter((t) => t.id === '/models')).toHaveLength(1)
    })
  })
})
