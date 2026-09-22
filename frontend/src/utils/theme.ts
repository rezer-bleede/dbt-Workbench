export type ThemeMode = 'light' | 'dark'

export type ThemeColorKey = 'primary' | 'secondary' | 'background' | 'surface' | 'text'

export interface ThemeColors {
  primary: string
  secondary: string
  background: string
  surface: string
  text: string
}

export interface ThemeDerived {
  primary_hover: string
  primary_active: string
  primary_foreground: string
  secondary_hover: string
  secondary_active: string
  secondary_foreground: string
  text_muted: string
  bg_muted: string
  surface_muted: string
  border: string
  ring: string
}

export interface ThemeModeConfig {
  colors: ThemeColors
  derived: ThemeDerived
}

export interface ThemePreference {
  version: number
  light: ThemeModeConfig
  dark: ThemeModeConfig
}

export interface ContrastCheck {
  id: string
  label: string
  ratio: number
  minRatio: number
  pass: boolean
  foreground: string
  background: string
}

export interface AdjustmentNotice {
  key: ThemeColorKey
  from: string
  to: string
  reason: string
}

export interface ThemeValidation {
  isValid: boolean
  checks: ContrastCheck[]
  violations: ContrastCheck[]
  adjustments: AdjustmentNotice[]
}

export interface ThemeResolved {
  mode: ThemeMode
  colors: ThemeColors
  derived: ThemeDerived
  variables: Record<string, string>
  validation: ThemeValidation
}

const HEX_PATTERN = /^#([0-9a-fA-F]{6})$/
const SHORT_HEX_PATTERN = /^#?([0-9a-fA-F]{3})$/

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

