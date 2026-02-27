import https from 'https'
import http from 'http'
import { createWriteStream, existsSync, mkdirSync, readdirSync, statSync, renameSync, unlinkSync } from 'fs'
import { join } from 'path'

export interface ModelInfo {
    id: string
    name: string
    size: string
    params: string
    description: string
    downloadUrl: string
    filename: string
    category: 'bitnet' | 'general' | 'code' | 'small'
}

const AVAILABLE_MODELS: ModelInfo[] = [
    // ===== BitNet (1-bit) Models =====
    {
        id: 'bitnet-2b-4t',
        name: 'BitNet b1.58 2B-4T',
        size: '~1.2 GB',
        params: '2B',
        description: 'Official Microsoft 2B 1-bit model. Best for CPU inference.',
        downloadUrl: 'https://huggingface.co/microsoft/BitNet-b1.58-2B-4T-gguf/resolve/main/ggml-model-i2_s.gguf?download=true',
        filename: 'ggml-model-i2_s.gguf',
        category: 'bitnet'
    },
    {
        id: 'bitnet-3b',
        name: 'BitNet b1.58 3B',
        size: '~1.92 GB',
        params: '3B',
        description: 'Community 3B 1-bit model (QuantFactory). Higher quality outputs.',
        downloadUrl: 'https://huggingface.co/QuantFactory/bitnet_b1_58-3B-GGUF/resolve/main/bitnet_b1_58-3B.Q2_K.gguf?download=true',
        filename: 'bitnet_b1_58-3B.Q2_K.gguf',
        category: 'bitnet'
    },

    // ===== Small / Lightweight Models =====
    {
        id: 'smollm2-135m',
        name: 'SmolLM2 135M',
        size: '~100 MB',
        params: '135M',
        description: 'Tiny model by HuggingFace. Ultra-fast, great for testing.',
        downloadUrl: 'https://huggingface.co/bartowski/SmolLM2-135M-Instruct-GGUF/resolve/main/SmolLM2-135M-Instruct-Q4_K_M.gguf?download=true',
        filename: 'SmolLM2-135M-Instruct-Q4_K_M.gguf',
        category: 'small'
    },
    {
        id: 'smollm2-360m',
        name: 'SmolLM2 360M',
        size: '~250 MB',
        params: '360M',
        description: 'Small model by HuggingFace. Fast with reasonable quality.',
        downloadUrl: 'https://huggingface.co/bartowski/SmolLM2-360M-Instruct-GGUF/resolve/main/SmolLM2-360M-Instruct-Q4_K_M.gguf?download=true',
        filename: 'SmolLM2-360M-Instruct-Q4_K_M.gguf',
        category: 'small'
    },
    {
        id: 'smollm2-1.7b',
        name: 'SmolLM2 1.7B',
        size: '~1.0 GB',
        params: '1.7B',
        description: 'Best SmolLM2 variant. Excellent quality for its size.',
        downloadUrl: 'https://huggingface.co/bartowski/SmolLM2-1.7B-Instruct-GGUF/resolve/main/SmolLM2-1.7B-Instruct-Q4_K_M.gguf?download=true',
        filename: 'SmolLM2-1.7B-Instruct-Q4_K_M.gguf',
        category: 'small'
    },
    {
        id: 'tinyllama-1.1b',
        name: 'TinyLlama 1.1B Chat',
        size: '~670 MB',
        params: '1.1B',
        description: 'Compact Llama architecture. Fast and efficient for simple tasks.',
        downloadUrl: 'https://huggingface.co/TheBloke/TinyLlama-1.1B-Chat-v1.0-GGUF/resolve/main/tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf?download=true',
        filename: 'tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf',
        category: 'small'
    },
    {
        id: 'stablelm-2-zephyr-1.6b',
        name: 'StableLM 2 Zephyr 1.6B',
        size: '~1.0 GB',
        params: '1.6B',
        description: 'Stability AI chat model. Good reasoning for its small size.',
        downloadUrl: 'https://huggingface.co/TheBloke/stablelm-2-zephyr-1_6b-GGUF/resolve/main/stablelm-2-zephyr-1_6b.Q4_K_M.gguf?download=true',
        filename: 'stablelm-2-zephyr-1_6b.Q4_K_M.gguf',
        category: 'small'
    },
    {
        id: 'qwen2.5-0.5b',
        name: 'Qwen 2.5 0.5B Instruct',
        size: '~400 MB',
        params: '0.5B',
        description: 'Alibaba\'s smallest Qwen 2.5. Ultra-fast with good quality.',
        downloadUrl: 'https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/qwen2.5-0.5b-instruct-q4_k_m.gguf?download=true',
        filename: 'qwen2.5-0.5b-instruct-q4_k_m.gguf',
        category: 'small'
    },
    {
        id: 'qwen2.5-1.5b',
        name: 'Qwen 2.5 1.5B Instruct',
        size: '~1.0 GB',
        params: '1.5B',
        description: 'Alibaba\'s small Qwen 2.5. Great speed and capability balance.',
        downloadUrl: 'https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/qwen2.5-1.5b-instruct-q4_k_m.gguf?download=true',
        filename: 'qwen2.5-1.5b-instruct-q4_k_m.gguf',
        category: 'small'
    },

    // ===== General Purpose Models =====
    {
        id: 'llama-3.2-1b',
        name: 'Llama 3.2 1B Instruct',
        size: '~770 MB',
        params: '1B',
        description: 'Meta\'s smallest Llama 3.2. Fast, lightweight, and capable.',
        downloadUrl: 'https://huggingface.co/bartowski/Llama-3.2-1B-Instruct-GGUF/resolve/main/Llama-3.2-1B-Instruct-Q4_K_M.gguf?download=true',
        filename: 'Llama-3.2-1B-Instruct-Q4_K_M.gguf',
        category: 'general'
    },
    {
        id: 'llama-3.2-3b',
        name: 'Llama 3.2 3B Instruct',
        size: '~2.0 GB',
        params: '3B',
        description: 'Meta\'s 3B Llama 3.2. Excellent quality for a small model.',
        downloadUrl: 'https://huggingface.co/bartowski/Llama-3.2-3B-Instruct-GGUF/resolve/main/Llama-3.2-3B-Instruct-Q4_K_M.gguf?download=true',
        filename: 'Llama-3.2-3B-Instruct-Q4_K_M.gguf',
        category: 'general'
    },
    {
        id: 'gemma-2-2b',
        name: 'Gemma 2 2B Instruct',
        size: '~1.6 GB',
        params: '2B',
        description: 'Google\'s compact Gemma 2. Strong reasoning and instruction following.',
        downloadUrl: 'https://huggingface.co/bartowski/gemma-2-2b-it-GGUF/resolve/main/gemma-2-2b-it-Q4_K_M.gguf?download=true',
        filename: 'gemma-2-2b-it-Q4_K_M.gguf',
        category: 'general'
    },
    {
        id: 'phi-3.5-mini',
        name: 'Phi 3.5 Mini Instruct',
        size: '~2.4 GB',
        params: '3.8B',
        description: 'Microsoft\'s Phi 3.5 Mini. Exceptional reasoning for its size.',
        downloadUrl: 'https://huggingface.co/bartowski/Phi-3.5-mini-instruct-GGUF/resolve/main/Phi-3.5-mini-instruct-Q4_K_M.gguf?download=true',
        filename: 'Phi-3.5-mini-instruct-Q4_K_M.gguf',
        category: 'general'
    },
    {
        id: 'phi-4-mini',
        name: 'Phi 4 Mini Instruct',
        size: '~2.4 GB',
        params: '3.8B',
        description: 'Microsoft\'s latest Phi 4 Mini. State-of-the-art small model.',
        downloadUrl: 'https://huggingface.co/bartowski/microsoft_Phi-4-mini-instruct-GGUF/resolve/main/microsoft_Phi-4-mini-instruct-Q4_K_M.gguf?download=true',
        filename: 'microsoft_Phi-4-mini-instruct-Q4_K_M.gguf',
        category: 'general'
    },
    {
        id: 'qwen2.5-3b',
        name: 'Qwen 2.5 3B Instruct',
        size: '~2.0 GB',
        params: '3B',
        description: 'Alibaba\'s Qwen 2.5 3B. Strong multilingual and reasoning.',
        downloadUrl: 'https://huggingface.co/Qwen/Qwen2.5-3B-Instruct-GGUF/resolve/main/qwen2.5-3b-instruct-q4_k_m.gguf?download=true',
        filename: 'qwen2.5-3b-instruct-q4_k_m.gguf',
        category: 'general'
    },
    {
        id: 'qwen2.5-7b',
        name: 'Qwen 2.5 7B Instruct',
        size: '~4.7 GB',
        params: '7B',
        description: 'Alibaba\'s best sub-8B model. Top-tier quality and reasoning.',
        downloadUrl: 'https://huggingface.co/Qwen/Qwen2.5-7B-Instruct-GGUF/resolve/main/qwen2.5-7b-instruct-q4_k_m.gguf?download=true',
        filename: 'qwen2.5-7b-instruct-q4_k_m.gguf',
        category: 'general'
    },
    {
        id: 'mistral-7b-instruct',
        name: 'Mistral 7B Instruct v0.3',
        size: '~4.4 GB',
        params: '7B',
        description: 'Mistral AI\'s flagship 7B. Excellent general-purpose performance.',
        downloadUrl: 'https://huggingface.co/bartowski/Mistral-7B-Instruct-v0.3-GGUF/resolve/main/Mistral-7B-Instruct-v0.3-Q4_K_M.gguf?download=true',
        filename: 'Mistral-7B-Instruct-v0.3-Q4_K_M.gguf',
        category: 'general'
    },

    // ===== Code-Focused Models =====
    {
        id: 'qwen2.5-coder-1.5b',
        name: 'Qwen 2.5 Coder 1.5B',
        size: '~1.0 GB',
        params: '1.5B',
        description: 'Alibaba\'s small code model. Fast code completion.',
        downloadUrl: 'https://huggingface.co/Qwen/Qwen2.5-Coder-1.5B-Instruct-GGUF/resolve/main/qwen2.5-coder-1.5b-instruct-q4_k_m.gguf?download=true',
        filename: 'qwen2.5-coder-1.5b-instruct-q4_k_m.gguf',
        category: 'code'
    },
    {
        id: 'qwen2.5-coder-3b',
        name: 'Qwen 2.5 Coder 3B',
        size: '~2.0 GB',
        params: '3B',
        description: 'Alibaba\'s mid-size code model. Good quality with fast speed.',
        downloadUrl: 'https://huggingface.co/Qwen/Qwen2.5-Coder-3B-Instruct-GGUF/resolve/main/qwen2.5-coder-3b-instruct-q4_k_m.gguf?download=true',
        filename: 'qwen2.5-coder-3b-instruct-q4_k_m.gguf',
        category: 'code'
    },
    {
        id: 'qwen2.5-coder-7b',
        name: 'Qwen 2.5 Coder 7B',
        size: '~4.7 GB',
        params: '7B',
        description: 'Alibaba\'s best sub-8B code model. Excellent for coding.',
        downloadUrl: 'https://huggingface.co/Qwen/Qwen2.5-Coder-7B-Instruct-GGUF/resolve/main/qwen2.5-coder-7b-instruct-q4_k_m.gguf?download=true',
        filename: 'qwen2.5-coder-7b-instruct-q4_k_m.gguf',
        category: 'code'
    },
    {
        id: 'deepseek-coder-1.3b',
        name: 'DeepSeek Coder 1.3B',
        size: '~820 MB',
        params: '1.3B',
        description: 'DeepSeek\'s small code model. Fast code generation.',
        downloadUrl: 'https://huggingface.co/TheBloke/deepseek-coder-1.3b-instruct-GGUF/resolve/main/deepseek-coder-1.3b-instruct.Q4_K_M.gguf?download=true',
        filename: 'deepseek-coder-1.3b-instruct.Q4_K_M.gguf',
        category: 'code'
    },
    {
        id: 'deepseek-coder-6.7b',
        name: 'DeepSeek Coder 6.7B',
        size: '~4.0 GB',
        params: '6.7B',
        description: 'DeepSeek\'s best sub-8B code model. Strong coding capabilities.',
        downloadUrl: 'https://huggingface.co/TheBloke/deepseek-coder-6.7B-instruct-GGUF/resolve/main/deepseek-coder-6.7b-instruct.Q4_K_M.gguf?download=true',
        filename: 'deepseek-coder-6.7b-instruct.Q4_K_M.gguf',
        category: 'code'
    },
    {
        id: 'codegemma-2b',
        name: 'CodeGemma 2B',
        size: '~1.6 GB',
        params: '2B',
        description: 'Google\'s code-focused Gemma. Compact and fast.',
        downloadUrl: 'https://huggingface.co/bartowski/codegemma-2b-GGUF/resolve/main/codegemma-2b-Q4_K_M.gguf?download=true',
        filename: 'codegemma-2b-Q4_K_M.gguf',
        category: 'code'
    },
    {
        id: 'codegemma-7b-it',
        name: 'CodeGemma 7B Instruct',
        size: '~5.0 GB',
        params: '7B',
        description: 'Google\'s largest code Gemma. Best-in-class code generation.',
        downloadUrl: 'https://huggingface.co/bartowski/codegemma-7b-it-GGUF/resolve/main/codegemma-7b-it-Q4_K_M.gguf?download=true',
        filename: 'codegemma-7b-it-Q4_K_M.gguf',
        category: 'code'
    }
]

