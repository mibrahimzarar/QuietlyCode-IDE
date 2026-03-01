import React, { useState, useRef, useEffect } from 'react'
import { useApp, ChatMessage, ChatSession, FileTreeNode } from '../store/appStore'
import { PROMPTS } from '../prompts'
import {
    Send, Trash2, Sparkles, Code, Wand2, FileCode, Bot, Scan,
    ChevronDown, ChevronRight, Cpu, Brain, FileEdit, FilePlus, FileX,
    Check, X, Loader, Square, Plus, MessageSquare, Edit2, Check as CheckIcon
} from 'lucide-react'

// Types for parsed file actions
interface FilePatch {
    search: string
    replace: string
}

interface FileAction {
    id: string
    type: 'create' | 'edit' | 'delete' | 'patch'
    path: string
    content?: string
    patches?: FilePatch[]
    status: 'idle' | 'pending' | 'applied' | 'rejected' | 'error'
    error?: string
}

// Helper to flatten file tree
function flattenFileTree(nodes: FileTreeNode[]): string[] {
    let files: string[] = []
    for (const node of nodes) {
        if (node.isDirectory && node.children) {
            files = [...files, ...flattenFileTree(node.children)]
        } else if (!node.isDirectory) {
            files.push(node.path)
        }
    }
    return files
}

