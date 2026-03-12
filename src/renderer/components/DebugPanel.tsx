import React, { useState, useEffect, useRef } from 'react'
import { useApp } from '../store/appStore'
import { Play, Pause, Square, ArrowRight, ArrowDown, ArrowUp, Bug, CircleDot, Trash2 } from 'lucide-react'

interface DebugSession {
    id: string
    type: 'node' | 'python'
    isPaused: boolean
    output: { text: string; type: 'stdout' | 'stderr' }[]
}

export default function DebugPanel() {
    const { state } = useApp()
    const [sessions, setSessions] = useState<DebugSession[]>([])
    const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
    const [scriptPath, setScriptPath] = useState('')
    const [debugType, setDebugType] = useState<'node' | 'python'>('node')
    const outputRef = useRef<HTMLDivElement>(null)

    const activeSession = sessions.find(s => s.id === activeSessionId)

    useEffect(() => {
        // Set up debug event listeners
        const unsubOutput = window.electronAPI.onDebugOutput((data) => {
            setSessions(prev => prev.map(s => {
                if (s.id === data.sessionId) {
                    return {
                        ...s,
                        output: [...s.output, { text: data.output, type: data.type as 'stdout' | 'stderr' }]
                    }
                }
                return s
            }))
        })

        const unsubStarted = window.electronAPI.onDebugStarted((data) => {
            setSessions(prev => [...prev, {
                id: data.sessionId,
                type: data.type as 'node' | 'python',
                isPaused: true,
                output: []
            }])
            setActiveSessionId(data.sessionId)
        })

        const unsubStopped = window.electronAPI.onDebugStopped((data) => {
            setSessions(prev => prev.filter(s => s.id !== data.sessionId))
            if (activeSessionId === data.sessionId) {
                setActiveSessionId(null)
            }
        })

        const unsubTerminated = window.electronAPI.onDebugTerminated((data) => {
            setSessions(prev => prev.filter(s => s.id !== data.sessionId))
            if (activeSessionId === data.sessionId) {
                setActiveSessionId(null)
            }
        })

        const unsubPaused = window.electronAPI.onDebugPaused((data) => {
            setSessions(prev => prev.map(s => 
                s.id === data.sessionId ? { ...s, isPaused: true } : s
            ))
        })

        const unsubContinued = window.electronAPI.onDebugContinued((data) => {
            setSessions(prev => prev.map(s => 
                s.id === data.sessionId ? { ...s, isPaused: false } : s
            ))
        })

        return () => {
            unsubOutput()
            unsubStarted()
            unsubStopped()
            unsubTerminated()
            unsubPaused()
            unsubContinued()
        }
    }, [activeSessionId])

    useEffect(() => {
        // Auto-scroll to bottom
        if (outputRef.current) {
            outputRef.current.scrollTop = outputRef.current.scrollHeight
        }
    }, [activeSession?.output])

    const [error, setError] = useState<string | null>(null)

    const startDebug = async () => {
        if (!scriptPath || !state.projectPath) return

        setError(null)
        let result
        
        if (debugType === 'node') {
            result = await window.electronAPI.startNodeDebug(scriptPath, state.projectPath, [])
        } else {
            result = await window.electronAPI.startPythonDebug(scriptPath, state.projectPath, [])
        }

        if (result.error) {
            setError(result.error)
        }
    }

    const stopDebug = async () => {
        if (activeSessionId) {
            await window.electronAPI.stopDebug(activeSessionId)
        }
    }

    const pauseDebug = async () => {
        if (activeSessionId) {
            await window.electronAPI.pauseDebug(activeSessionId)
        }
    }

    const continueDebug = async () => {
        if (activeSessionId) {
            await window.electronAPI.continueDebug(activeSessionId)
        }
    }

    const handleStepOver = async () => {
        if (activeSessionId) {
            await window.electronAPI.stepOver(activeSessionId)
        }
    }

    const handleStepInto = async () => {
        if (activeSessionId) {
            await window.electronAPI.stepInto(activeSessionId)
        }
    }

    const handleStepOut = async () => {
        if (activeSessionId) {
            await window.electronAPI.stepOut(activeSessionId)
        }
    }

    const clearOutput = () => {
        if (activeSessionId) {
            setSessions(prev => prev.map(s => 
                s.id === activeSessionId ? { ...s, output: [] } : s
            ))
        }
    }

    return (
        <div className="debug-panel">
            <div className="debug-toolbar">
                <div className="debug-config">
                    <select 
                        value={debugType} 
                        onChange={(e) => setDebugType(e.target.value as 'node' | 'python')}
                        className="debug-type-select"
                    >
                        <option value="node">Node.js</option>
                        <option value="python">Python</option>
                    </select>
                    <input
                        type="text"
                        value={scriptPath}
                        onChange={(e) => setScriptPath(e.target.value)}
                        placeholder="Script path (relative to project root)"
                        className="debug-script-input"
                    />
                    <button 
                        onClick={startDebug}
                        disabled={!scriptPath || sessions.length > 0}
                        className="debug-btn start"
                    >
                        <Play size={14} />
                        Start
                    </button>
                </div>

                {error && (
                    <div className="debug-error">
                        Error: {error}
                    </div>
                )}

                {activeSession && (
                    <div className="debug-controls">
                        {activeSession.isPaused ? (
                            <button onClick={continueDebug} className="debug-btn continue">
                                <Play size={14} />
                                Continue
                            </button>
                        ) : (
                            <button onClick={pauseDebug} className="debug-btn pause">
                                <Pause size={14} />
                                Pause
                            </button>
                        )}
                        <button onClick={handleStepOver} className="debug-btn" disabled={!activeSession.isPaused}>
                            <ArrowRight size={14} />
                            Step Over
                        </button>
                        <button onClick={handleStepInto} className="debug-btn" disabled={!activeSession.isPaused}>
                            <ArrowDown size={14} />
                            Step Into
                        </button>
                        <button onClick={handleStepOut} className="debug-btn" disabled={!activeSession.isPaused}>
                            <ArrowUp size={14} />
                            Step Out
                        </button>
                        <button onClick={stopDebug} className="debug-btn stop">
                            <Square size={14} />
                            Stop
                        </button>
                    </div>
                )}
            </div>

            {sessions.length > 0 && (
                <div className="debug-sessions">
                    {sessions.map(session => (
                        <div 
                            key={session.id}
                            className={`debug-session-tab ${session.id === activeSessionId ? 'active' : ''}`}
                            onClick={() => setActiveSessionId(session.id)}
                        >
                            <Bug size={12} />
                            <span>{session.type}</span>
                            {session.isPaused && <CircleDot size={10} className="paused-indicator" />}
                        </div>
                    ))}
                </div>
            )}

            <div className="debug-output-container">
                <div className="debug-output-header">
                    <span>Debug Console</span>
                    {activeSession && (
                        <button onClick={clearOutput} className="debug-clear-btn">
                            <Trash2 size={12} />
                        </button>
                    )}
                </div>
                <div className="debug-output" ref={outputRef}>
                    {activeSession?.output.length === 0 ? (
                        <div className="debug-empty">Debug output will appear here...</div>
                    ) : (
                        activeSession?.output.map((line, i) => (
                            <div 
                                key={i} 
                                className={`debug-line ${line.type}`}
                            >
                                {line.text}
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    )
}
