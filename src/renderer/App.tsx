import React, { useEffect, useCallback, useState, useRef } from 'react'
import { useApp } from './store/appStore'
import SetupScreen from './components/SetupScreen'
import TitleBar from './components/TitleBar'
import Sidebar from './components/Sidebar'
import Editor from './components/Editor'
import TabBar from './components/TabBar'
import ChatPanel from './components/ChatPanel'
import StatusBar from './components/StatusBar'
import SettingsPanel from './components/SettingsPanel'
import CommandPalette from './components/CommandPalette'
import DiffPreview from './components/DiffPreview'
import ContextMenu from './components/ContextMenu'
import TerminalPanel from './components/TerminalPanel'
import ProblemsPanel from './components/ProblemsPanel'
import QuickOpen from './components/QuickOpen'
import DebugPanel from './components/DebugPanel'
import StandaloneChat from './components/StandaloneChat'

export default function App() {
    const { state, dispatch } = useApp()
    const [bottomTab, setBottomTab] = React.useState<'terminal' | 'problems' | 'debug'>('terminal')
    const [isBottomPanelMaximized, setIsBottomPanelMaximized] = React.useState(false)
    const [isInitializing, setIsInitializing] = useState(true)

    const toggleBottomPanelMaximized = useCallback(() => {
        setIsBottomPanelMaximized(prev => !prev)
    }, [])


    // Performance optimization: debounce project-wide linting
    const runLinting = useCallback(async () => {
        if (!state.projectPath) return
        const result = await window.electronAPI.lintCodebase(state.projectPath)
        if (result.success && result.problems) {
            dispatch({ type: 'SET_PROBLEMS', problems: result.problems })
        }
    }, [state.projectPath, dispatch])

    // Run linting on initial project load
    useEffect(() => {
        if (state.projectPath && state.screen === 'ide') {
            runLinting()
        }
    }, [state.projectPath, state.screen, runLinting])

    // Load settings and restore session on mount
    useEffect(() => {
        async function initApp() {
            try {
                const settings = await window.electronAPI.getSettings()
                dispatch({ type: 'SET_SETTINGS', settings })

                // Check if this is a returning user (setupComplete with valid paths)
                const isLlamaReady = settings.modelPath && settings.serverBinaryPath
                const isAirllmReady = settings.aiBackend === 'airllm' && settings.airllmModelId
                const isReturningUser = settings.setupComplete && (isLlamaReady || isAirllmReady)

                if (isReturningUser) {
                    // Returning user — show IDE IMMEDIATELY, restore everything in background
                    dispatch({ type: 'SET_SCREEN', screen: 'ide' })

                    // Restore chat history (synchronous dispatches, instant)
                    if (settings.chatMessages && settings.chatMessages.length > 0) {
                        dispatch({ type: 'SET_CHAT_MESSAGES', messages: settings.chatMessages })
                    }
                    if (settings.standaloneChatSessions && settings.standaloneChatSessions.length > 0) {
                        dispatch({ type: 'SET_STANDALONE_CHAT_SESSIONS', sessions: settings.standaloneChatSessions })
                    }

                    // Hide loading screen NOW — everything below runs in background
                    setIsInitializing(false)

                    // ── Background: restore project files ──
                    if (settings.lastProjectPath) {
                        window.electronAPI.getFileTree(settings.lastProjectPath).then((tree) => {
                            dispatch({ type: 'SET_PROJECT', path: settings.lastProjectPath!, tree })

                            // Read open files in parallel
                            const langMap: Record<string, string> = {
                                ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
                                py: 'python', rs: 'rust', go: 'go', java: 'java', cpp: 'cpp', c: 'c',
                                h: 'c', hpp: 'cpp', css: 'css', html: 'html', json: 'json', md: 'markdown',
                                yaml: 'yaml', yml: 'yaml', xml: 'xml', sh: 'shell', sql: 'sql',
                                rb: 'ruby', php: 'php', swift: 'swift', kt: 'kotlin', toml: 'toml'
                            }

                            Promise.all(
                                (settings.lastOpenFiles || []).map(async (filePath: string) => {
                                    try {
                                        const result = await window.electronAPI.readFile(filePath)
                                        if (result.success && result.content !== undefined) {
                                            const name = filePath.split('\\').pop() || filePath
                                            const ext = name.split('.').pop()?.toLowerCase() || ''
                                            dispatch({
                                                type: 'OPEN_FILE',
                                                file: {
                                                    path: filePath,
                                                    name,
                                                    content: result.content,
                                                    language: langMap[ext] || 'plaintext',
                                                    isDirty: false
                                                }
                                            })
                                        }
                                    } catch { /* skip unreadable files */ }
                                })
                            ).then(() => {
                                if (settings.lastActiveFile) {
                                    dispatch({ type: 'SET_ACTIVE_FILE', path: settings.lastActiveFile })
                                }
                            })
                        }).catch(() => { /* skip if folder no longer exists */ })
                    }

                    // ── Background: scan models ──
                    if (settings.modelsDirectory) {
                        window.electronAPI.scanLocalModels(settings.modelsDirectory).catch(() => { })
                    }

                    // ── Background: start AI server ──
                    dispatch({ type: 'SET_AI_STATUS', status: 'connecting' })
                    window.electronAPI.startAIServer().then((aiResult) => {
                        dispatch({ type: 'SET_AI_STATUS', status: aiResult.success ? 'connected' : 'disconnected' })
                    }).catch(() => {
                        dispatch({ type: 'SET_AI_STATUS', status: 'disconnected' })
                    })

                    return // early return — setIsInitializing already called above
                } else {
                    dispatch({ type: 'SET_SCREEN', screen: 'setup' })
                    dispatch({ type: 'SET_AI_STATUS', status: 'disconnected' })
                }
            } catch (error) {
                console.error('Failed to init app:', error)
                dispatch({ type: 'SET_SCREEN', screen: 'setup' })
                dispatch({ type: 'SET_AI_STATUS', status: 'disconnected' })
            } finally {
                setIsInitializing(false)
            }
        }
        initApp()
    }, [])

    // Save session when it changes
    useEffect(() => {
        if (state.screen === 'ide') {
            const lastProjectPath = state.projectPath
            const lastOpenFiles = state.openFiles.map(f => f.path)
            const lastActiveFile = state.activeFilePath
            const chatMessages = state.chatMessages
            const standaloneChatSessions = state.standaloneChatSessions

            window.electronAPI.saveSettings({
                lastProjectPath,
                lastOpenFiles,
                lastActiveFile,
                chatMessages,
                standaloneChatSessions
            }).catch(err => {
                console.error('Failed to save session settings:', err)
            })
        }
    }, [state.projectPath, state.openFiles.length, state.activeFilePath, state.chatMessages, state.standaloneChatSessions, state.screen])

    // Apply theme
    useEffect(() => {
        document.documentElement.setAttribute('data-theme', state.settings.theme)
    }, [state.settings.theme])

    // Auto-start AI server when entering IDE (handles setup completion flow)
    useEffect(() => {
        if (state.screen !== 'ide') return
        // Only auto-start if not already connecting/connected (avoids double-call from initApp)
        if (state.aiStatus !== 'disconnected') return

        const hasLlama = state.settings.modelPath && state.settings.serverBinaryPath
        const hasAirllm = state.settings.aiBackend === 'airllm' && state.settings.airllmModelId
        if (!hasLlama && !hasAirllm) return

        dispatch({ type: 'SET_AI_STATUS', status: 'connecting' })
        window.electronAPI.startAIServer().then((result) => {
            dispatch({ type: 'SET_AI_STATUS', status: result.success ? 'connected' : 'disconnected' })
        }).catch(() => {
            dispatch({ type: 'SET_AI_STATUS', status: 'disconnected' })
        })
    }, [state.screen])

    // Download event listeners
    useEffect(() => {
        // llama.cpp downloads
        const unsubscribeProgress = window.electronAPI.onDownloadProgress((data) => {
            dispatch({ type: 'DOWNLOAD_PROGRESS', progress: data.progress, speed: data.speed, modelId: data.modelId })
        })
        const unsubscribeComplete = window.electronAPI.onDownloadComplete((data) => {
            dispatch({ type: 'DOWNLOAD_COMPLETE', modelId: data.modelId })
        })
        const unsubscribeError = window.electronAPI.onDownloadError((data) => {
            dispatch({ type: 'DOWNLOAD_ERROR', modelId: data.modelId, error: data.error })
        })

        // AirLLM downloads
        const unsubAirllmProgress = window.electronAPI.onAirllmDownloadProgress((data) => {
            dispatch({ type: 'DOWNLOAD_PROGRESS', progress: data.progress, speed: data.speed, modelId: data.modelId, downloaded: data.downloaded, total: data.total })
        })
        const unsubAirllmComplete = window.electronAPI.onAirllmDownloadComplete((data) => {
            dispatch({ type: 'DOWNLOAD_COMPLETE', modelId: data.modelId })
        })
        const unsubAirllmError = window.electronAPI.onAirllmDownloadError((data) => {
            dispatch({ type: 'DOWNLOAD_ERROR', modelId: data.modelId, error: data.error })
        })

        return () => {
            unsubscribeProgress()
            unsubscribeComplete()
            unsubscribeError()
            unsubAirllmProgress()
            unsubAirllmComplete()
            unsubAirllmError()
        }
    }, [])

    // Global AI Stream Listener
    const activeStreamTargetRef = useRef(state.activeStreamTarget)
    useEffect(() => {
        activeStreamTargetRef.current = state.activeStreamTarget
    }, [state.activeStreamTarget])

    useEffect(() => {
        const unsubChunk = window.electronAPI.onStreamChunk((chunk) => {
            const target = activeStreamTargetRef.current
            if (target) {
                dispatch({ type: 'APPEND_STREAM_CHUNK', chunk, target })
            }
        })

        const unsubEnd = window.electronAPI.onStreamEnd(() => {
            dispatch({ type: 'SET_STREAMING', isStreaming: false })
            dispatch({ type: 'SET_ACTIVE_STREAM_TARGET', target: null })
        })

        return () => {
            unsubChunk()
            unsubEnd()
        }
    }, [])

    const saveActiveFile = useCallback(async () => {
        const file = state.openFiles.find(f => f.path === state.activeFilePath)
        if (!file || !file.isDirty) return
        const result = await window.electronAPI.writeFile(file.path, file.content)
        if (result.success) {
            dispatch({ type: 'MARK_FILE_SAVED', path: file.path })
            // Refresh tree to update Git status
            if (state.projectPath) {
                const tree = await window.electronAPI.getFileTree(state.projectPath)
                dispatch({ type: 'SET_FILE_TREE', tree })
                // Trigger project-wide linting
                runLinting()
            }
        }
    }, [state.openFiles, state.activeFilePath, state.projectPath, dispatch])

    // Close context menu on click
    useEffect(() => {
        function handleClick() {
            if (state.contextMenu) {
                dispatch({ type: 'SET_CONTEXT_MENU', menu: null })
            }
        }
        window.addEventListener('click', handleClick)
        return () => window.removeEventListener('click', handleClick)
    }, [state.contextMenu])

    // Global keyboard shortcuts
    useEffect(() => {
        function handleKeyDown(e: KeyboardEvent) {
            // Ctrl+P: Quick Open (prevent default browser print)
            if (e.ctrlKey && e.key === 'p') {
                e.preventDefault()
                dispatch({ type: 'TOGGLE_QUICK_OPEN' })
                return
            }
            // Ctrl+Shift+P: Command Palette
            if (e.ctrlKey && e.shiftKey && e.key === 'P') {
                e.preventDefault()
                dispatch({ type: 'TOGGLE_COMMAND_PALETTE' })
            }
            // Ctrl+S: Save file
            if (e.ctrlKey && e.key === 's') {
                e.preventDefault()
                saveActiveFile()
            }
            // Ctrl+B: Toggle sidebar
            if (e.ctrlKey && e.key === 'b') {
                e.preventDefault()
                dispatch({ type: 'TOGGLE_SIDEBAR' })
            }
            // Ctrl+J: Toggle chat panel
            if (e.ctrlKey && e.key === 'j') {
                e.preventDefault()
                dispatch({ type: 'TOGGLE_CHAT_PANEL' })
            }
            // Ctrl+`: Toggle terminal
            if (e.ctrlKey && e.key === '`') {
                e.preventDefault()
                dispatch({ type: 'TOGGLE_TERMINAL' })
            }
            // Ctrl+,: Settings
            if (e.ctrlKey && e.key === ',') {
                e.preventDefault()
                dispatch({ type: 'TOGGLE_SETTINGS' })
            }
            // Escape: Close overlays
            if (e.key === 'Escape') {
                if (state.showQuickOpen) dispatch({ type: 'TOGGLE_QUICK_OPEN' })
                if (state.showCommandPalette) dispatch({ type: 'TOGGLE_COMMAND_PALETTE' })
                if (state.showSettings) dispatch({ type: 'TOGGLE_SETTINGS' })
                if (state.diffPreview) dispatch({ type: 'SET_DIFF_PREVIEW', diff: null })
                if (state.contextMenu) dispatch({ type: 'SET_CONTEXT_MENU', menu: null })
            }
            // Ctrl+\\: Toggle split editor
            if (e.ctrlKey && e.key === '\\') {
                e.preventDefault()
                dispatch({ type: 'TOGGLE_SPLIT_EDITOR' })
            }
        }
        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [state.showCommandPalette, state.showSettings, state.diffPreview, state.contextMenu, saveActiveFile, dispatch, state.showCommandPalette])


    return (
        <div className="app-container">
            {/* Loading Screen with Bouncing Neon Dots */}
            {(state.screen === 'loading' || isInitializing) && (
                <div className="loading-screen">
                    <div className="loading-logo">
                        <img src="./assets/logo.jpg" alt="QuietlyCode" />
                    </div>
                    <div className="loading-dots">
                        <div className="loading-dot" />
                        <div className="loading-dot" />
                        <div className="loading-dot" />
                    </div>
                    <div className="loading-text">Starting QuietlyCode...</div>
                </div>
            )}

            {!isInitializing && (
                <>
                    <TitleBar />
                    {state.screen === 'setup' ? (
                        <SetupScreen />
                    ) : state.screen === 'ide' ? (
                        <>
                            {state.viewMode === 'ide' ? (
                                <div key="ide-view" className="main-layout" style={{ animation: 'fadeInView 0.3s cubic-bezier(0.2, 0, 0, 1)' }}>
                                    {state.sidebarVisible && <Sidebar />}
                                    <div className="editor-area">
                                        <div className={`editor-main ${state.splitEditor.enabled ? 'split' : ''}`}>
                                            <TabBar />
                                            <div className="editor-content">
                                                <Editor isSecondary={false} />
                                                {state.splitEditor.enabled && (
                                                    <Editor isSecondary={true} />
                                                )}
                                            </div>
                                        </div>

                                        {state.terminalVisible && (
                                            <div className={`bottom-panel-container ${isBottomPanelMaximized ? 'maximized' : ''}`}>
                                                <div className="bottom-panel-tabs">
                                                    <div
                                                        className={`bottom-tab ${bottomTab === 'terminal' ? 'active' : ''}`}
                                                        onClick={() => setBottomTab('terminal')}
                                                    >
                                                        TERMINAL
                                                    </div>
                                                    <div
                                                        className={`bottom-tab ${bottomTab === 'problems' ? 'active' : ''}`}
                                                        onClick={() => setBottomTab('problems')}
                                                    >
                                                        PROBLEMS
                                                        {state.problems.length > 0 && (
                                                            <span className="bottom-tab-badge">{state.problems.length}</span>
                                                        )}
                                                    </div>
                                                    <div
                                                        className={`bottom-tab ${bottomTab === 'debug' ? 'active' : ''}`}
                                                        onClick={() => setBottomTab('debug')}
                                                    >
                                                        DEBUG
                                                    </div>
                                                </div>
                                                <div className="bottom-panel-content">
                                                    {bottomTab === 'terminal' && (
                                                        <TerminalPanel
                                                            isMaximized={isBottomPanelMaximized}
                                                            onToggleMaximize={toggleBottomPanelMaximized}
                                                        />
                                                    )}
                                                    {bottomTab === 'problems' && (
                                                        <ProblemsPanel
                                                            isMaximized={isBottomPanelMaximized}
                                                            onToggleMaximize={toggleBottomPanelMaximized}
                                                        />
                                                    )}
                                                    {bottomTab === 'debug' && (
                                                        <DebugPanel />
                                                    )}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                    {state.chatPanelVisible && <ChatPanel />}
                                </div>
                            ) : (
                                <div key="chat-view" className="main-layout chat-mode-layout" style={{ animation: 'fadeInView 0.3s cubic-bezier(0.2, 0, 0, 1)' }}>
                                    <div className="editor-area standalone-chat-area">
                                        <StandaloneChat />
                                    </div>
                                </div>
                            )}
                        </>
                    ) : null}
                    <StatusBar />

                    {/* Overlays */}
                    {state.showQuickOpen && <QuickOpen />}
                    {state.showSettings && <SettingsPanel />}
                    {state.showCommandPalette && <CommandPalette />}
                    {state.diffPreview && <DiffPreview />}
                    {state.contextMenu && <ContextMenu />}
                </>
            )}
        </div>
    )
}

