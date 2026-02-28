import { spawn, ChildProcess } from 'child_process'
import { join } from 'path'
import { createInterface, Interface } from 'readline'

export interface AirLLMConfig {
    modelId: string          // HuggingFace ID or local path
    compression: string      // '4bit' | '8bit' | 'none'
    maxLength: number        // max context length
}

/**
 * Manages a long-running Python subprocess that runs AirLLM inference.
 * Communication is via JSON lines over stdin (commands) / stdout (responses).
 */
export class AirLLMService {
    private process: ChildProcess | null = null
    private rl: Interface | null = null
    private isRunning: boolean = false
    private isModelReady: boolean = false
    private currentStreamAborted: boolean = false

    /**
     * Spawn the Python server and send the init command.
     */
    async start(config: AirLLMConfig): Promise<{ success: boolean; error?: string }> {
        if (this.isRunning) {
            return { success: true }
        }

        try {
            const scriptPath = join(__dirname, '..', '..', 'src', 'main', 'python', 'airllm_server.py')

            this.process = spawn('python', [scriptPath], {
                stdio: ['pipe', 'pipe', 'pipe'],
                env: { ...process.env, PYTHONUNBUFFERED: '1' }
            })

            // Capture stderr for error reporting
            let stderrOutput = ''
            this.process.stderr?.on('data', (data) => {
                stderrOutput = (stderrOutput + data.toString()).slice(-5000)
            })

            this.process.on('error', () => {
                this.isRunning = false
                this.isModelReady = false
            })

            this.process.on('exit', () => {
                this.isRunning = false
                this.isModelReady = false
                this.rl = null
            })

            // Set up readline for line-by-line JSON parsing from stdout
            this.rl = createInterface({ input: this.process.stdout! })

            this.isRunning = true

            // Send init command
            this.send({
                action: 'init',
                model_id: config.modelId,
                compression: config.compression,
                max_length: config.maxLength
            })

            // Wait for "ready" response (with timeout)
            const ready = await this.waitForReady(120000) // 2 min for large model downloads
            if (ready) {
                this.isModelReady = true
                return { success: true }
            } else {
                this.stop()
                const lastLines = stderrOutput.trim().split('\n').slice(-5).join('\n')
                return {
                    success: false,
                    error: `AirLLM model failed to load within timeout. ${lastLines || 'No stderr output.'}`
                }
            }
        } catch (err: any) {
            return { success: false, error: `Failed to spawn Python process: ${err.message}` }
        }
    }

    /**
     * Gracefully shut down the Python subprocess.
     */
    async stop(): Promise<void> {
        if (this.process) {
            try { this.send({ action: 'stop' }) } catch { /* ignore */ }

            const proc = this.process
            this.process = null
            this.isRunning = false
            this.isModelReady = false
            this.rl = null

            return new Promise<void>((resolve) => {
                const timeout = setTimeout(() => {
                    try { proc.kill('SIGKILL') } catch { }
                    resolve()
                }, 3000)

                proc.on('exit', () => {
                    clearTimeout(timeout)
                    resolve()
                })
            })
        }
    }

    getStatus(): { running: boolean; port: number } {
        return { running: this.isRunning && this.isModelReady, port: 0 }
    }

    /**
     * Non-streaming chat (collects full response).
     */
    async chat(
        messages: Array<{ role: string; content: string }>,
        options: { maxTokens: number; temperature: number }
    ): Promise<{ success: boolean; content?: string; error?: string }> {
        if (!this.isRunning || !this.isModelReady) {
            return { success: false, error: 'AirLLM model not loaded' }
        }

        const prompt = this.messagesToPrompt(messages)

        this.send({
            action: 'generate',
            prompt,
            max_new_tokens: options.maxTokens,
            temperature: options.temperature
        })

        return new Promise((resolve) => {
            let fullText = ''

            const handler = (line: string) => {
                try {
                    const msg = JSON.parse(line)
                    if (msg.type === 'chunk') {
                        fullText += msg.text
                    } else if (msg.type === 'done') {
                        this.rl?.removeListener('line', handler)
                        resolve({ success: true, content: msg.text || fullText })
                    } else if (msg.type === 'error') {
                        this.rl?.removeListener('line', handler)
                        resolve({ success: false, error: msg.message })
                    }
                } catch { /* skip malformed line */ }
            }

            this.rl?.on('line', handler)
        })
    }

    /**
     * Streaming chat — emits chunks via callbacks.
     */
    async chatStream(
        messages: Array<{ role: string; content: string }>,
        options: { maxTokens: number; temperature: number },
        onChunk: (chunk: string) => void,
        onEnd: () => void
    ): Promise<{ success: boolean; error?: string }> {
        if (!this.isRunning || !this.isModelReady) {
            onEnd()
            return { success: false, error: 'AirLLM model not loaded' }
        }

        this.currentStreamAborted = false

        const prompt = this.messagesToPrompt(messages)

        this.send({
            action: 'generate',
            prompt,
            max_new_tokens: options.maxTokens,
            temperature: options.temperature
        })

        return new Promise((resolve) => {
            const handler = (line: string) => {
                if (this.currentStreamAborted) {
                    this.rl?.removeListener('line', handler)
                    onEnd()
                    resolve({ success: true })
                    return
                }

                try {
                    const msg = JSON.parse(line)
                    if (msg.type === 'chunk') {
                        onChunk(msg.text)
                    } else if (msg.type === 'done') {
                        this.rl?.removeListener('line', handler)
                        onEnd()
                        resolve({ success: true })
                    } else if (msg.type === 'error') {
                        this.rl?.removeListener('line', handler)
                        onEnd()
                        resolve({ success: false, error: msg.message })
                    }
                } catch { /* skip malformed line */ }
            }

            this.rl?.on('line', handler)
        })
    }

    abortStream(): void {
        this.currentStreamAborted = true
    }

    // ─── Private helpers ──────────────────────────────────────────

    private send(obj: Record<string, unknown>): void {
        if (this.process?.stdin?.writable) {
            this.process.stdin.write(JSON.stringify(obj) + '\n')
        }
    }

    /**
     * Convert chat messages array to a single prompt string.
     */
    private messagesToPrompt(messages: Array<{ role: string; content: string }>): string {
        return messages
            .map((m) => {
                if (m.role === 'system') return `[System]\n${m.content}`
                if (m.role === 'user') return `[User]\n${m.content}`
                return `[Assistant]\n${m.content}`
            })
            .join('\n\n') + '\n\n[Assistant]\n'
    }

    /**
     * Wait for the {"type":"ready"} message from the Python process.
     */
    private waitForReady(timeoutMs: number): Promise<boolean> {
        return new Promise((resolve) => {
            const timer = setTimeout(() => {
                this.rl?.removeListener('line', handler)
                resolve(false)
            }, timeoutMs)

            const handler = (line: string) => {
                try {
                    const msg = JSON.parse(line)
                    if (msg.type === 'ready') {
                        clearTimeout(timer)
                        this.rl?.removeListener('line', handler)
                        resolve(true)
                    } else if (msg.type === 'error') {
                        clearTimeout(timer)
                        this.rl?.removeListener('line', handler)
                        resolve(false)
                    }
                    // ignore status messages during loading
                } catch { /* skip */ }
            }

            this.rl?.on('line', handler)
        })
    }
}
