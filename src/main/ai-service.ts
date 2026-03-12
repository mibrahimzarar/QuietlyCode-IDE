import { spawn, ChildProcess } from 'child_process'
import http from 'http'

interface ServerConfig {
    binaryPath: string
    modelPath: string
    contextSize: number
    threads: number
    port: number
}

export class AIService {
    private process: ChildProcess | null = null
    private port: number = 8765
    private isRunning: boolean = false
    private currentStreamRequest: http.ClientRequest | null = null
    public currentModelPath: string | null = null

    async start(config: ServerConfig): Promise<{ success: boolean; error?: string }> {
        if (this.isRunning) {
            return { success: true }
        }

        this.port = config.port

        try {
            // Run from the binary's own directory so it finds its DLLs
            const binaryDir = require('path').dirname(config.binaryPath)
            this.currentModelPath = config.modelPath

            const args = [
                '--model', config.modelPath,
                '--ctx-size', String(config.contextSize),
                '--threads', String(config.threads),
                '--port', String(config.port),
                '--host', '127.0.0.1',
                '--log-disable',
                '--embedding' // Enable embedding endpoint
            ]

            this.process = spawn(config.binaryPath, args, {
                stdio: ['pipe', 'pipe', 'pipe'],
                cwd: binaryDir
            })

            // Capture stderr for error reporting (ring buffer, max 5000 chars)
            let stderrOutput = ''
            const MAX_STDERR = 5000
            this.process.stderr?.on('data', (data) => {
                stderrOutput = (stderrOutput + data.toString()).slice(-MAX_STDERR)
            })

            // Track early exit
            let earlyExit = false
            let exitCode: number | null = null
            this.process.on('error', () => {
                earlyExit = true
                this.isRunning = false
            })

            this.process.on('exit', (code) => {
                exitCode = code
                earlyExit = true
                this.isRunning = false
            })

            // Wait for server to become healthy
            const healthy = await this.waitForHealth(30000)
            if (healthy) {
                this.isRunning = true
                return { success: true }
            } else {
                this.stop()
                if (earlyExit) {
                    const lastLines = stderrOutput.trim().split('\n').slice(-5).join('\n')
                    return { success: false, error: `Server crashed (exit code: ${exitCode}). Output: ${lastLines || 'No output'}` }
                }
                return { success: false, error: 'Server failed to start within 30s timeout. Check that the binary and model are valid.' }
            }
        } catch (err: any) {
            return { success: false, error: `Failed to spawn process: ${err.message}` }
        }
    }

    async stop(): Promise<void> {
        if (this.process) {
            const proc = this.process
            this.process = null
            this.isRunning = false

            return new Promise<void>((resolve) => {
                const timeout = setTimeout(() => {
                    try { proc.kill('SIGKILL') } catch { }
                    resolve()
                }, 2000)

                proc.on('exit', () => {
                    clearTimeout(timeout)
                    resolve()
                })

                try { proc.kill('SIGTERM') } catch { }
            })
        }
    }

    getStatus(): { running: boolean; port: number } {
        return { running: this.isRunning, port: this.port }
    }

    private waitForHealth(timeoutMs: number): Promise<boolean> {
        return new Promise((resolve) => {
            const start = Date.now()
            const check = () => {
                if (Date.now() - start > timeoutMs) {
                    resolve(false)
                    return
                }

                const req = http.get(`http://127.0.0.1:${this.port}/health`, (res) => {
                    if (res.statusCode === 200) {
                        resolve(true)
                    } else {
                        setTimeout(check, 200)
                    }
                })

                req.on('error', () => {
                    setTimeout(check, 200)
                })

                req.setTimeout(1000, () => {
                    req.destroy()
                    setTimeout(check, 200)
                })
            }
            check()
        })
    }

