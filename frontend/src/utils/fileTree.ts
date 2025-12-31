import { GitFileNode } from '../types'

export const sortGitNodes = (nodes: GitFileNode[]): GitFileNode[] => {
  return nodes
    .slice()
    .sort((a, b) => {
      const aIsDir = (a.children?.length ?? 0) > 0 || a.type === 'directory'
      const bIsDir = (b.children?.length ?? 0) > 0 || b.type === 'directory'
      if (aIsDir !== bIsDir) {
        return aIsDir ? -1 : 1
      }
      return a.name.localeCompare(b.name)
    })
    .map((node) => ({
      ...node,
      children: node.children ? sortGitNodes(node.children) : undefined,
    }))
}

export const filterGitTree = (
  nodes: GitFileNode[],
  predicate: (node: GitFileNode) => boolean,
): GitFileNode[] => {
  const visit = (node: GitFileNode): GitFileNode | null => {
    const filteredChildren = (node.children || [])
      .map(visit)
      .filter((child): child is GitFileNode => Boolean(child))

    const isMatch = predicate(node)
    if (isMatch || filteredChildren.length > 0) {
      return {
        ...node,
        children: filteredChildren.length ? filteredChildren : undefined,
      }
    }
    return null
  }

  const filtered = nodes
    .map(visit)
    .filter((node): node is GitFileNode => Boolean(node))

  return sortGitNodes(filtered)
}

export const buildExpansionMap = (path: string): Record<string, boolean> => {
  if (!path) return {}
  const segments = path.split('/')
  const map: Record<string, boolean> = {}
  segments.reduce((acc, segment) => {
    const next = acc ? `${acc}/${segment}` : segment
    map[next] = true
    return next
  }, '')
  return map
}