export const normalizeHexColor = (value: string, fallback: string) => {
  const raw = value.trim()
  if (HEX_PATTERN.test(raw)) {
    return raw.toLowerCase()
  }
  const short = raw.replace(/^#/, '')
  if (SHORT_HEX_PATTERN.test(raw)) {
    const expanded = short.split('').map((c) => `${c}${c}`).join('')
    return `#${expanded.toLowerCase()}`
  }
  return fallback
}

const hexToRgb = (hex: string) => {
  const normalized = normalizeHexColor(hex, '#000000').replace('#', '')
  const r = parseInt(normalized.slice(0, 2), 16)
  const g = parseInt(normalized.slice(2, 4), 16)
  const b = parseInt(normalized.slice(4, 6), 16)
  return { r, g, b }
}

const rgbToHex = (r: number, g: number, b: number) => {
  const toHex = (v: number) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

const mixHex = (base: string, tint: string, tintWeight: number) => {
  const weight = clamp(tintWeight, 0, 1)
  const baseRgb = hexToRgb(base)
  const tintRgb = hexToRgb(tint)
  return rgbToHex(
    baseRgb.r + (tintRgb.r - baseRgb.r) * weight,
    baseRgb.g + (tintRgb.g - baseRgb.g) * weight,
    baseRgb.b + (tintRgb.b - baseRgb.b) * weight,
  )
}

const rgbToHsl = (r: number, g: number, b: number) => {
  const rNorm = r / 255
  const gNorm = g / 255
  const bNorm = b / 255
  const max = Math.max(rNorm, gNorm, bNorm)
  const min = Math.min(rNorm, gNorm, bNorm)
  const delta = max - min

  let h = 0
  let s = 0
  const l = (max + min) / 2

  if (delta !== 0) {
    s = delta / (1 - Math.abs(2 * l - 1))
    switch (max) {
      case rNorm:
        h = ((gNorm - bNorm) / delta) % 6
        break
      case gNorm:
        h = (bNorm - rNorm) / delta + 2
        break
      default:
        h = (rNorm - gNorm) / delta + 4
        break
    }
    h *= 60
    if (h < 0) h += 360
  }

  return {
    h: Math.round(h),
    s: Math.round(s * 100),
    l: Math.round(l * 100),
  }
}

const hslToRgb = (h: number, s: number, l: number) => {
  const sNorm = s / 100
  const lNorm = l / 100
  const c = (1 - Math.abs(2 * lNorm - 1)) * sNorm
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = lNorm - c / 2

  let r = 0
  let g = 0
  let b = 0

  if (h >= 0 && h < 60) {
    r = c
    g = x
  } else if (h >= 60 && h < 120) {
    r = x
    g = c
  } else if (h >= 120 && h < 180) {
    g = c
    b = x
  } else if (h >= 180 && h < 240) {
    g = x
    b = c
  } else if (h >= 240 && h < 300) {
    r = x
    b = c
  } else {
    r = c
    b = x
  }

  return {
    r: Math.round((r + m) * 255),
    g: Math.round((g + m) * 255),
    b: Math.round((b + m) * 255),
  }
}

const hslToHex = (h: number, s: number, l: number) => {
  const rgb = hslToRgb(h, s, l)
  return rgbToHex(rgb.r, rgb.g, rgb.b)
}

const hslToCss = (h: number, s: number, l: number) => `${Math.round(h)} ${Math.round(s)}% ${Math.round(l)}%`

export const hexToHsl = (hex: string) => {
  const rgb = hexToRgb(hex)
  return rgbToHsl(rgb.r, rgb.g, rgb.b)
}

export const toHexFromHsl = (h: number, s: number, l: number) => hslToHex(h, s, l)

const relativeLuminance = (r: number, g: number, b: number) => {
  const toLinear = (value: number) => {
    const channel = value / 255
    return channel <= 0.03928 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4)
  }
  const rLin = toLinear(r)
  const gLin = toLinear(g)
  const bLin = toLinear(b)
  return 0.2126 * rLin + 0.7152 * gLin + 0.0722 * bLin
}

export const contrastRatio = (hexA: string, hexB: string) => {
  const rgbA = hexToRgb(hexA)
  const rgbB = hexToRgb(hexB)
  const lumA = relativeLuminance(rgbA.r, rgbA.g, rgbA.b)
  const lumB = relativeLuminance(rgbB.r, rgbB.g, rgbB.b)
  const lighter = Math.max(lumA, lumB)
  const darker = Math.min(lumA, lumB)
  return (lighter + 0.05) / (darker + 0.05)
}

const findLightnessForContrast = (
  h: number,
  s: number,
  originalL: number,
  backgrounds: string[],
  minRatio: number,
) => {
  const candidates: number[] = []
  for (let l = 0; l <= 100; l += 1) {
    const hex = hslToHex(h, s, l)
    const passes = backgrounds.every((bg) => contrastRatio(hex, bg) >= minRatio)
    if (passes) candidates.push(l)
  }
  if (!candidates.length) {
    return { l: originalL, valid: false }
  }
  let best = candidates[0]
  let bestDelta = Math.abs(best - originalL)
  candidates.forEach((candidate) => {
    const delta = Math.abs(candidate - originalL)
    if (delta < bestDelta) {
      best = candidate
      bestDelta = delta
    }
  })
  return { l: best, valid: true }
}

const adjustColorForContrast = (
  hex: string,
  backgrounds: string[],
  minRatio: number,
) => {
  const hsl = hexToHsl(hex)
  const result = findLightnessForContrast(hsl.h, hsl.s, hsl.l, backgrounds, minRatio)
  const adjustedHex = hslToHex(hsl.h, hsl.s, result.l)
  const ratio = Math.min(...backgrounds.map((bg) => contrastRatio(adjustedHex, bg)))
  return {
    color: adjustedHex,
    changed: adjustedHex.toLowerCase() !== hex.toLowerCase(),
    valid: result.valid && ratio >= minRatio,
    ratio,
  }
}

const shiftLightness = (hex: string, delta: number) => {
  const hsl = hexToHsl(hex)
  return hslToHex(hsl.h, hsl.s, clamp(hsl.l + delta, 0, 100))
}

const buildScale = (hex: string) => {
  const hsl = hexToHsl(hex)
  const deltas: Record<string, number> = {
    50: 44,
    100: 34,
    200: 24,
    300: 14,
    400: 6,
    500: 0,
    600: -6,
    700: -14,
    800: -22,
    900: -30,
    950: -38,
  }
  const scale: Record<string, string> = {}
  Object.entries(deltas).forEach(([key, delta]) => {
    scale[key] = hslToHex(hsl.h, hsl.s, clamp(hsl.l + delta, 2, 98))
  })
  return scale
}

const buildNeutralScale = (hex: string, mode: ThemeMode) => {
  const hsl = hexToHsl(hex)
  const saturation = mode === 'dark' ? 10 : 8
  const lightnessScale = mode === 'dark'
    ? { 50: 96, 100: 90, 200: 82, 300: 72, 400: 60, 500: 48, 600: 36, 700: 26, 800: 18, 900: 12, 950: 7 }
    : { 50: 98, 100: 95, 200: 90, 300: 82, 400: 72, 500: 60, 600: 48, 700: 36, 800: 24, 900: 14, 950: 8 }
  const scale: Record<string, string> = {}
  Object.entries(lightnessScale).forEach(([key, l]) => {
    scale[key] = hslToHex(hsl.h, saturation, l)
  })
  return scale
}

const pickForeground = (background: string) => {
  const white = '#ffffff'
  const black = '#0b0b0b'
  const whiteRatio = contrastRatio(white, background)
  const blackRatio = contrastRatio(black, background)
  if (whiteRatio >= 4.5 || whiteRatio >= blackRatio) {
    return white
  }
  return black
}

export const getPreferredColorScheme = (): ThemeMode => {
  if (typeof window === 'undefined') return 'dark'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

const DEFAULT_LIGHT_COLORS: ThemeColors = {
  primary: '#0ea5e9',
  secondary: '#22d3ee',
  background: '#f8fafc',
  surface: '#ffffff',
  text: '#0f172a',
}

const DEFAULT_DARK_COLORS: ThemeColors = {
  primary: '#22d3ee',
  secondary: '#38bdf8',
  background: '#0f172a',
  surface: '#111827',
  text: '#e2e8f0',
}

export const buildThemeMode = (mode: ThemeMode, input: ThemeColors): ThemeResolved => {
  const fallback = mode === 'dark' ? DEFAULT_DARK_COLORS : DEFAULT_LIGHT_COLORS
  const normalized: ThemeColors = {
    primary: normalizeHexColor(input.primary, fallback.primary),
    secondary: normalizeHexColor(input.secondary, fallback.secondary),
    background: normalizeHexColor(input.background, fallback.background),
    surface: normalizeHexColor(input.surface, fallback.surface),
    text: normalizeHexColor(input.text, fallback.text),
  }

  const adjustments: AdjustmentNotice[] = []

  const textAdjusted = adjustColorForContrast(
    normalized.text,
    [normalized.background, normalized.surface],
    4.5,
  )
  if (textAdjusted.changed) {
    adjustments.push({
      key: 'text',
      from: normalized.text,
      to: textAdjusted.color,
      reason: 'Adjusted text color to meet 4.5:1 contrast with background and surface.',
    })
  }

  const primaryAdjusted = adjustColorForContrast(
    normalized.primary,
    [normalized.background, normalized.surface],
    3,
  )
  if (primaryAdjusted.changed) {
    adjustments.push({
      key: 'primary',
      from: normalized.primary,
      to: primaryAdjusted.color,
      reason: 'Adjusted primary color to meet 3:1 contrast with background and surface.',
    })
  }

  const secondaryAdjusted = adjustColorForContrast(
    normalized.secondary,
    [normalized.background, normalized.surface],
    3,
  )
  if (secondaryAdjusted.changed) {
    adjustments.push({
      key: 'secondary',
      from: normalized.secondary,
      to: secondaryAdjusted.color,
      reason: 'Adjusted secondary color to meet 3:1 contrast with background and surface.',
    })
  }

  const colors: ThemeColors = {
    background: normalized.background,
    surface: normalized.surface,
    text: textAdjusted.color,
    primary: primaryAdjusted.color,
    secondary: secondaryAdjusted.color,
  }

  const hoverDelta = mode === 'dark' ? 8 : -8
  const activeDelta = mode === 'dark' ? 14 : -14

  let primaryHover = shiftLightness(colors.primary, hoverDelta)
  primaryHover = adjustColorForContrast(primaryHover, [colors.background, colors.surface], 3).color
  let primaryActive = shiftLightness(colors.primary, activeDelta)
  primaryActive = adjustColorForContrast(primaryActive, [colors.background, colors.surface], 3).color

  let secondaryHover = shiftLightness(colors.secondary, hoverDelta)
  secondaryHover = adjustColorForContrast(secondaryHover, [colors.background, colors.surface], 3).color
  let secondaryActive = shiftLightness(colors.secondary, activeDelta)
  secondaryActive = adjustColorForContrast(secondaryActive, [colors.background, colors.surface], 3).color

  const initialTextMuted = shiftLightness(colors.text, mode === 'dark' ? -20 : 20)
  const textMuted = adjustColorForContrast(initialTextMuted, [colors.background, colors.surface], 4.5).color

  const bgMuted = shiftLightness(colors.background, mode === 'dark' ? 4 : -4)
  const surfaceMuted = shiftLightness(colors.surface, mode === 'dark' ? 4 : -4)
  const border = shiftLightness(colors.surface, mode === 'dark' ? 12 : -12)
  const ring = shiftLightness(colors.primary, mode === 'dark' ? 10 : -10)

  const derived: ThemeDerived = {
    primary_hover: primaryHover,
    primary_active: primaryActive,
    primary_foreground: pickForeground(colors.primary),
    secondary_hover: secondaryHover,
    secondary_active: secondaryActive,
    secondary_foreground: pickForeground(colors.secondary),
    text_muted: textMuted,
    bg_muted: bgMuted,
    surface_muted: surfaceMuted,
    border,
    ring,
  }

  // Define theme-safe high-contrast status colors (passing 4.5:1 against surface/background)
  const successColor = mode === 'dark' ? '#4ade80' : '#15803d' // emerald-400 in dark, emerald-700 in light
  const dangerColor = mode === 'dark' ? '#f87171' : '#b91c1c'  // red-400 in dark, red-700 in light
  const warningColor = mode === 'dark' ? '#fbbf24' : '#b45309' // amber-400 in dark, amber-700 in light
  const infoColor = mode === 'dark' ? '#38bdf8' : '#0369a1'    // sky-400 in dark, sky-700 in light

  const checks: ContrastCheck[] = []
  const pushCheck = (id: string, label: string, foreground: string, background: string, minRatio: number) => {
    const ratio = contrastRatio(foreground, background)
    checks.push({
      id,
      label,
      ratio,
      minRatio,
      pass: ratio >= minRatio,
      foreground,
      background,
    })
  }

  pushCheck('text-bg', 'Text on background', colors.text, colors.background, 4.5)
  pushCheck('text-surface', 'Text on surface', colors.text, colors.surface, 4.5)
  pushCheck('text-muted-bg', 'Muted text on background', derived.text_muted, colors.background, 4.5)
  pushCheck('text-muted-surface', 'Muted text on surface', derived.text_muted, colors.surface, 4.5)
  pushCheck('primary-bg', 'Primary on background', colors.primary, colors.background, 3)
  pushCheck('primary-surface', 'Primary on surface', colors.primary, colors.surface, 3)
  pushCheck('secondary-bg', 'Secondary on background', colors.secondary, colors.background, 3)
  pushCheck('secondary-surface', 'Secondary on surface', colors.secondary, colors.surface, 3)
  pushCheck('primary-foreground', 'Primary text', derived.primary_foreground, colors.primary, 4.5)
  pushCheck('secondary-foreground', 'Secondary text', derived.secondary_foreground, colors.secondary, 4.5)
  pushCheck('status-success-bg', 'Success status on background', successColor, colors.background, 4.5)
  pushCheck('status-danger-bg', 'Danger status on background', dangerColor, colors.background, 4.5)
  pushCheck('status-warning-bg', 'Warning status on background', warningColor, colors.background, 4.5)
  pushCheck('status-info-bg', 'Info status on background', infoColor, colors.background, 4.5)

  const violations = checks.filter((check) => !check.pass)

  const neutralScale = buildNeutralScale(colors.background, mode)
  const primaryScale = buildScale(colors.primary)
  const secondaryScale = buildScale(colors.secondary)

  const shellBaseTop = mixHex(colors.background, colors.primary, mode === 'dark' ? 0.16 : 0.06)
  const shellBaseBottom = mixHex(colors.background, colors.secondary, mode === 'dark' ? 0.09 : 0.04)
  const shellGlowPrimary = mixHex(colors.primary, colors.surface, mode === 'dark' ? 0.08 : 0.2)
  const shellGlowSecondary = mixHex(colors.secondary, colors.surface, mode === 'dark' ? 0.08 : 0.2)
  const panelTop = mixHex(colors.surface, colors.primary, mode === 'dark' ? 0.14 : 0.06)
  const panelMid = colors.surface
  const panelBottom = mixHex(colors.surface, colors.secondary, mode === 'dark' ? 0.08 : 0.04)
  const panelBorderStrong = mixHex(derived.border, colors.primary, mode === 'dark' ? 0.42 : 0.24)
  const panelBorderSoft = mixHex(derived.border, colors.surface, mode === 'dark' ? 0.18 : 0.1)

  const toCss = (hex: string) => {
    const { h, s, l } = hexToHsl(hex)
    return hslToCss(h, s, l)
  }

  const variables: Record<string, string> = {
    '--color-primary': toCss(colors.primary),
    '--color-primary-hover': toCss(derived.primary_hover),
    '--color-primary-active': toCss(derived.primary_active),
    '--color-primary-foreground': toCss(derived.primary_foreground),
    '--color-secondary': toCss(colors.secondary),
    '--color-secondary-hover': toCss(derived.secondary_hover),
    '--color-secondary-active': toCss(derived.secondary_active),
    '--color-secondary-foreground': toCss(derived.secondary_foreground),
    '--color-accent': toCss(colors.secondary),
    '--color-bg': toCss(colors.background),
    '--color-bg-muted': toCss(derived.bg_muted),
    '--color-surface': toCss(colors.surface),
    '--color-surface-muted': toCss(derived.surface_muted),
    '--color-panel': toCss(colors.surface),
    '--color-text': toCss(colors.text),
    '--color-text-muted': toCss(derived.text_muted),
    '--color-border': toCss(derived.border),
    '--color-ring': toCss(derived.ring),
    '--color-status-success': toCss(successColor),
    '--color-status-danger': toCss(dangerColor),
    '--color-status-warning': toCss(warningColor),
    '--color-status-info': toCss(infoColor),
    '--fx-shell-base-top': toCss(shellBaseTop),
    '--fx-shell-base-bottom': toCss(shellBaseBottom),
    '--fx-shell-glow-primary': toCss(shellGlowPrimary),
    '--fx-shell-glow-secondary': toCss(shellGlowSecondary),
    '--fx-panel-top': toCss(panelTop),
    '--fx-panel-mid': toCss(panelMid),
    '--fx-panel-bottom': toCss(panelBottom),
    '--fx-panel-border-strong': toCss(panelBorderStrong),
    '--fx-panel-border-soft': toCss(panelBorderSoft),
  }

  Object.entries(neutralScale).forEach(([key, value]) => {
    variables[`--color-neutral-${key}`] = toCss(value)
  })

  Object.entries(primaryScale).forEach(([key, value]) => {
    variables[`--color-primary-${key}`] = toCss(value)
  })

  Object.entries(secondaryScale).forEach(([key, value]) => {
    variables[`--color-secondary-${key}`] = toCss(value)
  })

  return {
    mode,
    colors,
    derived,
    variables,
    validation: {
      isValid: violations.length === 0,
      checks,
      violations,
      adjustments,
    },
  }
}

export const getDefaultThemePreference = (): ThemePreference => {
  const light = buildThemeMode('light', DEFAULT_LIGHT_COLORS)
  const dark = buildThemeMode('dark', DEFAULT_DARK_COLORS)
  return {
    version: 1,
    light: { colors: light.colors, derived: light.derived },
    dark: { colors: dark.colors, derived: dark.derived },
  }
}

export const applyThemeVariables = (definition: ThemeResolved) => {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  Object.entries(definition.variables).forEach(([key, value]) => {
    root.style.setProperty(key, value)
  })
  root.style.colorScheme = definition.mode
}

export const ensureThemePreference = (preference: ThemePreference | null): ThemePreference => {
  if (!preference) return getDefaultThemePreference()
  return preference
}
