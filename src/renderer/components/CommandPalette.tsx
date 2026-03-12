import React, { useState, useEffect, useRef } from 'react'
import { useApp } from '../store/appStore'
import {
    Settings, FolderOpen, PanelLeft, PanelRight,
    Sun, Moon, Trash2, FileCode, Code, Wand2, Bot
} from 'lucide-react'

interface Command {
    id: string
    label: string
    icon: React.ReactNode
    shortcut?: string
    action: () => void
}

export default function CommandPalette() {
    const { state, dispatch } = useApp()
    const [query, setQuery] = useState('')
    const [selectedIndex, setSelectedIndex] = useState(0)
    const inputRef = useRef<HTMLInputElement>(null)

    useEffect(() => {
        inputRef.current?.focus()
    }, [])

    async function openFolder() {
        const result = await window.electronAPI.openFolder()
        if (result) {
            dispatch({ type: 'SET_PROJECT', path: result.path, tree: result.tree })
        }
        dispatch({ type: 'TOGGLE_COMMAND_PALETTE' })
    }

    const commands: Command[] = [
        {
            id: 'open-folder',
            label: 'Open Folder',
            icon: <FolderOpen size={14} />,
            shortcut: '',
            action: openFolder
        },
        {
            id: 'toggle-sidebar',
            label: 'Toggle Sidebar',
            icon: <PanelLeft size={14} />,
            shortcut: 'Ctrl+B',
            action: () => {
                dispatch({ type: 'TOGGLE_SIDEBAR' })
                dispatch({ type: 'TOGGLE_COMMAND_PALETTE' })
            }
        },
        {
            id: 'toggle-chat',
            label: 'Toggle AI Panel',
            icon: <PanelRight size={14} />,
            shortcut: 'Ctrl+J',
            action: () => {
                dispatch({ type: 'TOGGLE_CHAT_PANEL' })
                dispatch({ type: 'TOGGLE_COMMAND_PALETTE' })
            }
        },
        {
            id: 'settings',
            label: 'Open Settings',
            icon: <Settings size={14} />,
            shortcut: 'Ctrl+,',
            action: () => {
                dispatch({ type: 'TOGGLE_COMMAND_PALETTE' })
                dispatch({ type: 'TOGGLE_SETTINGS' })
            }
        },
        {
            id: 'theme',
            label: `Switch to ${state.settings.theme === 'dark' ? 'Light' : 'Dark'} Theme`,
            icon: state.settings.theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />,
            action: () => {
                const newTheme = state.settings.theme === 'dark' ? 'light' : 'dark'
                dispatch({ type: 'SET_SETTINGS', settings: { theme: newTheme } })
                window.electronAPI.saveSettings({ theme: newTheme })
                dispatch({ type: 'TOGGLE_COMMAND_PALETTE' })
            }
        },
        {
            id: 'start-ai',
            label: 'Start AI Server',
            icon: <Bot size={14} />,
            action: async () => {
                dispatch({ type: 'SET_AI_STATUS', status: 'connecting' })
                const result = await window.electronAPI.startAIServer()
                dispatch({ type: 'SET_AI_STATUS', status: result.success ? 'connected' : 'disconnected' })
                dispatch({ type: 'TOGGLE_COMMAND_PALETTE' })
            }
        },
        {
            id: 'stop-ai',
            label: 'Stop AI Server',
            icon: <Bot size={14} />,
            action: async () => {
                await window.electronAPI.stopAIServer()
                dispatch({ type: 'SET_AI_STATUS', status: 'disconnected' })
                dispatch({ type: 'TOGGLE_COMMAND_PALETTE' })
            }
        },
        {
            id: 'clear-chat',
            label: 'Clear Chat History',
            icon: <Trash2 size={14} />,
            action: () => {
                dispatch({ type: 'CLEAR_CHAT' })
                dispatch({ type: 'TOGGLE_COMMAND_PALETTE' })
            }
        },
        {
            id: 'ai-explain',
            label: 'AI: Explain Selection',
            icon: <Code size={14} />,
            shortcut: 'Ctrl+Shift+E',
            action: () => dispatch({ type: 'TOGGLE_COMMAND_PALETTE' })
        },
        {
            id: 'ai-refactor',
            label: 'AI: Refactor Selection',
            icon: <Wand2 size={14} />,
            shortcut: 'Ctrl+Shift+R',
            action: () => dispatch({ type: 'TOGGLE_COMMAND_PALETTE' })
        },
        {
            id: 'ai-generate',
            label: 'AI: Generate Code',
            icon: <FileCode size={14} />,
            action: () => dispatch({ type: 'TOGGLE_COMMAND_PALETTE' })
        }
    ]

    const filtered = query
        ? commands.filter(c => c.label.toLowerCase().includes(query.toLowerCase()))
        : commands

    useEffect(() => {
        setSelectedIndex(0)
    }, [query])

    function handleKeyDown(e: React.KeyboardEvent) {
        if (e.key === 'ArrowDown') {
            e.preventDefault()
            setSelectedIndex(i => Math.min(i + 1, filtered.length - 1))
        } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setSelectedIndex(i => Math.max(i - 1, 0))
        } else if (e.key === 'Enter') {
            e.preventDefault()
            if (filtered[selectedIndex]) {
                filtered[selectedIndex].action()
            }
        } else if (e.key === 'Escape') {
            dispatch({ type: 'TOGGLE_COMMAND_PALETTE' })
        }
    }

    return (
        <div className="command-palette-overlay" onClick={() => dispatch({ type: 'TOGGLE_COMMAND_PALETTE' })}>
            <div className="command-palette" onClick={(e) => e.stopPropagation()}>
                <input
                    ref={inputRef}
                    className="command-palette-input"
                    placeholder="Type a command..."
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={handleKeyDown}
                />
                <div className="command-palette-list">
                    {filtered.map((cmd, i) => (
                        <div
                            key={cmd.id}
                            className={`command-palette-item ${i === selectedIndex ? 'selected' : ''}`}
                            onClick={cmd.action}
                            onMouseEnter={() => setSelectedIndex(i)}
                        >
                            {cmd.icon}
                            <span>{cmd.label}</span>
                            {cmd.shortcut && <span className="shortcut">{cmd.shortcut}</span>}
                        </div>
                    ))}
                    {filtered.length === 0 && (
                        <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-tertiary)' }}>
                            No matching commands
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