    async getEmbedding(text: string): Promise<number[] | null> {
        if (!this.isRunning) return null

        try {
            const body = JSON.stringify({
                content: text
            })

            return new Promise((resolve) => {
                const req = http.request({
                    hostname: '127.0.0.1',
                    port: this.port,
                    path: '/embedding', // llama-server embedding endpoint
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Content-Length': Buffer.byteLength(body)
                    }
                }, (res) => {
                    let data = ''
                    res.on('data', (chunk) => { data += chunk })
                    res.on('end', () => {
                        try {
                            const parsed = JSON.parse(data)
                            // llama.cpp embedding format can vary, usually it's { embedding: [...] } or { data: [{ embedding: ... }] }
                            // Checking standard OpenAI format first then direct format
                            const embedding = parsed.embedding || parsed.data?.[0]?.embedding
                            resolve(embedding || null)
                        } catch {
                            resolve(null)
                        }
                    })
                })

                req.on('error', () => resolve(null))
                req.write(body)
                req.end()
            })
        } catch {
            return null
        }
    }

    async chat(
        messages: Array<{ role: string; content: string }>,
        options: { maxTokens: number; temperature: number }
    ): Promise<{ success: boolean; content?: string; error?: string }> {
        try {
            const body = JSON.stringify({
                messages,
                max_tokens: options.maxTokens,
                temperature: options.temperature,
                stream: false
            })

            return new Promise((resolve) => {
                const req = http.request({
                    hostname: '127.0.0.1',
                    port: this.port,
                    path: '/v1/chat/completions',
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Content-Length': Buffer.byteLength(body)
                    }
                }, (res) => {
                    let data = ''
                    res.on('data', (chunk) => { data += chunk })
                    res.on('end', () => {
                        try {
                            const parsed = JSON.parse(data)
                            resolve({
                                success: true,
                                content: parsed.choices?.[0]?.message?.content || ''
                            })
                        } catch {
                            resolve({ success: false, error: 'Invalid response from server' })
                        }
                    })
                })

                req.on('error', (err) => {
                    resolve({ success: false, error: err.message })
                })

                req.write(body)
                req.end()
            })
        } catch (err: any) {
            return { success: false, error: err.message }
        }
    }

    async chatStream(
        messages: Array<{ role: string; content: string }>,
        options: { maxTokens: number; temperature: number },
        onChunk: (chunk: string) => void,
        onEnd: () => void
    ): Promise<{ success: boolean; error?: string }> {
        try {
            const body = JSON.stringify({
                messages,
                max_tokens: options.maxTokens,
                temperature: options.temperature,
                stream: true
            })

            return new Promise((resolve) => {
                const req = http.request({
                    hostname: '127.0.0.1',
                    port: this.port,
                    path: '/v1/chat/completions',
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Content-Length': Buffer.byteLength(body)
                    }
                }, (res) => {
                    let buffer = ''

                    res.on('data', (chunk) => {
                        buffer += chunk.toString()
                        const lines = buffer.split('\n')
                        buffer = lines.pop() || ''

                        for (const line of lines) {
                            const trimmed = line.trim()
                            if (trimmed.startsWith('data: ')) {
                                const data = trimmed.slice(6)
                                if (data === '[DONE]') {
                                    onEnd()
                                    resolve({ success: true })
                                    return
                                }
                                try {
                                    const parsed = JSON.parse(data)
                                    const content = parsed.choices?.[0]?.delta?.content
                                    if (content) {
                                        onChunk(content)
                                    }
                                } catch {
                                    // Skip malformed chunks
                                }
                            }
                        }
                    })

                    res.on('end', () => {
                        onEnd()
                        resolve({ success: true })
                    })
                })

                req.on('error', (err) => {
                    this.currentStreamRequest = null
                    onEnd()
                    resolve({ success: false, error: err.message })
                })

                this.currentStreamRequest = req
                req.write(body)
                req.end()
            })
        } catch (err: any) {
            onEnd()
            return { success: false, error: err.message }
        }
    }

    abortStream(): void {
        if (this.currentStreamRequest) {
            this.currentStreamRequest.destroy()
            this.currentStreamRequest = null
        }
    }
}
