import React, { useState, useRef, useEffect } from 'react'
import { useApp, ChatMessage, FileTreeNode } from '../store/appStore'
import { PROMPTS } from '../prompts'
import {
    Send, Trash2, Sparkles, Code, Wand2, FileCode, Bot, Scan,
    ChevronDown, ChevronRight, Cpu, Brain, FileEdit, FilePlus, FileX,
    Check, X, Loader, Square
} from 'lucide-react'

// Types for parsed file actions
interface FileAction {
    id: string
    type: 'create' | 'edit' | 'delete'
    path: string
    content?: string
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

export default function ChatPanel() {
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

    // File actions state
    const [fileActions, setFileActions] = useState<Record<string, FileAction>>({})

    // Auto-scroll
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [state.chatMessages])

    // Stream listeners
    useEffect(() => {
        const unsubChunk = window.electronAPI.onStreamChunk((chunk) => {
            streamContentRef.current += chunk
            dispatch({ type: 'UPDATE_LAST_ASSISTANT_MESSAGE', content: streamContentRef.current })
        })

        const unsubEnd = window.electronAPI.onStreamEnd(() => {
            dispatch({ type: 'SET_STREAMING', isStreaming: false })
            streamContentRef.current = ''
        })

        return () => {
            unsubChunk()
            unsubEnd()
        }
    }, [])

    // Watch for new user messages and trigger AI
    useEffect(() => {
        if (state.chatMessages.length === 0) return
        const lastMsg = state.chatMessages[state.chatMessages.length - 1]
        if (lastMsg.role === 'user' && !state.isStreaming) {
            sendToAI()
        }
    }, [state.chatMessages])

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

    async function loadModels() {
        if (!state.settings.modelsDirectory) return
        try {
            const found = await window.electronAPI.scanLocalModels(state.settings.modelsDirectory)
            console.log('[ChatPanel] loadModels:', state.settings.modelsDirectory, 'found:', found)
            setModels(found)
        } catch (err) {
            console.error('[ChatPanel] loadModels error:', err)
        }
    }

    const currentModelName = state.settings.modelPath
        ? state.settings.modelPath.split(/[\\/]/).pop()?.replace('.gguf', '') || 'Model'
        : 'No Model'

    async function handleModelSelect(modelPath: string) {
        if (modelPath === state.settings.modelPath) {
            setShowModelDropdown(false)
            return
        }

        setShowModelDropdown(false)
        setSwitchingModel(true)

        const newSettings = { ...state.settings, modelPath }
        await window.electronAPI.saveSettings(newSettings)
        dispatch({ type: 'SET_SETTINGS', settings: newSettings })

        await window.electronAPI.stopAIServer()
        // Brief delay to ensure port is released on Windows
        await new Promise(r => setTimeout(r, 500))
        const result = await window.electronAPI.startAIServer()
        setSwitchingModel(false)

        if (!result.success) {
            alert('Failed to start model: ' + result.error)
        }
    }

    const [indexing, setIndexing] = useState(false)
    const [indexingProgress, setIndexingProgress] = useState<{ current: number; total: number; file: string } | null>(null)

    // Listen for indexing progress
    useEffect(() => {
        return window.electronAPI.onRagProgress((data) => {
            setIndexingProgress(data)
        })
    }, [])

    async function handleIndexCodebase() {
        if (!state.projectPath) return
        setIndexing(true)
        try {
            await window.electronAPI.indexCodebase(state.projectPath)
            alert('Indexing complete!')
        } catch (err) {
            console.error('Indexing failed:', err)
            alert('Indexing failed')
        } finally {
            setIndexing(false)
            setIndexingProgress(null)
        }
    }

