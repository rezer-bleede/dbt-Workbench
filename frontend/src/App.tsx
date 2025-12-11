import { Routes, Route } from 'react-router-dom'
import { Sidebar } from './components/Sidebar'
import { TopBar } from './components/TopBar'
import { RefreshIndicator } from './components/RefreshIndicator'
import DashboardPage from './pages/Dashboard'
import ModelsPage from './pages/Models'
import ModelDetailPage from './pages/ModelDetail'
import LineagePage from './pages/Lineage'
import RunsPage from './pages/Runs'
import DocsPage from './pages/Docs'
import SettingsPage from './pages/Settings'

function App() {
  const handleRefreshNeeded = (updatedArtifacts: string[]) => {
    // Force refresh of components that depend on the updated artifacts
    console.log('Artifacts updated:', updatedArtifacts)
    
    // Trigger a custom event that pages can listen to
    window.dispatchEvent(new CustomEvent('artifactsUpdated', { 
      detail: { updatedArtifacts } 
    }))
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
            <Route path="/runs" element={<RunsPage />} />
            <Route path="/docs" element={<DocsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
        </main>
      </div>
      <RefreshIndicator onRefreshNeeded={handleRefreshNeeded} />
    </div>
  )
}

export default App
