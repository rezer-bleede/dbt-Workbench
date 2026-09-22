import CodeMirror from '@uiw/react-codemirror'
import { sql as sqlLang } from '@codemirror/lang-sql'
import { autocompletion, CompletionContext, CompletionResult } from '@codemirror/autocomplete'
import { vscodeDark, vscodeLight } from '@uiw/codemirror-theme-vscode'

import { SqlEditorTab } from './types'

interface EditorPaneProps {
  activeTab: SqlEditorTab | null
  editorTheme: 'dark' | 'light'
  completionSource: (context: CompletionContext) => CompletionResult | null
  onChange: (value: string) => void
}

export const EditorPane = ({ activeTab, editorTheme, completionSource, onChange }: EditorPaneProps) => {
  const theme = editorTheme === 'dark' ? vscodeDark : vscodeLight

  if (!activeTab) {
    return <div className="sqlwb-empty">No active editor tab.</div>
  }

  if (activeTab.mode === 'model') {
    return (
      <div className="sqlwb-model-editor-grid">
        <div className="sqlwb-editor-pane-section">
          <div className="sqlwb-editor-pane-header">
            <span>Model source (editable)</span>
            {activeTab.isLoadingCompiled && <span className="sqlwb-loading-text">Refreshing compiled SQL…</span>}
          </div>
          <div className="sqlwb-editor-cm">
            <CodeMirror
              value={activeTab.sqlText}
              height="100%"
              theme={theme}
              extensions={[sqlLang(), autocompletion({ override: [completionSource] })]}
              basicSetup={{ lineNumbers: true, highlightActiveLine: true }}
              onChange={onChange}
              editable={!activeTab.isReadonly}
            />
          </div>
          {activeTab.isReadonly && <div className="sqlwb-hint">This model file is read-only.</div>}
        </div>

        <div className="sqlwb-editor-pane-section">
          <div className="sqlwb-editor-pane-header">
            <span>Compiled SQL (read-only)</span>
            {activeTab.compiledTarget && <span>Target {activeTab.compiledTarget}</span>}
          </div>
          <div className="sqlwb-editor-cm">
            <CodeMirror
              value={activeTab.compiledSql || '-- Compiled SQL not available yet'}
              height="100%"
              theme={theme}
              extensions={[sqlLang()]}
              editable={false}
              basicSetup={{ lineNumbers: true, highlightActiveLine: false }}
            />
          </div>
          {activeTab.compileError && (
            <div className="sqlwb-inline-error">Compilation error: {activeTab.compileError}</div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="sqlwb-single-editor">
      <div className="sqlwb-editor-cm">
        <CodeMirror
          value={activeTab.sqlText}
          height="100%"
          theme={theme}
          extensions={[sqlLang(), autocompletion({ override: [completionSource] })]}
          basicSetup={{ lineNumbers: true, highlightActiveLine: true }}
          onChange={onChange}
          editable={!activeTab.isReadonly}
        />
      </div>
      {activeTab.isReadonly && <div className="sqlwb-hint px-2 py-1">This SQL buffer is read-only.</div>}
    </div>
  )
}
