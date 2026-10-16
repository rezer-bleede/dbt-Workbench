import React, { useEffect, useState } from 'react'

const THEMES = [
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
  { id: 'midnight-marina', label: 'Midnight Marina' },
  { id: 'burj-gold', label: 'Burj Gold' },
  { id: 'desert-dusk', label: 'Desert Dusk' },
  { id: 'oasis', label: 'Oasis' },
  { id: 'harbour-blue', label: 'Harbour Blue' },
  { id: 'aurora', label: 'Aurora' },
  { id: 'coral-reef', label: 'Coral Reef' },
]

export default function ThemePicker() {
  const [theme, setTheme] = useState('light')
  useEffect(() => {
    if (typeof window === 'undefined') return
    const stored = localStorage.getItem('docs-theme') || 'light'
    setTheme(stored)
    document.documentElement.setAttribute('data-theme', stored)
  }, [])
  const change = (next: string) => {
    setTheme(next)
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-theme', next)
    }
    try {
      localStorage.setItem('docs-theme', next)
    } catch {}
  }
  return (
    <div
      style={{
        position: 'fixed',
        bottom: 16,
        right: 16,
        zIndex: 10000,
        background: 'var(--color-widget-bg)',
        border: '1px solid var(--color-widget-border)',
        borderRadius: 10,
        padding: '4px 8px',
        boxShadow: 'var(--shadow-md)',
      }}
    >
      <select
        aria-label="Theme"
        value={theme}
        onChange={(e) => change(e.target.value)}
        style={{
          background: 'transparent',
          border: 'none',
          color: 'var(--color-text-primary)',
          fontSize: 12,
          fontWeight: 600,
          cursor: 'pointer',
          outline: 'none',
        }}
      >
        {THEMES.map((t) => (
          <option key={t.id} value={t.id}>
            {t.label}
          </option>
        ))}
      </select>
    </div>
  )
}
