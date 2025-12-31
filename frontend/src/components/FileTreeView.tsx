import { useEffect, useMemo, useState } from 'react'
import { GitFileNode } from '../types'
import { buildExpansionMap, sortGitNodes } from '../utils/fileTree'

interface FileTreeViewProps {
  nodes: GitFileNode[]
  selectedPath?: string
  onSelect?: (path: string, node: GitFileNode) => void
  emptyMessage?: string
  showCategory?: boolean
}

const INDENT = 'ml-4'

export function FileTreeView({
  nodes,
  selectedPath,
  onSelect,
  emptyMessage = 'No files available.',
  showCategory = false,
}: FileTreeViewProps) {
  const sortedNodes = useMemo(() => sortGitNodes(nodes), [nodes])
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  useEffect(() => {
    if (selectedPath) {
      setExpanded((prev) => ({ ...prev, ...buildExpansionMap(selectedPath) }))
    }
  }, [selectedPath])

  const toggle = (path: string) => {
    setExpanded((prev) => ({ ...prev, [path]: !prev[path] }))
  }

  const renderNode = (node: GitFileNode, depth = 0) => {
    const isFolder = (node.children?.length ?? 0) > 0 || node.type === 'directory'
    const isExpanded = expanded[node.path] ?? depth === 0
    const isSelected = selectedPath === node.path

    const caret = isFolder ? (
      <span className={`mr-2 inline-block transition-transform ${isExpanded ? 'rotate-90' : ''}`}>
        ▶
      </span>
    ) : (
      <span className="mr-2" aria-hidden>
        •
      </span>
    )

    const label = (
      <button
        type="button"
        onClick={() => (isFolder ? toggle(node.path) : onSelect?.(node.path, node))}
        className={`flex items-center w-full text-left px-2 py-1 rounded border border-transparent hover:border-gray-700 ${
          isSelected ? 'bg-gray-800 text-white border-gray-700' : 'text-gray-200'
        }`}
      >
        {caret}
        <span className="font-mono text-sm truncate">
          {showCategory && node.category ? `[${node.category}] ` : ''}
          {node.name}
        </span>
      </button>
    )

    return (
      <div key={node.path} className={depth > 0 ? INDENT : ''}>
        {label}
        {isFolder && isExpanded && node.children && (
          <div className="ml-3 border-l border-gray-800 pl-2 space-y-1">
            {node.children.map((child) => renderNode(child, depth + 1))}
          </div>
        )}
      </div>
    )
  }

  if (!sortedNodes.length) {
    return <div className="text-xs text-gray-500">{emptyMessage}</div>
  }

  return <div className="space-y-1">{sortedNodes.map((node) => renderNode(node))}</div>
}

export default FileTreeView

