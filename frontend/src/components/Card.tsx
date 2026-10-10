import { ReactNode } from 'react'
import { cn } from '../utils/cn'

interface CardProps {
  title: string
  children: ReactNode
  className?: string
  action?: ReactNode
}

export function Card({ title, children, className, action }: CardProps) {
  return (
    <div
      className={cn(
        'bg-widget-bg border border-widget-border rounded-xl p-4 shadow-2xs transition-all hover:shadow-xs hover:border-brand-primary/30 flex flex-col justify-between',
        className
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-bold text-text-tertiary uppercase tracking-wider flex-1">
          {title}
        </p>
        {action}
      </div>
      <div className="mt-2.5 text-2xl font-bold tracking-tight text-text-primary">{children}</div>
    </div>
  )
}
