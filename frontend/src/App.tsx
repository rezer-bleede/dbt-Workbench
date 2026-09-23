import { Routes, Route, Navigate } from 'react-router-dom'
import { useEffect } from 'react'
import { Sidebar } from './components/Sidebar'
import { TopBar } from './components/TopBar'
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

function App() {
  const { isLoading, isAuthEnabled, user, activeWorkspace } = useAuth()

  useEffect(() => {
    // Key props on routes and main already force rerender; emit global event for listeners
    if (activeWorkspace?.id) {
      window.dispatchEvent(new CustomEvent('workspace-changed', { detail: { workspaceId: activeWorkspace.id } }))
    }
  }, [activeWorkspace?.id])

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
      <div className="app-shell-gradient min-h-screen flex items-center justify-center text-muted">
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
      <div className="app-shell-gradient flex h-screen overflow-hidden">
        <Sidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <TopBar />
          <main className="flex-1 overflow-y-auto p-6 space-y-6" key={activeWorkspace?.id ?? 'none'} data-testid="main-content">
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
          </main>
        </div>
        <RefreshIndicator onRefreshNeeded={handleRefreshNeeded} />
        <AiAssistantPanel />
      </div>
    </AiProvider>
  )
}

export default App
