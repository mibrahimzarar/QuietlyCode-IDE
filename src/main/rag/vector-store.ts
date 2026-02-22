import { join } from 'path'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { app } from 'electron'

interface Document {
    id: string
    content: string
    embedding: number[]
    metadata: any
    hash: string
}

export class VectorStore {
    private documents: Document[] = []
    private storagePath: string

    constructor() {
        const userDataPath = app.getPath('userData')
        this.storagePath = join(userDataPath, 'rag-store.json')
        this.load()
    }

    add(doc: Document) {
        // Remove existing if duplicate ID
        this.documents = this.documents.filter(d => d.id !== doc.id)
        this.documents.push(doc)
    }

    async search(queryEmbedding: number[], limit: number = 5): Promise<(Document & { score: number })[]> {
        const results = this.documents.map(doc => ({
            ...doc,
            score: this.cosineSimilarity(queryEmbedding, doc.embedding)
        }))

        return results
            .sort((a, b) => b.score - a.score)
            .slice(0, limit)
    }

    save() {
        try {
            writeFileSync(this.storagePath, JSON.stringify(this.documents), 'utf-8')
        } catch (err) {
            console.error('Failed to save Vector Store:', err)
        }
    }

    load() {
        if (existsSync(this.storagePath)) {
            try {
                const data = readFileSync(this.storagePath, 'utf-8')
                this.documents = JSON.parse(data)
            } catch (err) {
                console.error('Failed to load Vector Store:', err)
                this.documents = []
            }
        }
    }

    clear() {
        this.documents = []
        this.save()
    }

    getStats() {
        return {
            count: this.documents.length,
            path: this.storagePath
        }
    }

    private cosineSimilarity(vecA: number[], vecB: number[]): number {
        let dotProduct = 0
        let normA = 0
        let normB = 0
        for (let i = 0; i < vecA.length; i++) {
            dotProduct += vecA[i] * vecB[i]
            normA += vecA[i] * vecA[i]
            normB += vecB[i] * vecB[i]
        }
        return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB))
    }
}
