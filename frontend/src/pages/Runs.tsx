import React, { useState } from 'react'
import { RefreshIndicator } from '../components/RefreshIndicator'
import { useAutoRefresh } from '../hooks/useAutoRefresh'
import { RunCommand } from '../components/RunCommand'
import { RunViewer } from '../components/RunViewer'
import { RunHistory } from '../components/RunHistory'

function RunsPage() {
  const { isRefreshing, hasUpdates } = useAutoRefresh(['run_results']);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const handleRunStarted = (runId: string) => {
    setSelectedRunId(runId);
    setRefreshTrigger(prev => prev + 1);
  };

  const handleRunSelect = (runId: string) => {
    setSelectedRunId(runId);
  };

  const handleCloseViewer = () => {
    setSelectedRunId(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-100">dbt Execution</h1>
        <RefreshIndicator isRefreshing={isRefreshing} hasUpdates={hasUpdates} />
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Run Command Panel */}
        <div className="lg:col-span-1">
          <RunCommand onRunStarted={handleRunStarted} />
        </div>

        {/* Run Viewer or History */}
        <div className="lg:col-span-2">
          {selectedRunId ? (
            <RunViewer 
              runId={selectedRunId} 
              onClose={handleCloseViewer}
            />
          ) : (
            <RunHistory 
              onRunSelect={handleRunSelect}
              refreshTrigger={refreshTrigger}
            />
          )}
        </div>
      </div>
    </div>
  )
}

export default RunsPage
