import React, { useEffect } from 'react'
import { useApp } from '../store/appStore'
import { RefreshCw } from 'lucide-react'

export default function StatusBar() {
    const { state, dispatch } = useApp()

    const activeFile = state.openFiles.find(f => f.path === state.activeFilePath)

    // On mount (and HMR reloads), check actual server status
    useEffect(() => {
        async function checkHealth() {
            try {
                const status = await window.electronAPI.getAIStatus()
                if (status && status.running) {
                    dispatch({ type: 'SET_AI_STATUS', status: 'connected' })
                }
            } catch { /* ignore */ }
        }
        // Check immediately
        checkHealth()
        // Re-check every 30 seconds
        const interval = setInterval(checkHealth, 30000)
        return () => clearInterval(interval)
    }, [dispatch])
    function handleReconnect() {
        if (state.aiStatus === 'connecting') return
        dispatch({ type: 'SET_AI_STATUS', status: 'connecting' })
        // Stop any stale server first, then restart
        window.electronAPI.stopAIServer().catch(() => { }).finally(() => {
            window.electronAPI.startAIServer().then((result) => {
                if (result.success) {
                    dispatch({ type: 'SET_AI_STATUS', status: 'connected' })
                } else {
                    console.error('AI reconnect failed:', result.error)
                    dispatch({ type: 'SET_AI_STATUS', status: 'disconnected' })
                }
            }).catch((err) => {
                console.error('AI reconnect error:', err)
                dispatch({ type: 'SET_AI_STATUS', status: 'disconnected' })
            })
        })
    }

    return (
        <div className="status-bar">
            <div className="status-left">
                <div className="status-item ai-status-item">
                    <span
                        className={`status-dot ${state.aiStatus === 'connected' ? 'connected' :
                            state.aiStatus === 'connecting' ? 'loading' : 'disconnected'
                            }`}
                    />
                    <span>
                        {state.aiStatus === 'connected' ? 'AI Connected' :
                            state.aiStatus === 'connecting' ? 'Connecting...' : 'AI Offline'}
                    </span>
                    {state.aiStatus === 'disconnected' && (
                        <button
                            className="status-reconnect-btn"
                            onClick={handleReconnect}
                            title="Reconnect AI Server"
                        >
                            <RefreshCw size={12} />
                        </button>
                    )}
                    {state.aiStatus === 'connecting' && (
                        <span className="status-reconnect-btn spinning" title="Connecting...">
                            <RefreshCw size={12} />
                        </span>
                    )}
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
