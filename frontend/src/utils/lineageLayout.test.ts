import { describe, expect, it } from 'vitest'
import { layoutLineageGraph } from './lineageLayout'

const nodes = [{ id: 'a', label: 'A', type: 'model' }, { id: 'b', label: 'B', type: 'model' }, { id: 'c', label: 'C', type: 'model' }]
const edges = [{ source: 'a', target: 'b' }, { source: 'b', target: 'c' }]

describe('layoutLineageGraph', () => {
  it.each(['hierarchical', 'star', 'snowflake'] as const)('positions %s graphs deterministically', (mode) => {
    const first = layoutLineageGraph(nodes, edges, mode)
    const second = layoutLineageGraph(nodes, edges, mode)
    expect(first.nodes.map((node) => node.position)).toEqual(second.nodes.map((node) => node.position))
    expect(first.edges).toHaveLength(2)
  })

  it('handles empty and disconnected graphs', () => {
    expect(layoutLineageGraph([], [], 'hierarchical').nodes).toEqual([])
    expect(layoutLineageGraph([{ id: 'a', label: 'A', type: 'model' }, { id: 'b', label: 'B', type: 'model' }], [], 'snowflake').nodes).toHaveLength(2)
  })
})
