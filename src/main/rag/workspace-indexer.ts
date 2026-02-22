import { readFileSync, statSync, readdirSync } from 'fs'
import { join, extname } from 'path'
import { VectorStore } from './vector-store'
import { AIService } from '../ai-service'
import crypto from 'crypto'

// Common text files to index
const ALLOWED_EXTS = ['.ts', '.tsx', '.js', '.jsx', '.css', '.html', '.json', '.md', '.py', '.rs', '.go', '.cpp', '.hpp', '.h', '.c', '.java', '.xml', '.yaml', '.yml', '.sh']
// Directories to ignore
const IGNORE_DIRS = ['node_modules', '.git', 'dist', 'build', 'out', '.next', 'coverage', '.gemini', '.vscode', '.idea', '__pycache__']

export class WorkspaceIndexer {
    private isIndexing = false
    private stopRequested = false
    private currentPath: string | null = null

    constructor(
        private vectorStore: VectorStore,
        private aiService: AIService
    ) { }

    private scanDir(dir: string): string[] {
        let results: string[] = []
        try {
            const list = readdirSync(dir)
            for (const file of list) {
                const path = join(dir, file)
                const stat = statSync(path)

                if (stat && stat.isDirectory()) {
                    if (!IGNORE_DIRS.includes(file)) {
                        results = results.concat(this.scanDir(path))
                    }
                } else {
                    const ext = extname(file).toLowerCase()
                    if (ALLOWED_EXTS.includes(ext) && stat.size < 1024 * 1024) {
                        results.push(path)
                    }
                }
            }
        } catch (e) {
            console.error('Scan error:', e)
        }
        return results
    }

    async startIndexing(workspacePath: string, onProgress?: (msg: string) => void) {
        if (this.isIndexing) return
        if (!this.aiService.getStatus().running) {
            onProgress?.('AI Engine not running. Cannot create embeddings.')
            return
        }

        this.isIndexing = true
        this.stopRequested = false
        this.currentPath = workspacePath

        try {
            onProgress?.('Scanning workspace files...')

            // 1. Find all indexable files
            const files = this.scanDir(workspacePath)

            onProgress?.(`Found ${files.length} files to index.`)

            // 2. Process each file
            let indexedCount = 0
            for (const file of files) {
                if (this.stopRequested) break

                try {
                    const stats = statSync(file)
                    // Skip files larger than 1MB
                    if (stats.size > 1024 * 1024) continue

                    const content = readFileSync(file, 'utf-8')
                    const hash = crypto.createHash('md5').update(content).digest('hex')

                    // Chunk the content (simple overlapping windows)
                    const chunks = this.chunkText(content, 1000, 200)

                    for (let i = 0; i < chunks.length; i++) {
                        if (this.stopRequested) break

                        const chunkId = `${file}#chunk-${i}`

                        // Check if we already have this exact chunk hash in the DB
                        // (Requires updating vector store to query by ID or just rebuilding)
                        // For now we just embed everything to get a fresh state

                        const embedding = await this.aiService.getEmbedding(chunks[i])
                        if (embedding && embedding.length > 0) {
                            this.vectorStore.add({
                                id: chunkId,
                                content: chunks[i],
                                embedding,
                                metadata: { filePath: file, chunkIndex: i },
                                hash
                            })
                        }
                    }

                    indexedCount++
                    if (indexedCount % 5 === 0) {
                        onProgress?.(`Indexed ${indexedCount}/${files.length} files...`)
                        // Periodically save
                        this.vectorStore.save()
                    }

                } catch (err) {
                    console.error(`Failed to index file ${file}:`, err)
                }
            }

            // Final save
            this.vectorStore.save()
            onProgress?.(`Indexing complete! Indexed ${indexedCount} files.`)

        } catch (err) {
            console.error('Indexing failed', err)
            onProgress?.(`Indexing failed: ${err}`)
        } finally {
            this.isIndexing = false
        }
    }

    stop() {
        if (this.isIndexing) {
            this.stopRequested = true
        }
    }

    private chunkText(text: string, chunkSize: number, overlap: number): string[] {
        const words = text.split(/\s+/)
        const chunks: string[] = []

        let i = 0
        while (i < words.length) {
            const chunk = words.slice(i, i + chunkSize).join(' ')
            if (chunk.trim().length > 0) {
                chunks.push(chunk)
            }
            i += (chunkSize - overlap)
        }

        return chunks
    }
}
