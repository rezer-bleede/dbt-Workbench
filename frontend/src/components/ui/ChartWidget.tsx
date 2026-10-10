import { useMemo } from 'react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { BarChart3, PieChart as PieChartIcon, TrendingUp } from 'lucide-react'
import { cn } from '../../utils/cn'
import { useThemeStore } from '../../stores/themeStore'

export interface ChartSeries {
  key: string
  label?: string
  color?: string
}

export interface ChartWidgetProps {
  title?: string
  subtitle?: string
  data: Array<Record<string, unknown>>
  type: 'line' | 'area' | 'bar' | 'stackedBar' | 'donut'
  xKey?: string
  series?: ChartSeries[]
  height?: number
  legend?: boolean
  grid?: boolean
  loading?: boolean
  error?: string
  className?: string
}

const DEFAULT_CHART_COLORS = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
  'var(--chart-6)',
  'var(--chart-7)',
  'var(--chart-8)',
]

const tooltipStyle: React.CSSProperties = {
  backgroundColor: 'var(--chart-tooltip-bg)',
  border: '1px solid var(--color-widget-border)',
  borderRadius: 10,
  fontSize: 11,
  color: 'var(--color-text-primary)',
  boxShadow: 'var(--shadow-md)',
}

function getChartIcon(type: string) {
  switch (type) {
    case 'pie':
    case 'donut':
      return <PieChartIcon className="h-5 w-5 text-brand-primary" strokeWidth={1.75} aria-hidden="true" />
    case 'line':
    case 'area':
      return <TrendingUp className="h-5 w-5 text-brand-primary" strokeWidth={1.75} aria-hidden="true" />
    default:
      return <BarChart3 className="h-5 w-5 text-brand-primary" strokeWidth={1.75} aria-hidden="true" />
  }
}

