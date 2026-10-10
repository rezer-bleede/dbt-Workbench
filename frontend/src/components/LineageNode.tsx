import { Handle, Position, type NodeProps } from '@xyflow/react'
import type { FlowNode } from '../utils/lineageLayout'

export function LineageNode({ data }: NodeProps<FlowNode>) {
  const collapsed = data.isGroup || data.isSubtree
  return (
    <div className="relative h-[84px] w-[190px] rounded-xl px-4 py-3 text-text-primary shadow-sm transition-opacity" style={{ background: data.color.fill, border: `1.75px ${collapsed ? 'dashed' : 'solid'} ${data.color.stroke}`, opacity: data.faded ? 0.35 : 1 }} title={data.label} data-node-id={data.id} data-testid={`lineage-node-${data.id}`}>
      <Handle type="target" position={Position.Left} className="!h-2 !w-2 !border-0 !bg-brand-primary" />
      <div className="line-clamp-2 text-sm font-bold leading-4 text-text-primary">{data.label}</div>
      {data.schema && <div className="mt-2 truncate text-[11px] font-medium text-text-secondary">{data.schema}</div>}
      <div className="truncate text-[10px] uppercase font-semibold tracking-wider text-text-tertiary">{data.type}</div>
      <Handle type="source" position={Position.Right} className="!h-2 !w-2 !border-0 !bg-brand-primary" />
    </div>
  )
}
