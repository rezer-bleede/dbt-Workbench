import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

export type ThemeId =
  | 'system'
  | 'light'
  | 'dark'
  | 'midnight-marina'
  | 'burj-gold'
  | 'desert-dusk'
  | 'oasis'
  | 'aurora'
  | 'coral-reef'
  | 'harbour-blue'

export type ThemeMode = 'light' | 'dark'

export interface ThemeConfig {
  id: ThemeId
  name: string
  mode: ThemeMode | 'auto'
  description: string
  swatch: {
    bg: string
    surface: string
    accent: string
  }
}

export const THEME_LIST: ThemeConfig[] = [
  {
    id: 'system',
    name: 'System',
    mode: 'auto',
    description: 'Follows OS preference (Light or Dark)',
    swatch: {
      bg: '#f8fafc',
      surface: '#ffffff',
      accent: '#4f46e5',
    },
  },
  {
    id: 'light',
    name: 'Light',
    mode: 'light',
    description: 'Clean, crisp light dashboard theme',
    swatch: {
      bg: '#f8fafc',
      surface: '#ffffff',
      accent: '#4f46e5',
    },
  },
  {
    id: 'dark',
    name: 'Dark',
    mode: 'dark',
    description: 'Classic dark mode for low-light environments',
    swatch: {
      bg: '#0b0f19',
      surface: '#111827',
      accent: '#6366f1',
    },
  },
  {
    id: 'midnight-marina',
    name: 'Midnight Marina',
    mode: 'dark',
    description: 'Deep navy base with electric cyan & teal accents',
    swatch: {
      bg: '#030712',
      surface: '#0b1329',
      accent: '#06b6d4',
    },
  },
  {
    id: 'burj-gold',
    name: 'Burj Gold',
    mode: 'dark',
    description: 'Near-black base with luxury champagne gold accents',
    swatch: {
      bg: '#0b0b0d',
      surface: '#141417',
      accent: '#d4af37',
    },
  },
  {
    id: 'desert-dusk',
    name: 'Desert Dusk',
    mode: 'light',
    description: 'Warm sand base with terracotta & amber sunset tones',
    swatch: {
      bg: '#faf6f0',
      surface: '#fffdfa',
      accent: '#c85a32',
    },
  },
  {
    id: 'oasis',
    name: 'Oasis',
    mode: 'light',
    description: 'Fresh off-white base with emerald & mint accents',
    swatch: {
      bg: '#f4f8f6',
      surface: '#ffffff',
      accent: '#059669',
    },
  },
  {
    id: 'aurora',
    name: 'Aurora',
    mode: 'dark',
    description: 'Deep violet base with vibrant magenta & cyan gradients',
    swatch: {
      bg: '#090714',
      surface: '#120e24',
      accent: '#d946ef',
    },
  },
  {
    id: 'coral-reef',
    name: 'Coral Reef',
    mode: 'light',
    description: 'Bright airy base with coral & turquoise accents',
    swatch: {
      bg: '#f7fafc',
      surface: '#ffffff',
      accent: '#ff6b6b',
    },
  },
  {
    id: 'harbour-blue',
    name: 'Harbour Blue',
    mode: 'light',
    description: 'Zoho CRM Day mode — Honolulu-blue actions, hairline borders, four-brand chart palette',
    swatch: {
      bg: '#f5f7fa',
      surface: '#ffffff',
      accent: '#226db4',
    },
  },
]

export function getSystemThemeMode(): 'light' | 'dark' {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 'light'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function resolveTheme(themeId: ThemeId): { resolvedId: Exclude<ThemeId, 'system'>; mode: ThemeMode } {
  if (themeId === 'system') {
    const sysMode = getSystemThemeMode()
    return { resolvedId: sysMode, mode: sysMode }
  }
  const found = THEME_LIST.find((t) => t.id === themeId)
  const mode = found?.mode === 'dark' ? 'dark' : 'light'
  return { resolvedId: themeId, mode }
}

function updateMetaThemeColor(accentColor?: string) {
  if (typeof document === 'undefined') return
  const metaThemeColor = document.querySelector('meta[name="theme-color"]')
  if (metaThemeColor) {
    const color = accentColor || getComputedStyle(document.documentElement).getPropertyValue('--color-brand-primary').trim() || '#4f46e5'
    metaThemeColor.setAttribute('content', color)
  }
}

function applyThemeToDOM(themeId: ThemeId): { resolvedId: Exclude<ThemeId, 'system'>; mode: ThemeMode } {
  if (typeof document === 'undefined') return { resolvedId: 'light', mode: 'light' }
  const { resolvedId, mode } = resolveTheme(themeId)
  const root = document.documentElement
  root.setAttribute('data-theme', resolvedId)
  root.classList.toggle('dark', mode === 'dark')

  const found = THEME_LIST.find((t) => t.id === resolvedId)
  if (found) {
    updateMetaThemeColor(found.swatch.accent)
  }
  return { resolvedId, mode }
}

interface ThemeState {
  theme: ThemeId
  resolvedTheme: Exclude<ThemeId, 'system'>
  resolvedMode: ThemeMode
  setTheme: (theme: ThemeId) => void
  initialize: () => void
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      theme: 'coral-reef',
      resolvedTheme: 'coral-reef',
      resolvedMode: 'light',

      setTheme: (theme: ThemeId) => {
        const { resolvedId, mode } = applyThemeToDOM(theme)
        set({ theme, resolvedTheme: resolvedId, resolvedMode: mode })
      },

      initialize: () => {
        const { theme } = get()
        const { resolvedId, mode } = applyThemeToDOM(theme)
        set({ resolvedTheme: resolvedId, resolvedMode: mode })

        if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
          const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
          const handler = () => {
            if (get().theme === 'system') {
              const { resolvedId: sysId, mode: sysMode } = applyThemeToDOM('system')
              set({ resolvedTheme: sysId, resolvedMode: sysMode })
            }
          }
          if (typeof mediaQuery.addEventListener === 'function') {
            mediaQuery.addEventListener('change', handler)
          }
        }
      },
    }),
    {
      name: 'theme-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ theme: state.theme }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.initialize()
        }
      },
    }
  )
)
