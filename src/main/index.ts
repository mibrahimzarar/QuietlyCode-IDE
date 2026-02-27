import { app, BrowserWindow, ipcMain, dialog, shell, nativeImage } from 'electron'
import { join, dirname, basename, extname } from 'path'
import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync, renameSync, readdirSync, statSync, rmSync } from 'fs'
import { exec } from 'child_process'
import { FileService } from './file-service'
import { AIService } from './ai-service'
import { ModelDownloader } from './model-downloader'
import { BinaryDownloader } from './binary-downloader'
import { TerminalManager } from './terminal-manager'
import { DiagnosticService } from './diagnostic-service'
import { VectorStore } from './rag/vector-store'
import { CodebaseIndexer } from './rag/indexer'
import { LSPService } from './lsp-service'
import { GitService } from './git-service'
import { FormatService } from './format-service'
import { DebugService } from './debug-service'

let mainWindow: BrowserWindow | null = null
let fileService: FileService
let aiService: AIService
let modelDownloader: ModelDownloader
let diagnosticService: DiagnosticService
let lspService: LSPService
let gitService: GitService
let formatService: FormatService
let debugService: DebugService

const SETTINGS_PATH = join(app.getPath('userData'), 'settings.json')

interface AppSettings {
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
    chatMessages: any[]
    standaloneChatMessages: any[]
}

function getDefaultSettings(): AppSettings {
    return {
        modelPath: '',
        serverBinaryPath: '',
        contextSize: 4096,
        maxTokens: 512,
        temperature: 0.7,
        threads: 4,
        theme: 'dark',
        modelsDirectory: join(app.getPath('userData'), 'models'),
        setupComplete: false,
        lastProjectPath: null,
        lastOpenFiles: [],
        lastActiveFile: null,
        chatMessages: [],
        standaloneChatMessages: []
    }
}

function loadSettings(): AppSettings {
    try {
        if (existsSync(SETTINGS_PATH)) {
            const data = readFileSync(SETTINGS_PATH, 'utf-8')
            return { ...getDefaultSettings(), ...JSON.parse(data) }
        }
    } catch (e) { /* ignore */ }
    return getDefaultSettings()
}

function saveSettings(settings: AppSettings): void {
    try {
        const dir = join(app.getPath('userData'))
        if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
        writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2))
    } catch (e) { /* ignore */ }
}

function createWindow(): void {
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 900,
        minHeight: 600,
        frame: false,
        titleBarStyle: 'hidden',
        backgroundColor: '#0a0a0f',
        icon: nativeImage.createFromPath(join(__dirname, '../../assets/images/1.png')),
        webPreferences: {
            preload: join(__dirname, '../preload/index.js'),
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: false
        }
    })

    // Start maximized
    mainWindow.maximize()

    // Load renderer
    if (process.env.ELECTRON_RENDERER_URL) {
        mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
    } else {
        mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
    }

    // Notify renderer of maximize state changes
    mainWindow.on('maximize', () => {
        mainWindow?.webContents.send('window:maximizeChanged', true)
    })
    mainWindow.on('unmaximize', () => {
        mainWindow?.webContents.send('window:maximizeChanged', false)
    })

    mainWindow.on('closed', () => {
        mainWindow = null
    })
}

