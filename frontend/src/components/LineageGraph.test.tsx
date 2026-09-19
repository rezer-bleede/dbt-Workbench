import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { LineageGraph } from './LineageGraph'

describe('LineageGraph', () => {
  const props = {
    nodes: [{ id: 'a', label: 'Orders', type: 'model' }, { id: 'b', label: 'Customers', type: 'model' }],
    edges: [{ source: 'a', target: 'b' }],
    highlighted: new Set<string>(),
    resolveColor: () => ({ fill: '#111827', stroke: '#38bdf8' }),
    onNodeClick: vi.fn(),
    isFullscreen: false,
    onToggleFullscreen: vi.fn(),
  }

  it('renders React Flow nodes and Lucide toolbar controls', () => {
    render(<LineageGraph {...props} />)
    expect(screen.getByTestId('lineage-node-a')).toBeInTheDocument()
    expect(screen.getByTestId('lineage-node-b')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Zoom in' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Fit graph' })).toBeInTheDocument()
  })

  it('supports layout mode selection and node selection', () => {
    render(<LineageGraph {...props} />)
    fireEvent.change(screen.getByRole('combobox', { name: 'Graph layout' }), { target: { value: 'snowflake' } })
    fireEvent.click(screen.getByTestId('lineage-node-a'))
    expect(props.onNodeClick).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }))
  })
})
