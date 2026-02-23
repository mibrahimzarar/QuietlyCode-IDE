import React, { createContext, useContext, useReducer, useCallback, ReactNode } from 'react'

// --- Types ---
export interface FileTreeNode {
    name: string
    path: string
    isDirectory: boolean
    children?: FileTreeNode[]
    gitStatus?: 'modified' | 'staged' | 'added' | 'deleted' | 'untracked' | 'ignored'
}

export interface OpenFile {
    path: string
    name: string
    content: string
    language: string
    isDirty: boolean
}

export interface ChatMessage {
    id: string
    role: 'user' | 'assistant' | 'system'
    content: string
    timestamp: number
}

export interface CodeProblem {
    path: string
    message: string
    line: number
    character: number
    severity: number // 1: Error, 2: Warning
}

export interface AppSettings {
    modelPath: string
    serverBinaryPath: string
    contextSize: number
    maxTokens: number
    temperature: number
    threads: number
    theme: 'dark' | 'light'
    modelsDirectory: string
    setupComplete: boolean
    lastProjectPath: string | null
    lastOpenFiles: string[]
    lastActiveFile: string | null
}

export type AppScreen = 'loading' | 'setup' | 'ide'

export interface AppState {
    screen: AppScreen
    // File system
    projectPath: string | null
    fileTree: FileTreeNode[]
    openFiles: OpenFile[]
    activeFilePath: string | null
    // AI
    aiStatus: 'disconnected' | 'connecting' | 'connected'
    chatMessages: ChatMessage[]
    isStreaming: boolean
    selectedCode: string
    // UI
    settings: AppSettings
    showSettings: boolean
    showCommandPalette: boolean
    sidebarVisible: boolean
    chatPanelVisible: boolean
    diffPreview: {
        original: string
        modified: string
        filePath: string
        selection?: { startLineNumber: number, startColumn: number, endLineNumber: number, endColumn: number }
    } | null
    contextMenu: { x: number; y: number; items: ContextMenuItem[] } | null
    terminalVisible: boolean
    showQuickOpen: boolean
    splitEditor: {
        enabled: boolean
        secondaryFilePath: string | null
    }
    downloadStatus: {
        isDownloading: boolean
        progress: number
        speed: string
        modelId: string | null
        error: string | null
    }
    pendingChatMention: string | null
    pendingChatContext: string | null
    problems: CodeProblem[]
}

export interface ContextMenuItem {
    label: string
    icon?: string
    action: () => void
}

// --- Actions ---
type Action =
    | { type: 'SET_SCREEN'; screen: AppScreen }
    | { type: 'SET_PROJECT'; path: string; tree: FileTreeNode[] }
    | { type: 'SET_FILE_TREE'; tree: FileTreeNode[] }
    | { type: 'OPEN_FILE'; file: OpenFile }
    | { type: 'CLOSE_FILE'; path: string }
    | { type: 'SET_ACTIVE_FILE'; path: string }
    | { type: 'UPDATE_FILE_CONTENT'; path: string; content: string }
    | { type: 'MARK_FILE_SAVED'; path: string }
    | { type: 'SET_AI_STATUS'; status: 'disconnected' | 'connecting' | 'connected' }
    | { type: 'ADD_CHAT_MESSAGE'; message: ChatMessage }
    | { type: 'UPDATE_LAST_ASSISTANT_MESSAGE'; content: string }
    | { type: 'SET_STREAMING'; isStreaming: boolean }
    | { type: 'SET_SELECTED_CODE'; code: string }
    | { type: 'CLEAR_CHAT' }
    | { type: 'SET_SETTINGS'; settings: Partial<AppSettings> }
    | { type: 'TOGGLE_SETTINGS' }
    | { type: 'TOGGLE_COMMAND_PALETTE' }
    | { type: 'TOGGLE_SIDEBAR' }
    | { type: 'TOGGLE_CHAT_PANEL' }
    | { type: 'SET_DIFF_PREVIEW'; diff: AppState['diffPreview'] }
    | { type: 'SET_CONTEXT_MENU'; menu: { x: number; y: number; items: ContextMenuItem[] } | null }
    | { type: 'TOGGLE_TERMINAL' }
    | { type: 'SET_DOWNLOAD_STATUS'; status: Partial<AppState['downloadStatus']> }
    | { type: 'DOWNLOAD_PROGRESS'; progress: number; speed: string; modelId: string }
    | { type: 'DOWNLOAD_COMPLETE'; modelId: string }
    | { type: 'DOWNLOAD_ERROR'; modelId: string; error: string }
    | { type: 'MENTION_FILE'; filename: string }
    | { type: 'APPEND_TO_CHAT'; content: string }
    | { type: 'SET_PROBLEMS'; problems: CodeProblem[] }
    | { type: 'TOGGLE_QUICK_OPEN' }
    | { type: 'TOGGLE_SPLIT_EDITOR' }
    | { type: 'SET_SECONDARY_FILE'; path: string | null }

