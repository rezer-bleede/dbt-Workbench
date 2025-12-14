import { Routes, Route, Navigate } from 'react-router-dom'
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
import { useAuth } from './context/AuthContext'

function App() {
  const { isLoading, isAuthEnabled, user } = useAuth()

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
      <div className="min-h-screen bg-surface flex items-center justify-center text-gray-300">
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
    <div className="flex min-h-screen bg-surface">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <TopBar />
        <main className="p-6 space-y-6">
          <Routes>
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
            <Route path="/docs" element={<DocsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/login" element={<LoginPage />} />
          </Routes>
        </main>
      </div>
      <RefreshIndicator onRefreshNeeded={handleRefreshNeeded} />
    </div>
  )
}

export default App
