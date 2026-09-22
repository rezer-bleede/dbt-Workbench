import { Handle, Position, type NodeProps } from '@xyflow/react'
import type { FlowNode } from '../utils/lineageLayout'

export function LineageNode({ data }: NodeProps<FlowNode>) {
  const collapsed = data.isGroup || data.isSubtree
  return (
    <div className="relative h-[84px] w-[190px] rounded-xl px-4 py-3 text-white shadow-lg transition-opacity" style={{ background: data.color.fill, border: `1.75px ${collapsed ? 'dashed' : 'solid'} ${data.color.stroke}`, opacity: data.faded ? 0.35 : 1 }} title={data.label} data-node-id={data.id} data-testid={`lineage-node-${data.id}`}>
      <Handle type="target" position={Position.Left} className="!h-2 !w-2 !border-0 !bg-primary" />
      <div className="line-clamp-2 text-sm font-bold leading-4 drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)] text-white">{data.label}</div>
      {data.schema && <div className="mt-2 truncate text-[11px] font-medium text-slate-100 drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)]">{data.schema}</div>}
      <div className="truncate text-[10px] uppercase font-semibold text-slate-200 drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)]">{data.type}</div>
      <Handle type="source" position={Position.Right} className="!h-2 !w-2 !border-0 !bg-primary" />
    </div>
  )
}
