import { useEffect } from 'react'
import { useThemeStore } from '../../stores/themeStore'

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const initialize = useThemeStore((s) => s.initialize)

  useEffect(() => {
    initialize()
  }, [initialize])

  return <>{children}</>
}
