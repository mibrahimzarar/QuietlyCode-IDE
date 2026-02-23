import { spawn, ChildProcess } from 'child_process'
import { createMessageConnection, StreamMessageReader, StreamMessageWriter, MessageConnection } from 'vscode-jsonrpc/node'
import { ipcMain, BrowserWindow } from 'electron'
import * as path from 'path'
import * as fs from 'fs'

interface LSPClient {
    process: ChildProcess
    connection: MessageConnection
    rootPath: string
    language: string
    capabilities: any
}

interface Location {
    uri: string
    range: {
        start: { line: number; character: number }
        end: { line: number; character: number }
    }
}

interface Hover {
    contents: string | { language: string; value: string } | Array<string | { language: string; value: string }>
    range?: {
        start: { line: number; character: number }
        end: { line: number; character: number }
    }
}

export class LSPService {
    private clients: Map<string, LSPClient> = new Map()
    private failedServers: Set<string> = new Set()
    private mainWindow: BrowserWindow | null = null

    setWindow(window: BrowserWindow) {
        this.mainWindow = window
    }

    async startLanguageServer(language: string, rootPath: string): Promise<boolean> {
        const key = `${language}:${rootPath}`
        
        if (this.clients.has(key)) {
            return true
        }

        // Skip if we've already failed to start this server
        if (this.failedServers.has(key)) {
            return false
        }

        // Determine which language server to use
        const serverCommand = this.getLanguageServerCommand(language, rootPath)
        if (!serverCommand) {
            console.log(`[LSP] No language server available for ${language}`)
            this.failedServers.add(key)
            return false
        }

        try {
            const { command, args, options } = serverCommand
            
            console.log(`[LSP] Starting ${language} server: ${command} ${args.join(' ')}`)
            
            const process = spawn(command, args, {
                ...options,
                cwd: rootPath,
                stdio: ['pipe', 'pipe', 'pipe']
            })

            const connection = createMessageConnection(
                new StreamMessageReader(process.stdout),
                new StreamMessageWriter(process.stdin)
            )

            connection.listen()

            // Handle errors
            process.stderr?.on('data', (data) => {
                console.log(`[LSP ${language}]`, data.toString())
            })

            process.on('exit', (code) => {
                console.log(`[LSP ${language}] Server exited with code ${code}`)
                this.clients.delete(key)
            })

            // Initialize the server
            const initResult = await connection.sendRequest('initialize', {
                processId: process.pid,
                rootUri: `file://${rootPath}`,
                capabilities: {
                    textDocument: {
                        synchronization: {
                            dynamicRegistration: false,
                            willSave: true,
                            willSaveWaitUntil: true,
                            didSave: true
                        },
                        completion: {
                            dynamicRegistration: false,
                            completionItem: {
                                snippetSupport: true,
                                commitCharactersSupport: true,
                                documentationFormat: ['markdown', 'plaintext'],
                                deprecatedSupport: true,
                                preselectSupport: true
                            }
                        },
                        hover: {
                            dynamicRegistration: false,
                            contentFormat: ['markdown', 'plaintext']
                        },
                        definition: {
                            dynamicRegistration: false,
                            linkSupport: true
                        },
                        documentSymbol: {
                            dynamicRegistration: false,
                            hierarchicalDocumentSymbolSupport: true
                        },
                        codeAction: {
                            dynamicRegistration: false,
                            codeActionLiteralSupport: {
                                codeActionKind: {
                                    valueSet: ['', 'quickfix', 'refactor', 'source']
                                }
                            }
                        },
                        formatting: {
                            dynamicRegistration: false
                        },
                        rename: {
                            dynamicRegistration: false,
                            prepareSupport: true
                        }
                    },
                    workspace: {
                        applyEdit: true,
                        workspaceEdit: {
                            documentChanges: true
                        }
                    }
                },
                workspaceFolders: [{
                    uri: `file://${rootPath}`,
                    name: path.basename(rootPath)
                }]
            })

            await connection.sendNotification('initialized', {})

            const client: LSPClient = {
                process,
                connection,
                rootPath,
                language,
                capabilities: (initResult as any)?.capabilities || {}
            }

            this.clients.set(key, client)
            
            console.log(`[LSP] ${language} server initialized successfully`)
            return true

        } catch (error) {
            console.error(`[LSP] Failed to start ${language} server:`, error)
            this.failedServers.add(key)
            return false
        }
    }

    private getLanguageServerCommand(language: string, rootPath: string): { command: string; args: string[]; options?: any } | null {
        const isWin = process.platform === 'win32'
        const nodeModulesPath = path.join(rootPath, 'node_modules')
        
        switch (language) {
            case 'typescript':
            case 'javascript':
                // Check for typescript-language-server in project
                const tlsPath = path.join(nodeModulesPath, '.bin', isWin ? 'typescript-language-server.cmd' : 'typescript-language-server')
                if (fs.existsSync(tlsPath)) {
                    return {
                        command: tlsPath,
                        args: ['--stdio'],
                        options: { shell: isWin }
                    }
                }
                // Fall back to npx
                return {
                    command: isWin ? 'npx.cmd' : 'npx',
                    args: ['-y', 'typescript-language-server', '--stdio'],
                    options: { shell: isWin }
                }
                
            case 'python':
                return {
                    command: isWin ? 'pylsp.cmd' : 'pylsp',
                    args: [],
                    options: { shell: isWin }
                }
                
            case 'rust':
                return {
                    command: 'rust-analyzer',
                    args: [],
                    options: {}
                }
                
            case 'go':
                return {
                    command: 'gopls',
                    args: [],
                    options: {}
                }
                
            default:
                return null
        }
    }

