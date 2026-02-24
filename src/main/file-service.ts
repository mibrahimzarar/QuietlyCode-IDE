import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'fs'
import { join, basename, extname } from 'path'

export interface FileTreeNode {
    name: string
    path: string
    isDirectory: boolean
    children?: FileTreeNode[]
    gitStatus?: 'modified' | 'staged' | 'added' | 'deleted' | 'untracked' | 'ignored'
}

const IGNORED_DIRS = new Set([
    '.git', '.svn', '.hg', '__pycache__',
    '.idea', '.vscode', '.vs', '.cache', '.DS_Store'
])

const IGNORED_FILES = new Set([
    '.DS_Store', 'Thumbs.db', 'desktop.ini'
])

// Directories that should be visible but marked as ignored
const VISIBLE_IGNORED_DIRS = new Set([
    'node_modules', 'dist', 'build', 'out',
    '.next', '.nuxt', 'coverage'
])

import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

export class FileService {
    private gitStatusMap: Map<string, FileTreeNode['gitStatus']> = new Map()

    async getGitStatus(projectPath: string) {
        try {
            const { stdout } = await execAsync('git status --porcelain=v1 --ignored', { cwd: projectPath })
            const map: Map<string, FileTreeNode['gitStatus']> = new Map()

            stdout.split('\n').forEach(line => {
                if (!line || line.length < 3) return
                const x = line[0] // Index status
                const y = line[1] // Working tree status
                const filePath = join(projectPath, line.substring(3).trim().replace(/"/g, ''))

                if (x === '?') {
                    map.set(filePath, 'untracked')
                } else if (x === '!') {
                    map.set(filePath, 'ignored')
                } else if (x !== ' ') {
                    map.set(filePath, 'staged')
                } else if (y === 'M') {
                    map.set(filePath, 'modified')
                } else if (y === 'D') {
                    map.set(filePath, 'deleted')
                }
            })
            this.gitStatusMap = map
        } catch (err) {
            this.gitStatusMap = new Map()
        }
    }

    async getFileTree(dirPath: string, depth: number = 0, maxDepth: number = 20, isExpandingIgnored: boolean = false): Promise<FileTreeNode[]> {
        if (depth === 0) {
            await this.getGitStatus(dirPath)
        }
        if (depth >= maxDepth) return []

        try {
            const entries = readdirSync(dirPath, { withFileTypes: true })
            const nodes: FileTreeNode[] = []

            // Sort: directories first, then files, alphabetically
            const sorted = entries.sort((a, b) => {
                if (a.isDirectory() && !b.isDirectory()) return -1
                if (!a.isDirectory() && b.isDirectory()) return 1
                return a.name.localeCompare(b.name)
            })

            for (const entry of sorted) {
                // Skip completely hidden directories
                if (IGNORED_DIRS.has(entry.name) || IGNORED_FILES.has(entry.name)) continue

                const fullPath = join(dirPath, entry.name)
                
                // Check if this is a visible ignored directory (like node_modules)
                const isVisibleIgnored = VISIBLE_IGNORED_DIRS.has(entry.name)
                
                const node: FileTreeNode = {
                    name: entry.name,
                    path: fullPath,
                    isDirectory: entry.isDirectory(),
                    gitStatus: isVisibleIgnored ? 'ignored' : this.gitStatusMap.get(fullPath)
                }

                if (entry.isDirectory()) {
                    // For visible ignored dirs, only load children if explicitly expanding (depth > 0 and isExpandingIgnored)
                    if (isVisibleIgnored && depth === 0 && !isExpandingIgnored) {
                        node.children = [] // Empty array to show it's expandable
                    } else {
                        node.children = await this.getFileTree(fullPath, depth + 1, maxDepth, isExpandingIgnored)
                    }
                }

                nodes.push(node)
            }

            return nodes
        } catch (err) {
            console.error('Error reading directory:', dirPath, err)
            return []
        }
    }

    // Method to load contents of a specific directory (for expanding ignored dirs)
    async expandDirectory(dirPath: string): Promise<FileTreeNode[]> {
        return this.getFileTree(dirPath, 1, 20, true)
    }

    readFile(filePath: string): { success: boolean; content?: string; error?: string } {
        try {
            const content = readFileSync(filePath, 'utf-8')
            return { success: true, content }
        } catch (err: any) {
            return { success: false, error: err.message }
        }
    }

    writeFile(filePath: string, content: string): { success: boolean; error?: string } {
        try {
            writeFileSync(filePath, content, 'utf-8')
            return { success: true }
        } catch (err: any) {
            return { success: false, error: err.message }
        }
    }

    patchFile(filePath: string, patches: { search: string; replace: string }[]): { success: boolean; error?: string } {
        try {
            if (!existsSync(filePath)) {
                return { success: false, error: `File not found: ${filePath}` }
            }

            let content = readFileSync(filePath, 'utf-8')

            for (const patch of patches) {
                if (!content.includes(patch.search)) {
                    return { success: false, error: `Search block not found in file: ${patch.search.substring(0, 50)}...` }
                }
                // Use split/join to replace all occurrences if needed, but usually patches should be unique
                // Given the context, we'll replace the first occurrence as standard for LLM patching
                content = content.replace(patch.search, patch.replace)
            }

            writeFileSync(filePath, content, 'utf-8')
            return { success: true }
        } catch (err: any) {
            return { success: false, error: err.message }
        }
    }

    getLanguageFromPath(filePath: string): string {
        const ext = extname(filePath).toLowerCase()
        const langMap: Record<string, string> = {
            '.ts': 'typescript', '.tsx': 'typescript', '.js': 'javascript',
            '.jsx': 'javascript', '.py': 'python', '.rs': 'rust',
            '.go': 'go', '.java': 'java', '.cpp': 'cpp', '.c': 'c',
            '.h': 'c', '.hpp': 'cpp', '.css': 'css', '.scss': 'scss',
            '.html': 'html', '.json': 'json', '.md': 'markdown',
            '.yaml': 'yaml', '.yml': 'yaml', '.xml': 'xml',
            '.sh': 'shell', '.bash': 'shell', '.sql': 'sql',
            '.rb': 'ruby', '.php': 'php', '.swift': 'swift',
            '.kt': 'kotlin', '.dart': 'dart', '.lua': 'lua',
            '.r': 'r', '.toml': 'toml', '.ini': 'ini',
            '.dockerfile': 'dockerfile', '.vue': 'html',
            '.svelte': 'html'
        }
        return langMap[ext] || 'plaintext'
    }
}
