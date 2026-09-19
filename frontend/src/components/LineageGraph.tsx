import { useCallback, useEffect, useMemo, useState } from 'react'
import { Background, Controls, MiniMap, ReactFlow, ReactFlowProvider, useReactFlow, type Edge } from '@xyflow/react'
import { Maximize2, Minimize2, ScanSearch, ZoomIn, ZoomOut } from 'lucide-react'
import { LineageNode } from './LineageNode'
import { layoutLineageGraph, type FlowNodeData, type LayoutEdge, type LayoutNode, type LineageLayoutMode } from '../utils/lineageLayout'
import '@xyflow/react/dist/style.css'

export type LineageGraphNode = LayoutNode
export type LineageGraphEdge = LayoutEdge
type Props = { nodes: LineageGraphNode[]; edges: LineageGraphEdge[]; highlighted: Set<string>; resolveColor: (node: LineageGraphNode) => { fill: string; stroke: string }; onNodeClick: (node: LineageGraphNode) => void; isFullscreen: boolean; onToggleFullscreen: () => void }
const nodeTypes = { lineage: LineageNode }

function GraphCanvas({ props }: { props: Props }) {
  const reactFlow = useReactFlow()
  const [layoutMode, setLayoutMode] = useState<LineageLayoutMode>('hierarchical')
  const graph = useMemo(() => layoutLineageGraph(props.nodes, props.edges, layoutMode), [props.nodes, props.edges, layoutMode])
  const nodes = useMemo(() => graph.nodes.map((node) => ({ ...node, data: { ...node.data, color: props.resolveColor(node.data), faded: props.highlighted.size > 0 && !props.highlighted.has(node.id) } })), [graph.nodes, props.highlighted, props.resolveColor])
  const edges = useMemo(() => graph.edges.map((edge) => {
    const active = props.highlighted.size === 0 || (props.highlighted.has(edge.source) && props.highlighted.has(edge.target))
    return { ...edge, style: { stroke: active && props.highlighted.size > 0 ? '#38bdf8' : '#475569', strokeWidth: active && props.highlighted.size > 0 ? 2.5 : 1.5, opacity: active ? 0.92 : 0.25 }, markerEnd: { ...edge.markerEnd, color: active ? '#38bdf8' : '#64748b7a' } }
  }) as Edge[], [graph.edges, props.highlighted])

  useEffect(() => { if (nodes.length) requestAnimationFrame(() => reactFlow.fitView({ padding: 0.18, duration: 250 })) }, [layoutMode, nodes.length, reactFlow])
  const toggleFullscreen = useCallback(() => props.onToggleFullscreen(), [props])
  return <div className={`relative h-full w-full ${props.isFullscreen ? 'bg-slate-950' : ''}`}>
    <div className="absolute right-3 top-3 z-10 flex items-center gap-1 rounded-md border border-slate-700 bg-slate-900/90 p-1 text-slate-200 shadow backdrop-blur">
      <select aria-label="Graph layout" value={layoutMode} onChange={(event) => setLayoutMode(event.target.value as LineageLayoutMode)} className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-[11px]"><option value="hierarchical">Hierarchical</option><option value="star">Star</option><option value="snowflake">Snowflake</option></select>
      <button aria-label="Zoom in" onClick={() => reactFlow.zoomIn()} className="rounded p-1.5 hover:bg-slate-700"><ZoomIn size={15} /></button>
      <button aria-label="Zoom out" onClick={() => reactFlow.zoomOut()} className="rounded p-1.5 hover:bg-slate-700"><ZoomOut size={15} /></button>
      <button aria-label="Fit graph" onClick={() => reactFlow.fitView({ padding: 0.18, duration: 250 })} className="rounded p-1.5 hover:bg-slate-700"><ScanSearch size={15} /></button>
      <button aria-label={props.isFullscreen ? 'Exit full screen' : 'Full screen'} onClick={toggleFullscreen} className="rounded p-1.5 hover:bg-slate-700">{props.isFullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}</button>
    </div>
    <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} fitView onNodeClick={(_, node) => props.onNodeClick(node.data)} minZoom={0.25} maxZoom={2.5} proOptions={{ hideAttribution: true }}>
      <Background color="#1f2937" gap={32} size={1} /><Controls showInteractive={false} /><MiniMap nodeColor={(node) => String((node.data as FlowNodeData)?.color?.stroke || '#38bdf8')} pannable zoomable />
    </ReactFlow>
  </div>
}

export function LineageGraph(props: Props) { return <ReactFlowProvider><GraphCanvas props={props} /></ReactFlowProvider> }
