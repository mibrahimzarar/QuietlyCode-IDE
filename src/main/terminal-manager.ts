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
            let shellCmd = shell
            let shellArgs: string[] = []

            if (isWin) {
                shellCmd = shell || 'powershell.exe'
                shellArgs = ['-NoProfile', '-ExecutionPolicy', 'Bypass']
            } else {
                shellCmd = shell || '/bin/bash'
            }

            const terminalProcess = spawn(shellCmd, shellArgs, {
                cwd,
                env: { ...process.env, TERM: 'xterm-256color' },
                shell: false
            })

            const normalizeOutput = (data: any) => {
                let str = data.toString()
                // Normalize line endings for xterm.js
                return str.replace(/\r?\n/g, '\r\n')
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
