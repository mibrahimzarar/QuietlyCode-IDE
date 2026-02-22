import React, { useEffect, useRef, useState } from 'react'
import { useApp } from '../store/appStore'
import { Terminal as TerminalIcon, Plus, X, Maximize2, Minimize2, SplitSquareHorizontal, ChevronDown } from 'lucide-react'
import { Terminal } from 'xterm'
import { FitAddon } from 'xterm-addon-fit'
// @ts-ignore
import 'xterm/css/xterm.css'

interface TerminalSession {
    id: string
    title: string
    instance: Terminal | null
    fitAddon: FitAddon | null
    containerRef: React.RefObject<HTMLDivElement>
}

export default function TerminalPanel() {
    const { state, dispatch } = useApp()
    const [sessions, setSessions] = useState<TerminalSession[]>([])
    const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
    const [isMaximized, setIsMaximized] = useState(false)
    const [splitMode, setSplitMode] = useState(false)
    const [shell, setShell] = useState('')
    const [availableShells, setAvailableShells] = useState<string[]>([])

    // Load available shells on mount
    useEffect(() => {
        window.electronAPI.getShells().then(shells => {
            setAvailableShells(shells)
            if (shells.length > 0) setShell(shells[0])
        })
    }, [])

    // Initialize first session if none exists
    useEffect(() => {
        if (sessions.length === 0 && shell) {
            createNewSession()
        }
    }, [shell])

    // Incoming data handler
    useEffect(() => {
        const unsubData = window.electronAPI.onTerminalData((data) => {
            const session = sessions.find(s => s.id === data.id)
            if (session && session.instance) {
                session.instance.write(data.data)
            }
        })

        const unsubExit = window.electronAPI.onTerminalExit((data) => {
            const session = sessions.find(s => s.id === data.id)
            if (session && session.instance) {
                session.instance.writeln(`\r\n\x1b[33mProcess exited with code ${data.code}\x1b[0m`)
            }
        })

        return () => {
            unsubData()
            unsubExit()
        }
    }, [sessions])

    const terminalAreaRef = useRef<HTMLDivElement>(null)

    // Handle Resize
    useEffect(() => {
        const resizeObserver = new ResizeObserver(() => {
            requestAnimationFrame(() => {
                sessions.forEach(s => {
                    if (s.fitAddon && s.instance) {
                        try {
                            s.fitAddon.fit()
                            // Optional: Tell the local PTY backend about the new size
                            window.electronAPI.resizeTerminal(s.id, s.instance.cols, s.instance.rows)
                        } catch (e) { /* ignore */ }
                    }
                })
            })
        })

        if (terminalAreaRef.current) {
            resizeObserver.observe(terminalAreaRef.current)
        }

        return () => resizeObserver.disconnect()
    }, [sessions])

    function createNewSession() {
        const id = `term-${Date.now()}`
        const newSession: TerminalSession = {
            id,
            title: `Terminal ${sessions.length + 1}`,
            instance: null, // Initialized in effect
            fitAddon: null,
            containerRef: React.createRef()
        }

        setSessions(prev => [...prev, newSession])
        setActiveSessionId(id)

        // Defer instantiation until DOM is ready
        setTimeout(() => initXterm(newSession), 50)
    }

    async function initXterm(session: TerminalSession) {
        if (!session.containerRef.current) return

        const term = new Terminal({
            fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
            fontSize: 13,
            lineHeight: 1.4,
            cursorBlink: true,
            cursorStyle: 'bar',
            theme: {
                background: '#1a1b2e',
                foreground: '#eaeaf2',
                cursor: '#7c6cf0',
                selectionBackground: '#3a3a6840',
                black: '#1a1b2e',
                red: '#e8705a',
                green: '#2ecc9a',
                yellow: '#f0c060', // bright yellow
                blue: '#6cb4ff', // bright blue
                magenta: '#a8a0ff',
                cyan: '#89ddff',
                white: '#eaeaf2',
                brightBlack: '#7878a0',
                brightRed: '#e8705a',
                brightGreen: '#2ecc9a',
                brightYellow: '#f0c060',
                brightBlue: '#6cb4ff',
                brightMagenta: '#a8a0ff',
                brightCyan: '#89ddff',
                brightWhite: '#ffffff',
            }
        })

        const fitAddon = new FitAddon()
        term.loadAddon(fitAddon)
        term.open(session.containerRef.current)

        // Wait a tick for DOM to update
        setTimeout(() => fitAddon.fit(), 10)

        term.onData((data) => {
            window.electronAPI.writeTerminal(session.id, data)
        })

        // Update session object
        session.instance = term
        session.fitAddon = fitAddon

        // Create backend process
        await window.electronAPI.createTerminal(session.id, shell, state.projectPath || '')

        term.focus()
    }

    function closeSession(id: string) {
        window.electronAPI.killTerminal(id)
        const newSessions = sessions.filter(s => s.id !== id)
        setSessions(newSessions)
        if (activeSessionId === id && newSessions.length > 0) {
            setActiveSessionId(newSessions[newSessions.length - 1].id)
        }
    }

    const activeSession = sessions.find(s => s.id === activeSessionId)

    return (
        <div className={`bottom-panel ${isMaximized ? 'maximized' : ''}`} style={{ height: isMaximized ? '60vh' : '200px' }}>
            <div className="bottom-panel-header">
                <div className="bottom-panel-tabs">
                    {sessions.map(s => (
                        <button
                            key={s.id}
                            className={`bottom-panel-tab ${activeSessionId === s.id && !splitMode ? 'active' : ''}`}
                            onClick={() => { setActiveSessionId(s.id); setSplitMode(false) }}
                        >
                            <TerminalIcon size={12} />
                            {s.title}
                            <X size={10} onClick={(e) => { e.stopPropagation(); closeSession(s.id) }} style={{ marginLeft: 6, opacity: 0.6 }} />
                        </button>
                    ))}
                    <button className="btn btn-ghost btn-icon" onClick={createNewSession} title="New Terminal">
                        <Plus size={12} />
                    </button>
                </div>

                <div className="bottom-panel-actions">
                    <div className="terminal-shell-select">
                        <span style={{ fontSize: 10, opacity: 0.5, marginRight: 4 }}>{shell && shell.split(/[\\/]/).pop()}</span>
                    </div>

                    <button className={`btn btn-ghost btn-icon ${splitMode ? 'active' : ''}`} onClick={() => setSplitMode(!splitMode)} title="Split View">
                        <SplitSquareHorizontal size={12} />
                    </button>

                    <button className="btn btn-ghost btn-icon" onClick={() => setIsMaximized(!isMaximized)} title={isMaximized ? 'Restore' : 'Maximize'}>
                        {isMaximized ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
                    </button>
                    <button className="btn btn-ghost btn-icon" onClick={() => dispatch({ type: 'TOGGLE_TERMINAL' })} title="Close Panel">
                        <X size={12} />
                    </button>
                </div>
            </div>

            <div ref={terminalAreaRef} className={`terminal-content-area ${splitMode ? 'split-mode' : ''}`}>
                {sessions.map(s => (
                    <div
                        key={s.id}
                        className={`terminal-instance ${splitMode ? 'split' : (activeSessionId === s.id ? 'active' : 'hidden')
                            }`}
                        ref={s.containerRef}
                    />
                ))}
                {sessions.length === 0 && (
                    <div className="terminal-empty-state">
                        <button className="btn btn-primary" onClick={createNewSession}>Open Terminal</button>
                    </div>
                )}
            </div>

            <style>{`
                .terminal-content-area {
                    flex: 1;
                    position: relative;
                    overflow: hidden;
                    display: flex;
                    background: #1a1b2e;
                }
                .terminal-instance {
                    width: 100%;
                    height: 100%;
                    padding-left: 12px;
                    padding-top: 8px;
                }
                .terminal-instance.hidden {
                    display: none;
                }
                .terminal-instance.split {
                    width: 50%;
                    border-right: 1px solid var(--border-color);
                }
                .terminal-instance.split:last-child {
                    border-right: none;
                }
            `}</style>
        </div>
    )
}