export class ModelDownloader {
    private abortController: AbortController | null = null
    private isDownloading = false

    getAvailableModels(): ModelInfo[] {
        return AVAILABLE_MODELS
    }

    async downloadModel(
        modelId: string,
        targetDir: string,
        onProgress: (progress: number, speed: string) => void
    ): Promise<{ success: boolean; path?: string; error?: string }> {
        const model = AVAILABLE_MODELS.find((m) => m.id === modelId)
        if (!model) {
            return { success: false, error: 'Model not found' }
        }

        if (!existsSync(targetDir)) {
            mkdirSync(targetDir, { recursive: true })
        }

        const filePath = join(targetDir, model.filename)
        this.isDownloading = true

        try {
            await this.downloadFile(model.downloadUrl, filePath, onProgress)
            this.isDownloading = false
            return { success: true, path: filePath }
        } catch (err: any) {
            this.isDownloading = false
            if (err.message === 'Download cancelled') {
                return { success: false, error: 'Download cancelled' }
            }
            return { success: false, error: err.message }
        }
    }

    cancelDownload(): void {
        if (this.abortController) {
            this.abortController.abort()
            this.abortController = null
            this.isDownloading = false
        }
    }

    scanLocalModels(directory: string): Array<{ name: string; path: string; size: string }> {
        const models: Array<{ name: string; path: string; size: string }> = []

        if (!existsSync(directory)) return models

        try {
            const files = readdirSync(directory)
            for (const file of files) {
                if (file.endsWith('.gguf')) {
                    const fullPath = join(directory, file)
                    const stats = statSync(fullPath)
                    const sizeMB = (stats.size / (1024 * 1024)).toFixed(0)
                    models.push({
                        name: file,
                        path: fullPath,
                        size: `${sizeMB} MB`
                    })
                }
            }
        } catch {
            // Ignore errors
        }

        return models
    }

