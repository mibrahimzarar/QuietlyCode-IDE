import React from 'react'
import { DiffEditor } from '@monaco-editor/react'
import { useApp } from '../store/appStore'
import { X, Check, XCircle } from 'lucide-react'

export default function DiffPreview() {
    const { state, dispatch } = useApp()

    if (!state.diffPreview) return null

    function handleApply() {
        if (!state.diffPreview) return

        const file = state.openFiles.find(f => f.path === state.diffPreview?.filePath)
        if (!file) return

        let newContent = state.diffPreview.modified

        // If there's a selection range, we only replace that part of the file
        if (state.diffPreview.selection) {
            const lines = file.content.split('\n')
            const { startLineNumber, endLineNumber } = state.diffPreview.selection

            // 1-based indexing
            const before = lines.slice(0, startLineNumber - 1).join('\n')
            const after = lines.slice(endLineNumber).join('\n')

            newContent = [before, state.diffPreview.modified, after].filter(s => s !== '').join('\n')
        }

        dispatch({
            type: 'UPDATE_FILE_CONTENT',
            path: state.diffPreview.filePath,
            content: newContent
        })
        dispatch({ type: 'SET_DIFF_PREVIEW', diff: null })
    }

    function handleReject() {
        dispatch({ type: 'SET_DIFF_PREVIEW', diff: null })
    }

    return (
        <div className="diff-overlay" onClick={handleReject}>
            <div className="diff-container" onClick={(e) => e.stopPropagation()}>
                <div className="diff-header">
                    <h3>Review Changes</h3>
                    <div className="diff-actions">
                        <button className="btn btn-secondary" onClick={handleReject}>
                            <XCircle size={14} />
                            Reject
                        </button>
                        <button className="btn btn-primary" onClick={handleApply}>
                            <Check size={14} />
                            Apply Changes
                        </button>
                    </div>
                </div>
                <div className="diff-editor-container">
                    <DiffEditor
                        original={state.diffPreview.original}
                        modified={state.diffPreview.modified}
                        language={state.openFiles.find(f => f.path === state.diffPreview?.filePath)?.language || 'plaintext'}
                        theme={state.settings.theme === 'dark' ? 'bitnet-dark' : 'bitnet-light'}
                        options={{
                            readOnly: true,
                            renderSideBySide: true,
                            fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                            fontSize: 13,
                            lineHeight: 22,
                            scrollBeyondLastLine: false,
                            automaticLayout: true
                        }}
                    />
                </div>
            </div>
        </div>
    )
}
