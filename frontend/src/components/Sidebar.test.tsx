import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { vi } from 'vitest'

import { UserSummary } from '../types'
import { Sidebar } from './layout/Sidebar'
import { useSidebarStore } from '../stores/sidebarStore'

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

vi.mock('../context/AuthContext', () => ({
  useAuth: () => authValue,
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

const renderSidebar = (initialEntries: string[]) =>
  render(
    <MemoryRouter initialEntries={initialEntries}>
      <Routes>
        <Route path="*" element={<Sidebar />} />
      </Routes>
    </MemoryRouter>,
  )

describe('Sidebar route-scoped collapse behavior', () => {
  beforeEach(() => {
    useSidebarStore.setState({ collapsed: false, mobileOpen: false })
  })

  it('defaults to collapsed on /sql route', () => {
    renderSidebar(['/sql'])

    expect(screen.getByTestId('sidebar')).toHaveAttribute('data-collapsed', 'true')
  })

  it('restores non-SQL state on exit and re-collapses when returning to /sql', async () => {
    const user = userEvent.setup()
    renderSidebar(['/models'])

    const sidebar = screen.getByTestId('sidebar')
    expect(sidebar).toHaveAttribute('data-collapsed', 'false')

    await user.click(screen.getByLabelText(/collapse sidebar/i))
    expect(sidebar).toHaveAttribute('data-collapsed', 'true')

    await user.click(screen.getByTitle('SQL Workspace'))
    expect(sidebar).toHaveAttribute('data-collapsed', 'true')

    await user.click(screen.getByLabelText(/expand sidebar/i))
    expect(sidebar).toHaveAttribute('data-collapsed', 'false')

    await user.click(screen.getByTitle('Dashboard'))
    expect(sidebar).toHaveAttribute('data-collapsed', 'true')

    await user.click(screen.getByLabelText(/expand sidebar/i))
    expect(sidebar).toHaveAttribute('data-collapsed', 'false')

    await user.click(screen.getByTitle('SQL Workspace'))
    expect(sidebar).toHaveAttribute('data-collapsed', 'true')
  })
})
