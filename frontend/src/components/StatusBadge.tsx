interface StatusBadgeProps {
  status?: string
}

const statusColors: Record<string, string> = {
  success: 'bg-green-600/20 text-green-300',
  succeeded: 'bg-green-600/20 text-green-300',
  error: 'bg-red-600/20 text-red-300',
  fail: 'bg-red-600/20 text-red-300',
  failed: 'bg-red-600/20 text-red-300',
  running: 'bg-yellow-600/20 text-yellow-200',
  queued: 'bg-blue-600/20 text-blue-200',
  cancelled: 'bg-gray-600/20 text-gray-300',
  skipped: 'bg-gray-600/20 text-gray-300',
  active: 'bg-green-600/20 text-green-300',
  paused: 'bg-yellow-600/20 text-yellow-200',
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const normalized = status?.toLowerCase() || 'unknown'
  const color = statusColors[normalized] || 'bg-gray-700 text-gray-200'
  return <span className={`px-2 py-1 rounded-full text-xs font-semibold ${color}`}>{status || 'unknown'}</span>
}
