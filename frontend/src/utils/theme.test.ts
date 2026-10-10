import { describe, expect, it } from 'vitest'
import {
  ThemeMode,
  THEME_PRESETS,
  buildThemeMode,
  getDefaultThemePreference,
} from './theme'

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

describe('theme presets', () => {
  it('exposes at least one preset with unique ids', () => {
    expect(THEME_PRESETS.length).toBeGreaterThan(0)
    const ids = THEME_PRESETS.map((preset) => preset.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('builds every preset mode with no contrast violations', () => {
    THEME_PRESETS.forEach((preset) => {
      ;(['light', 'dark'] as ThemeMode[]).forEach((mode) => {
        const resolved = buildThemeMode(mode, preset.colors[mode], preset.status[mode])
        expect(resolved.validation.violations).toEqual([])
        expect(resolved.validation.isValid).toBe(true)

        FX_VARIABLE_KEYS.forEach((key) => {
          expect(resolved.variables[key]).toMatch(/^\d+\s\d+%\s\d+%$/)
        })

        resolved.validation.checks.forEach((check) => {
          expect(check.pass).toBe(true)
          expect(check.ratio).toBeGreaterThanOrEqual(check.minRatio)
        })
      })
    })
  })

  it('applies preset status colors to the emitted css variables', () => {
    THEME_PRESETS.forEach((preset) => {
      ;(['light', 'dark'] as ThemeMode[]).forEach((mode) => {
        const resolved = buildThemeMode(mode, preset.colors[mode], preset.status[mode])
        const expected = preset.status[mode]
        ;(['success', 'danger', 'warning', 'info'] as const).forEach((key) => {
          expect(resolved.variables[`--color-status-${key}`]).toBeDefined()
        })
        expect(resolved.variables['--color-status-success']).not.toBe('')
        expect(expected.success).toMatch(/^#[0-9a-f]{6}$/)
      })
    })
  })

  it('keeps default status colors when a preset overrides none', () => {
    const preset = THEME_PRESETS[0]
    const withStatus = buildThemeMode('light', preset.colors.light, preset.status.light)
    const withoutStatus = buildThemeMode('light', preset.colors.light)
    expect(withStatus.variables['--color-status-success']).not.toBe(
      withoutStatus.variables['--color-status-success'],
    )
  })
})
