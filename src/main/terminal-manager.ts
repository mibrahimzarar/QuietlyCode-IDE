import { BrowserWindow } from 'electron'
import { platform } from 'os'
import { existsSync } from 'fs'
import * as pty from 'node-pty'

interface TerminalSession {
    id: string
    pty: pty.IPty
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
            let shellCmd = shell || 'powershell.exe'
            let shellArgs: string[] = []

            if (isWin) {
                // Determine args based on shell type
                const shellLower = (shell || '').toLowerCase()

                if (shellLower.includes('powershell')) {
                    shellArgs = ['-NoProfile', '-ExecutionPolicy', 'Bypass']
                } else if (shellLower.includes('cmd')) {
                    shellArgs = []
                } else if (shellLower.includes('bash') || shellLower.includes('git')) {
                    // Git Bash - run as interactive login shell
                    shellArgs = ['--login', '-i']
                } else if (shellLower.includes('wsl')) {
                    shellArgs = []
                } else if (!shell) {
                    shellArgs = ['-NoProfile', '-ExecutionPolicy', 'Bypass']
                }
            } else {
                shellCmd = shell || '/bin/bash'
            }

            const ptyProcess = pty.spawn(shellCmd, shellArgs, {
                name: 'xterm-256color',
                cols: 80,
                rows: 24,
                cwd: cwd || process.cwd(),
                env: process.env as { [key: string]: string }
            })

            ptyProcess.onData((data: string) => {
                this.window?.webContents.send('terminal:data', { id, data })
            })

            ptyProcess.onExit(({ exitCode }) => {
                this.window?.webContents.send('terminal:exit', { id, code: exitCode })
                this.sessions.delete(id)
            })

            this.sessions.set(id, {
                id,
                pty: ptyProcess
            })

            return { success: true }
        } catch (err: any) {
            return { success: false, error: err.message }
        }
    }

    write(id: string, data: string) {
        const session = this.sessions.get(id)
        if (session) {
            session.pty.write(data)
        }
    }

    resize(id: string, cols: number, rows: number) {
        const session = this.sessions.get(id)
        if (session && cols > 0 && rows > 0) {
            try {
                session.pty.resize(cols, rows)
            } catch (e) { /* ignore */ }
        }
    }

    kill(id: string) {
        const session = this.sessions.get(id)
        if (session) {
            session.pty.kill()
            this.sessions.delete(id)
        }
    }

    detectShells(): string[] {
        const shells: string[] = []
        if (platform() === 'win32') {
            shells.push('powershell.exe')
            shells.push('cmd.exe')

            // Check for Git Bash - check common locations including C:\Git
            const gitBashPaths = [
                'C:\\Git\\bin\\bash.exe',
                'C:\\Git\\usr\\bin\\bash.exe',
                'C:\\Program Files\\Git\\bin\\bash.exe',
                'C:\\Program Files\\Git\\usr\\bin\\bash.exe',
                'C:\\Program Files (x86)\\Git\\bin\\bash.exe',
                'C:\\Program Files (x86)\\Git\\usr\\bin\\bash.exe',
                process.env.LOCALAPPDATA + '\\Programs\\Git\\bin\\bash.exe',
                process.env.PROGRAMFILES + '\\Git\\bin\\bash.exe',
            ].filter(Boolean) as string[]

            for (const gitBash of gitBashPaths) {
                if (existsSync(gitBash)) {
                    shells.push(gitBash)
                    break
                }
            }

            // Check for WSL
            if (existsSync('C:\\Windows\\System32\\wsl.exe')) {
                shells.push('wsl.exe')
            }
        } else {
            shells.push('/bin/bash')
            shells.push('/bin/zsh')
        }
        return shells
    }
}
