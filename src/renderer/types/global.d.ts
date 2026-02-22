export { }

declare global {
    interface Window {
        electronAPI: {
            // Window controls
            minimize: () => Promise<void>
            maximize: () => Promise<void>
            close: () => Promise<void>
            isMaximized: () => Promise<boolean>
            onMaximizeChange: (callback: (isMaximized: boolean) => void) => () => void

            // Settings
            getSettings: () => Promise<any>
            saveSettings: (settings: any) => Promise<any>

            // File system
            selectFile: () => Promise<string | null>
            openFolder: () => Promise<{ path: string; tree: any[] } | null>
            readFile: (path: string) => Promise<{ success: boolean; content?: string; error?: string }>
            writeFile: (path: string, content: string) => Promise<{ success: boolean; error?: string }>
            patchFile: (path: string, patches: { search: string; replace: string }[]) => Promise<{ success: boolean; error?: string }>
            lintCodebase: (projectPath: string) => Promise<{ success: boolean; problems?: any[]; error?: string }>
            getFileTree: (path: string) => Promise<any[]>
            createFile: (path: string) => Promise<{ success: boolean; error?: string }>
            createFolder: (path: string) => Promise<{ success: boolean; error?: string }>
            renameFile: (oldPath: string, newPath: string) => Promise<{ success: boolean; error?: string }>
            deleteFile: (path: string) => Promise<{ success: boolean; error?: string }>
            searchInFiles: (dir: string, query: string) => Promise<{ file: string; line: number; content: string }[]>

            // AI Service
            startAIServer: () => Promise<{ success: boolean; error?: string }>
            stopAIServer: () => Promise<void>
            getAIStatus: () => Promise<{ running: boolean; port: number }>
            chat: (messages: any[], options?: any) => Promise<{ success: boolean; content?: string; error?: string }>
            chatStream: (messages: any[], options?: any) => Promise<{ success: boolean; error?: string }>
            stopStream: () => Promise<void>
            analyzeCodebase: (projectPath: string) => Promise<{ success: boolean; summary?: string; error?: string }>
            onStreamChunk: (callback: (chunk: string) => void) => () => void
            onStreamEnd: (callback: () => void) => () => void

            // Model downloader
            getAvailableModels: () => Promise<any[]>
            selectDirectory: () => Promise<string | null>
            downloadModel: (modelId: string, targetDir: string) => Promise<{ success: boolean; path?: string; error?: string }>
            cancelDownload: () => Promise<void>
            scanLocalModels: (directory: string) => Promise<any[]>
            deleteModel: (path: string) => Promise<{ success: boolean; error?: string }>
            onDownloadProgress: (callback: (data: { modelId: string; progress: number; speed: string }) => void) => () => void
            onDownloadComplete: (callback: (data: { modelId: string; path: string }) => void) => () => void
            onDownloadError: (callback: (data: { modelId: string; error: string }) => void) => () => void

            // Binary downloader
            downloadBinary: (targetDir: string) => Promise<{ success: boolean; path?: string; error?: string }>
            cancelBinaryDownload: () => Promise<void>
            onBinaryDownloadProgress: (callback: (data: { progress: number; status: string }) => void) => () => void

            // Persistent Terminal
            createTerminal: (id: string, shell: string, cwd: string) => Promise<{ success: boolean; error?: string }>
            writeTerminal: (id: string, data: string) => void
            resizeTerminal: (id: string, cols: number, rows: number) => void
            killTerminal: (id: string) => void
            getShells: () => Promise<string[]>
            onTerminalData: (callback: (data: { id: string; data: string }) => void) => () => void
            onTerminalExit: (callback: (data: { id: string; code: number }) => void) => () => void

            // RAG
            indexCodebase: (projectPath: string) => Promise<{ success: boolean; error?: string }>
            getRagStatus: () => Promise<{ count: number; path: string }>
            ragRetrieve: (query: string) => Promise<any[]>
            onRagProgress: (callback: (data: { current: number; total: number; file: string }) => void) => () => void

            // Shell / Terminal
            executeCommand: (command: string, cwd?: string) => Promise<{ stdout: string; stderr: string; code: number }>
            openExternal: (url: string) => Promise<void>
        }
    }
}
