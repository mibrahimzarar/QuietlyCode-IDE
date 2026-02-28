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
            expandDirectory: (path: string) => Promise<any[]>
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

            // AirLLM model downloader
            getAirllmModels: () => Promise<any[]>
            downloadAirllmModel: (modelId: string, targetDir: string) => Promise<{ success: boolean; path?: string; error?: string }>
            cancelAirllmDownload: () => Promise<void>
            installAirllmDeps: () => Promise<{ success: boolean; output: string }>
            onAirllmDownloadProgress: (callback: (data: { progress: number; speed: string; downloaded: string; total: string }) => void) => () => void

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

            // LSP
            getDefinition: (filePath: string, line: number, character: number) => Promise<any | null>
            getHover: (filePath: string, line: number, character: number) => Promise<{ contents: any; range?: any } | null>
            getDocumentSymbols: (filePath: string) => Promise<any[] | null>

            // Git
            isGitRepo: (projectPath: string) => Promise<boolean>
            getGitStatus: (projectPath: string) => Promise<any[]>
            getGitBranches: (projectPath: string) => Promise<any[]>
            getCurrentBranch: (projectPath: string) => Promise<string | null>
            getGitCommits: (projectPath: string, count?: number) => Promise<any[]>
            getGitDiff: (projectPath: string, filePath?: string) => Promise<string>
            stageFile: (projectPath: string, filePath: string) => Promise<boolean>
            unstageFile: (projectPath: string, filePath: string) => Promise<boolean>
            discardChanges: (projectPath: string, filePath: string) => Promise<boolean>
            commitChanges: (projectPath: string, message: string) => Promise<{ success: boolean; error?: string }>
            createBranch: (projectPath: string, branchName: string, checkout?: boolean) => Promise<boolean>
            checkoutBranch: (projectPath: string, branchName: string) => Promise<boolean>
            pullChanges: (projectPath: string) => Promise<{ success: boolean; output?: string; error?: string }>
            pushChanges: (projectPath: string) => Promise<{ success: boolean; output?: string; error?: string }>

            // Format
            formatDocument: (filePath: string, projectPath: string) => Promise<{ success: boolean; content?: string; error?: string }>
            checkFormatting: (filePath: string, projectPath: string) => Promise<{ formatted: boolean; error?: string }>
            getFormatConfig: (projectPath: string) => Promise<any | null>

            // Debug
            startNodeDebug: (scriptPath: string, cwd: string, args: string[]) => Promise<{ sessionId: string; error?: string }>
            startPythonDebug: (scriptPath: string, cwd: string, args: string[]) => Promise<{ sessionId: string; error?: string }>
            stopDebug: (sessionId: string) => Promise<boolean>
            pauseDebug: (sessionId: string) => Promise<boolean>
            continueDebug: (sessionId: string) => Promise<boolean>
            stepOver: (sessionId: string) => Promise<boolean>
            stepInto: (sessionId: string) => Promise<boolean>
            stepOut: (sessionId: string) => Promise<boolean>
            setBreakpoint: (sessionId: string, file: string, line: number, condition?: string) => Promise<boolean>
            removeBreakpoint: (sessionId: string, file: string, line: number) => Promise<boolean>
            getBreakpoints: (sessionId: string, file?: string) => Promise<{ file: string; line: number }[]>
            getActiveDebugSessions: () => Promise<string[]>
            getDebugSessionInfo: (sessionId: string) => Promise<{ type: string; isPaused: boolean } | null>
            onDebugOutput: (callback: (data: { sessionId: string; output: string; type: string }) => void) => () => void
            onDebugStarted: (callback: (data: { sessionId: string; type: string }) => void) => () => void
            onDebugStopped: (callback: (data: { sessionId: string }) => void) => () => void
            onDebugTerminated: (callback: (data: { sessionId: string; code: number | null }) => void) => () => void
            onDebugPaused: (callback: (data: { sessionId: string }) => void) => () => void
            onDebugContinued: (callback: (data: { sessionId: string }) => void) => () => void
        }
    }
}
// refresh
