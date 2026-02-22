import React, { useState, useEffect } from 'react'
import { useApp } from '../store/appStore'
import { Cpu, Minus, Square, Copy, X, Sun, Moon, Settings, Terminal } from 'lucide-react'

export default function TitleBar() {
    const { state, dispatch } = useApp()
    const [isMaximized, setIsMaximized] = useState(true)

    useEffect(() => {
        // Get initial state
        window.electronAPI.isMaximized().then(setIsMaximized)

        // Listen for changes
        const unsub = window.electronAPI.onMaximizeChange((maximized) => {
            setIsMaximized(maximized)
        })
        return unsub
    }, [])

    function toggleTheme() {
        const newTheme = state.settings.theme === 'dark' ? 'light' : 'dark'
        dispatch({ type: 'SET_SETTINGS', settings: { theme: newTheme } })
        window.electronAPI.saveSettings({ theme: newTheme })
    }

    return (
        <div className="titlebar">
            <div className="titlebar-logo">
                <Cpu size={16} strokeWidth={2} />
                <span>BitNet IDE</span>
            </div>

            {/* IDE menu buttons - only show in IDE mode */}
            {state.screen === 'ide' && (
                <div className="titlebar-menu">
                    <button
                        className={`titlebar-menu-btn ${state.terminalVisible ? 'active' : ''}`}
                        onClick={() => dispatch({ type: 'TOGGLE_TERMINAL' })}
                        title="Toggle Terminal (Ctrl+`)"
                    >
                        <Terminal size={14} />
                        <span>Terminal</span>
                    </button>
                </div>
            )}

            <div className="titlebar-controls">
                <button className="titlebar-btn" onClick={toggleTheme} title="Toggle Theme">
                    {state.settings.theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
                </button>
                <button className="titlebar-btn" onClick={() => dispatch({ type: 'TOGGLE_SETTINGS' })} title="Settings">
                    <Settings size={14} />
                </button>
                <button className="titlebar-btn" onClick={() => window.electronAPI.minimize()} title="Minimize">
                    <Minus size={14} />
                </button>
                <button className="titlebar-btn" onClick={() => window.electronAPI.maximize()} title={isMaximized ? 'Restore' : 'Maximize'}>
                    {isMaximized ? <Copy size={12} /> : <Square size={12} />}
                </button>
                <button className="titlebar-btn close" onClick={() => window.electronAPI.close()} title="Close">
                    <X size={14} />
                </button>
            </div>
        </div>
    )
}