export default function StandaloneChat() {
    const { state, dispatch } = useApp()
    const [input, setInput] = useState('')
    const messagesEndRef = useRef<HTMLDivElement>(null)
    const textareaRef = useRef<HTMLTextAreaElement>(null)
    const streamContentRef = useRef('')
    const [codebaseContext, setCodebaseContext] = useState<string | null>(null)
    const [analyzing, setAnalyzing] = useState(false)

    // Suggestions state
    const [showSuggestions, setShowSuggestions] = useState(false)
    const [suggestionQuery, setSuggestionQuery] = useState('')
    const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(0)
    const [filteredFiles, setFilteredFiles] = useState<string[]>([])
    const [cursorPosition, setCursorPosition] = useState(0)

    // Flatten files for search
    const allFiles = React.useMemo(() => {
        return flattenFileTree(state.fileTree)
    }, [state.fileTree])

    // Update filtered files when query changes
    useEffect(() => {
        if (showSuggestions) {
            const lowerQuery = suggestionQuery.toLowerCase()
            const matches = allFiles
                .filter(f => {
                    const name = f.split(/[\\/]/).pop() || f
                    return name.toLowerCase().includes(lowerQuery)
                })
                .slice(0, 5) // Limit to 5 suggestions
            setFilteredFiles(matches)
            setSelectedSuggestionIndex(0)
        }
    }, [showSuggestions, suggestionQuery, allFiles])

    // Model switcher
    const [models, setModels] = useState<any[]>([])
    const [switchingModel, setSwitchingModel] = useState(false)
    const [showModelDropdown, setShowModelDropdown] = useState(false)
    const dropdownRef = useRef<HTMLDivElement>(null)
    const [downloadedAirllm, setDownloadedAirllm] = useState<Array<{ name: string; path: string; size: string; id: string }>>([])

    // File actions state
    const [fileActions, setFileActions] = useState<Record<string, FileAction>>({})

    const activeSession = state.standaloneChatSessions.find(s => s.id === state.activeStandaloneChatId)
    const chatMessages = activeSession?.messages || []

    // Auto-scroll
    useEffect(() => {
        if (messagesEndRef.current) {
            messagesEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' })
        }
    }, [chatMessages, state.isStreaming])



    // Watch for new user messages and trigger AI
    useEffect(() => {
        if (chatMessages.length === 0) return
        const lastMsg = chatMessages[chatMessages.length - 1]
        if (lastMsg.role === 'user' && !state.isStreaming) {
            sendToAI()
        }
    }, [chatMessages.length, state.isStreaming]) // specifically depend on length to only trigger on new addition

    async function loadModels() {
        if (!state.settings.modelsDirectory) return
        try {
            const found = await window.electronAPI.scanLocalModels(state.settings.modelsDirectory)
            setModels(found)
            const airllm = await window.electronAPI.scanDownloadedAirllm(state.settings.modelsDirectory)
            setDownloadedAirllm(airllm)
        } catch (err) { /* ignore */ }
    }

    // Load models
    useEffect(() => {
        loadModels()
    }, [state.settings.modelsDirectory])

    // Close dropdown on outside click
    useEffect(() => {
        function handleClick(e: MouseEvent) {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setShowModelDropdown(false)
            }
        }
        document.addEventListener('mousedown', handleClick)
        return () => document.removeEventListener('mousedown', handleClick)
    }, [])

    const isAirllm = state.settings.aiBackend === 'airllm'

    // AirLLM config state
    const [airllmModelId, setAirllmModelId] = useState(state.settings.airllmModelId || 'Qwen/Qwen2.5-7B-Instruct')
    const [airllmCompression, setAirllmCompression] = useState<'4bit' | '8bit'>(state.settings.airllmCompression || '4bit')
    const currentModelName = isAirllm
        ? (state.settings.airllmModelId?.split('/').pop() || 'AirLLM')
        : state.settings.modelPath
            ? state.settings.modelPath.split(/[\\/]/).pop()?.replace('.gguf', '') || 'Model'
            : 'No Model'

    async function handleModelSelect(modelPath: string) {
        if (modelPath === state.settings.modelPath) {
            setShowModelDropdown(false)
            return
        }

        setShowModelDropdown(false)
        setSwitchingModel(true)

        // Update settings immediately so the UI reflects the change
        const newSettings = { ...state.settings, modelPath }
        await window.electronAPI.saveSettings(newSettings)
        dispatch({ type: 'SET_SETTINGS', settings: newSettings })

        // Restart server in background
        try {
            await window.electronAPI.stopAIServer()
            window.electronAPI.startAIServer().then((result) => {
                setSwitchingModel(false)
                if (!result.success) {
                    dispatch({ type: 'SET_AI_STATUS', status: 'disconnected' })
                } else {
                    dispatch({ type: 'SET_AI_STATUS', status: 'connected' })
                }
            })
        } catch {
            setSwitchingModel(false)
        }
    }

    const [indexingProgress, setIndexingProgress] = useState<{ current: number; total: number; file: string } | null>(null)

    // Listen for indexing progress
    useEffect(() => {
        return window.electronAPI.onRagProgress((data) => {
            setIndexingProgress(data)
        })
    }, [])

    async function sendToAI() {
        dispatch({ type: 'SET_STREAMING', isStreaming: true })
        dispatch({ type: 'SET_ACTIVE_STREAM_TARGET', target: 'standalone' })

        dispatch({
            type: 'ADD_STANDALONE_CHAT_MESSAGE',
            message: {
                id: `assistant-${Date.now()}`,
                role: 'assistant',
                content: '',
                timestamp: Date.now()
            }
        })

        streamContentRef.current = ''

        const systemPrompt = PROMPTS.standaloneSystem

        const chatLog = chatMessages
            .filter(m => m.role !== 'system')
            .map(m => ({ role: m.role, content: m.content }))



        const messages = [
            { role: 'system', content: systemPrompt },
            ...chatLog
        ]

        const result = await window.electronAPI.chatStream(messages)

        if (!result.success) {
            dispatch({
                type: 'UPDATE_LAST_STANDALONE_ASSISTANT_MESSAGE',
                content: `⚠️ ${result.error || 'Failed to get response. Is the model running?'}`
            })
            dispatch({ type: 'SET_STREAMING', isStreaming: false })
        }
    }

    function handleSend() {
        const trimmed = input.trim()
        if (!trimmed || state.isStreaming) return

        setShowSuggestions(false)

        // If no active session, create one first
        if (!state.activeStandaloneChatId) {
            const newSessionId = `session-${Date.now()}`
            const newSession: ChatSession = {
                id: newSessionId,
                title: trimmed.substring(0, 30) + (trimmed.length > 30 ? '...' : ''),
                messages: [{
                    id: `user-${Date.now()}`,
                    role: 'user',
                    content: trimmed,
                    timestamp: Date.now()
                }],
                updatedAt: Date.now()
            }
            dispatch({ type: 'ADD_STANDALONE_CHAT_SESSION', session: newSession })
            // the useEffect will trigger AI when chatMessages updates
        } else {
            dispatch({
                type: 'ADD_STANDALONE_CHAT_MESSAGE',
                message: {
                    id: `user-${Date.now()}`,
                    role: 'user',
                    content: trimmed,
                    timestamp: Date.now()
                }
            })
            // rename session if it's the first message
            if (chatMessages.length === 0) {
                dispatch({
                    type: 'UPDATE_STANDALONE_CHAT_TITLE',
                    id: state.activeStandaloneChatId,
                    title: trimmed.substring(0, 30) + (trimmed.length > 30 ? '...' : '')
                })
            }
        }

        setInput('')

        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto'
        }
    }

    function handleKeyDown(e: React.KeyboardEvent) {
        if (showSuggestions && filteredFiles.length > 0) {
            if (e.key === 'ArrowUp') {
                e.preventDefault()
                setSelectedSuggestionIndex(prev => (prev > 0 ? prev - 1 : filteredFiles.length - 1))
                return
            }
            if (e.key === 'ArrowDown') {
                e.preventDefault()
                setSelectedSuggestionIndex(prev => (prev < filteredFiles.length - 1 ? prev + 1 : 0))
                return
            }
            if (e.key === 'Enter' || e.key === 'Tab') {
                e.preventDefault()
                insertSuggestion(filteredFiles[selectedSuggestionIndex])
                return
            }
            if (e.key === 'Escape') {
                setShowSuggestions(false)
                return
            }
        }

        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            handleSend()
        }
    }

    function insertSuggestion(filePath: string) {
        const lastAt = input.lastIndexOf('@', cursorPosition)
        if (lastAt !== -1) {
            const prefix = input.substring(0, lastAt)
            const displayPath = state.projectPath ? filePath.replace(state.projectPath, '').replace(/^[\\/]/, '') : filePath
            const suffix = input.substring(cursorPosition)
            const newInput = `${prefix}@${displayPath} ${suffix}`
            setInput(newInput)
            setShowSuggestions(false)

            setTimeout(() => {
                const newCursor = lastAt + 1 + displayPath.length + 1
                textareaRef.current?.focus()
                textareaRef.current?.setSelectionRange(newCursor, newCursor)
            }, 0)
        }
    }

    function handleTextareaInput(e: React.ChangeEvent<HTMLTextAreaElement>) {
        const val = e.target.value
        const cursorPos = e.target.selectionStart
        setInput(val)
        setCursorPosition(cursorPos)

        const textBeforeCursor = val.substring(0, cursorPos)
        const lastAt = textBeforeCursor.lastIndexOf('@')

        if (lastAt !== -1) {
            const query = textBeforeCursor.substring(lastAt + 1)
            if (!/\s/.test(query)) {
                setShowSuggestions(true)
                setSuggestionQuery(query)
            } else {
                setShowSuggestions(false)
            }
        } else {
            setShowSuggestions(false)
        }

        e.target.style.height = 'auto'
        e.target.style.height = Math.min(e.target.scrollHeight, 200) + 'px'
    }

    async function handleStop() {
        await window.electronAPI.stopStream()
        dispatch({ type: 'SET_STREAMING', isStreaming: false })
        streamContentRef.current = ''
    }

    // Auto-analyze project
    useEffect(() => {
        if (!state.projectPath) {
            setCodebaseContext(null)
            return
        }

        async function autoAnalyze() {
            try {
                const result = await window.electronAPI.analyzeCodebase(state.projectPath!)
                if (result.success && result.summary) {
                    setCodebaseContext(result.summary)
                }
            } catch (err) { /* ignore */ }
        }
        autoAnalyze()
    }, [state.projectPath])



    // File action handlers
    async function applyFileAction(action: FileAction) {
        setFileActions(prev => ({ ...prev, [action.id]: { ...action, status: 'pending' } }))

        let targetPath = action.path
        if (state.projectPath && !targetPath.match(/^[a-zA-Z]:/)) {
            let cleanPath = targetPath.replace(/^[\/\\]+/, '')
            if (cleanPath.startsWith('./')) cleanPath = cleanPath.slice(2)
            if (cleanPath.startsWith('root/')) cleanPath = cleanPath.slice(5)

            targetPath = `${state.projectPath}/${cleanPath}`.replace(/\\/g, '/')
        }


        try {
            let result: { success: boolean; error?: string }

            if (action.type === 'delete') {
                result = await window.electronAPI.deleteFile(targetPath)
            } else if (action.type === 'create') {
                result = await window.electronAPI.createFile(targetPath)
                if (result.success && action.content) {
                    result = await window.electronAPI.writeFile(targetPath, action.content)
                }
            } else if (action.type === 'patch') {
                result = await window.electronAPI.patchFile(targetPath, action.patches || [])
            } else {
                // edit
                result = await window.electronAPI.writeFile(targetPath, action.content || '')
            }

            if (result.success) {
                setFileActions(prev => ({ ...prev, [action.id]: { ...action, status: 'applied' } }))
                if (state.projectPath) {
                    const tree = await window.electronAPI.getFileTree(state.projectPath)
                    dispatch({ type: 'SET_FILE_TREE', tree })
                }
            } else {
                setFileActions(prev => ({
                    ...prev,
                    [action.id]: { ...action, status: 'error', error: result.error }
                }))
            }
        } catch (err: any) {
            setFileActions(prev => ({
                ...prev,
                [action.id]: { ...action, status: 'error', error: err.message }
            }))
        }
    }

    // Session Sidebar state
    const [editingSessionId, setEditingSessionId] = useState<string | null>(null)
    const [editSessionTitle, setEditSessionTitle] = useState('')
    const [sidebarOpen, setSidebarOpen] = useState(true)

    function createNewSession() {
        const newSessionId = `session-${Date.now()}`
        const newSession: ChatSession = {
            id: newSessionId,
            title: 'New Chat',
            messages: [],
            updatedAt: Date.now()
        }
        dispatch({ type: 'ADD_STANDALONE_CHAT_SESSION', session: newSession })
    }

    return (
        <div className="standalone-layout">
            {/* Sidebar for Sessions */}
            <div className={`standalone-sidebar ${sidebarOpen ? 'open' : 'collapsed'}`}>
                <div className="standalone-sidebar-header">
                    <button
                        className="standalone-new-chat-btn"
                        onClick={createNewSession}
                    >
                        <Plus size={16} /> New Chat
                    </button>
                    <button
                        className="standalone-sidebar-close-btn"
                        onClick={() => setSidebarOpen(false)}
                        title="Close sidebar"
                    >
                        <X size={16} />
                    </button>
                </div>

                <div className="standalone-session-list">
                    {state.standaloneChatSessions.map(session => (
                        <div
                            key={session.id}
                            className={`standalone-session-item ${session.id === state.activeStandaloneChatId ? 'active' : ''}`}
                            onClick={() => {
                                if (editingSessionId !== session.id) {
                                    dispatch({ type: 'SET_ACTIVE_STANDALONE_CHAT', id: session.id })
                                }
                            }}
                        >
                            <div className="standalone-session-item-content">
                                <MessageSquare size={15} className="standalone-session-icon" />
                                {editingSessionId === session.id ? (
                                    <input
                                        autoFocus
                                        className="standalone-session-rename-input"
                                        value={editSessionTitle}
                                        onChange={(e) => setEditSessionTitle(e.target.value)}
                                        onBlur={() => {
                                            dispatch({ type: 'UPDATE_STANDALONE_CHAT_TITLE', id: session.id, title: editSessionTitle || 'New Chat' })
                                            setEditingSessionId(null)
                                        }}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                                dispatch({ type: 'UPDATE_STANDALONE_CHAT_TITLE', id: session.id, title: editSessionTitle || 'New Chat' })
                                                setEditingSessionId(null)
                                            }
                                            if (e.key === 'Escape') setEditingSessionId(null)
                                        }}
                                        onClick={(e) => e.stopPropagation()}
                                    />
                                ) : (
                                    <span className="standalone-session-title">{session.title}</span>
                                )}
                            </div>

                            {session.id === state.activeStandaloneChatId && editingSessionId !== session.id && (
                                <div className="standalone-session-actions">
                                    <button
                                        className="standalone-session-action-btn"
                                        onClick={(e) => {
                                            e.stopPropagation()
                                            setEditSessionTitle(session.title)
                                            setEditingSessionId(session.id)
                                        }}
                                        title="Rename"
                                    >
                                        <Edit2 size={13} />
                                    </button>
                                    <button
                                        className="standalone-session-action-btn delete"
                                        onClick={(e) => {
                                            e.stopPropagation()
                                            dispatch({ type: 'DELETE_STANDALONE_CHAT_SESSION', id: session.id })
                                        }}
                                        title="Delete"
                                    >
                                        <Trash2 size={13} />
                                    </button>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </div>

            <div className="standalone-chat-container">
                {/* Header */}
                <div className="standalone-chat-header">
                    <div className="standalone-chat-header-left">
                        {!sidebarOpen && (
                            <button
                                className="standalone-sidebar-toggle-btn"
                                onClick={() => setSidebarOpen(true)}
                                title="Open sidebar"
                            >
                                <MessageSquare size={18} />
                            </button>
                        )}
                        <div className="standalone-chat-brand">
                            <div className="standalone-brand-icon">
                                <Sparkles size={16} />
                            </div>
                            <span>Quietly Chat</span>
                        </div>
                    </div>
                    <div className="standalone-chat-header-right">
                        <button
                            className="standalone-header-btn"
                            onClick={createNewSession}
                            title="New Chat"
                        >
                            <Plus size={16} />
                        </button>
                        <button
                            className="standalone-header-btn danger"
                            onClick={() => dispatch({ type: 'CLEAR_STANDALONE_CHAT' })}
                            title="Clear current chat"
                        >
                            <Trash2 size={16} />
                        </button>
                    </div>
                </div>


                {/* Messages */}
                <div className="standalone-chat-messages">
                    <div className="standalone-chat-messages-inner">
                        {chatMessages.length === 0 && (
                            <div className="standalone-chat-empty">
                                <div className="standalone-chat-empty-icon">
                                    <Sparkles size={48} strokeWidth={1} />
                                </div>
                                <h2>How can I help you today?</h2>
                                <p>Ask anything.</p>
                            </div>
                        )}

                        {chatMessages.map((msg) => (
                            <div key={msg.id} className={`standalone-chat-message ${msg.role}`}>
                                <div className="standalone-message-avatar">
                                    {msg.role === 'user' ? 'You' : <Cpu size={16} />}
                                </div>
                                <div className="standalone-message-body">
                                    <span className={`standalone-message-role ${msg.role}`}>
                                        {msg.role === 'user' ? 'You' : 'Quietly AI'}
                                    </span>
                                    <div className="standalone-message-content markdown-body">
                                        {/* Render markdown logic here - reusing your chat panel logic or simplified string for now */}
                                        <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', background: 'transparent', margin: 0 }}>
                                            {msg.content}
                                        </pre>

                                        {msg.role === 'assistant' && indexingProgress && (
                                            <div className="status-indicator">
                                                Synthesizing local context...
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}

                        {state.isStreaming && !chatMessages[chatMessages.length - 1]?.content && (
                            <div className="standalone-chat-message assistant">
                                <div className="standalone-message-avatar"><Cpu size={16} /></div>
                                <div className="standalone-message-body">
                                    <span className="standalone-message-role assistant">Quietly AI</span>
                                    <div className="standalone-typing-indicator">
                                        <span /><span /><span />
                                    </div>
                                </div>
                            </div>
                        )}
                        <div ref={messagesEndRef} />
                    </div>
                </div>

                {/* Input area */}
                <div className="standalone-chat-input-area">
                    <div className="standalone-chat-input-wrapper">
                        {/* Suggestions Popup */}
                        {showSuggestions && filteredFiles.length > 0 && (
                            <div className="mention-suggestions standalone">
                                {filteredFiles.map((file, i) => {
                                    const name = file.split(/[\\/]/).pop() || file
                                    const displayPath = state.projectPath ? file.replace(state.projectPath, '').replace(/^[\\/]/, '') : file
                                    return (
                                        <div
                                            key={file}
                                            className={`suggestion-item ${i === selectedSuggestionIndex ? 'active' : ''}`}
                                            onClick={() => insertSuggestion(file)}
                                        >
                                            <span className="suggestion-name">{name}</span>
                                            <span className="suggestion-path">{displayPath}</span>
                                        </div>
                                    )
                                })}
                            </div>
                        )}

                        <div className="standalone-input-box">
                            <textarea
                                ref={textareaRef}
                                className="standalone-textarea"
                                placeholder="Message Quietly AI..."
                                value={input}
                                onChange={handleTextareaInput}
                                onKeyDown={handleKeyDown}
                                rows={1}
                                disabled={switchingModel}
                            />
                            <div className="standalone-input-footer">
                                <div className="model-selector" ref={dropdownRef}>
                                    <button
                                        className={`model-selector-btn ${switchingModel ? 'switching' : ''}`}
                                        onClick={() => {
                                            if (!switchingModel) {
                                                if (!showModelDropdown) loadModels()
                                                setShowModelDropdown(!showModelDropdown)
                                            }
                                        }}
                                        disabled={switchingModel}
                                    >
                                        <Cpu size={14} />
                                        <span>{switchingModel ? 'Switching…' : currentModelName}</span>
                                        <ChevronDown size={14} />
                                    </button>

                                    {showModelDropdown && (
                                        <div className="model-dropdown">
                                            {/* Backend toggle */}
                                            <div style={{ display: 'flex', gap: 2, padding: '6px 6px 0', marginBottom: 4 }}>
                                                <button
                                                    onClick={async () => {
                                                        const newSettings = { ...state.settings, aiBackend: 'llama' as const }
                                                        await window.electronAPI.saveSettings(newSettings)
                                                        dispatch({ type: 'SET_SETTINGS', settings: newSettings })
                                                    }}
                                                    style={{
                                                        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                                                        padding: '7px 8px', fontSize: 11, fontWeight: 600, cursor: 'pointer',
                                                        background: !isAirllm ? 'linear-gradient(135deg, rgba(168,160,255,0.15), rgba(124,108,240,0.1))' : 'transparent',
                                                        border: !isAirllm ? '1px solid rgba(168,160,255,0.3)' : '1px solid transparent',
                                                        borderRadius: 8, color: !isAirllm ? 'var(--accent-primary, #a8a0ff)' : 'var(--text-tertiary)',
                                                        letterSpacing: '0.3px', transition: 'all 0.2s ease',
                                                        boxShadow: !isAirllm ? '0 2px 8px rgba(124,108,240,0.12)' : 'none'
                                                    }}
                                                >
                                                    <span style={{ fontSize: 12 }}>⚡</span>
                                                    llama.cpp
                                                </button>
                                                <button
                                                    onClick={async () => {
                                                        const newSettings = { ...state.settings, aiBackend: 'airllm' as const }
                                                        await window.electronAPI.saveSettings(newSettings)
                                                        dispatch({ type: 'SET_SETTINGS', settings: newSettings })
                                                    }}
                                                    style={{
                                                        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                                                        padding: '7px 8px', fontSize: 11, fontWeight: 600, cursor: 'pointer',
                                                        background: isAirllm ? 'linear-gradient(135deg, rgba(0,200,255,0.12), rgba(168,160,255,0.1))' : 'transparent',
                                                        border: isAirllm ? '1px solid rgba(0,200,255,0.25)' : '1px solid transparent',
                                                        borderRadius: 8, color: isAirllm ? 'var(--accent-primary, #a8a0ff)' : 'var(--text-tertiary)',
                                                        letterSpacing: '0.3px', transition: 'all 0.2s ease',
                                                        boxShadow: isAirllm ? '0 2px 8px rgba(0,200,255,0.1)' : 'none'
                                                    }}
                                                >
                                                    <span style={{ fontSize: 12 }}>🧠</span>
                                                    AirLLM
                                                </button>
                                            </div>

                                            {isAirllm ? (
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                                    {downloadedAirllm.filter(m => !(state.downloadStatus.isDownloading && state.downloadStatus.modelId === m.id)).length > 0 ?
                                                        downloadedAirllm.filter(m => !(state.downloadStatus.isDownloading && state.downloadStatus.modelId === m.id)).map((m) => (
                                                            <div
                                                                key={m.id}
                                                                className={`model-dropdown-item ${state.settings.airllmModelId === m.id ? 'active' : ''}`}
                                                                onClick={async () => {
                                                                    setAirllmModelId(m.id)
                                                                    setShowModelDropdown(false)
                                                                    setSwitchingModel(true)
                                                                    const newSettings = {
                                                                        ...state.settings,
                                                                        aiBackend: 'airllm' as const,
                                                                        airllmModelId: m.id,
                                                                        airllmCompression
                                                                    }
                                                                    await window.electronAPI.saveSettings(newSettings)
                                                                    dispatch({ type: 'SET_SETTINGS', settings: newSettings })
                                                                    try {
                                                                        await window.electronAPI.stopAIServer()
                                                                        const result = await window.electronAPI.startAIServer()
                                                                        setSwitchingModel(false)
                                                                        dispatch({ type: 'SET_AI_STATUS', status: result.success ? 'connected' : 'disconnected' })
                                                                    } catch {
                                                                        setSwitchingModel(false)
                                                                        dispatch({ type: 'SET_AI_STATUS', status: 'disconnected' })
                                                                    }
                                                                }}
                                                            >
                                                                <span className="model-dropdown-name">{m.name}</span>
                                                                <span className="model-dropdown-size">{m.size}</span>
                                                            </div>
                                                        )) : (
                                                            <div style={{ padding: '10px 12px', fontSize: 11, color: 'var(--text-muted)', textAlign: 'center' }}>
                                                                No AirLLM models downloaded yet. Download models from Settings.
                                                            </div>
                                                        )}
                                                    {/* Compression selector */}
                                                    <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', padding: '6px 10px', display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                                                        <span style={{ fontSize: 10, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>Precision:</span>
                                                        {(['4bit', '8bit'] as const).map((opt) => (
                                                            <button
                                                                key={opt}
                                                                onClick={async (e) => {
                                                                    e.stopPropagation()
                                                                    setAirllmCompression(opt)
                                                                    const newSettings = { ...state.settings, airllmCompression: opt }
                                                                    await window.electronAPI.saveSettings(newSettings)
                                                                    dispatch({ type: 'SET_SETTINGS', settings: newSettings })
                                                                }}
                                                                style={{
                                                                    flex: 1, padding: '3px 0', borderRadius: 4, fontSize: 10, cursor: 'pointer',
                                                                    border: airllmCompression === opt ? '1px solid var(--accent)' : '1px solid rgba(255,255,255,0.1)',
                                                                    background: airllmCompression === opt ? 'rgba(var(--accent-rgb, 99,102,241), 0.15)' : 'transparent',
                                                                    color: airllmCompression === opt ? 'var(--accent)' : 'var(--text-muted)',
                                                                    fontWeight: airllmCompression === opt ? 600 : 400
                                                                }}
                                                            >
                                                                {opt}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>
                                            ) : (
                                                <>
                                                    {models.map((m) => (
                                                        <div
                                                            key={m.path}
                                                            className={`model-dropdown-item ${m.path === state.settings.modelPath ? 'active' : ''}`}
                                                            onClick={() => handleModelSelect(m.path)}
                                                        >
                                                            <span className="model-dropdown-name">{m.name.replace('.gguf', '')}</span>
                                                            <span className="model-dropdown-size">{m.size}</span>
                                                        </div>
                                                    ))}
                                                    {models.length === 0 && (
                                                        <div style={{ padding: '8px 12px', fontSize: 12, color: 'var(--text-muted)' }}>No models found</div>
                                                    )}
                                                </>
                                            )}
                                        </div>
                                    )}
                                </div>

                                {state.isStreaming ? (
                                    <button
                                        className="standalone-send-btn stop"
                                        onClick={handleStop}
                                        title="Stop generating"
                                    >
                                        <Square size={16} />
                                    </button>
                                ) : (
                                    <button
                                        className="standalone-send-btn"
                                        onClick={handleSend}
                                        disabled={!input.trim() || switchingModel}
                                    >
                                        <Send size={16} />
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                    <div className="standalone-footer-note">
                        Quietly AI can make mistakes. Consider verifying responses.
                    </div>
                </div>
            </div>
        </div>
    )
}
