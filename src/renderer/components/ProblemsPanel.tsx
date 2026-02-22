import React from 'react'
import { useApp } from '../store/appStore'
import { AlertCircle, ChevronRight, FileText, Maximize2, Minimize2, X } from 'lucide-react'

interface ProblemsPanelProps {
    isMaximized: boolean
    onToggleMaximize: () => void
}

export default function ProblemsPanel({ isMaximized, onToggleMaximize }: ProblemsPanelProps) {
    const { state, dispatch } = useApp()
    const { problems } = state

    // Group problems by file
    const groupedProblems = problems.reduce((acc, p) => {
        if (!acc[p.path]) acc[p.path] = []
        acc[p.path].push(p)
        return acc
    }, {} as Record<string, typeof problems>)

    return (
        <div className="problems-panel">
            <div className="problems-header">
                <span>{problems.length} {problems.length === 1 ? 'problem' : 'problems'} detected</span>
                <div className="problems-actions">
                    <button className="toolbar-btn" onClick={onToggleMaximize} title={isMaximized ? 'Restore' : 'Maximize'}>
                        {isMaximized ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                    </button>
                    <button className="toolbar-btn" onClick={() => dispatch({ type: 'TOGGLE_TERMINAL' })} title="Close Panel">
                        <X size={14} />
                    </button>
                </div>
            </div>
            <div className="problems-list">
                {problems.length === 0 ? (
                    <div className="problems-empty">
                        <AlertCircle size={48} style={{ opacity: 0.1, marginBottom: 12 }} />
                        <span>No problems have been detected in the workspace.</span>
                    </div>
                ) : (
                    Object.entries(groupedProblems).map(([path, fileProblems]) => (
                        <div key={path} className="problems-file-group">
                            <div className="problems-file-header">
                                <ChevronRight size={14} style={{ opacity: 0.4 }} />
                                <FileText size={14} style={{ color: 'var(--text-tertiary)' }} />
                                <span className="file-name">{path.split(/[\/\\]/).pop()}</span>
                                <span className="file-path">{path}</span>
                            </div>
                            <div className="problems-file-items">
                                {fileProblems.map((p, idx) => (
                                    <div
                                        key={idx}
                                        className="problem-item"
                                        onClick={() => {
                                            // TODO: navigate to file and line
                                            dispatch({ type: 'SET_ACTIVE_FILE', path: p.path })
                                        }}
                                    >
                                        <span className="problem-severity error">
                                            <AlertCircle size={12} />
                                        </span>
                                        <span className="problem-location">({p.line}, {p.character})</span>
                                        <span className="problem-message">{p.message}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    )
}