    async function sendToAI() {
        dispatch({ type: 'SET_STREAMING', isStreaming: true })

        dispatch({
            type: 'ADD_CHAT_MESSAGE',
            message: {
                id: `assistant-${Date.now()}`,
                role: 'assistant',
                content: '',
                timestamp: Date.now()
            }
        })

        streamContentRef.current = ''

        // --- RAG Retrieval & File Mentions ---
        let context = ''
        if (state.projectPath) {
            context += `Project Root Absolute Path: ${state.projectPath}\n\n`
        }
        if (codebaseContext) {
            context += codebaseContext + '\n\n'
        }

        const lastUserMsg = state.chatMessages.filter(m => m.role === 'user').pop()?.content || ''

        // 1. Handle File Mentions (@)
        const mentionRegex = /@([^\s]+)/g
        const mentions = Array.from(lastUserMsg.matchAll(mentionRegex))
        let mentionedContent = ''

        for (const match of mentions) {
            const potentialPath = match[1]
            // Matches might be partial like just filename, or full path
            const matchedFile = allFiles.find(f => f.endsWith(potentialPath) || f === potentialPath)

            if (matchedFile) {
                try {
                    const result = await window.electronAPI.readFile(matchedFile)
                    if (result.success) {
                        mentionedContent += `\nFile: ${matchedFile}\n\`\`\`\n${result.content}\n\`\`\`\n`
                    }
                } catch (e) {
                    console.error('Failed to read mentioned file:', matchedFile, e)
                }
            }
        }

        if (mentionedContent) {
            context += `\n\nMentioned Files Context:\n${mentionedContent}`
        }

        // 2. RAG Retrieval (if project open)
        if (state.projectPath) {
            const lastUserMsg = state.chatMessages.filter(m => m.role === 'user').pop()?.content || ''
            if (lastUserMsg) {
                try {
                    const snippets = await window.electronAPI.ragRetrieve(lastUserMsg)
                    if (snippets && snippets.length > 0) {
                        const references = snippets.map((s: any) => `File: ${s.id}\n${s.content}`).join('\n\n')
                        context += `\n\nRelevant Code Snippets:\n${references}`
                        console.log('RAG Retrieved:', snippets.length, 'snippets')
                    }
                } catch (e) {
                    console.error('RAG Retrieval failed:', e)
                }
            }
        }

        const systemPrompt = context
            ? PROMPTS.systemWithContext(context)
            : PROMPTS.system

        const chatLog = state.chatMessages
            .filter(m => m.role !== 'system')
            .map(m => ({ role: m.role, content: m.content }))

        // Inject strict instruction into the very last user message
        if (chatLog.length > 0) {
            const lastMsg = chatLog[chatLog.length - 1]
            if (lastMsg.role === 'user') {
                lastMsg.content += `\n\n(IMPORTANT: If providing code for a file, YOU MUST use the \`\`\`FILE_ACTION:create:/path/to/file.ts format. DO NOT use standard markdown code blocks.)`
            }
        }

        const messages = [
            { role: 'system', content: systemPrompt },
            ...chatLog
        ]

        const result = await window.electronAPI.chatStream(messages)

        if (!result.success) {
            dispatch({
                type: 'UPDATE_LAST_ASSISTANT_MESSAGE',
                content: `⚠️ ${result.error || 'Failed to get response. Is the model running?'}`
            })
            dispatch({ type: 'SET_STREAMING', isStreaming: false })
        }
    }

    function handleSend() {
        const trimmed = input.trim()
        if (!trimmed || state.isStreaming) return

        setShowSuggestions(false)
        dispatch({
            type: 'ADD_CHAT_MESSAGE',
            message: {
                id: `user-${Date.now()}`,
                role: 'user',
                content: trimmed,
                timestamp: Date.now()
            }
        })
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
        // Find the @ position
        const lastAt = input.lastIndexOf('@', cursorPosition)
        if (lastAt !== -1) {
            const prefix = input.substring(0, lastAt)
            // Use relative path for display if possible
            const displayPath = state.projectPath ? filePath.replace(state.projectPath, '').replace(/^[\\/]/, '') : filePath
            const suffix = input.substring(cursorPosition)
            const newInput = `${prefix}@${displayPath} ${suffix}`
            setInput(newInput)
            setShowSuggestions(false)

            // Restore focus and cursor position
            setTimeout(() => {
                const newCursor = lastAt + 1 + displayPath.length + 1
                textareaRef.current?.focus()
                textareaRef.current?.setSelectionRange(newCursor, newCursor)
            }, 0)
        }
    }

