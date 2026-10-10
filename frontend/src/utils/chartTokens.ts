import { useMemo } from 'react'
import { useThemeStore } from '../stores/themeStore'

export interface ChartPalette {
  colors: string[]
  grid: string
  axis: string
  widgetBg: string
  bgSecondary: string
  bgTertiary: string
  borderPrimary: string
  borderSecondary: string
}

const FALLBACK: ChartPalette = {
  colors: ['#4f46e5', '#0284c7', '#059669', '#d97706', '#dc2626', '#9333ea', '#db2777', '#0891b2'],
  grid: '#e2e8f0',
  axis: '#64748b',
  widgetBg: '#ffffff',
  bgSecondary: '#ffffff',
  bgTertiary: '#f1f5f9',
  borderPrimary: '#e2e8f0',
  borderSecondary: '#cbd5e1',
}

const read = (value: string, fallback: string) => {
  const v = value.trim()
  return v.length > 0 ? v : fallback
}

/**
 * Resolves the theme CSS variables to concrete values so SVG/attribute-based
 * renderers (xyflow backgrounds, minimaps, edge markers) follow the active
 * Property-Intelligence theme. Re-renders whenever the theme changes.
 */
export function useChartPalette(): ChartPalette {
  const resolvedTheme = useThemeStore((s) => s.resolvedTheme)

  return useMemo(() => {
    if (typeof document === 'undefined') return FALLBACK
    try {
      const cs = getComputedStyle(document.documentElement)
      const v = (name: string, fallback: string) => read(cs.getPropertyValue(name), fallback)
      return {
        colors: [
          v('--chart-1', FALLBACK.colors[0]),
          v('--chart-2', FALLBACK.colors[1]),
          v('--chart-3', FALLBACK.colors[2]),
          v('--chart-4', FALLBACK.colors[3]),
          v('--chart-5', FALLBACK.colors[4]),
          v('--chart-6', FALLBACK.colors[5]),
          v('--chart-7', FALLBACK.colors[6]),
          v('--chart-8', FALLBACK.colors[7]),
        ],
        grid: v('--chart-grid', FALLBACK.grid),
        axis: v('--chart-axis', FALLBACK.axis),
        widgetBg: v('--color-widget-bg', FALLBACK.widgetBg),
        bgSecondary: v('--color-bg-secondary', FALLBACK.bgSecondary),
        bgTertiary: v('--color-bg-tertiary', FALLBACK.bgTertiary),
        borderPrimary: v('--color-border-primary', FALLBACK.borderPrimary),
        borderSecondary: v('--color-border-secondary', FALLBACK.borderSecondary),
      }
    } catch {
      return FALLBACK
    }
  }, [resolvedTheme])
}
