import { useState } from 'react'
import { TrendingUp, TrendingDown, Minus, HelpCircle } from 'lucide-react'
import { cn } from '../../utils/cn'

export interface KPICardProps {
  title: string
  value: number | string
  subtitle?: string
  trend?: {
    value: number
    label: string
    direction: 'up' | 'down' | 'neutral'
  }
  sparkline?: number[]
  interpretationTag?: string
  interpretationColor?: 'success' | 'warning' | 'danger' | 'neutral'
  definitionTooltip?: string
  className?: string
  loading?: boolean
  error?: string
  footerNote?: string
}

const getTrendStyle = (direction: 'up' | 'down' | 'neutral') => {
  switch (direction) {
    case 'up':
      return 'bg-brand-success/10 text-brand-success border-brand-success/20'
    case 'down':
      return 'bg-brand-danger/10 text-brand-danger border-brand-danger/20'
    default:
      return 'bg-bg-tertiary text-text-tertiary border-border-primary'
  }
}

const getTrendIcon = (direction: 'up' | 'down' | 'neutral') => {
  switch (direction) {
    case 'up':
      return <TrendingUp className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
    case 'down':
      return <TrendingDown className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
    default:
      return <Minus className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
  }
}

const getSparklinePath = (data: number[]) => {
  if (data.length < 2) return ''
  const max = Math.max(...data)
  const min = Math.min(...data)
  const range = max - min || 1
  return data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * 100
      const y = 100 - ((v - min) / range) * 80
      return `${i === 0 ? 'M' : 'L'} ${x} ${y}`
    })
    .join(' ')
}

export default function KPICard({
  title,
  value,
  subtitle,
  trend,
  sparkline,
  interpretationTag,
  interpretationColor = 'neutral',
  definitionTooltip,
  className,
  loading,
  error,
  footerNote,
}: KPICardProps) {
  const [showTooltip, setShowTooltip] = useState(false)

  if (loading) {
    return (
      <div className="bg-widget-bg border border-widget-border rounded-xl p-4 shadow-2xs">
        <div className="h-4 w-28 bg-bg-tertiary animate-pulse rounded-md" />
        <div className="mt-3 h-8 w-36 bg-bg-tertiary animate-pulse rounded-md" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-widget-bg border border-widget-border rounded-xl p-4">
        <p className="text-xs font-bold text-brand-danger">Failed to load metric</p>
      </div>
    )
  }

  const tagBgColor =
    interpretationColor === 'success'
      ? 'bg-brand-success/15 text-brand-success border-brand-success/30'
      : interpretationColor === 'danger'
      ? 'bg-brand-danger/15 text-brand-danger border-brand-danger/30'
      : interpretationColor === 'warning'
      ? 'bg-brand-warning/15 text-brand-warning border-brand-warning/30'
      : 'bg-bg-tertiary text-text-secondary border-border-primary'

  return (
    <div
      className={cn(
        'bg-widget-bg border border-widget-border rounded-xl p-4 shadow-2xs transition-all hover:shadow-xs hover:border-brand-primary/30 relative flex flex-col justify-between group',
        className
      )}
    >
      <div>
        <div className="flex items-start justify-between gap-2">
          <p className="text-[11px] font-bold text-text-tertiary uppercase tracking-wider flex-1">
            {title}
          </p>
          {definitionTooltip && (
            <div className="relative">
              <button
                type="button"
                onMouseEnter={() => setShowTooltip(true)}
                onMouseLeave={() => setShowTooltip(false)}
                onClick={() => setShowTooltip(!showTooltip)}
                className="text-text-tertiary hover:text-text-primary p-0.5 rounded cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary"
                aria-label={`Definition for ${title}`}
              >
                <HelpCircle className="h-3.5 w-3.5" strokeWidth={1.75} />
              </button>
              {showTooltip && (
                <div className="absolute right-0 top-6 w-64 p-2.5 bg-widget-bg border border-widget-border rounded-lg shadow-lg z-50 text-[11px] text-text-secondary leading-relaxed">
                  <p className="font-bold text-text-primary mb-1">Definition & Scope</p>
                  <p>{definitionTooltip}</p>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="mt-2.5 flex items-baseline justify-between gap-2 flex-wrap">
          <span className="text-2xl font-bold tracking-tight text-text-primary">
            {value}
          </span>

          {interpretationTag && (
            <span
              className={cn(
                'px-2 py-0.5 rounded-full text-[10px] font-bold border uppercase tracking-wider',
                tagBgColor
              )}
            >
              {interpretationTag}
            </span>
          )}
        </div>

        {trend && (
          <div className="mt-2 flex items-center gap-1.5 text-xs font-semibold">
            <span className={cn('flex items-center gap-1 px-2 py-0.5 rounded-md border text-[11px]', getTrendStyle(trend.direction))}>
              {getTrendIcon(trend.direction)}
              <span>{trend.value >= 0 ? '+' : ''}{trend.value.toFixed(1)}%</span>
            </span>
            <span className="text-text-tertiary font-medium text-[11px]">{trend.label}</span>
          </div>
        )}

        {subtitle && <p className="text-[11px] text-text-tertiary mt-1.5">{subtitle}</p>}
      </div>

      <div className="mt-3 pt-2.5 border-t border-border-primary/40 flex items-center justify-between">
        {sparkline && sparkline.length > 1 ? (
          <div className="w-24 h-5" aria-hidden="true">
            <svg viewBox="0 0 100 30" className="w-full h-full overflow-visible" preserveAspectRatio="none">
              <path d={getSparklinePath(sparkline)} stroke="var(--color-brand-primary)" strokeWidth="1.75" fill="none" />
            </svg>
          </div>
        ) : (
          <span className="text-[10px] text-text-tertiary font-medium">{footerNote ?? 'dbt-Workbench'}</span>
        )}
      </div>
    </div>
  )
}
