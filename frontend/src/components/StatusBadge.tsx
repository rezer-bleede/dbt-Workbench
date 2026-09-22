interface StatusBadgeProps {
  status?: string
}

const statusColors: Record<string, string> = {
  success: 'bg-status-success/15 text-status-success border border-status-success/35',
  succeeded: 'bg-status-success/15 text-status-success border border-status-success/35',
  error: 'bg-status-danger/15 text-status-danger border border-status-danger/35',
  fail: 'bg-status-danger/15 text-status-danger border border-status-danger/35',
  failure: 'bg-status-danger/15 text-status-danger border border-status-danger/35',
  failed: 'bg-status-danger/15 text-status-danger border border-status-danger/35',
  running: 'bg-status-info/15 text-status-info border border-status-info/35',
  in_progress: 'bg-status-info/15 text-status-info border border-status-info/35',
  queued: 'bg-status-info/15 text-status-info border border-status-info/35',
  pending: 'bg-status-info/15 text-status-info border border-status-info/35',
  cancelled: 'bg-surface-muted text-muted border border-border',
  skipped: 'bg-surface-muted text-muted border border-border',
  active: 'bg-status-success/15 text-status-success border border-status-success/35',
  paused: 'bg-status-warning/15 text-status-warning border border-status-warning/35',
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const normalized = status?.toLowerCase() || 'unknown'
  const color = statusColors[normalized] || 'bg-slate-500/16 text-muted border border-border'
  return <span className={`px-2 py-1 rounded-full text-xs font-semibold ${color}`}>{status || 'unknown'}</span>
}
