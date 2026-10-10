import { ThemePreference } from '../utils/theme'

const baseKey = 'dbt_workbench_theme'

const getStorageKey = (userId?: number | null) => {
  if (userId == null) return baseKey
  return `${baseKey}_${userId}`
}

const getPresetKey = (userId?: number | null) => `${getStorageKey(userId)}_preset`

export type StoredTheme = ThemePreference

export const loadStoredTheme = (userId?: number | null): StoredTheme | null => {
  try {
    const raw = window.localStorage.getItem(getStorageKey(userId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as StoredTheme
    if (!parsed?.light?.colors || !parsed?.dark?.colors) return null
    return parsed
  } catch {
    return null
  }
}

export const storeTheme = (theme: StoredTheme, userId?: number | null) => {
  try {
    window.localStorage.setItem(getStorageKey(userId), JSON.stringify(theme))
  } catch {
    // ignore storage errors
  }
}

export const clearStoredTheme = (userId?: number | null) => {
  try {
    window.localStorage.removeItem(getStorageKey(userId))
    window.localStorage.removeItem(getPresetKey(userId))
  } catch {
    // ignore
  }
}

export const loadStoredThemePresetId = (userId?: number | null): string | null => {
  try {
    return window.localStorage.getItem(getPresetKey(userId))
  } catch {
    return null
  }
}

export const storeThemePresetId = (presetId: string | null, userId?: number | null) => {
  try {
    if (presetId) {
      window.localStorage.setItem(getPresetKey(userId), presetId)
    } else {
      window.localStorage.removeItem(getPresetKey(userId))
    }
  } catch {
    // ignore
  }
}
