import { contextBridge, ipcRenderer } from 'electron'

const electronAPI = {
    // Window controls
    minimize: () => ipcRenderer.invoke('window:minimize'),
    maximize: () => ipcRenderer.invoke('window:maximize'),
    close: () => ipcRenderer.invoke('window:close'),
    isMaximized: () => ipcRenderer.invoke('window:isMaximized'),
    onMaximizeChange: (callback: (isMaximized: boolean) => void) => {
        const listener = (_event: any, isMaximized: boolean) => callback(isMaximized)
        ipcRenderer.on('window:maximizeChanged', listener)
        return () => ipcRenderer.removeListener('window:maximizeChanged', listener)
    },

    // Settings
    getSettings: () => ipcRenderer.invoke('settings:get'),
    saveSettings: (settings: any) => ipcRenderer.invoke('settings:save', settings),

    // File system
    selectFile: () => ipcRenderer.invoke('fs:selectFile'),
    openFolder: () => ipcRenderer.invoke('fs:openFolder'),
    readFile: (path: string) => ipcRenderer.invoke('fs:readFile', path),
    writeFile: (path: string, content: string) => ipcRenderer.invoke('fs:writeFile', path, content),
    patchFile: (path: string, patches: { search: string; replace: string }[]) => ipcRenderer.invoke('fs:patchFile', path, patches),
    lintCodebase: (path: string) => ipcRenderer.invoke('fs:lintCodebase', path),
    getFileTree: (path: string) => ipcRenderer.invoke('fs:getFileTree', path),
    expandDirectory: (path: string) => ipcRenderer.invoke('fs:expandDirectory', path),
    createFile: (path: string) => ipcRenderer.invoke('fs:createFile', path),
    createFolder: (path: string) => ipcRenderer.invoke('fs:createFolder', path),
    renameFile: (oldPath: string, newPath: string) => ipcRenderer.invoke('fs:rename', oldPath, newPath),
    deleteFile: (path: string) => ipcRenderer.invoke('fs:delete', path),
    searchInFiles: (dir: string, query: string) => ipcRenderer.invoke('fs:searchInFiles', dir, query),

    // AI Service
    startAIServer: () => ipcRenderer.invoke('ai:startServer'),
    stopAIServer: () => ipcRenderer.invoke('ai:stopServer'),
    getAIStatus: () => ipcRenderer.invoke('ai:getStatus'),
    chat: (messages: any[], options?: any) => ipcRenderer.invoke('ai:chat', messages, options),
    chatStream: (messages: any[], options?: any) => ipcRenderer.invoke('ai:chatStream', messages, options),
    stopStream: () => ipcRenderer.invoke('ai:stopStream'),
    analyzeCodebase: (projectPath: string) => ipcRenderer.invoke('ai:analyzeCodebase', projectPath),
    onStreamChunk: (callback: (chunk: string) => void) => {
        const listener = (_event: any, chunk: string) => callback(chunk)
        ipcRenderer.on('ai:streamChunk', listener)
        return () => ipcRenderer.removeListener('ai:streamChunk', listener)
    },
    onStreamEnd: (callback: () => void) => {
        const listener = () => callback()
        ipcRenderer.on('ai:streamEnd', listener)
        return () => ipcRenderer.removeListener('ai:streamEnd', listener)
    },

    // Model downloader
    getAvailableModels: () => ipcRenderer.invoke('models:getAvailable'),
    selectDirectory: () => ipcRenderer.invoke('models:selectDirectory'),
    downloadModel: (modelId: string, targetDir: string) => ipcRenderer.invoke('models:download', modelId, targetDir),
    cancelDownload: () => ipcRenderer.invoke('models:cancelDownload'),
    scanLocalModels: (directory: string) => ipcRenderer.invoke('models:scanLocal', directory),
    deleteModel: (path: string) => ipcRenderer.invoke('models:delete', path),
    onDownloadProgress: (callback: (data: { modelId: string; progress: number; speed: string }) => void) => {
        const listener = (_event: any, data: any) => callback(data)
        ipcRenderer.on('models:downloadProgress', listener)
        return () => ipcRenderer.removeListener('models:downloadProgress', listener)
    },
    onDownloadComplete: (callback: (data: { modelId: string; path: string }) => void) => {
        const listener = (_event: any, data: any) => callback(data)
        ipcRenderer.on('models:downloadComplete', listener)
        return () => ipcRenderer.removeListener('models:downloadComplete', listener)
    },
    onDownloadError: (callback: (data: { modelId: string; error: string }) => void) => {
        const listener = (_event: any, data: any) => callback(data)
        ipcRenderer.on('models:downloadError', listener)
        return () => ipcRenderer.removeListener('models:downloadError', listener)
    },

    // Binary downloader
    downloadBinary: (targetDir: string) => ipcRenderer.invoke('binary:download', targetDir),
    cancelBinaryDownload: () => ipcRenderer.invoke('binary:cancel'),
    onBinaryDownloadProgress: (callback: (data: { progress: number; status: string }) => void) => {
        const listener = (_event: any, data: any) => callback(data)
        ipcRenderer.on('binary:progress', listener)
        return () => ipcRenderer.removeListener('binary:progress', listener)
    },

    // Shell / Terminal
    executeCommand: (command: string, cwd?: string) => ipcRenderer.invoke('terminal:execute', command, cwd),
    openExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url),

    // Persistent Terminal
    createTerminal: (id: string, shell: string, cwd: string) => ipcRenderer.invoke('terminal:create', id, shell, cwd),
    writeTerminal: (id: string, data: string) => ipcRenderer.invoke('terminal:write', id, data),
    resizeTerminal: (id: string, cols: number, rows: number) => ipcRenderer.invoke('terminal:resize', id, cols, rows),
    killTerminal: (id: string) => ipcRenderer.invoke('terminal:kill', id),
    getShells: () => ipcRenderer.invoke('terminal:getShells'),
    onTerminalData: (callback: (data: { id: string; data: string }) => void) => {
        const listener = (_event: any, data: any) => callback(data)
        ipcRenderer.on('terminal:data', listener)
        return () => ipcRenderer.removeListener('terminal:data', listener)
    },
    onTerminalExit: (callback: (data: { id: string; code: number }) => void) => {
        const listener = (_event: any, data: any) => callback(data)
        ipcRenderer.on('terminal:exit', listener)
        return () => ipcRenderer.removeListener('terminal:exit', listener)
    },

    // RAG
    indexCodebase: (projectPath: string) => ipcRenderer.invoke('rag:index', projectPath),
    getRagStatus: () => ipcRenderer.invoke('rag:status'),
    ragRetrieve: (query: string) => ipcRenderer.invoke('rag:retrieve', query),
    onRagProgress: (callback: (data: { current: number; total: number; file: string }) => void) => {
        const listener = (_event: any, data: any) => callback(data)
        ipcRenderer.on('rag:progress', listener)
        return () => ipcRenderer.removeListener('rag:progress', listener)
    },

    // LSP
    getDefinition: (filePath: string, line: number, character: number) => 
        ipcRenderer.invoke('lsp:definition', filePath, line, character),
    getHover: (filePath: string, line: number, character: number) => 
        ipcRenderer.invoke('lsp:hover', filePath, line, character),
    getDocumentSymbols: (filePath: string) => 
        ipcRenderer.invoke('lsp:documentSymbols', filePath),

    // Git
    isGitRepo: (projectPath: string) => ipcRenderer.invoke('git:isRepo', projectPath),
    getGitStatus: (projectPath: string) => ipcRenderer.invoke('git:status', projectPath),
    getGitBranches: (projectPath: string) => ipcRenderer.invoke('git:branches', projectPath),
    getCurrentBranch: (projectPath: string) => ipcRenderer.invoke('git:currentBranch', projectPath),
    getGitCommits: (projectPath: string, count?: number) => ipcRenderer.invoke('git:commits', projectPath, count || 20),
    getGitDiff: (projectPath: string, filePath?: string) => ipcRenderer.invoke('git:diff', projectPath, filePath),
    stageFile: (projectPath: string, filePath: string) => ipcRenderer.invoke('git:stage', projectPath, filePath),
    unstageFile: (projectPath: string, filePath: string) => ipcRenderer.invoke('git:unstage', projectPath, filePath),
    discardChanges: (projectPath: string, filePath: string) => ipcRenderer.invoke('git:discard', projectPath, filePath),
    commitChanges: (projectPath: string, message: string) => ipcRenderer.invoke('git:commit', projectPath, message),
    createBranch: (projectPath: string, branchName: string, checkout?: boolean) => 
        ipcRenderer.invoke('git:createBranch', projectPath, branchName, checkout || false),
    checkoutBranch: (projectPath: string, branchName: string) => ipcRenderer.invoke('git:checkout', projectPath, branchName),
    pullChanges: (projectPath: string) => ipcRenderer.invoke('git:pull', projectPath),
    pushChanges: (projectPath: string) => ipcRenderer.invoke('git:push', projectPath),

    // Format
    formatDocument: (filePath: string, projectPath: string) => ipcRenderer.invoke('format:document', filePath, projectPath),
    checkFormatting: (filePath: string, projectPath: string) => ipcRenderer.invoke('format:check', filePath, projectPath),
    getFormatConfig: (projectPath: string) => ipcRenderer.invoke('format:config', projectPath),

    // Debug
    startNodeDebug: (scriptPath: string, cwd: string, args: string[]) => ipcRenderer.invoke('debug:startNode', scriptPath, cwd, args),
    startPythonDebug: (scriptPath: string, cwd: string, args: string[]) => ipcRenderer.invoke('debug:startPython', scriptPath, cwd, args),
    stopDebug: (sessionId: string) => ipcRenderer.invoke('debug:stop', sessionId),
    pauseDebug: (sessionId: string) => ipcRenderer.invoke('debug:pause', sessionId),
    continueDebug: (sessionId: string) => ipcRenderer.invoke('debug:continue', sessionId),
    stepOver: (sessionId: string) => ipcRenderer.invoke('debug:stepOver', sessionId),
    stepInto: (sessionId: string) => ipcRenderer.invoke('debug:stepInto', sessionId),
    stepOut: (sessionId: string) => ipcRenderer.invoke('debug:stepOut', sessionId),
    setBreakpoint: (sessionId: string, file: string, line: number, condition?: string) => 
        ipcRenderer.invoke('debug:setBreakpoint', sessionId, file, line, condition),
    removeBreakpoint: (sessionId: string, file: string, line: number) => 
        ipcRenderer.invoke('debug:removeBreakpoint', sessionId, file, line),
    getBreakpoints: (sessionId: string, file?: string) => ipcRenderer.invoke('debug:getBreakpoints', sessionId, file),
    getActiveDebugSessions: () => ipcRenderer.invoke('debug:getActiveSessions'),
    getDebugSessionInfo: (sessionId: string) => ipcRenderer.invoke('debug:getSessionInfo', sessionId),
    onDebugOutput: (callback: (data: { sessionId: string; output: string; type: string }) => void) => {
        const handler = (_event: any, data: any) => callback(data)
        ipcRenderer.on('debug:output', handler)
        return () => ipcRenderer.removeListener('debug:output', handler)
    },
    onDebugStarted: (callback: (data: { sessionId: string; type: string }) => void) => {
        const handler = (_event: any, data: any) => callback(data)
        ipcRenderer.on('debug:started', handler)
        return () => ipcRenderer.removeListener('debug:started', handler)
    },
    onDebugStopped: (callback: (data: { sessionId: string }) => void) => {
        const handler = (_event: any, data: any) => callback(data)
        ipcRenderer.on('debug:stopped', handler)
        return () => ipcRenderer.removeListener('debug:stopped', handler)
    },
    onDebugTerminated: (callback: (data: { sessionId: string; code: number | null }) => void) => {
        const handler = (_event: any, data: any) => callback(data)
        ipcRenderer.on('debug:terminated', handler)
        return () => ipcRenderer.removeListener('debug:terminated', handler)
    },
    onDebugPaused: (callback: (data: { sessionId: string }) => void) => {
        const handler = (_event: any, data: any) => callback(data)
        ipcRenderer.on('debug:paused', handler)
        return () => ipcRenderer.removeListener('debug:paused', handler)
    },
    onDebugContinued: (callback: (data: { sessionId: string }) => void) => {
        const handler = (_event: any, data: any) => callback(data)
        ipcRenderer.on('debug:continued', handler)
        return () => ipcRenderer.removeListener('debug:continued', handler)
    }
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)

export type ElectronAPI = typeof electronAPI

