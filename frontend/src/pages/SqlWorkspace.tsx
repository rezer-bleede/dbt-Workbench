import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { BottomDock } from './sql-workspace/BottomDock'
import { EditorPane } from './sql-workspace/EditorPane'
import { EditorTabs } from './sql-workspace/EditorTabs'
import { NavigatorPane } from './sql-workspace/NavigatorPane'
import { WorkbenchStatusBar } from './sql-workspace/WorkbenchStatusBar'
import { WorkbenchToolbar } from './sql-workspace/WorkbenchToolbar'
import { useSplitLayout } from './sql-workspace/useSplitLayout'
import { useSqlWorkbenchState } from './sql-workspace/useSqlWorkbenchState'
import './sql-workspace/sqlWorkbench.css'

function SqlWorkspacePage() {
  const state = useSqlWorkbenchState()

  const getIsMobile = () => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
    return window.matchMedia('(max-width: 1280px)').matches
  }

  const [isMobile, setIsMobile] = useState<boolean>(getIsMobile)
  const [mobileNavigatorOpen, setMobileNavigatorOpen] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const workbenchRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    const media = window.matchMedia('(max-width: 1280px)')

    const sync = () => {
      const nextMobile = media.matches
      setIsMobile(nextMobile)
      if (!nextMobile) {
        setMobileNavigatorOpen(false)
      }
    }

    sync()
    if (typeof media.addEventListener === 'function') {
      media.addEventListener('change', sync)
      return () => media.removeEventListener('change', sync)
    }
    media.addListener(sync)
    return () => media.removeListener(sync)
  }, [])

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(document.fullscreenElement === workbenchRef.current)
    }

    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange)
  }, [])

  const toggleFullscreen = useCallback(() => {
    const target = workbenchRef.current
    if (!target) return

    if (document.fullscreenElement === target) {
      document.exitFullscreen?.().catch(() => undefined)
      return
    }

    target.requestFullscreen?.().catch(() => undefined)
  }, [])

  const split = useSplitLayout({
    initialLeftPaneWidth: state.layoutState.leftPaneWidth,
    initialBottomPaneHeight: state.layoutState.bottomPaneHeight,
    initialEditorFocused: state.layoutState.isEditorFocused,
    onChange: (next) => {
      state.setLayoutState((prev) => {
        if (
          prev.leftPaneWidth === next.leftPaneWidth &&
          prev.bottomPaneHeight === next.bottomPaneHeight &&
          prev.isEditorFocused === next.isEditorFocused
        ) {
          return prev
        }
        return next
      })
    },
  })

  const canSaveFile = Boolean(
    state.activeTab?.sourceFilePath &&
      !state.activeTab?.isReadonly &&
      state.isDeveloperOrAdmin,
  )

  const canRun = Boolean(
    state.activeTab &&
      (state.activeTab.mode === 'sql' || (state.activeTab.mode === 'model' && state.activeTab.selectedModelId)),
  )

  const activeModelId = state.activeTab?.selectedModelId || ''
  const selectedFilePath = state.activeTab?.sourceFilePath || ''

  const showLeftPane = !isMobile && !split.isEditorFocused

  const bottomPaneHeight = useMemo(() => {
    if (isMobile) return undefined
    if (split.isEditorFocused) {
      return 220
    }
    return split.bottomPaneHeight
  }, [isMobile, split.bottomPaneHeight, split.isEditorFocused])

  const modelOptions = state.selectedModelOptions.map((model) => ({ id: model.id, name: model.name }))

  return (
    <div className="space-y-2">
      <div
        ref={workbenchRef}
        className="sqlwb-root panel-gradient"
        data-testid="sql-workbench-root"
        data-fullscreen={isFullscreen ? 'true' : 'false'}
      >
        <WorkbenchToolbar
          environmentId={state.environmentId}
          environments={state.environments.map((env) => ({ id: env.id, name: env.name }))}
          onEnvironmentChange={state.setEnvironmentId}
          activeMode={state.activeTab?.mode || 'sql'}
          onModeChange={state.setActiveTabMode}
          editorTheme={state.editorTheme}
          onEditorThemeChange={state.setEditorTheme}
          onRun={state.runActiveTab}
          onCancel={state.handleCancelRun}
          onSave={state.handleSaveActiveFile}
          onNewTab={() => state.openTab({ mode: 'sql', forceNew: true })}
          onFocusEditor={split.focusEditor}
          onResetLayout={split.resetLayout}
          isFullscreen={isFullscreen}
          onToggleFullscreen={toggleFullscreen}
          isRunning={state.isRunning}
          canSave={canSaveFile}
          canRun={canRun}
          isDeveloperOrAdmin={state.isDeveloperOrAdmin}
          showNavigatorToggle={isMobile}
          navigatorOpen={mobileNavigatorOpen}
          onToggleNavigator={() => setMobileNavigatorOpen((prev) => !prev)}
        />

        {state.error && (
          <div className="sqlwb-error-banner">
            <span>{state.error}</span>
            <button
              type="button"
              className="sqlwb-btn sqlwb-btn-ghost"
              onClick={() => state.setError(null)}
            >
              Clear
            </button>
          </div>
        )}

        <div className="sqlwb-workbench">
          {showLeftPane && (
            <>
              <aside className="sqlwb-left-pane" style={{ width: split.leftPaneWidth }}>
                <NavigatorPane
                  metadata={state.metadata}
                  modelFiles={state.modelFiles}
                  selectedModelOptions={state.selectedModelOptions}
                  selectedFilePath={selectedFilePath}
                  selectedModelId={activeModelId}
                  gitLoadError={state.gitLoadError}
                  onRefreshFiles={state.loadGitFiles}
                  onSelectFile={state.loadFileIntoTab}
                  onSelectModel={state.selectModelFromMetadata}
                  onRefreshCompiled={() => {
                    if (state.activeTab?.id) {
                      state.loadCompiledSqlForTab(state.activeTab.id, {
                        force: true,
                        hydrateSourceSql: true,
                        modelId: state.activeTab.selectedModelId,
                      })
                    }
                  }}
                  onSaveFile={state.handleSaveActiveFile}
                  onReloadFile={state.handleReloadActiveFile}
                  fileSaveMessage={state.fileSaveMessage}
                  setFileSaveMessage={state.setFileSaveMessage}
                  fileValidationErrors={state.fileValidationErrors}
                  canSaveFile={canSaveFile}
                  isSavingFile={state.isSavingFile}
                  isReadonly={Boolean(state.activeTab?.isReadonly)}
                  selectedFileExists={Boolean(state.activeTab?.sourceFilePath)}
                />
              </aside>
              <div
                className="sqlwb-vsplit"
                onMouseDown={split.startLeftResize}
                role="separator"
                aria-orientation="vertical"
                aria-label="Resize navigator"
              />
            </>
          )}

          <section className="sqlwb-center-pane">
            {isMobile && mobileNavigatorOpen && (
              <aside className="sqlwb-left-pane" style={{ width: '100%' }}>
                <NavigatorPane
                  metadata={state.metadata}
                  modelFiles={state.modelFiles}
                  selectedModelOptions={state.selectedModelOptions}
                  selectedFilePath={selectedFilePath}
                  selectedModelId={activeModelId}
                  gitLoadError={state.gitLoadError}
                  onRefreshFiles={state.loadGitFiles}
                  onSelectFile={async (path) => {
                    await state.loadFileIntoTab(path)
                    setMobileNavigatorOpen(false)
                  }}
                  onSelectModel={async (modelId, modelName, filePath) => {
                    await state.selectModelFromMetadata(modelId, modelName, filePath)
                    setMobileNavigatorOpen(false)
                  }}
                  onRefreshCompiled={() => {
                    if (state.activeTab?.id) {
                      state.loadCompiledSqlForTab(state.activeTab.id, {
                        force: true,
                        hydrateSourceSql: true,
                        modelId: state.activeTab.selectedModelId,
                      })
                    }
                  }}
                  onSaveFile={state.handleSaveActiveFile}
                  onReloadFile={state.handleReloadActiveFile}
                  fileSaveMessage={state.fileSaveMessage}
                  setFileSaveMessage={state.setFileSaveMessage}
                  fileValidationErrors={state.fileValidationErrors}
                  canSaveFile={canSaveFile}
                  isSavingFile={state.isSavingFile}
                  isReadonly={Boolean(state.activeTab?.isReadonly)}
                  selectedFileExists={Boolean(state.activeTab?.sourceFilePath)}
                />
              </aside>
            )}

            <div className="sqlwb-editor-zone">
              <EditorTabs
                tabs={state.tabs}
                activeTabId={state.activeTabId}
                onSelectTab={state.setActiveTab}
                onCloseTab={state.closeTab}
                onAddTab={() => state.openTab({ mode: 'sql', forceNew: true })}
              />
              <EditorPane
                activeTab={state.activeTab}
                editorTheme={state.editorTheme}
                completionSource={state.completionSource}
                onChange={state.setActiveTabSqlText}
              />
            </div>

            {!isMobile && (
              <div
                className="sqlwb-hsplit"
                onMouseDown={split.startBottomResize}
                role="separator"
                aria-orientation="horizontal"
                aria-label="Resize result panel"
              />
            )}

            <div className="sqlwb-bottom-pane" style={bottomPaneHeight ? { height: bottomPaneHeight } : undefined}>
              <BottomDock
                activePanel={state.activeBottomPanel}
                onPanelChange={state.setActiveBottomPanel}
                resultTabs={state.resultTabs}
                activeResultTabId={state.activeResultTabId}
                onActiveResultTabChange={state.setActiveResultTabId}
                activeResultTab={state.activeResultTab}
                currentRows={state.currentRows}
                totalResultPages={state.totalResultPages}
                resultsPage={state.resultsPage}
                onResultsPageChange={state.setResultsPage}
                profiling={state.effectiveProfiling}
                history={state.history}
                historyPage={state.historyPage}
                historyTotal={state.historyTotal}
                historyStatusFilter={state.historyStatusFilter}
                setHistoryStatusFilter={state.setHistoryStatusFilter}
                historyModelFilter={state.historyModelFilter}
                setHistoryModelFilter={state.setHistoryModelFilter}
                historyDateFrom={state.historyDateFrom}
                setHistoryDateFrom={state.setHistoryDateFrom}
                historyDateTo={state.historyDateTo}
                setHistoryDateTo={state.setHistoryDateTo}
                modelOptions={modelOptions}
                onHistoryReRun={state.handleRerunHistoryEntry}
                onHistoryDelete={state.handleDeleteHistoryEntry}
                onHistoryPageChange={state.setHistoryPage}
                outputEntries={state.outputEntries}
                onClearOutput={state.clearOutput}
              />
            </div>
          </section>
        </div>

        <WorkbenchStatusBar
          isRunning={state.isRunning}
          environmentName={state.selectedEnvironmentName}
          activeTab={state.activeTab}
          activeResultTab={state.activeResultTab}
        />
      </div>
    </div>
  )
}

export default SqlWorkspacePage
