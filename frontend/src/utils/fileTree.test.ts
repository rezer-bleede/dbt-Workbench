import { describe, expect, it } from 'vitest'
import { GitFileNode } from '../types'
import { buildExpansionMap, filterGitTree, sortGitNodes } from './fileTree'

describe('fileTree utilities', () => {
  const nodes: GitFileNode[] = [
    {
      name: 'models',
      path: 'models',
      type: 'directory',
      children: [
        { name: 'orders.sql', path: 'models/orders.sql', type: 'file', category: 'models' },
        {
          name: 'staging',
          path: 'models/staging',
          type: 'directory',
          children: [
            { name: 'stg_customers.sql', path: 'models/staging/stg_customers.sql', type: 'file', category: 'models' },
          ],
        },
      ],
    },
    { name: 'README.md', path: 'README.md', type: 'file' },
  ]

  it('sorts directories before files and alphabetically', () => {
    const unsorted: GitFileNode[] = [
      { name: 'b.sql', path: 'b.sql', type: 'file' },
      { name: 'alpha', path: 'alpha', type: 'directory', children: [] },
      { name: 'a.sql', path: 'a.sql', type: 'file' },
    ]

    const sorted = sortGitNodes(unsorted)
    expect(sorted[0].name).toBe('alpha')
    expect(sorted[1].name).toBe('a.sql')
    expect(sorted[2].name).toBe('b.sql')
  })

  it('filters tree nodes while keeping ancestor folders', () => {
    const filtered = filterGitTree(nodes, (node) => node.path.endsWith('.sql'))
    expect(filtered).toHaveLength(1)
    const root = filtered[0]
    expect(root.name).toBe('models')
    const childNames = root.children?.map((child) => child.name)
    expect(childNames).toContain('orders.sql')
    expect(childNames).toContain('staging')
  })

  it('builds an expansion map for the provided path', () => {
    const expansion = buildExpansionMap('models/staging/stg_customers.sql')
    expect(expansion).toMatchObject({
      models: true,
      'models/staging': true,
      'models/staging/stg_customers.sql': true,
    })
  })
})

