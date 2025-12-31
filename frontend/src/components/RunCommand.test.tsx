import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RunCommand } from './RunCommand'

const startRunMock = vi.fn().mockResolvedValue({ run_id: 'run-1' })

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ activeWorkspace: { id: 1 } }),
}))

vi.mock('../services/executionService', () => ({
  ExecutionService: {
    startRun: (...args: unknown[]) => startRunMock(...args),
  },
}))

vi.mock('../api/client', () => ({
  api: {
    get: vi.fn().mockResolvedValue({ data: [] }),
  },
}))

vi.mock('../services/environmentService', () => ({
  EnvironmentService: {
    list: vi.fn().mockResolvedValue([{ id: 1, name: 'dev env', dbt_target_name: 'dev' }]),
  },
}))

vi.mock('./Autocomplete', () => ({
  Autocomplete: ({ value, onChange, placeholder }: any) => (
    <input
      aria-label={placeholder}
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  ),
}))

describe('RunCommand', () => {
  beforeEach(() => {
    startRunMock.mockClear()
  })

  it('shows a prompt when no target is selected', async () => {
    render(<RunCommand />)

    fireEvent.click(screen.getByText('Run'))

    expect(await screen.findByText(/select a Target/i)).toBeInTheDocument()
    expect(startRunMock).not.toHaveBeenCalled()
  })

  it('starts a run after selecting a target', async () => {
    render(<RunCommand />)

    fireEvent.change(screen.getByPlaceholderText('e.g., dev'), { target: { value: 'dev' } })
    fireEvent.click(screen.getByText('Run'))

    await waitFor(() => expect(startRunMock).toHaveBeenCalled())
  })
})