const defaultSettings: AppSettings = {
    modelPath: '',
    serverBinaryPath: '',
    contextSize: 4096,
    maxTokens: 512,
    temperature: 0.7,
    threads: 4,
    theme: 'dark',
    modelsDirectory: '',
    setupComplete: false,
    lastProjectPath: null,
    lastOpenFiles: [],
    lastActiveFile: null
}

const initialState: AppState = {
    screen: 'loading',
    projectPath: null,
    fileTree: [],
    openFiles: [],
    activeFilePath: null,
    aiStatus: 'disconnected',
    chatMessages: [],
    isStreaming: false,
    selectedCode: '',
    settings: defaultSettings,
    showSettings: false,
    showCommandPalette: false,
    sidebarVisible: true,
    chatPanelVisible: true,
    diffPreview: null,
    contextMenu: null,
    terminalVisible: false,
    showQuickOpen: false,
    splitEditor: {
        enabled: false,
        secondaryFilePath: null
    },
    downloadStatus: {
        isDownloading: false,
        progress: 0,
        speed: '0 B/s',
        modelId: null,
        error: null
    },
    pendingChatMention: null,
    pendingChatContext: null,
    problems: []
}

function reducer(state: AppState, action: Action): AppState {
    switch (action.type) {
        case 'SET_SCREEN':
            return { ...state, screen: action.screen }

        case 'SET_PROJECT':
            return { ...state, projectPath: action.path, fileTree: action.tree }

        case 'SET_FILE_TREE':
            return { ...state, fileTree: action.tree }

        case 'OPEN_FILE': {
            const exists = state.openFiles.find(f => f.path === action.file.path)
            if (exists) {
                return { ...state, activeFilePath: action.file.path }
            }
            return {
                ...state,
                openFiles: [...state.openFiles, action.file],
                activeFilePath: action.file.path
            }
        }

        case 'CLOSE_FILE': {
            const files = state.openFiles.filter(f => f.path !== action.path)
            let active = state.activeFilePath
            if (active === action.path) {
                active = files.length > 0 ? files[files.length - 1].path : null
            }
            return { ...state, openFiles: files, activeFilePath: active }
        }

        case 'SET_ACTIVE_FILE':
            return { ...state, activeFilePath: action.path }

        case 'UPDATE_FILE_CONTENT':
            return {
                ...state,
                openFiles: state.openFiles.map(f =>
                    f.path === action.path ? { ...f, content: action.content, isDirty: true } : f
                )
            }

        case 'MARK_FILE_SAVED':
            return {
                ...state,
                openFiles: state.openFiles.map(f =>
                    f.path === action.path ? { ...f, isDirty: false } : f
                )
            }

        case 'SET_AI_STATUS':
            return { ...state, aiStatus: action.status }

        case 'ADD_CHAT_MESSAGE':
            return { ...state, chatMessages: [...state.chatMessages, action.message] }

        case 'UPDATE_LAST_ASSISTANT_MESSAGE': {
            const messages = [...state.chatMessages]
            let lastAssistant = -1
            for (let i = messages.length - 1; i >= 0; i--) {
                if (messages[i].role === 'assistant') {
                    lastAssistant = i
                    break
                }
            }
            if (lastAssistant >= 0) {
                messages[lastAssistant] = { ...messages[lastAssistant], content: action.content }
            }
            return { ...state, chatMessages: messages }
        }

        case 'SET_STREAMING':
            return { ...state, isStreaming: action.isStreaming }

        case 'SET_SELECTED_CODE':
            return { ...state, selectedCode: action.code }

        case 'CLEAR_CHAT':
            return { ...state, chatMessages: [] }

        case 'SET_SETTINGS':
            return { ...state, settings: { ...state.settings, ...action.settings } }

        case 'TOGGLE_SETTINGS':
            return { ...state, showSettings: !state.showSettings }

        case 'TOGGLE_COMMAND_PALETTE':
            return { ...state, showCommandPalette: !state.showCommandPalette }

        case 'TOGGLE_SIDEBAR':
            return { ...state, sidebarVisible: !state.sidebarVisible }

        case 'TOGGLE_CHAT_PANEL':
            return { ...state, chatPanelVisible: !state.chatPanelVisible }

        case 'SET_DIFF_PREVIEW':
            return { ...state, diffPreview: action.diff }

        case 'SET_CONTEXT_MENU':
            return { ...state, contextMenu: action.menu }

        case 'TOGGLE_TERMINAL':
            return { ...state, terminalVisible: !state.terminalVisible }

        case 'SET_DOWNLOAD_STATUS':
            return { ...state, downloadStatus: { ...state.downloadStatus, ...action.status } }

        case 'DOWNLOAD_PROGRESS':
            return {
                ...state,
                downloadStatus: {
                    ...state.downloadStatus,
                    isDownloading: true,
                    progress: action.progress,
                    speed: action.speed,
                    modelId: action.modelId,
                    error: null
                }
            }

        case 'DOWNLOAD_COMPLETE':
            return {
                ...state,
                downloadStatus: {
                    ...state.downloadStatus,
                    isDownloading: false,
                    progress: 100,
                    speed: '0 B/s',
                    modelId: null,
                    error: null
                }
            }

        case 'DOWNLOAD_ERROR':
            return {
                ...state,
                downloadStatus: {
                    ...state.downloadStatus,
                    isDownloading: false,
                    error: action.error
                }
            }

        case 'MENTION_FILE':
            return { ...state, pendingChatMention: action.filename }

        case 'APPEND_TO_CHAT':
            return { ...state, pendingChatContext: action.content }

        case 'SET_PROBLEMS':
            return { ...state, problems: action.problems }

        case 'TOGGLE_QUICK_OPEN':
            return { ...state, showQuickOpen: !state.showQuickOpen }

        case 'TOGGLE_SPLIT_EDITOR':
            return { 
                ...state, 
                splitEditor: { 
                    ...state.splitEditor, 
                    enabled: !state.splitEditor.enabled,
                    secondaryFilePath: state.splitEditor.enabled ? null : state.splitEditor.secondaryFilePath
                } 
            }

        case 'SET_SECONDARY_FILE':
            return { 
                ...state, 
                splitEditor: { 
                    ...state.splitEditor, 
                    secondaryFilePath: action.path,
                    enabled: action.path !== null ? true : state.splitEditor.enabled
                } 
            }

        default:
            return state
    }
}

// --- Context ---
const AppContext = createContext<{
    state: AppState
    dispatch: React.Dispatch<Action>
} | null>(null)

export function AppProvider({ children }: { children: ReactNode }) {
    const [state, dispatch] = useReducer(reducer, initialState)
    return (
        <AppContext.Provider value={{ state, dispatch }}>
            {children}
        </AppContext.Provider>
    )
}

export function useApp() {
    const ctx = useContext(AppContext)
    if (!ctx) throw new Error('useApp must be used within AppProvider')
    return ctx
}
