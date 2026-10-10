import { beforeEach, describe, expect, it } from 'vitest'
import { useThemeStore, THEME_LIST, resolveTheme } from './themeStore'

describe('themeStore', () => {
  beforeEach(() => {
    document.documentElement.removeAttribute('data-theme')
    document.documentElement.classList.remove('dark')
    localStorage.clear()
    useThemeStore.setState({ theme: 'system', resolvedTheme: 'light', resolvedMode: 'light' })
  })

  it('lists the Property Intelligence theme gallery', () => {
    const ids = THEME_LIST.map((t) => t.id)
    expect(ids).toEqual(
      expect.arrayContaining([
        'system',
        'light',
        'dark',
        'midnight-marina',
        'burj-gold',
        'desert-dusk',
        'oasis',
        'aurora',
        'coral-reef',
        'harbour-blue',
      ])
    )
  })

  it('applies data-theme and .dark class for dark presets', () => {
    useThemeStore.getState().setTheme('dark')

    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(useThemeStore.getState().resolvedMode).toBe('dark')
  })

  it('supports named dark presets like burj-gold', () => {
    useThemeStore.getState().setTheme('burj-gold')

    expect(document.documentElement.getAttribute('data-theme')).toBe('burj-gold')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(useThemeStore.getState().resolvedTheme).toBe('burj-gold')
  })

  it('light presets do not toggle the .dark class', () => {
    useThemeStore.getState().setTheme('harbour-blue')

    expect(document.documentElement.getAttribute('data-theme')).toBe('harbour-blue')
    expect(document.documentElement.classList.contains('dark')).toBe(false)
    expect(useThemeStore.getState().resolvedMode).toBe('light')
  })

  it('defaults new users to coral-reef', () => {
    const fresh = useThemeStore.getInitialState()
    expect(fresh.theme).toBe('coral-reef')
    expect(fresh.resolvedTheme).toBe('coral-reef')
    expect(fresh.resolvedMode).toBe('light')
  })

  it('system resolves to light in jsdom (no matchMedia)', () => {
    useThemeStore.getState().setTheme('system')

    expect(resolveTheme('system')).toEqual({ resolvedId: 'light', mode: 'light' })
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })

  it('persists the selected theme to localStorage', () => {
    useThemeStore.getState().setTheme('oasis')

    const raw = localStorage.getItem('theme-storage')
    expect(raw).toBeTruthy()
    expect(JSON.parse(raw!).state.theme).toBe('oasis')
  })
})
