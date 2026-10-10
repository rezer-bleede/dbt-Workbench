import { useEffect, useCallback } from 'react'
import { useSidebarStore } from '../../stores/sidebarStore'

export default function KeyboardShortcuts() {
  const toggleSidebar = useSidebarStore((s) => s.toggle)

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const target = e.target as HTMLElement
    const isInput =
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement ||
      target?.isContentEditable

    if ((e.metaKey || e.ctrlKey) && e.key === 'b') {
      e.preventDefault()
      toggleSidebar()
      return
    }

    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault()
      const input = document.querySelector('input[type="search"]') as HTMLInputElement
      input?.focus()
      return
    }

    if (isInput) return

    switch (e.key) {
      case '/':
        e.preventDefault()
        {
          const search = document.querySelector('input[type="search"]') as HTMLInputElement
          search?.focus()
        }
        break
      case 'Escape':
        if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
        break
    }
  }, [toggleSidebar])

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  return null
}
