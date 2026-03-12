import React from 'react'
import { useApp } from '../store/appStore'
import { X } from 'lucide-react'

export default function TabBar() {
    const { state, dispatch } = useApp()

    if (state.openFiles.length === 0) return null

    return (
        <div className="tab-bar">
            {state.openFiles.map((file) => (
                <div
                    key={file.path}
                    className={`tab ${state.activeFilePath === file.path ? 'active' : ''} ${file.isDirty ? 'dirty' : ''}`}
                    onClick={() => dispatch({ type: 'SET_ACTIVE_FILE', path: file.path })}
                    title={file.path}
                >
                    <span>{file.name}</span>
                    <button
                        className="tab-close"
                        onClick={(e) => {
                            e.stopPropagation()
                            dispatch({ type: 'CLOSE_FILE', path: file.path })
                        }}
                        title="Close"
                    >
                        <X size={12} />
                    </button>
                </div>
            ))}
        </div>
    )
}
