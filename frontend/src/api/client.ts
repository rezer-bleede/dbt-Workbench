import axios from 'axios'

const apiBase =
  (import.meta.env?.VITE_API_BASE_URL) || (import.meta.env as any)?.VITE_API_BASE_URL || 'http://localhost:8000'

export const api = axios.create({
  baseURL: apiBase,
})

api.interceptors.request.use((config) => {
  try {
    const storedRaw = window.localStorage.getItem('dbt_workbench_auth')
    if (!storedRaw) return config
    const stored = JSON.parse(storedRaw)
    const token = stored?.accessToken
    if (token) {
      config.headers = {
        ...config.headers,
        Authorization: `Bearer ${token}`,
      }
    }
  } catch {
    // ignore storage errors
  }
  return config
})
