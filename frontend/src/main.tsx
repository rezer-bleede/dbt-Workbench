import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './index.css'
import { AuthProvider } from './context/AuthContext'
import { ThemeProvider } from './context/ThemeContext'
import { applyThemeVariables, buildThemeMode, getDefaultThemePreference, getPreferredColorScheme, getThemePreset } from './utils/theme'
import { loadStoredTheme, loadStoredThemePresetId } from './storage/themeStorage'

const preferredMode = getPreferredColorScheme()
const storedTheme = loadStoredTheme()
const initialPreference = storedTheme ?? getDefaultThemePreference()
const initialPreset = getThemePreset(loadStoredThemePresetId())
applyThemeVariables(buildThemeMode(preferredMode, initialPreference[preferredMode].colors, initialPreset?.status[preferredMode]))

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <ThemeProvider>
          <App />
        </ThemeProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
)