    async getDefinition(filePath: string, line: number, character: number): Promise<Location | Location[] | null> {
        const language = this.detectLanguage(filePath)
        const rootPath = this.findProjectRoot(filePath, language)
        
        if (!rootPath) return null

        const key = `${language}:${rootPath}`
        let client = this.clients.get(key)

        if (!client) {
            const started = await this.startLanguageServer(language, rootPath)
            if (!started) return null
            client = this.clients.get(key)
        }

        if (!client) return null

        try {
            // Ensure document is open
            const content = fs.readFileSync(filePath, 'utf-8')
            await client.connection.sendNotification('textDocument/didOpen', {
                textDocument: {
                    uri: `file://${filePath}`,
                    languageId: language,
                    version: 1,
                    text: content
                }
            })

            const result = await client.connection.sendRequest('textDocument/definition', {
                textDocument: {
                    uri: `file://${filePath}`
                },
                position: {
                    line,
                    character
                }
            })

            return result as Location | Location[] | null
        } catch (error) {
            console.error('[LSP] Definition request failed:', error)
            return null
        }
    }

    async getHover(filePath: string, line: number, character: number): Promise<Hover | null> {
        const language = this.detectLanguage(filePath)
        const rootPath = this.findProjectRoot(filePath, language)
        
        if (!rootPath) return null

        const key = `${language}:${rootPath}`
        let client = this.clients.get(key)

        if (!client) {
            const started = await this.startLanguageServer(language, rootPath)
            if (!started) return null
            client = this.clients.get(key)
        }

        if (!client) return null

        try {
            // Ensure document is open
            const content = fs.readFileSync(filePath, 'utf-8')
            await client.connection.sendNotification('textDocument/didOpen', {
                textDocument: {
                    uri: `file://${filePath}`,
                    languageId: language,
                    version: 1,
                    text: content
                }
            })

            const result = await client.connection.sendRequest('textDocument/hover', {
                textDocument: {
                    uri: `file://${filePath}`
                },
                position: {
                    line,
                    character
                }
            })

            return result as Hover | null
        } catch (error) {
            console.error('[LSP] Hover request failed:', error)
            return null
        }
    }

    async getDocumentSymbols(filePath: string): Promise<any[] | null> {
        const language = this.detectLanguage(filePath)
        const rootPath = this.findProjectRoot(filePath, language)
        
        if (!rootPath) return null

        const key = `${language}:${rootPath}`
        let client = this.clients.get(key)

        if (!client) {
            const started = await this.startLanguageServer(language, rootPath)
            if (!started) return null
            client = this.clients.get(key)
        }

        if (!client) return null

        try {
            const content = fs.readFileSync(filePath, 'utf-8')
            await client.connection.sendNotification('textDocument/didOpen', {
                textDocument: {
                    uri: `file://${filePath}`,
                    languageId: language,
                    version: 1,
                    text: content
                }
            })

            const result = await client.connection.sendRequest('textDocument/documentSymbol', {
                textDocument: {
                    uri: `file://${filePath}`
                }
            })

            return result as any[] | null
        } catch (error) {
            console.error('[LSP] Document symbols request failed:', error)
            return null
        }
    }

    private detectLanguage(filePath: string): string {
        const ext = path.extname(filePath).toLowerCase()
        
        switch (ext) {
            case '.ts':
            case '.tsx':
                return 'typescript'
            case '.js':
            case '.jsx':
                return 'javascript'
            case '.py':
                return 'python'
            case '.rs':
                return 'rust'
            case '.go':
                return 'go'
            default:
                return 'plaintext'
        }
    }

    private findProjectRoot(filePath: string, language: string): string | null {
        let currentDir = path.dirname(filePath)
        
        while (currentDir !== path.dirname(currentDir)) {
            // Check for language-specific project markers
            switch (language) {
                case 'typescript':
                case 'javascript':
                    if (fs.existsSync(path.join(currentDir, 'tsconfig.json')) ||
                        fs.existsSync(path.join(currentDir, 'package.json'))) {
                        return currentDir
                    }
                    break
                case 'python':
                    if (fs.existsSync(path.join(currentDir, 'requirements.txt')) ||
                        fs.existsSync(path.join(currentDir, 'setup.py')) ||
                        fs.existsSync(path.join(currentDir, 'pyproject.toml'))) {
                        return currentDir
                    }
                    break
                case 'rust':
                    if (fs.existsSync(path.join(currentDir, 'Cargo.toml'))) {
                        return currentDir
                    }
                    break
                case 'go':
                    if (fs.existsSync(path.join(currentDir, 'go.mod'))) {
                        return currentDir
                    }
                    break
            }
            
            // Check for git repository
            if (fs.existsSync(path.join(currentDir, '.git'))) {
                return currentDir
            }
            
            currentDir = path.dirname(currentDir)
        }
        
        return path.dirname(filePath)
    }

    stopAll(): void {
        for (const [key, client] of this.clients) {
            try {
                client.connection.sendNotification('exit')
                client.process.kill()
            } catch (error) {
                console.error(`[LSP] Error stopping ${key}:`, error)
            }
        }
        this.clients.clear()
    }
}