export default function ChartWidget({
  title,
  subtitle,
  data,
  type,
  xKey = 'name',
  series = [],
  height = 240,
  legend = true,
  grid = true,
  loading,
  error,
  className,
}: ChartWidgetProps) {
  // Subscribe to theme changes so charts repaint against the active palette
  useThemeStore((s) => s.resolvedTheme)

  const colors = useMemo(
    () => series.map((s, i) => s.color ?? DEFAULT_CHART_COLORS[i % DEFAULT_CHART_COLORS.length]),
    [series]
  )

  if (loading) {
    return (
      <div className={cn('bg-widget-bg border border-widget-border rounded-xl p-4 shadow-2xs', className)}>
        <div className="h-4 w-40 bg-bg-tertiary animate-pulse rounded-md" />
        <div className="mt-4 h-[240px] bg-bg-tertiary animate-pulse rounded-lg" />
      </div>
    )
  }

  if (error) {
    return (
      <div className={cn('bg-widget-bg border border-widget-border rounded-xl p-4', className)}>
        <p className="text-xs font-bold text-brand-danger">Failed to load chart data</p>
      </div>
    )
  }

  if (!data || data.length === 0) {
    return (
      <div className={cn('bg-widget-bg border border-widget-border rounded-xl p-4', className)}>
        {title && (
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-medium text-text-primary text-sm">{title}</h3>
              {subtitle && <p className="text-xs text-text-secondary">{subtitle}</p>}
            </div>
          </div>
        )}
        <div className="flex flex-col items-center justify-center text-text-tertiary p-8" style={{ minHeight: height }}>
          {getChartIcon(type)}
          <p className="text-xs font-medium mt-2">No data available</p>
        </div>
      </div>
    )
  }

  const axisTick = { fill: 'var(--chart-axis, var(--color-text-tertiary))', fontSize: 11 }

  const header = title ? (
    <div className="flex items-center justify-between mb-4 gap-2">
      <div className="flex items-center gap-2.5 min-w-0">
        {getChartIcon(type)}
        <div className="min-w-0">
          <h3 className="font-semibold text-text-primary text-sm truncate">{title}</h3>
          {subtitle && <p className="text-[11px] text-text-tertiary truncate">{subtitle}</p>}
        </div>
      </div>
    </div>
  ) : null

  const commonTooltip = (
    <Tooltip
      contentStyle={tooltipStyle}
      labelStyle={{ color: 'var(--color-text-secondary)', fontWeight: 700 }}
      itemStyle={{ color: 'var(--color-text-secondary)', fontSize: 11 }}
    />
  )

  const renderCartesian = () => {
    const chartBody = (
      <>
        {grid && <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid, var(--color-border-primary))" />}
        <XAxis dataKey={xKey} tick={axisTick} stroke="var(--chart-axis, var(--color-text-tertiary))" tickLine={false} axisLine={{ stroke: 'var(--chart-grid, var(--color-border-primary))' }} />
        <YAxis tick={axisTick} stroke="var(--chart-axis, var(--color-text-tertiary))" tickLine={false} axisLine={{ stroke: 'var(--chart-grid, var(--color-border-primary))' }} width={36} allowDecimals={false} />
        {commonTooltip}
        {legend && <Legend wrapperStyle={{ fontSize: 11, color: 'var(--color-text-secondary)' }} iconType="circle" iconSize={8} />}
      </>
    )

    if (type === 'line') {
      return (
        <LineChart data={data} margin={{ top: 5, right: 15, left: 0, bottom: 5 }}>
          {chartBody}
          {series.map((s, i) => (
            <Line key={s.key} type="monotone" dataKey={s.key} name={s.label ?? s.key} stroke={colors[i]} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
          ))}
        </LineChart>
      )
    }

    if (type === 'area') {
      return (
        <AreaChart data={data} margin={{ top: 5, right: 15, left: 0, bottom: 5 }}>
          {chartBody}
          {series.map((s, i) => (
            <Area key={s.key} type="monotone" dataKey={s.key} name={s.label ?? s.key} stroke={colors[i]} fill={colors[i]} fillOpacity={0.15} strokeWidth={2} />
          ))}
        </AreaChart>
      )
    }

    return (
      <BarChart data={data} margin={{ top: 5, right: 15, left: 0, bottom: 5 }}>
        {chartBody}
          {series.map((s, i) => (
            <Bar key={s.key} dataKey={s.key} name={s.label ?? s.key} stackId={type === 'stackedBar' ? 'a' : undefined} fill={colors[i]} radius={type === 'stackedBar' ? 0 : ([4, 4, 0, 0] as [number, number, number, number])} maxBarSize={28} />
          ))}
      </BarChart>
    )
  }

  const renderDonut = () => {
    const valueKey = series[0]?.key ?? 'value'
    const nameKey = xKey
    return (
      <PieChart>
        <Tooltip
          contentStyle={tooltipStyle}
          itemStyle={{ color: 'var(--color-text-secondary)', fontSize: 11 }}
        />
        {legend && <Legend wrapperStyle={{ fontSize: 11, color: 'var(--color-text-secondary)' }} iconType="circle" iconSize={8} />}
        <Pie
          data={data}
          dataKey={valueKey}
          nameKey={nameKey}
          innerRadius="58%"
          outerRadius="82%"
          paddingAngle={2}
          strokeWidth={0}
        >
          {data.map((_, i) => (
            <Cell key={i} fill={DEFAULT_CHART_COLORS[i % DEFAULT_CHART_COLORS.length]} />
          ))}
        </Pie>
      </PieChart>
    )
  }

  return (
    <div className={cn('bg-widget-bg border border-widget-border rounded-xl p-4 shadow-2xs transition-all hover:shadow-xs hover:border-brand-primary/30 flex flex-col', className)}>
      {header}
      <div style={{ height }} className="min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          {type === 'donut' ? renderDonut() : renderCartesian()}
        </ResponsiveContainer>
      </div>
    </div>
  )
}
