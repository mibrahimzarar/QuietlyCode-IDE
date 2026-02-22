import { spawn, ChildProcessWithoutNullStreams } from 'child_process'
import { BrowserWindow } from 'electron'
import { platform } from 'os'

interface TerminalSession {
    id: string
    process: ChildProcessWithoutNullStreams
    history: string
}


export class TerminalManager {
    private sessions: Map<string, TerminalSession> = new Map()
    private window: BrowserWindow | null = null

    constructor(window: BrowserWindow | null) {
        this.window = window
    }

    setWindow(window: BrowserWindow) {
        this.window = window
    }

    createSession(id: string, shell: string, cwd: string) {
        try {
            const isWin = platform() === 'win32'
            const shellCmd = shell || (isWin ? 'powershell.exe' : 'bash')

            // Use shell: true for better compatibility with some commands, 
            // but for interactive shell persistence we spawn the shell executable itself.
            const terminalProcess = spawn(shellCmd, [], {
                cwd,
                env: process.env,
                shell: false // We are spawning the shell itself
            })

            // Xterm.js requires standard \r\n carriages to return to column 0 on newlines.
            // Raw spawn pipes often just yield \n which creates diagonal cascading text.
            const normalizeOutput = (data: any) => {
                let str = data.toString()
                // Replace bare \n that aren't preceded by \r with \r\n
                str = str.replace(/(?<!\r)\n/g, '\r\n')
                return str
            }

            terminalProcess.stdout.on('data', (data: any) => {
                this.window?.webContents.send('terminal:data', { id, data: normalizeOutput(data) })
            })

            terminalProcess.stderr.on('data', (data: any) => {
                this.window?.webContents.send('terminal:data', { id, data: normalizeOutput(data) })
            })

            terminalProcess.on('exit', (code: number | null) => {
                this.window?.webContents.send('terminal:exit', { id, code: code || 0 })
                this.sessions.delete(id)
            })

            this.sessions.set(id, {
                id,
                process: terminalProcess,
                history: ''
            })

            return { success: true }
        } catch (err: any) {
            console.error('Failed to create terminal session:', err)
            return { success: false, error: err.message }
        }
    }

    write(id: string, data: string) {
        const session = this.sessions.get(id)
        if (session) {
            session.process.stdin.write(data)
        }
    }

    resize(id: string, cols: number, rows: number) {
        // 'spawn' doesn't support resizing natively like PTY.
        // We can ignore this or try to set COLUMNS/LINES env via some hack, 
        // but generally for 'spawn' we just let it flow.
    }

    kill(id: string) {
        const session = this.sessions.get(id)
        if (session) {
            session.process.kill()
            this.sessions.delete(id)
        }
    }

    detectShells(): string[] {
        const shells: string[] = []
        if (platform() === 'win32') {
            shells.push('powershell.exe')
            shells.push('cmd.exe')
            // Check for Git Bash / WSL could be added here if we want to be fancy
        } else {
            shells.push('/bin/bash')
            shells.push('/bin/zsh')
        }
        return shells
    }
}
