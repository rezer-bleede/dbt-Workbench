import { graphlib, layout as dagreLayout } from '@dagrejs/dagre'
import { MarkerType, type Edge, type Node } from '@xyflow/react'

export type LineageLayoutMode = 'hierarchical' | 'star' | 'snowflake'
export type LayoutNode = { id: string; label: string; type: string; schema?: string; isGroup?: boolean; isSubtree?: boolean }
export type LayoutEdge = { source: string; target: string }
export type FlowNodeData = LayoutNode & { color: { fill: string; stroke: string }; faded: boolean }
export type FlowNode = Node<FlowNodeData, 'lineage'>

export const lineageNodeSize = { width: 190, height: 84 }

export function layoutLineageGraph(nodes: LayoutNode[], edges: LayoutEdge[], mode: LineageLayoutMode) {
  const dag = new graphlib.Graph({ multigraph: true, compound: false })
  dag.setDefaultEdgeLabel(() => ({}))
  dag.setGraph({ rankdir: 'LR', ranksep: 150, nodesep: 78, marginx: 48, marginy: 48 })
  nodes.forEach((node) => dag.setNode(node.id, lineageNodeSize))
  edges.forEach((edge) => dag.setEdge(edge.source, edge.target))

  const root = nodes.find((node) => !edges.some((edge) => edge.target === node.id))?.id
  if (root && mode !== 'hierarchical') {
    const distance = new Map<string, number>([[root, 0]])
    const queue = [root]
    while (queue.length) {
      const current = queue.shift() as string
      edges.filter((edge) => edge.source === current).forEach((edge) => {
        if (!distance.has(edge.target)) {
          distance.set(edge.target, (distance.get(current) || 0) + 1)
          queue.push(edge.target)
        }
      })
    }
    nodes.forEach((node) => dag.setNode(node.id, { ...lineageNodeSize, rank: distance.get(node.id) ?? 1 }))
    dag.setGraph({ rankdir: mode === 'star' ? 'TB' : 'LR', ranksep: 150, nodesep: 78, marginx: 48, marginy: 48 })
  }
  dagreLayout(dag)
  return {
    nodes: nodes.map((node) => {
      const position = dag.node(node.id)
      return { id: node.id, type: 'lineage', position: { x: (position?.x || 0) - lineageNodeSize.width / 2, y: (position?.y || 0) - lineageNodeSize.height / 2 }, data: node } as FlowNode
    }),
    edges: edges.map((edge, index) => ({ id: `${edge.source}-${edge.target}-${index}`, source: edge.source, target: edge.target, type: 'smoothstep', markerEnd: { type: MarkerType.ArrowClosed } })) as Edge[],
  }
}
