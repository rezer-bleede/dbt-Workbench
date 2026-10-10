import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useEffect } from 'react'
import { cn } from './utils/cn'
import { Sidebar } from './components/layout/Sidebar'
import { TopBar } from './components/layout/TopBar'
import { TabBar } from './components/layout/TabBar'
import KeyboardShortcuts from './components/ui/KeyboardShortcuts'
import { RefreshIndicator } from './components/RefreshIndicator'
import DashboardPage from './pages/Dashboard'
import ModelsPage from './pages/Models'
import ModelDetailPage from './pages/ModelDetail'
import LineagePage from './pages/Lineage'
import RunsPage from './pages/Runs'
import RunHistoryPage from './pages/RunHistory'
import DocsPage from './pages/Docs'
import SettingsPage from './pages/Settings'
import SchedulesPage from './pages/Schedules'
import EnvironmentsPage from './pages/Environments'
import SqlWorkspacePage from './pages/SqlWorkspace'
import LoginPage from './pages/Login'
import PluginsInstalledPage from './pages/PluginsInstalled'
import PluginMarketplacePage from './pages/PluginMarketplace'
import VersionControlPage from './pages/VersionControl'
import FileEditorPage from './pages/FileEditor'
import { useAuth } from './context/AuthContext'
import { AiProvider } from './context/AiContext'
import { AiAssistantPanel } from './components/ai/AiAssistantPanel'
import { useTabStore } from './stores/tabStore'
import { useSidebarStore } from './stores/sidebarStore'
import { sectionForPath } from './config/navigation'

function App() {
  const { isLoading, isAuthEnabled, user, activeWorkspace } = useAuth()
  const { pathname } = useLocation()
  const sidebarCollapsed = useSidebarStore((s) => s.collapsed)
  const addTab = useTabStore((s) => s.addTab)
  const setActiveTab = useTabStore((s) => s.setActiveTab)
  const tabs = useTabStore((s) => s.tabs)
  const activeTabId = useTabStore((s) => s.activeTabId)

  useEffect(() => {
    // Key props on routes and main already force rerender; emit global event for listeners
    if (activeWorkspace?.id) {
      window.dispatchEvent(new CustomEvent('workspace-changed', { detail: { workspaceId: activeWorkspace.id } }))
    }
  }, [activeWorkspace?.id])

  // Route -> tab sync: every top-level section owns one closable tab
  useEffect(() => {
    if (isAuthEnabled && !user) return
    const section = sectionForPath(pathname)
    if (!section) return

    const existing = tabs.find((t) => t.id === section.path)
    if (existing) {
      if (activeTabId !== existing.id) setActiveTab(existing.id)
    } else {
      addTab({
        id: section.path,
        title: section.label,
        path: section.path,
        icon: section.icon,
        closable: section.path !== '/',
      })
    }
  }, [pathname, isAuthEnabled, user, tabs, activeTabId, addTab, setActiveTab])

  useEffect(() => {
    const activeTab = tabs.find((t) => t.id === activeTabId)
    document.title = activeTab ? `${activeTab.title} | dbt-Workbench` : 'dbt-Workbench'
  }, [activeTabId, tabs])

  const handleRefreshNeeded = (updatedArtifacts: string[]) => {
    console.log('Artifacts updated:', updatedArtifacts)

    window.dispatchEvent(
      new CustomEvent('artifactsUpdated', {
        detail: { updatedArtifacts },
      }),
    )
  }

  if (isLoading) {
    return (
      <div className="bg-bg-primary min-h-screen flex items-center justify-center text-text-tertiary">
        Loading…
      </div>
    )
  }

  if (isAuthEnabled && !user) {
    return (
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    )
  }

  return (
    <AiProvider>
      <div className="h-screen overflow-hidden bg-bg-primary flex">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:p-4 focus:bg-brand-primary focus:text-white focus:font-bold focus:rounded-br-xl"
        >
          Skip to main content
        </a>
        <Sidebar />

        <div
          className={cn(
            'flex-1 flex flex-col min-w-0 min-h-0 transition-all duration-300',
            sidebarCollapsed ? 'lg:ml-[72px]' : 'lg:ml-[280px]'
          )}
        >
          <TopBar />
          <TabBar />
          <main
            id="main-content"
            className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden pb-8"
            role="main"
            tabIndex={-1}
          >
            <KeyboardShortcuts />
            <div className="p-6 space-y-6" key={activeWorkspace?.id ?? 'none'} data-testid="main-content">
              <Routes key={activeWorkspace?.id ?? 'routes-none'}>
                <Route path="/" element={<DashboardPage />} />
                <Route path="/models" element={<ModelsPage />} />
                <Route path="/models/:modelId" element={<ModelDetailPage />} />
                <Route path="/lineage" element={<LineagePage />} />
                <Route path="/sql" element={<SqlWorkspacePage />} />
                <Route path="/runs" element={<RunsPage />} />
                <Route path="/run-history" element={<RunHistoryPage />} />
                <Route path="/schedules" element={<SchedulesPage />} />
                <Route path="/environments" element={<EnvironmentsPage />} />
                <Route path="/plugins" element={<PluginsInstalledPage />} />
                <Route path="/plugins/installed" element={<PluginsInstalledPage />} />
                <Route path="/plugins/marketplace" element={<PluginMarketplacePage />} />
                <Route path="/version-control" element={<VersionControlPage />} />
                <Route path="/file-editor" element={<FileEditorPage />} />
                <Route path="/docs" element={<DocsPage />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="/login" element={<LoginPage />} />
              </Routes>
            </div>
          </main>
        </div>
        <RefreshIndicator onRefreshNeeded={handleRefreshNeeded} />
        <AiAssistantPanel />
      </div>
    </AiProvider>
  )
}

export default App
