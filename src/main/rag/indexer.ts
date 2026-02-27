import { readFileSync, readdirSync, statSync } from 'fs'
import { join, extname, relative } from 'path'
import { createHash } from 'crypto'
import { VectorStore } from './vector-store'
import { AIService } from '../ai-service'

export class CodebaseIndexer {
    private vectorStore: VectorStore
    private aiService: AIService
    private isIndexing = false
    private stopRequested = false

    constructor(store: VectorStore, aiService: AIService) {
        this.vectorStore = store
        this.aiService = aiService
    }

    async index(rootPath: string, onProgress?: (current: number, total: number, file: string) => void) {
        if (this.isIndexing) return
        this.isIndexing = true
        this.stopRequested = false

        try {
            const files = this.scanDir(rootPath)
            let processed = 0

            for (const file of files) {
                if (this.stopRequested) break

                if (onProgress) onProgress(processed, files.length, relative(rootPath, file))

                try {
                    const content = readFileSync(file, 'utf-8')
                    const hash = createHash('md5').update(content).digest('hex')
                    const relativePath = relative(rootPath, file)

                    // Semantic Chunking: 500 words with 100 word overlap
                    const chunks = this.chunkText(content, 500, 100)

                    for (let i = 0; i < chunks.length; i++) {
                        if (this.stopRequested) break

                        const chunkId = `${relativePath}#chunk-${i}`
                        const embedding = await this.aiService.getEmbedding(chunks[i])

                        if (embedding && embedding.length > 0) {
                            await this.vectorStore.add({
                                id: chunkId,
                                content: chunks[i],
                                embedding,
                                metadata: { path: relativePath, chunkIndex: i },
                                hash
                            })
                        }
                    }
                } catch (e) {
                    console.error('Failed to index file:', file, e)
                }

                processed++

                // Save periodically to avoid losing progress
                if (processed % 10 === 0) {
                    await this.vectorStore.save()
                }
            }

            await this.vectorStore.save()
            if (onProgress) onProgress(processed, files.length, "Done")
        } finally {
            this.isIndexing = false
        }
    }

    stop() {
        if (this.isIndexing) {
            this.stopRequested = true
        }
    }

    private scanDir(dir: string): string[] {
        let results: string[] = []
        try {
            const list = readdirSync(dir)

            const IGNORE_DIRS = ['node_modules', '.git', 'dist', 'build', 'out', '.next', 'coverage', '.gemini', '.vscode', '.idea', '__pycache__']
            const ALLOWED_EXTS = ['.ts', '.tsx', '.js', '.jsx', '.css', '.html', '.json', '.md', '.py', '.rs', '.go', '.cpp', '.hpp', '.h', '.c', '.java', '.xml', '.yaml', '.yml', '.sh']

            for (const file of list) {
                const path = join(dir, file)
                const stat = statSync(path)

                if (stat && stat.isDirectory()) {
                    if (!IGNORE_DIRS.includes(file)) {
                        results = results.concat(this.scanDir(path))
                    }
                } else {
                    const ext = extname(file).toLowerCase()
                    if (ALLOWED_EXTS.includes(ext) && stat.size < 500 * 1024) { // Increased to 500KB max file size
                        results.push(path)
                    }
                }
            }
        } catch (e) {
            console.error('Scan error:', e)
        }
        return results
    }

    private chunkText(text: string, chunkSize: number, overlap: number): string[] {
        const words = text.split(/\s+/)
        const chunks: string[] = []

        let i = 0
        while (i < words.length) {
            const chunk = words.slice(i, i + chunkSize).join(' ')
            if (chunk.trim().length > 0) {
                // Prepend context to the chunk for better embedding focus
                chunks.push(chunk)
            }
            i += (chunkSize - overlap)
        }

        return chunks
    }
}
