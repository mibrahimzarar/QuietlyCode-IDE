import React, { useEffect, useRef, useState } from 'react'
import { useApp } from '../store/appStore'
import { Terminal as TerminalIcon, Plus, X, Maximize2, Minimize2, SplitSquareHorizontal, ChevronDown, Bot } from 'lucide-react'
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

interface TerminalPanelProps {
    isMaximized: boolean
    onToggleMaximize: () => void
}

export default function TerminalPanel({ isMaximized, onToggleMaximize }: TerminalPanelProps) {
    const { state, dispatch } = useApp()
    const [sessions, setSessions] = useState<TerminalSession[]>([])
    const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
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

    const inputLengthsRef = useRef<Record<string, number>>({})

    // Incoming data handler
    useEffect(() => {
        const unsubData = window.electronAPI.onTerminalData((data) => {
            const session = sessions.find(s => s.id === data.id)
            if (session && session.instance) {
                // If we see a newline or carriage return from the shell, 
                // it likely means a new prompt is starting, so reset tracking.
                if (data.data.includes('\n') || data.data.includes('\r')) {
                    inputLengthsRef.current[data.id] = 0
                }
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
        let resizeTimeout: NodeJS.Timeout | null = null
        
        const resizeObserver = new ResizeObserver((entries) => {
            // Debounce resize events
            if (resizeTimeout) clearTimeout(resizeTimeout)
            resizeTimeout = setTimeout(() => {
                requestAnimationFrame(() => {
                    sessions.forEach(s => {
                        if (s.fitAddon && s.instance && s.containerRef.current) {
                            // Only resize if the container is visible
                            const rect = s.containerRef.current.getBoundingClientRect()
                            if (rect.width > 0 && rect.height > 0) {
                                try {
                                    s.fitAddon.fit()
                                    // Tell the PTY backend about the new size
                                    const cols = s.instance.cols
                                    const rows = s.instance.rows
                                    if (cols > 0 && rows > 0) {
                                        window.electronAPI.resizeTerminal(s.id, cols, rows)
                                    }
                                } catch (e) { 
                                    console.error('Resize error:', e)
                                }
                            }
                        }
                    })
                })
            }, 100)
        })

        if (terminalAreaRef.current) {
            resizeObserver.observe(terminalAreaRef.current)
        }

        return () => {
            resizeObserver.disconnect()
            if (resizeTimeout) clearTimeout(resizeTimeout)
        }
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

        // Clear any existing content
        session.containerRef.current.innerHTML = ''

        const term = new Terminal({
            fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
            fontSize: 13,
            lineHeight: 1.2,
            cursorBlink: true,
            cursorStyle: 'bar',
            allowTransparency: true,
            convertEol: true,
            scrollback: 10000,
            smoothScrollDuration: 0,
            fastScrollModifier: 'alt',
            fastScrollSensitivity: 5,
            theme: {
                background: '#1a1b2e', /* Consistent dark background */
                foreground: '#eaeaf2',
                cursor: '#7c6cf0',
                selectionBackground: 'rgba(124, 108, 240, 0.3)',
                black: '#1a1b2e',
                red: '#ff6b6b',
                green: '#51cf66',
                yellow: '#fcc419',
                blue: '#339af0',
                magenta: '#a8a0ff',
                cyan: '#22b8cf',
                white: '#eaeaf2',
                brightBlack: '#7878a0',
                brightRed: '#ff8787',
                brightGreen: '#69db7c',
                brightYellow: '#ffd43b',
                brightBlue: '#4dabf7',
                brightMagenta: '#b197fc',
                brightCyan: '#3bc9db',
                brightWhite: '#ffffff',
            }
        })

        const fitAddon = new FitAddon()
        term.loadAddon(fitAddon)
        
        // Create a container for xterm
        const xtermContainer = document.createElement('div')
        xtermContainer.style.width = '100%'
        xtermContainer.style.height = '100%'
        xtermContainer.style.position = 'relative'
        xtermContainer.style.overflow = 'hidden'
        session.containerRef.current.appendChild(xtermContainer)
        
        term.open(xtermContainer)

        // Force font antialiasing
        if (term.element) {
            const style = term.element.style as any
            style.WebkitFontSmoothing = 'antialiased'
            style.MozOsxFontSmoothing = 'grayscale'
        }

        // Wait for DOM to update then fit
        requestAnimationFrame(() => {
            try {
                fitAddon.fit()
                // Resize the terminal PTY to match
                if (term.cols && term.rows) {
                    window.electronAPI.resizeTerminal(session.id, term.cols, term.rows)
                }
            } catch (e) {
                console.error('Failed to fit terminal:', e)
            }
        })

        term.onData((data) => {
            if (data === '\r') {
                inputLengthsRef.current[session.id] = 0
                window.electronAPI.writeTerminal(session.id, '\r\n')
            } else if (data === '\x7f' || data === '\x08') { // Backspace or Del
                if ((inputLengthsRef.current[session.id] || 0) > 0) {
                    inputLengthsRef.current[session.id]--
                    // Send Remote Erase sequence: Backspace + Space + Backspace
                    // This forces the shell to erase the character on screen correctly.
                    window.electronAPI.writeTerminal(session.id, '\x08 \x08')
                }
            } else {
                // Count printable characters
                for (let i = 0; i < data.length; i++) {
                    const code = data.charCodeAt(i)
                    if (code >= 32 && code !== 127) {
                        inputLengthsRef.current[session.id] = (inputLengthsRef.current[session.id] || 0) + 1
                    }
                }
                window.electronAPI.writeTerminal(session.id, data)
            }
        })

        term.onSelectionChange(() => {
            const selection = term.getSelection()
            if (selection) {
                // Get selection position for floating button
                const terminalElement = session.containerRef.current
                if (terminalElement) {
                    const selectionRect = window.getSelection()?.getRangeAt(0).getBoundingClientRect()
                    if (selectionRect) {
                        setSelection({
                            text: selection,
                            x: selectionRect.left + selectionRect.width / 2,
                            y: selectionRect.top - 10
                        })
                    }
                }
            } else {
                setSelection(null)
            }
        })

        // Update session object
        session.instance = term
        session.fitAddon = fitAddon

        // Create backend process
        await window.electronAPI.createTerminal(session.id, shell, state.projectPath || '')

        term.focus()
    }

    const [selection, setSelection] = useState<{ text: string; x: number; y: number } | null>(null)

    function handleAddToChat() {
        if (selection) {
            dispatch({ type: 'APPEND_TO_CHAT', content: selection.text })
            setSelection(null)
            const session = sessions.find(s => s.id === activeSessionId)
            session?.instance?.clearSelection()
        }
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
        <div className="terminal-panel-wrapper">
            <div className="terminal-toolbar">
                <div className="terminal-tabs">
                    {sessions.map(s => (
                        <div
                            key={s.id}
                            className={`terminal-tab ${activeSessionId === s.id ? 'active' : ''}`}
                            onClick={() => setActiveSessionId(s.id)}
                        >
                            <span>{s.title.toLowerCase()}</span>
                            <X size={10} onClick={(e) => { e.stopPropagation(); closeSession(s.id) }} />
                        </div>
                    ))}
                    <button className="toolbar-btn" onClick={createNewSession} title="New Terminal">
                        <Plus size={14} />
                    </button>
                </div>

                <div className="terminal-actions">
                    <button className="toolbar-btn" onClick={onToggleMaximize} title={isMaximized ? 'Restore' : 'Maximize'}>
                        {isMaximized ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                    </button>
                    <button className="toolbar-btn" onClick={() => dispatch({ type: 'TOGGLE_TERMINAL' })} title="Close Panel">
                        <X size={14} />
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

                {selection && (
                    <div
                        className="terminal-selection-popup"
                        style={{
                            position: 'fixed',
                            left: `${selection.x}px`,
                            top: `${selection.y}px`,
                            transform: 'translate(-50%, -100%)',
                            zIndex: 1000,
                        }}
                    >
                        <button
                            className="terminal-add-to-chat-btn"
                            onClick={(e) => {
                                e.stopPropagation()
                                handleAddToChat()
                            }}
                            onMouseDown={(e) => e.stopPropagation()}
                        >
                            <Bot size={13} />
                            <span>Add to Chat</span>
                        </button>
                    </div>
                )}
            </div>
        </div>
    )
}
