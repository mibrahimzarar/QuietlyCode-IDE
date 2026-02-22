import React, { useEffect, useCallback } from 'react'
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

export default function App() {
    const { state, dispatch } = useApp()

    // Load settings on mount
    useEffect(() => {
        async function init() {
            try {
                const settings = await window.electronAPI.getSettings()
                dispatch({ type: 'SET_SETTINGS', settings })

                // If setup is complete, go to IDE
                if (settings.setupComplete) {
                    dispatch({ type: 'SET_SCREEN', screen: 'ide' })
                }
            } catch (e) {
                console.error('Failed to load settings:', e)
            }
        }
        init()
    }, [])

    // Apply theme
    useEffect(() => {
        document.documentElement.setAttribute('data-theme', state.settings.theme)
    }, [state.settings.theme])

    // Auto-start AI server when entering IDE
    useEffect(() => {
        if (state.screen === 'ide' && state.settings.modelPath && state.settings.serverBinaryPath) {
            dispatch({ type: 'SET_AI_STATUS', status: 'connecting' })
            window.electronAPI.startAIServer().then((result) => {
                if (result.success) {
                    dispatch({ type: 'SET_AI_STATUS', status: 'connected' })
                    console.log('[App] AI server started successfully')
                } else {
                    dispatch({ type: 'SET_AI_STATUS', status: 'disconnected' })
                    console.error('[App] AI server failed to start:', result.error)
                }
            }).catch((err) => {
                dispatch({ type: 'SET_AI_STATUS', status: 'disconnected' })
                console.error('[App] AI server start error:', err)
            })
        }
    }, [state.screen])

    // Download event listeners
    useEffect(() => {
        const unsubscribeProgress = window.electronAPI.onDownloadProgress((data) => {
            dispatch({ type: 'DOWNLOAD_PROGRESS', progress: data.progress, speed: data.speed, modelId: data.modelId })
        })
        const unsubscribeComplete = window.electronAPI.onDownloadComplete((data) => {
            dispatch({ type: 'DOWNLOAD_COMPLETE', modelId: data.modelId })
        })
        const unsubscribeError = window.electronAPI.onDownloadError((data) => {
            dispatch({ type: 'DOWNLOAD_ERROR', modelId: data.modelId, error: data.error })
        })

        return () => {
            unsubscribeProgress()
            unsubscribeComplete()
            unsubscribeError()
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
                if (state.showCommandPalette) dispatch({ type: 'TOGGLE_COMMAND_PALETTE' })
                if (state.showSettings) dispatch({ type: 'TOGGLE_SETTINGS' })
                if (state.diffPreview) dispatch({ type: 'SET_DIFF_PREVIEW', diff: null })
                if (state.contextMenu) dispatch({ type: 'SET_CONTEXT_MENU', menu: null })
            }
        }
        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [state.showCommandPalette, state.showSettings, state.diffPreview, state.contextMenu, saveActiveFile, dispatch, state.showCommandPalette])


    return (
        <div className="app-container">
            <TitleBar />
            {state.screen === 'setup' ? (
                <SetupScreen />
            ) : (
                <div className="main-layout">
                    {state.sidebarVisible && <Sidebar />}
                    <div className="editor-area">
                        <div className="editor-main">
                            <TabBar />
                            <Editor />
                        </div>
                        {state.terminalVisible && <TerminalPanel />}
                    </div>
                    {state.chatPanelVisible && <ChatPanel />}
                </div>
            )}
            <StatusBar />

            {/* Overlays */}
            {state.showSettings && <SettingsPanel />}
            {state.showCommandPalette && <CommandPalette />}
            {state.diffPreview && <DiffPreview />}
            {state.contextMenu && <ContextMenu />}
        </div>
    )
}