    async deleteModel(filePath: string): Promise<{ success: boolean; error?: string }> {
        console.log('[ModelDownloader] Deleting file:', filePath)
        try {
            if (existsSync(filePath)) {
                unlinkSync(filePath)
                console.log('[ModelDownloader] File deleted successfully')
                return { success: true }
            } else {
                console.error('[ModelDownloader] File not found:', filePath)
                return { success: false, error: 'File not found' }
            }
        } catch (err: any) {
            console.error('[ModelDownloader] Delete error:', err)
            return { success: false, error: err.message }
        }
    }

    private downloadFile(
        url: string,
        destPath: string,
        onProgress: (progress: number, speed: string) => void
    ): Promise<void> {
        return new Promise((resolve, reject) => {
            const partPath = destPath + '.part'
            let resumeBytes = 0

            // Check for partial download
            if (existsSync(partPath)) {
                try {
                    resumeBytes = statSync(partPath).size
                } catch {
                    resumeBytes = 0
                }
            }

            const makeRequest = (requestUrl: string, redirectCount: number = 0) => {
                if (redirectCount > 5) {
                    reject(new Error('Too many redirects'))
                    return
                }

                let parsedUrl: URL
                try {
                    parsedUrl = new URL(requestUrl)
                } catch {
                    reject(new Error(`Invalid URL: ${requestUrl}`))
                    return
                }

                const options: any = {
                    headers: {}
                }

                if (resumeBytes > 0) {
                    options.headers['Range'] = `bytes=${resumeBytes}-`
                }

                const protocol = parsedUrl.protocol === 'https:' ? https : http
                const req = protocol.get(requestUrl, options, (res) => {
                    // Handle redirects
                    if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                        // Resolve relative redirect URLs against the current request URL
                        let redirectUrl: string
                        try {
                            redirectUrl = new URL(res.headers.location, requestUrl).href
                        } catch {
                            reject(new Error(`Invalid redirect URL: ${res.headers.location}`))
                            return
                        }
                        makeRequest(redirectUrl, redirectCount + 1)
                        return
                    }

                    // Check for valid status codes (200 OK or 206 Partial Content)
                    if (res.statusCode !== 200 && res.statusCode !== 206) {
                        // If range request fails (e.g. 416), try restarting
                        if (res.statusCode === 416 && resumeBytes > 0) {
                            console.log('Resuming failed (416), restarting download...')
                            resumeBytes = 0
                            // Delete invalid part file
                            try { unlinkSync(partPath) } catch { }
                            makeRequest(url, 0)
                            return
                        }

                        reject(new Error(`HTTP ${res.statusCode}`))
                        return
                    }

                    const totalBytes = parseInt(res.headers['content-length'] || '0', 10) + resumeBytes
                    let downloadedBytes = resumeBytes
                    let lastTime = Date.now()
                    let lastBytes = resumeBytes

                    // Append if resuming, otherwise overwrite
                    const file = createWriteStream(partPath, { flags: resumeBytes > 0 && res.statusCode === 206 ? 'a' : 'w' })

                    // If server ignored range header and sent 200, we must reset downloadedBytes
                    if (res.statusCode === 200 && resumeBytes > 0) {
                        resumeBytes = 0
                        downloadedBytes = 0
                        lastBytes = 0
                    }

                    res.on('data', (chunk: Buffer) => {
                        downloadedBytes += chunk.length
                        file.write(chunk)

                        const now = Date.now()
                        const elapsed = (now - lastTime) / 1000
                        if (elapsed >= 0.5) {
                            const bytesPerSec = (downloadedBytes - lastBytes) / elapsed
                            const speed = formatSpeed(bytesPerSec)
                            const progress = totalBytes > 0 ? (downloadedBytes / totalBytes) * 100 : 0
                            onProgress(Math.round(progress), speed)
                            lastTime = now
                            lastBytes = downloadedBytes
                        }
                    })

                    res.on('end', () => {
                        file.end()
                        onProgress(100, '0 B/s')

                        // Rename .part to actual filename
                        try {
                            if (existsSync(destPath)) {
                                try { unlinkSync(destPath) } catch { }
                            }
                            renameSync(partPath, destPath)
                            resolve()
                        } catch (err: any) {
                            reject(new Error(`Failed to rename part file: ${err.message}`))
                        }
                    })

                    res.on('error', (err) => {
                        file.end()
                        reject(err)
                    })
                })

                req.on('error', (err) => {
                    reject(err)
                })
            }

            makeRequest(url)
        })
    }
}

function formatSpeed(bytesPerSec: number): string {
    if (bytesPerSec >= 1024 * 1024) {
        return `${(bytesPerSec / (1024 * 1024)).toFixed(1)} MB/s`
    } else if (bytesPerSec >= 1024) {
        return `${(bytesPerSec / 1024).toFixed(0)} KB/s`
    }
    return `${bytesPerSec.toFixed(0)} B/s`
}