    // Handle pending mention from context menu
    useEffect(() => {
        if (state.pendingChatMention) {
            const filePath = state.pendingChatMention
            // Clear the pending state
            dispatch({ type: 'MENTION_FILE', filename: '' }) // Clearing by setting empty or we could add a specific CLEAR action.
            // Actually I defined MENTION_FILE as setting the string. If I set it to '' it reads as ''?
            // Wait, my reducer says `pendingChatMention: action.filename`.
            // So calling it with '' sets it to ''.
            // But I need to check `if (state.pendingChatMention)` which will be false for ''.
            // So this works.

            // Insert into input
            const displayPath = state.projectPath ? filePath.replace(state.projectPath, '').replace(/^[\\/]/, '') : filePath
            setInput(prev => {
                const prefix = prev.trimEnd()
                return `${prefix} @${displayPath} `
            })

            // Focus textarea
            setTimeout(() => {
                textareaRef.current?.focus()
                // Move cursor to end
                textareaRef.current?.setSelectionRange(10000, 10000)
            }, 100)
        }
    }, [state.pendingChatMention])

    function handleTextareaInput(e: React.ChangeEvent<HTMLTextAreaElement>) {
        const val = e.target.value
        const cursorPos = e.target.selectionStart
        setInput(val)
        setCursorPosition(cursorPos)

        // Check for @ triggering
        const textBeforeCursor = val.substring(0, cursorPos)
        const lastAt = textBeforeCursor.lastIndexOf('@')

        if (lastAt !== -1) {
            const query = textBeforeCursor.substring(lastAt + 1)
            // Allow suggestions only if no spaces in query (simpler for now)
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
        e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px'
    }

    async function handleStop() {
        await window.electronAPI.stopStream()
        dispatch({ type: 'SET_STREAMING', isStreaming: false })
        streamContentRef.current = ''
    }

    function handleQuickAction(type: 'explain' | 'refactor' | 'generate') {
        if (!state.selectedCode && type !== 'generate') return

        let content = ''
        if (type === 'explain') {
            content = PROMPTS.explain(state.selectedCode)
        } else if (type === 'refactor') {
            content = PROMPTS.refactor(state.selectedCode)
        } else if (type === 'generate') {
            const desc = prompt('Describe what to generate:')
            if (!desc) return
            content = PROMPTS.generate(desc)
        }

        dispatch({
            type: 'ADD_CHAT_MESSAGE',
            message: {
                id: `user-${Date.now()}`,
                role: 'user',
                content,
                timestamp: Date.now()
            }
        })
    }

    async function handleAnalyzeProject() {
        if (!state.projectPath) return
        setAnalyzing(true)
        try {
            const result = await window.electronAPI.analyzeCodebase(state.projectPath)
            if (result.success && result.summary) {
                setCodebaseContext(result.summary)
                dispatch({
                    type: 'ADD_CHAT_MESSAGE',
                    message: {
                        id: `user-${Date.now()}`,
                        role: 'user',
                        content: PROMPTS.analyzeProject(result.summary),
                        timestamp: Date.now()
                    }
                })
            }
        } catch (err) {
            console.error('Failed to analyze codebase:', err)
        }
        setAnalyzing(false)
    }

    // Auto-analyze project when a new project is loaded
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
            } catch (err) {
                console.error('[ChatPanel] Auto-analyze failed:', err)
            }
        }
        autoAnalyze()
    }, [state.projectPath])



    // File action handlers
    async function applyFileAction(action: FileAction) {
        setFileActions(prev => ({ ...prev, [action.id]: { ...action, status: 'pending' } }))

        let targetPath = action.path
        if (state.projectPath && !targetPath.match(/^[a-zA-Z]:/)) {
            // Strip leading slashes, backslashes, or relative prefixes (e.g. ./ or /root/)
            let cleanPath = targetPath.replace(/^[\/\\]+/, '')
            if (cleanPath.startsWith('./')) cleanPath = cleanPath.slice(2)
            if (cleanPath.startsWith('root/')) cleanPath = cleanPath.slice(5) // Strip generic /root/ prefix models sometimes use

            // Resolve relative path against projectPath
            targetPath = `${state.projectPath}/${cleanPath}`.replace(/\\/g, '/')
        }

        console.log('[applyFileAction] action.path:', action.path)
        console.log('[applyFileAction] state.projectPath:', state.projectPath)
        console.log('[applyFileAction] Resolved targetPath:', targetPath)

        try {
            let result: { success: boolean; error?: string }

            if (action.type === 'delete') {
                result = await window.electronAPI.deleteFile(targetPath)
            } else if (action.type === 'create') {
                result = await window.electronAPI.createFile(targetPath)
                if (result.success && action.content) {
                    result = await window.electronAPI.writeFile(targetPath, action.content)
                }
            } else {
                // edit
                result = await window.electronAPI.writeFile(targetPath, action.content || '')
            }

            if (result.success) {
                setFileActions(prev => ({ ...prev, [action.id]: { ...action, status: 'applied' } }))
                // Refresh file tree if project is open
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

    function rejectFileAction(actionId: string) {
        setFileActions(prev => ({
            ...prev,
            [actionId]: { ...prev[actionId], status: 'rejected' }
        }))
    }

    return (
        <div className="chat-panel">
            {/* Header */}
            <div className="chat-header">
                <div className="chat-header-title">
                    <Sparkles size={15} />
                    <span>AI Assistant</span>
                </div>
                <div className="chat-header-actions">
                    <button
                        className="btn btn-ghost btn-icon"
                        onClick={() => dispatch({ type: 'CLEAR_CHAT' })}
                        title="Clear Chat"
                    >
                        <Trash2 size={14} />
                    </button>
                    <button
                        className="btn btn-ghost btn-icon"
                        onClick={handleIndexCodebase}
                        disabled={!state.projectPath || indexing}
                        title={indexing ? `Indexing... ${indexingProgress ? `${Math.round(indexingProgress.current / indexingProgress.total * 100)}%` : ''}` : "Index Codebase for Search"}
                    >
                        {indexing ? <Loader size={14} className="spinner" /> : <Brain size={14} />}
                    </button>
                </div>
            </div>


            {/* Messages */}
            <div className="chat-messages">
                {state.chatMessages.length === 0 && (
                    <div className="chat-empty-state">
                        <div className="chat-empty-icon">
                            <Sparkles size={32} strokeWidth={1.2} />
                        </div>
                        <h3>BitNet AI</h3>
                        <p>Ask me anything about your code, or select code and use the quick actions above.</p>
                    </div>
                )}

                {state.chatMessages.map((msg) => (
                    <div key={msg.id} className={`chat-message ${msg.role}`}>
                        <div className="chat-message-avatar">
                            {msg.role === 'user' ? '→' : <Cpu size={13} />}
                        </div>
                        <div className="chat-message-body">
                            <span className={`chat-message-role ${msg.role}`}>
                                {msg.role === 'user' ? 'You' : 'BitNet AI'}
                            </span>
                            <div className="chat-message-content">
                                {renderContent(msg.id, msg.content, fileActions, applyFileAction, rejectFileAction)}
                                {msg.role === 'assistant' && indexingProgress && (
                                    <div className="status-indicator">
                                        Using updated context...
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                ))}

                {state.isStreaming && !state.chatMessages[state.chatMessages.length - 1]?.content && (
                    <div className="typing-indicator">
                        <span /><span /><span />
                    </div>
                )}

                <div ref={messagesEndRef} />
            </div>

            {/* Input area — Cursor-style */}
            <div className="chat-input-area">

                {/* Suggestions Popup */}
                {showSuggestions && filteredFiles.length > 0 && (
                    <div className="mention-suggestions">
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

                <div className="chat-input-container">
                    <textarea
                        ref={textareaRef}
                        className="chat-input"
                        placeholder="Ask about your code…"
                        value={input}
                        onChange={handleTextareaInput}
                        onKeyDown={handleKeyDown}
                        rows={1}
                        disabled={switchingModel}
                    />
                    <div className="chat-input-footer">
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
                                <Cpu size={12} />
                                <span>{switchingModel ? 'Switching…' : currentModelName}</span>
                                <ChevronDown size={11} />
                            </button>

                            {showModelDropdown && models.length > 0 && (
                                <div className="model-dropdown">
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
                                </div>
                            )}
                        </div>

                        {state.isStreaming ? (
                            <button
                                className="chat-send-btn stop"
                                onClick={handleStop}
                                title="Stop generating"
                            >
                                <Square size={12} />
                            </button>
                        ) : (
                            <button
                                className="chat-send-btn"
                                onClick={handleSend}
                                disabled={!input.trim() || switchingModel}
                            >
                                <Send size={14} />
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}




// =============================================================================
// Thinking Block Component
// =============================================================================

function ThinkingBlock({ content }: { content: string }) {
    const [expanded, setExpanded] = useState(false)

    return (
        <div className="thinking-block">
            <button className="thinking-block-header" onClick={() => setExpanded(!expanded)}>
                {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                <Brain size={13} />
                <span>Reasoning</span>
            </button>
            {expanded && (
                <div className="thinking-block-content">
                    {content}
                </div>
            )}
        </div>
    )
}

// =============================================================================
// File Action Card Component
// =============================================================================

function FileActionCard({
    action,
    onApply,
    onReject
}: {
    action: FileAction
    onApply: (a: FileAction) => void
    onReject: (id: string) => void
}) {
    const iconMap = {
        create: <FilePlus size={14} />,
        edit: <FileEdit size={14} />,
        delete: <FileX size={14} />
    }

    const labelMap = {
        create: 'Create file',
        edit: 'Edit file',
        delete: 'Delete file'
    }

    const colorMap = {
        create: 'var(--success)',
        edit: 'var(--accent-primary)',
        delete: 'var(--error)'
    }

    return (
        <div className={`file-action-card ${action.status}`}>
            <div className="file-action-header">
                <span className="file-action-icon" style={{ color: colorMap[action.type] }}>
                    {iconMap[action.type]}
                </span>
                <div className="file-action-info">
                    <span className="file-action-label">{labelMap[action.type]}</span>
                    <span className="file-action-path">{action.path}</span>
                </div>

                {action.status === 'pending' && (
                    <Loader size={14} className="spinner" style={{ color: 'var(--text-tertiary)' }} />
                )}

                {action.status === 'applied' && (
                    <span className="file-action-badge applied"><Check size={11} /> Applied</span>
                )}

                {action.status === 'rejected' && (
                    <span className="file-action-badge rejected"><X size={11} /> Skipped</span>
                )}

                {action.status === 'error' && (
                    <span className="file-action-badge error" title={action.error}><X size={11} /> Error</span>
                )}

                {!action.status || action.status === 'pending' ? null : null}
            </div>

            {/* Show preview for create/edit */}
            {action.content && action.type !== 'delete' && (
                <div className="file-action-preview">
                    <pre><code>{action.content.length > 500 ? action.content.slice(0, 500) + '\n…' : action.content}</code></pre>
                </div>
            )}

            {/* Action buttons — only if not yet acted on */}
            {action.status === 'idle' && (
                <div className="file-action-buttons">
                    <button className="file-action-btn apply" onClick={() => onApply(action)}>
                        <Check size={12} /> Apply
                    </button>
                    <button className="file-action-btn reject" onClick={() => onReject(action.id)}>
                        <X size={12} /> Skip
                    </button>
                </div>
            )}
        </div>
    )
}

// =============================================================================
// Content Rendering
// =============================================================================

function parseFileActions(messageId: string, text: string): { cleanText: string; actions: FileAction[] } {
    const actions: FileAction[] = []
    // Pattern: ```FILE_ACTION:type:path\ncontent\n```
    const regex = /```FILE_ACTION:(create|edit|delete):([^\n]+)\n([\s\S]*?)```/g

    let cleanText = text
    let match: RegExpExecArray | null

    while ((match = regex.exec(text)) !== null) {
        const [fullMatch, type, path, content] = match
        const action: FileAction = {
            id: `fa-${messageId}-${actions.length}`,
            type: type as 'create' | 'edit' | 'delete',
            path: path.trim(),
            content: type !== 'delete' ? content.trim() : undefined,
            status: 'idle' // fresh — shows apply/reject buttons
        }
        actions.push(action)
        cleanText = cleanText.replace(fullMatch, `[[FILE_ACTION_${actions.length - 1}]]`)
    }

    return { cleanText, actions }
}

function renderContent(
    messageId: string,
    content: string,
    fileActionsState: Record<string, FileAction>,
    onApply: (a: FileAction) => void,
    onReject: (id: string) => void
) {
    if (!content) return null

    const elements: React.ReactNode[] = []

    // 1. Extract <think>...</think> blocks
    const thinkRegex = /<think>([\s\S]*?)<\/think>/g
    let thinkMatch: RegExpExecArray | null
    let lastIndex = 0
    const segments: { type: 'text' | 'think'; content: string }[] = []

    while ((thinkMatch = thinkRegex.exec(content)) !== null) {
        if (thinkMatch.index > lastIndex) {
            segments.push({ type: 'text', content: content.slice(lastIndex, thinkMatch.index) })
        }
        segments.push({ type: 'think', content: thinkMatch[1].trim() })
        lastIndex = thinkMatch.index + thinkMatch[0].length
    }

    // Also handle partial/streaming <think> tags (unclosed)
    if (lastIndex < content.length) {
        const remaining = content.slice(lastIndex)
        // Check for an unclosed <think> tag (streaming)
        const unclosedThink = remaining.match(/^([\s\S]*?)<think>([\s\S]*)$/s)
        if (unclosedThink) {
            if (unclosedThink[1]) {
                segments.push({ type: 'text', content: unclosedThink[1] })
            }
            segments.push({ type: 'think', content: unclosedThink[2] })
        } else {
            segments.push({ type: 'text', content: remaining })
        }
    }

    // If no segments were created, treat whole content as text
    if (segments.length === 0) {
        segments.push({ type: 'text', content: content })
    }

    segments.forEach((segment, segIndex) => {
        if (segment.type === 'think') {
            elements.push(<ThinkingBlock key={`think-${segIndex}`} content={segment.content} />)
            return
        }

        // 2. Parse file actions from text segments
        const { cleanText, actions } = parseFileActions(messageId, segment.content)

        // 3. Render markdown-like content with file action placeholders
        const parts = cleanText.split(/(```[\s\S]*?```|\[\[FILE_ACTION_\d+\]\])/g)

        parts.forEach((part, i) => {
            // File action placeholder
            const actionMatch = part.match(/\[\[FILE_ACTION_(\d+)\]\]/)
            if (actionMatch) {
                const idx = parseInt(actionMatch[1])
                const action = actions[idx]
                if (action) {
                    const tracked = fileActionsState[action.id] || action
                    elements.push(
                        <FileActionCard
                            key={`action-${segIndex}-${idx}`}
                            action={tracked}
                            onApply={onApply}
                            onReject={onReject}
                        />
                    )
                }
                return
            }

            // Code blocks
            if (part.startsWith('```')) {
                const match = part.match(/```(\w+)?\n?([\s\S]*?)```/)
                if (match) {
                    elements.push(
                        <pre key={`code-${segIndex}-${i}`}>
                            {match[1] && <div className="code-block-lang">{match[1]}</div>}
                            <code>{match[2].trim()}</code>
                        </pre>
                    )
                    return
                }
            }

            // Inline code
            const inlineParts = part.split(/(`[^`]+`)/g)
            elements.push(
                <span key={`text-${segIndex}-${i}`}>
                    {inlineParts.map((ip, j) => {
                        if (ip.startsWith('`') && ip.endsWith('`')) {
                            return <code key={j}>{ip.slice(1, -1)}</code>
                        }
                        return ip
                    })}
                </span>
            )
        })
    })

    return elements
}
