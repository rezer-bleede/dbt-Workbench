const STORAGE_KEY = 'dbt_workbench_workspace'

export function storeWorkspaceId(id: number | null) {
  try {
    if (id == null) {
      window.localStorage.removeItem(STORAGE_KEY)
      return
    }
    window.localStorage.setItem(STORAGE_KEY, String(id))
  } catch {
    // ignore storage issues
  }
}

export function loadWorkspaceId(): number | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = Number(raw)
    return Number.isFinite(parsed) ? parsed : null
  } catch {
    return null
  }
}

export { STORAGE_KEY as WORKSPACE_STORAGE_KEY }
