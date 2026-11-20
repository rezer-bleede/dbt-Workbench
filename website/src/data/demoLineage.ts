export const demoNodes = [
  { id: 'raw_customers', label: 'raw_customers', layer: 'Raw', x: 160, y: 135 },
  { id: 'raw_orders', label: 'raw_orders', layer: 'Raw', x: 160, y: 270 },
  { id: 'raw_payments', label: 'raw_payments', layer: 'Raw', x: 160, y: 405 },
  { id: 'stg_customers', label: 'stg_customers', layer: 'Staging', x: 525, y: 135 },
  { id: 'stg_orders', label: 'stg_orders', layer: 'Staging', x: 525, y: 270 },
  { id: 'stg_payments', label: 'stg_payments', layer: 'Staging', x: 525, y: 405 },
  { id: 'customers', label: 'customers', layer: 'Mart', x: 890, y: 205 },
  { id: 'orders', label: 'orders', layer: 'Mart', x: 890, y: 365 },
] as const;

export const demoEdges = [
  { source: 'raw_customers', target: 'stg_customers' },
  { source: 'raw_orders', target: 'stg_orders' },
  { source: 'raw_payments', target: 'stg_payments' },
  { source: 'stg_customers', target: 'customers' },
  { source: 'stg_orders', target: 'customers' },
  { source: 'stg_payments', target: 'customers' },
  { source: 'stg_orders', target: 'orders' },
  { source: 'stg_payments', target: 'orders' },
] as const;

export function downstreamModels(modelId: string): Set<string> {
  const downstream = new Set<string>();
  const pending = [modelId];

  for (let i = 0; i < pending.length; i += 1) {
    for (const edge of demoEdges) {
      if (edge.source === pending[i] && !downstream.has(edge.target)) {
        downstream.add(edge.target);
        pending.push(edge.target);
      }
    }
  }

  downstream.delete(modelId);
  return downstream;
}