function setupIPC(): void {
    const settings = loadSettings()
    fileService = new FileService()
    aiService = new AIService()
    modelDownloader = new ModelDownloader()
    diagnosticService = new DiagnosticService()
    lspService = new LSPService()
    gitService = new GitService()
    formatService = new FormatService()
    debugService = new DebugService()

    // --- Window Controls ---
    ipcMain.handle('window:minimize', () => mainWindow?.minimize())
    ipcMain.handle('window:maximize', () => {
        if (mainWindow?.isMaximized()) {
            mainWindow.unmaximize()
        } else {
            mainWindow?.maximize()
        }
    })
    ipcMain.handle('window:close', () => mainWindow?.close())
    ipcMain.handle('window:isMaximized', () => mainWindow?.isMaximized() ?? false)

    // --- Settings ---
    ipcMain.handle('settings:get', () => loadSettings())
    ipcMain.handle('settings:save', (_event, newSettings: Partial<AppSettings>) => {
        const current = loadSettings()
        const merged = { ...current, ...newSettings }
        saveSettings(merged)
        return merged
    })

    // --- File System ---
    ipcMain.handle('fs:selectFile', async () => {
        const result = await dialog.showOpenDialog({
            properties: ['openFile'],
            filters: [
                { name: 'Executables', extensions: ['exe', 'bin', ''] },
                { name: 'All Files', extensions: ['*'] }
            ]
        })
        if (result.canceled || !result.filePaths.length) return null
        return result.filePaths[0]
    })

    ipcMain.handle('fs:openFolder', async () => {
        const result = await dialog.showOpenDialog({
            properties: ['openDirectory']
        })
        if (result.canceled || !result.filePaths.length) return null
        const folderPath = result.filePaths[0]
        const tree = await fileService.getFileTree(folderPath)
        return { path: folderPath, tree }
    })

    ipcMain.handle('fs:readFile', async (_event, filePath: string) => {
        return fileService.readFile(filePath)
    })

    ipcMain.handle('fs:writeFile', async (_event, filePath: string, content: string) => {
        return fileService.writeFile(filePath, content)
    })

    ipcMain.handle('fs:patchFile', async (_event, filePath: string, patches: { search: string; replace: string }[]) => {
        return fileService.patchFile(filePath, patches)
    })

    ipcMain.handle('fs:lintCodebase', async (_event, projectPath: string) => {
        return diagnosticService.lintCodebase(projectPath)
    })

    ipcMain.handle('fs:getFileTree', async (_event, folderPath: string) => {
        return fileService.getFileTree(folderPath)
    })

    ipcMain.handle('fs:expandDirectory', async (_event, dirPath: string) => {
        return fileService.expandDirectory(dirPath)
    })

    ipcMain.handle('fs:createFile', async (_event, filePath: string) => {
        try {
            const dir = dirname(filePath)
            if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
            writeFileSync(filePath, '', 'utf-8')
            return { success: true }
        } catch (err: any) {
            return { success: false, error: err.message }
        }
    })

    ipcMain.handle('fs:createFolder', async (_event, folderPath: string) => {
        try {
            mkdirSync(folderPath, { recursive: true })
            return { success: true }
        } catch (err: any) {
            return { success: false, error: err.message }
        }
    })

    ipcMain.handle('fs:rename', async (_event, oldPath: string, newPath: string) => {
        try {
            renameSync(oldPath, newPath)
            return { success: true }
        } catch (err: any) {
            return { success: false, error: err.message }
        }
    })

    ipcMain.handle('fs:delete', async (_event, filePath: string) => {
        try {
            const stat = statSync(filePath)
            if (stat.isDirectory()) {
                rmSync(filePath, { recursive: true, force: true })
            } else {
                unlinkSync(filePath)
            }
            return { success: true }
        } catch (err: any) {
            return { success: false, error: err.message }
        }
    })

    ipcMain.handle('fs:searchInFiles', async (_event, dir: string, query: string) => {
        const results: { file: string; line: number; content: string }[] = []
        const MAX_RESULTS = 100

        function searchDir(dirPath: string) {
            if (results.length >= MAX_RESULTS) return
            try {
                const entries = readdirSync(dirPath, { withFileTypes: true })
                for (const entry of entries) {
                    if (results.length >= MAX_RESULTS) return
                    const fullPath = join(dirPath, entry.name)
                    if (entry.isDirectory()) {
                        const skip = ['node_modules', '.git', 'dist', 'build', 'out', '.next', '__pycache__', '.cache']
                        if (!skip.includes(entry.name)) searchDir(fullPath)
                    } else {
                        const ext = extname(entry.name).toLowerCase()
                        const textExts = ['.ts', '.tsx', '.js', '.jsx', '.py', '.rs', '.go', '.java', '.cpp', '.c', '.h', '.css', '.html', '.json', '.md', '.yaml', '.yml', '.xml', '.sh', '.toml', '.txt', '.sql', '.rb', '.php', '.swift', '.kt']
                        if (!textExts.includes(ext)) continue
                        try {
                            const content = readFileSync(fullPath, 'utf-8')
                            const lines = content.split('\n')
                            for (let i = 0; i < lines.length; i++) {
                                if (results.length >= MAX_RESULTS) return
                                if (lines[i].toLowerCase().includes(query.toLowerCase())) {
                                    results.push({ file: fullPath, line: i + 1, content: lines[i].trim().substring(0, 200) })
                                }
                            }
                        } catch (err) { /* skip unreadable files */ }
                    }
                }
            } catch (err) { /* skip unreadable dirs */ }
        }

        searchDir(dir)
        return results
    })

    // --- AI Service ---
    ipcMain.handle('ai:startServer', async (_event) => {
        const s = loadSettings()
        if (!s.serverBinaryPath || !s.modelPath) {
            return { success: false, error: 'Server binary or model path not configured' }
        }
        return aiService.start({
            binaryPath: s.serverBinaryPath,
            modelPath: s.modelPath,
            contextSize: s.contextSize,
            threads: s.threads,
            port: 8765
        })
    })

    ipcMain.handle('ai:stopServer', async () => {
        return aiService.stop()
    })

    ipcMain.handle('ai:getStatus', () => {
        return aiService.getStatus()
    })

    ipcMain.handle('ai:chat', async (_event, messages: Array<{ role: string, content: string }>, options?: { maxTokens?: number, temperature?: number }) => {
        const s = loadSettings()
        return aiService.chat(messages, {
            maxTokens: options?.maxTokens || s.maxTokens,
            temperature: options?.temperature || s.temperature
        })
    })

    ipcMain.handle('ai:chatStream', async (event, messages: Array<{ role: string, content: string }>, options?: { maxTokens?: number, temperature?: number }) => {
        const s = loadSettings()
        return aiService.chatStream(
            messages,
            {
                maxTokens: options?.maxTokens || s.maxTokens,
                temperature: options?.temperature || s.temperature
            },
            (chunk: string) => {
                mainWindow?.webContents.send('ai:streamChunk', chunk)
            },
            () => {
                mainWindow?.webContents.send('ai:streamEnd')
            }
        )
    })

    ipcMain.handle('ai:stopStream', () => {
        aiService.abortStream()
    })

    // --- AI Codebase Analysis ---
    ipcMain.handle('ai:analyzeCodebase', async (_event, projectPath: string) => {
        try {
            const summary: string[] = []
            summary.push(`Project: ${basename(projectPath)}`)

            // Read package.json if exists
            const pkgPath = join(projectPath, 'package.json')
            if (existsSync(pkgPath)) {
                try {
                    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'))
                    summary.push(`\nPackage: ${pkg.name || 'unknown'} v${pkg.version || '0.0.0'}`)
                    if (pkg.description) summary.push(`Description: ${pkg.description}`)
                    if (pkg.dependencies) summary.push(`Dependencies: ${Object.keys(pkg.dependencies).join(', ')}`)
                    if (pkg.devDependencies) summary.push(`Dev Dependencies: ${Object.keys(pkg.devDependencies).join(', ')}`)
                } catch { /* skip */ }
            }

            // Read README if exists
            for (const name of ['README.md', 'readme.md', 'README.txt', 'README']) {
                const readmePath = join(projectPath, name)
                if (existsSync(readmePath)) {
                    try {
                        const readme = readFileSync(readmePath, 'utf-8').substring(0, 1000)
                        summary.push(`\nREADME (first 1000 chars):\n${readme}`)
                    } catch { /* skip */ }
                    break
                }
            }

            // List top-level structure
            try {
                const entries = readdirSync(projectPath, { withFileTypes: true })
                const dirs = entries.filter(e => e.isDirectory() && !e.name.startsWith('.') && e.name !== 'node_modules').map(e => e.name)
                const files = entries.filter(e => e.isFile()).map(e => e.name)
                summary.push(`\nTop-level directories: ${dirs.join(', ')}`)
                summary.push(`Top-level files: ${files.join(', ')}`)
            } catch { /* skip */ }

            // Count files by extension
            const extCounts: Record<string, number> = {}
            function countFiles(dir: string, depth = 0) {
                if (depth > 4) return
                try {
                    const entries = readdirSync(dir, { withFileTypes: true })
                    for (const entry of entries) {
                        if (entry.isDirectory()) {
                            if (!['node_modules', '.git', 'dist', 'build', '__pycache__'].includes(entry.name)) {
                                countFiles(join(dir, entry.name), depth + 1)
                            }
                        } else {
                            const ext = extname(entry.name).toLowerCase() || '(no ext)'
                            extCounts[ext] = (extCounts[ext] || 0) + 1
                        }
                    }
                } catch { /* skip */ }
            }
            countFiles(projectPath)
            const topExts = Object.entries(extCounts).sort((a, b) => b[1] - a[1]).slice(0, 10)
            summary.push(`\nFile types: ${topExts.map(([ext, count]) => `${ext}: ${count}`).join(', ')}`)

            return { success: true, summary: summary.join('\n') }
        } catch (err: any) {
            return { success: false, error: err.message }
        }
    })

    // --- Model Downloader ---
    ipcMain.handle('models:getAvailable', async () => {
        return modelDownloader.getAvailableModels()
    })

    ipcMain.handle('models:selectDirectory', async () => {
        const result = await dialog.showOpenDialog({
            properties: ['openDirectory', 'createDirectory'],
            title: 'Select Model Download Directory'
        })
        if (result.canceled || !result.filePaths.length) return null
        return result.filePaths[0]
    })

    ipcMain.handle('models:download', async (_event, modelId: string, targetDir: string) => {
        const result = await modelDownloader.downloadModel(
            modelId,
            targetDir,
            (progress: number, speed: string) => {
                mainWindow?.webContents.send('models:downloadProgress', { modelId, progress, speed })
            }
        )

        if (result.success) {
            mainWindow?.webContents.send('models:downloadComplete', { modelId, path: result.path })
        } else {
            mainWindow?.webContents.send('models:downloadError', { modelId, error: result.error })
        }

        return result
    })

    ipcMain.handle('models:cancelDownload', () => {
        modelDownloader.cancelDownload()
    })

    ipcMain.handle('models:scanLocal', async (_event, directory: string) => {
        return modelDownloader.scanLocalModels(directory)
    })

    ipcMain.handle('models:delete', async (_event, filePath: string) => {
        // Check if this model is currently running
        if (aiService.getStatus().running && aiService.currentModelPath === filePath) {
            await aiService.stop()
        }
        return modelDownloader.deleteModel(filePath)
    })

    // --- Binary Downloader ---
    const binaryDownloader = new BinaryDownloader()

    ipcMain.handle('binary:download', async (_event, targetDir: string) => {
        return binaryDownloader.downloadBinary(
            targetDir,
            (progress, status) => {
                mainWindow?.webContents.send('binary:progress', { progress, status })
            }
        )
    })

    ipcMain.handle('binary:cancel', () => {
        binaryDownloader.cancel()
    })

    // --- Shell ---
    ipcMain.handle('shell:openExternal', (_event, url: string) => {
        shell.openExternal(url)
    })

    // --- Terminal ---
    const terminalManager = new TerminalManager(mainWindow)

    ipcMain.handle('terminal:create', async (_event, id: string, shell: string, cwd: string) => {
        terminalManager.setWindow(mainWindow!)
        return terminalManager.createSession(id, shell, cwd)
    })

    ipcMain.handle('terminal:write', (_event, id: string, data: string) => {
        terminalManager.write(id, data)
    })

    ipcMain.handle('terminal:resize', (_event, id: string, cols: number, rows: number) => {
        terminalManager.resize(id, cols, rows)
    })

    ipcMain.handle('terminal:kill', (_event, id: string) => {
        terminalManager.kill(id)
    })

    ipcMain.handle('terminal:getShells', async () => {
        return terminalManager.detectShells()
    })

    ipcMain.handle('terminal:execute', async (_event, command: string, cwd?: string) => {
        return new Promise<{ stdout: string; stderr: string; code: number }>((resolve) => {
            exec(command, { cwd: cwd || app.getPath('home'), maxBuffer: 1024 * 1024 * 5, shell: 'powershell.exe' }, (error, stdout, stderr) => {
                resolve({
                    stdout: stdout || '',
                    stderr: stderr || (error?.message || ''),
                    code: error?.code || 0
                })
            })
        })
    })
    // --- RAG System ---
    const vectorStore = new VectorStore()
    const indexer = new CodebaseIndexer(vectorStore, aiService)

    ipcMain.handle('rag:index', async (_event, projectPath: string) => {
        // Run in background to not block UI
        indexer.index(projectPath, (current, total, file) => {
            mainWindow?.webContents.send('rag:progress', { current, total, file })
        })
        return { success: true }
    })

    ipcMain.handle('rag:status', () => {
        return vectorStore.getStats()
    })

    ipcMain.handle('rag:retrieve', async (_event, query: string) => {
        const embedding = await aiService.getEmbedding(query)
        if (!embedding) return []
        const results = await vectorStore.search(embedding, 5)
        return results
    })

    // --- LSP Service ---
    ipcMain.handle('lsp:definition', async (_event, filePath: string, line: number, character: number) => {
        return lspService.getDefinition(filePath, line, character)
    })

    ipcMain.handle('lsp:hover', async (_event, filePath: string, line: number, character: number) => {
        return lspService.getHover(filePath, line, character)
    })

    ipcMain.handle('lsp:documentSymbols', async (_event, filePath: string) => {
        return lspService.getDocumentSymbols(filePath)
    })

    // --- Git Service ---
    ipcMain.handle('git:isRepo', async (_event, projectPath: string) => {
        return gitService.isGitRepository(projectPath)
    })

    ipcMain.handle('git:status', async (_event, projectPath: string) => {
        return gitService.getStatus(projectPath)
    })

    ipcMain.handle('git:branches', async (_event, projectPath: string) => {
        return gitService.getBranches(projectPath)
    })

    ipcMain.handle('git:currentBranch', async (_event, projectPath: string) => {
        return gitService.getCurrentBranch(projectPath)
    })

    ipcMain.handle('git:commits', async (_event, projectPath: string, count: number) => {
        return gitService.getCommits(projectPath, count)
    })

    ipcMain.handle('git:diff', async (_event, projectPath: string, filePath?: string) => {
        return gitService.getDiff(projectPath, filePath)
    })

    ipcMain.handle('git:stage', async (_event, projectPath: string, filePath: string) => {
        return gitService.stageFile(projectPath, filePath)
    })

    ipcMain.handle('git:unstage', async (_event, projectPath: string, filePath: string) => {
        return gitService.unstageFile(projectPath, filePath)
    })

    ipcMain.handle('git:discard', async (_event, projectPath: string, filePath: string) => {
        return gitService.discardChanges(projectPath, filePath)
    })

    ipcMain.handle('git:commit', async (_event, projectPath: string, message: string) => {
        return gitService.commit(projectPath, message)
    })

    ipcMain.handle('git:createBranch', async (_event, projectPath: string, branchName: string, checkout: boolean) => {
        return gitService.createBranch(projectPath, branchName, checkout)
    })

    ipcMain.handle('git:checkout', async (_event, projectPath: string, branchName: string) => {
        return gitService.checkoutBranch(projectPath, branchName)
    })

    ipcMain.handle('git:pull', async (_event, projectPath: string) => {
        return gitService.pull(projectPath)
    })

    ipcMain.handle('git:push', async (_event, projectPath: string) => {
        return gitService.push(projectPath)
    })

    // --- Format Service ---
    ipcMain.handle('format:document', async (_event, filePath: string, projectPath: string) => {
        return formatService.formatDocument(filePath, projectPath)
    })

    ipcMain.handle('format:check', async (_event, filePath: string, projectPath: string) => {
        return formatService.checkFormatting(filePath, projectPath)
    })

    ipcMain.handle('format:config', async (_event, projectPath: string) => {
        return formatService.getPrettierConfig(projectPath)
    })

    // --- Debug Service ---
    ipcMain.handle('debug:startNode', async (_event, scriptPath: string, cwd: string, args: string[]) => {
        return debugService.startNodeDebug(scriptPath, cwd, args)
    })

    ipcMain.handle('debug:startPython', async (_event, scriptPath: string, cwd: string, args: string[]) => {
        return debugService.startPythonDebug(scriptPath, cwd, args)
    })

    ipcMain.handle('debug:stop', async (_event, sessionId: string) => {
        return debugService.stopDebug(sessionId)
    })

    ipcMain.handle('debug:pause', async (_event, sessionId: string) => {
        return debugService.pauseDebug(sessionId)
    })

    ipcMain.handle('debug:continue', async (_event, sessionId: string) => {
        return debugService.continueDebug(sessionId)
    })

    ipcMain.handle('debug:stepOver', async (_event, sessionId: string) => {
        return debugService.stepOver(sessionId)
    })

    ipcMain.handle('debug:stepInto', async (_event, sessionId: string) => {
        return debugService.stepInto(sessionId)
    })

    ipcMain.handle('debug:stepOut', async (_event, sessionId: string) => {
        return debugService.stepOut(sessionId)
    })

    ipcMain.handle('debug:setBreakpoint', async (_event, sessionId: string, file: string, line: number, condition?: string) => {
        return debugService.setBreakpoint(sessionId, file, line, condition)
    })

    ipcMain.handle('debug:removeBreakpoint', async (_event, sessionId: string, file: string, line: number) => {
        return debugService.removeBreakpoint(sessionId, file, line)
    })

    ipcMain.handle('debug:getBreakpoints', async (_event, sessionId: string, file?: string) => {
        return debugService.getBreakpoints(sessionId, file)
    })

    ipcMain.handle('debug:getActiveSessions', async () => {
        return debugService.getActiveSessions()
    })

    ipcMain.handle('debug:getSessionInfo', async (_event, sessionId: string) => {
        return debugService.getSessionInfo(sessionId)
    })

    // Debug event forwarding to renderer
    debugService.on('output', (data) => {
        mainWindow?.webContents.send('debug:output', data)
    })

    debugService.on('started', (data) => {
        mainWindow?.webContents.send('debug:started', data)
    })

    debugService.on('stopped', (data) => {
        mainWindow?.webContents.send('debug:stopped', data)
    })

    debugService.on('terminated', (data) => {
        mainWindow?.webContents.send('debug:terminated', data)
    })

    debugService.on('paused', (data) => {
        mainWindow?.webContents.send('debug:paused', data)
    })

    debugService.on('continued', (data) => {
        mainWindow?.webContents.send('debug:continued', data)
    })
}

app.whenReady().then(() => {
    // Suppress Chromium internal network logs (noise) and ignore cert errors in dev
    app.commandLine.appendSwitch('log-level', '3')
    app.commandLine.appendSwitch('ignore-certificate-errors')

    setupIPC()
    createWindow()

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow()
        }
    })
})

app.on('window-all-closed', () => {
    aiService?.stop()
    if (process.platform !== 'darwin') {
        app.quit()
    }
})
