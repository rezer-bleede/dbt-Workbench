import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

export interface WorkspaceTab {
  id: string
  title: string
  path: string
  icon?: string
  closable: boolean
}

interface TabState {
  tabs: WorkspaceTab[]
  activeTabId: string | null
  addTab: (tab: Omit<WorkspaceTab, 'id'> & { id?: string }) => string
  closeTab: (id: string) => void
  setActiveTab: (id: string) => void
  reorderTabs: (fromIndex: number, toIndex: number) => void
  updateTab: (id: string, updates: Partial<WorkspaceTab>) => void
  closeOtherTabs: (id: string) => void
  closeTabsToRight: (id: string) => void
  getActiveTab: () => WorkspaceTab | undefined
}

const MAX_TABS = 10

export const HOME_TAB: WorkspaceTab = {
  id: '/',
  title: 'Dashboard',
  path: '/',
  icon: 'layout-dashboard',
  closable: false,
}

export const useTabStore = create<TabState>()(
  persist(
    (set, get) => ({
      tabs: [HOME_TAB],
      activeTabId: '/',

      addTab: (tab) => {
        const { tabs } = get()
        const id = tab.id ?? tab.path

        const existing = tabs.find((t) => t.id === id || t.path === tab.path)
        if (existing) {
          set({ activeTabId: existing.id })
          return existing.id
        }

        if (tabs.length >= MAX_TABS) {
          const lastTab = tabs[tabs.length - 1]
          set({ activeTabId: lastTab.id })
          return lastTab.id
        }

        const newTab: WorkspaceTab = { ...tab, id, closable: tab.closable ?? true }
        set((state) => ({
          tabs: [...state.tabs, newTab],
          activeTabId: id,
        }))
        return id
      },

      closeTab: (id) => {
        set((state) => {
          const index = state.tabs.findIndex((t) => t.id === id)
          if (index === -1 || !state.tabs[index].closable) return state

          const newTabs = state.tabs.filter((t) => t.id !== id)
          let newActiveId = state.activeTabId

          if (state.activeTabId === id) {
            if (newTabs.length === 0) {
              newActiveId = HOME_TAB.id
              return { tabs: [HOME_TAB], activeTabId: HOME_TAB.id }
            } else if (index >= newTabs.length) {
              newActiveId = newTabs[newTabs.length - 1].id
            } else {
              newActiveId = newTabs[index].id
            }
          }

          return { tabs: newTabs, activeTabId: newActiveId }
        })
      },

      setActiveTab: (id) => {
        set({ activeTabId: id })
      },

      reorderTabs: (fromIndex, toIndex) => {
        set((state) => {
          const newTabs = [...state.tabs]
          const [removed] = newTabs.splice(fromIndex, 1)
          newTabs.splice(toIndex, 0, removed)
          return { tabs: newTabs }
        })
      },

      updateTab: (id, updates) => {
        set((state) => ({
          tabs: state.tabs.map((t) => (t.id === id ? { ...t, ...updates } : t)),
        }))
      },

      closeOtherTabs: (id) => {
        set((state) => ({
          tabs: state.tabs.filter((t) => t.id === id || !t.closable),
        }))
      },

      closeTabsToRight: (id) => {
        set((state) => {
          const index = state.tabs.findIndex((t) => t.id === id)
          if (index === -1) return state
          return {
            tabs: [
              ...state.tabs.slice(0, index + 1),
              ...state.tabs.slice(index + 1).filter((t) => !t.closable),
            ],
          }
        })
      },

      getActiveTab: () => {
        const { tabs, activeTabId } = get()
        return tabs.find((t) => t.id === activeTabId)
      },
    }),
    {
      name: 'workbench-tab-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ tabs: state.tabs, activeTabId: state.activeTabId }),
    }
  )
)
