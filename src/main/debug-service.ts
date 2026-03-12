import { spawn, ChildProcess } from 'child_process'
import { EventEmitter } from 'events'

interface DebugSession {
    id: string
    process: ChildProcess
    type: 'node' | 'python' | 'chrome'
    breakpoints: Map<string, number[]>
    isPaused: boolean
}

interface DebugBreakpoint {
    file: string
    line: number
    condition?: string
}

interface DebugStackFrame {
    file: string
    line: number
    column: number
    function: string
}

interface DebugVariable {
    name: string
    value: string
    type: string
}

export class DebugService extends EventEmitter {
    private sessions: Map<string, DebugSession> = new Map()
    private sessionIdCounter = 0

    async startNodeDebug(scriptPath: string, cwd: string, args: string[] = []): Promise<{ sessionId: string; error?: string }> {
        const sessionId = `debug-${++this.sessionIdCounter}`
        
        return new Promise((resolve) => {
            try {
                const proc = spawn('node', ['--inspect-brk=9229', scriptPath, ...args], {
                    cwd,
                    stdio: ['pipe', 'pipe', 'pipe']
                })

                const session: DebugSession = {
                    id: sessionId,
                    process: proc,
                    type: 'node',
                    breakpoints: new Map(),
                    isPaused: true
                }

                this.sessions.set(sessionId, session)

                // Handle process errors
                proc.on('error', (error) => {
                    console.error(`[Debug] Node process error:`, error)
                    this.emit('output', { sessionId, output: `Error: ${error.message}\n`, type: 'stderr' })
                    this.sessions.delete(sessionId)
                    resolve({ sessionId: '', error: error.message })
                })

                // Handle process output
                proc.stdout?.on('data', (data) => {
                    this.emit('output', { sessionId, output: data.toString(), type: 'stdout' })
                })

                proc.stderr?.on('data', (data) => {
                    this.emit('output', { sessionId, output: data.toString(), type: 'stderr' })
                })

                proc.on('exit', (code) => {
                    this.emit('terminated', { sessionId, code })
                    this.sessions.delete(sessionId)
                })

                // Give it a moment to fail before reporting success
                setTimeout(() => {
                    if (this.sessions.has(sessionId)) {
                        this.emit('started', { sessionId, type: 'node' })
                        resolve({ sessionId })
                    }
                }, 100)
            } catch (error: any) {
                console.error(`[Debug] Failed to start Node debug:`, error)
                resolve({ sessionId: '', error: error.message })
            }
        })
    }

    async startPythonDebug(scriptPath: string, cwd: string, args: string[] = []): Promise<{ sessionId: string; error?: string }> {
        const sessionId = `debug-${++this.sessionIdCounter}`
        
        return new Promise((resolve) => {
            try {
                const proc = spawn('python', ['-m', 'debugpy', '--listen', '5678', '--wait-for-client', scriptPath, ...args], {
                    cwd,
                    stdio: ['pipe', 'pipe', 'pipe']
                })

                const session: DebugSession = {
                    id: sessionId,
                    process: proc,
                    type: 'python',
                    breakpoints: new Map(),
                    isPaused: true
                }

                this.sessions.set(sessionId, session)

                // Handle process errors
                proc.on('error', (error) => {
                    console.error(`[Debug] Python process error:`, error)
                    this.emit('output', { sessionId, output: `Error: ${error.message}\n`, type: 'stderr' })
                    this.sessions.delete(sessionId)
                    resolve({ sessionId: '', error: error.message })
                })

                process.stdout?.on('data', (data) => {
                    this.emit('output', { sessionId, output: data.toString(), type: 'stdout' })
                })

                process.stderr?.on('data', (data) => {
                    this.emit('output', { sessionId, output: data.toString(), type: 'stderr' })
                })

                process.on('exit', (code) => {
                    this.emit('terminated', { sessionId, code })
                    this.sessions.delete(sessionId)
                })

                // Give it a moment to fail before reporting success
                setTimeout(() => {
                    if (this.sessions.has(sessionId)) {
                        this.emit('started', { sessionId, type: 'python' })
                        resolve({ sessionId })
                    }
                }, 100)
            } catch (error: any) {
                console.error(`[Debug] Failed to start Python debug:`, error)
                resolve({ sessionId: '', error: error.message })
            }
        })
    }

    stopDebug(sessionId: string): boolean {
        const session = this.sessions.get(sessionId)
        if (!session) return false

        session.process.kill('SIGTERM')
        this.sessions.delete(sessionId)
        this.emit('stopped', { sessionId })
        return true
    }

    pauseDebug(sessionId: string): boolean {
        const session = this.sessions.get(sessionId)
        if (!session) return false

        // For Node.js, send SIGUSR1 to trigger debugger
        if (session.type === 'node') {
            session.process.kill('SIGUSR1')
            session.isPaused = true
            this.emit('paused', { sessionId })
            return true
        }
        return false
    }

    continueDebug(sessionId: string): boolean {
        const session = this.sessions.get(sessionId)
        if (!session) return false

        // This would require a proper debug protocol implementation
        // For now, we just emit the event
        session.isPaused = false
        this.emit('continued', { sessionId })
        return true
    }

    stepOver(sessionId: string): boolean {
        const session = this.sessions.get(sessionId)
        if (!session || !session.isPaused) return false

        this.emit('stepOver', { sessionId })
        return true
    }

    stepInto(sessionId: string): boolean {
        const session = this.sessions.get(sessionId)
        if (!session || !session.isPaused) return false

        this.emit('stepInto', { sessionId })
        return true
    }

    stepOut(sessionId: string): boolean {
        const session = this.sessions.get(sessionId)
        if (!session || !session.isPaused) return false

        this.emit('stepOut', { sessionId })
        return true
    }

    setBreakpoint(sessionId: string, file: string, line: number, condition?: string): boolean {
        const session = this.sessions.get(sessionId)
        if (!session) return false

        const breakpoints = session.breakpoints.get(file) || []
        if (!breakpoints.includes(line)) {
            breakpoints.push(line)
            session.breakpoints.set(file, breakpoints)
        }

        this.emit('breakpointSet', { sessionId, file, line, condition })
        return true
    }

    removeBreakpoint(sessionId: string, file: string, line: number): boolean {
        const session = this.sessions.get(sessionId)
        if (!session) return false

        const breakpoints = session.breakpoints.get(file) || []
        const index = breakpoints.indexOf(line)
        if (index > -1) {
            breakpoints.splice(index, 1)
            session.breakpoints.set(file, breakpoints)
        }

        this.emit('breakpointRemoved', { sessionId, file, line })
        return true
    }

    getBreakpoints(sessionId: string, file?: string): DebugBreakpoint[] {
        const session = this.sessions.get(sessionId)
        if (!session) return []

        const breakpoints: DebugBreakpoint[] = []
        
        if (file) {
            const lines = session.breakpoints.get(file) || []
            lines.forEach(line => breakpoints.push({ file, line }))
        } else {
            session.breakpoints.forEach((lines, filePath) => {
                lines.forEach(line => breakpoints.push({ file: filePath, line }))
            })
        }

        return breakpoints
    }

    getActiveSessions(): string[] {
        return Array.from(this.sessions.keys())
    }

    isSessionActive(sessionId: string): boolean {
        return this.sessions.has(sessionId)
    }

    getSessionInfo(sessionId: string): { type: string; isPaused: boolean } | null {
        const session = this.sessions.get(sessionId)
        if (!session) return null
        return { type: session.type, isPaused: session.isPaused }
    }
}
