import { describe, expect, it } from 'vitest'
import { ThemeMode, buildThemeMode, getDefaultThemePreference } from './theme'

const FX_VARIABLE_KEYS = [
  '--fx-shell-base-top',
  '--fx-shell-base-bottom',
  '--fx-shell-glow-primary',
  '--fx-shell-glow-secondary',
  '--fx-panel-top',
  '--fx-panel-mid',
  '--fx-panel-bottom',
  '--fx-panel-border-strong',
  '--fx-panel-border-soft',
]

describe('theme fx variables', () => {
  it('builds all fx variables in both light and dark modes', () => {
    const preference = getDefaultThemePreference()
    ;(['light', 'dark'] as ThemeMode[]).forEach((mode) => {
      const resolved = buildThemeMode(mode, preference[mode].colors)
      FX_VARIABLE_KEYS.forEach((key) => {
        expect(resolved.variables[key]).toBeDefined()
        expect(resolved.variables[key]).toMatch(/^\d+\s\d+%\s\d+%$/)
      })
    })
  })

  it('updates fx gradient variables when theme colors change', () => {
    const base = buildThemeMode('dark', {
      primary: '#22d3ee',
      secondary: '#38bdf8',
      background: '#0f172a',
      surface: '#111827',
      text: '#e2e8f0',
    })

    const modified = buildThemeMode('dark', {
      primary: '#f97316',
      secondary: '#fb7185',
      background: '#0f172a',
      surface: '#111827',
      text: '#e2e8f0',
    })

    expect(modified.variables['--fx-shell-glow-primary']).not.toBe(base.variables['--fx-shell-glow-primary'])
    expect(modified.variables['--fx-panel-top']).not.toBe(base.variables['--fx-panel-top'])
    expect(modified.variables['--fx-panel-border-strong']).not.toBe(base.variables['--fx-panel-border-strong'])
  })

  it('validates text_muted and status contrast ratios >= 4.5 in light and dark modes', () => {
    const preference = getDefaultThemePreference()
    ;(['light', 'dark'] as ThemeMode[]).forEach((mode) => {
      const resolved = buildThemeMode(mode, preference[mode].colors)
      expect(resolved.validation.isValid).toBe(true)
      const mutedBgCheck = resolved.validation.checks.find((c) => c.id === 'text-muted-bg')
      const mutedSurfaceCheck = resolved.validation.checks.find((c) => c.id === 'text-muted-surface')
      expect(mutedBgCheck?.pass).toBe(true)
      expect(mutedSurfaceCheck?.pass).toBe(true)
      expect(mutedBgCheck?.ratio).toBeGreaterThanOrEqual(4.5)
      expect(mutedSurfaceCheck?.ratio).toBeGreaterThanOrEqual(4.5)

      const statusChecks = resolved.validation.checks.filter((c) => c.id.startsWith('status-'))
      statusChecks.forEach((check) => {
        expect(check.pass).toBe(true)
        expect(check.ratio).toBeGreaterThanOrEqual(4.5)
      })
    })
  })
})
