import React from 'react'
import { useApp } from '../store/appStore'

export default function StatusBar() {
    const { state } = useApp()

    const activeFile = state.openFiles.find(f => f.path === state.activeFilePath)

    return (
        <div className="status-bar">
            <div className="status-left">
                <div className="status-item">
                    <span
                        className={`status-dot ${state.aiStatus === 'connected' ? 'connected' :
                                state.aiStatus === 'connecting' ? 'loading' : 'disconnected'
                            }`}
                    />
                    <span>
                        {state.aiStatus === 'connected' ? 'AI Connected' :
                            state.aiStatus === 'connecting' ? 'Connecting...' : 'AI Offline'}
                    </span>
                </div>
                {state.projectPath && (
                    <div className="status-item">
                        <span>{state.projectPath.split(/[/\\]/).pop()}</span>
                    </div>
                )}
            </div>
            <div className="status-right">
                {activeFile && (
                    <>
                        <div className="status-item">
                            <span>{activeFile.language}</span>
                        </div>
                        <div className="status-item">
                            <span>UTF-8</span>
                        </div>
                    </>
                )}
                <div className="status-item">
                    <span>QuietlyCode</span>
                </div>
            </div>
        </div>
    )
}
