import { exec } from 'child_process'
import { promisify } from 'util'
import { join } from 'path'
import { existsSync } from 'fs'

const execAsync = promisify(exec)

export interface GitStatus {
    path: string
    status: 'modified' | 'staged' | 'added' | 'deleted' | 'untracked' | 'renamed' | 'conflict'
    originalPath?: string
}

export interface GitBranch {
    name: string
    current: boolean
    remote?: string
}

export interface GitCommit {
    hash: string
    shortHash: string
    message: string
    author: string
    date: string
    relativeDate: string
}

export interface GitDiff {
    path: string
    additions: number
    deletions: number
    diff: string
}

export class GitService {
    private async execGit(args: string, cwd: string): Promise<{ stdout: string; stderr: string }> {
        try {
            return await execAsync(`git ${args}`, { cwd })
        } catch (error: any) {
            // Git commands often exit with non-zero on expected conditions
            return { stdout: error.stdout || '', stderr: error.stderr || '' }
        }
    }

    async isGitRepository(projectPath: string): Promise<boolean> {
        if (!projectPath || !existsSync(projectPath)) return false
        try {
            await execAsync('git rev-parse --git-dir', { cwd: projectPath })
            return true
        } catch {
            return false
        }
    }

    async getStatus(projectPath: string): Promise<GitStatus[]> {
        if (!await this.isGitRepository(projectPath)) return []

        const { stdout } = await this.execGit('status --porcelain -z', projectPath)
        const statuses: GitStatus[] = []

        // Parse porcelain output (null-separated)
        const entries = stdout.split('\0')
        let i = 0
        while (i < entries.length) {
            const entry = entries[i]
            if (!entry || entry.length < 3) {
                i++
                continue
            }

            const x = entry[0] // Index status
            const y = entry[1] // Working tree status
            const filePath = entry.substring(3)

            let status: GitStatus['status']

            // Determine status
            if (x === '?' && y === '?') {
                status = 'untracked'
            } else if (x === 'A' || (x !== ' ' && y === 'A')) {
                status = 'added'
            } else if (x === 'D' || y === 'D') {
                status = 'deleted'
            } else if (x === 'M' || x === 'R' || x === 'C') {
                status = 'staged'
            } else if (y === 'M') {
                status = 'modified'
            } else if (x === 'R' || y === 'R') {
                status = 'renamed'
                // Renamed files have original path in next entry
                i++
                const originalPath = entries[i]
                statuses.push({ path: filePath, status, originalPath })
                i++
                continue
            } else if (x === 'U' || y === 'U' || x === 'A' && y === 'A' || x === 'D' && y === 'D') {
                status = 'conflict'
            } else {
                status = 'modified'
            }

            statuses.push({ path: join(projectPath, filePath), status })
            i++
        }

        return statuses
    }

    async getBranches(projectPath: string): Promise<GitBranch[]> {
        if (!await this.isGitRepository(projectPath)) return []

        const { stdout } = await this.execGit('branch -a --format="%(refname:short)|%(HEAD)"', projectPath)
        
        return stdout
            .split('\n')
            .filter(line => line.trim())
            .map(line => {
                const [name, head] = line.split('|')
                return {
                    name: name.trim(),
                    current: head === '*',
                    remote: name.startsWith('remotes/') ? name.replace('remotes/', '') : undefined
                }
            })
    }

    async getCurrentBranch(projectPath: string): Promise<string | null> {
        if (!await this.isGitRepository(projectPath)) return null

        try {
            const { stdout } = await execAsync('git branch --show-current', { cwd: projectPath })
            return stdout.trim() || null
        } catch {
            return null
        }
    }

    async getCommits(projectPath: string, count: number = 20): Promise<GitCommit[]> {
        if (!await this.isGitRepository(projectPath)) return []

        const format = '%H|%h|%s|%an|%ai|%ar'
        const { stdout } = await this.execGit(
            `log -${count} --format="${format}"`,
            projectPath
        )

        return stdout
            .split('\n')
            .filter(line => line.trim())
            .map(line => {
                const [hash, shortHash, message, author, date, relativeDate] = line.split('|')
                return {
                    hash,
                    shortHash,
                    message,
                    author,
                    date,
                    relativeDate
                }
            })
    }

    async getDiff(projectPath: string, filePath?: string): Promise<string> {
        if (!await this.isGitRepository(projectPath)) return ''

        const args = filePath ? `diff -- "${filePath}"` : 'diff'
        const { stdout } = await this.execGit(args, projectPath)
        return stdout
    }

    async getStagedDiff(projectPath: string, filePath?: string): Promise<string> {
        if (!await this.isGitRepository(projectPath)) return ''

        const args = filePath ? `diff --staged -- "${filePath}"` : 'diff --staged'
        const { stdout } = await this.execGit(args, projectPath)
        return stdout
    }

    async stageFile(projectPath: string, filePath: string): Promise<boolean> {
        if (!await this.isGitRepository(projectPath)) return false

        try {
            const relativePath = filePath.replace(projectPath, '').replace(/^[\\/]/, '')
            await execAsync(`git add "${relativePath}"`, { cwd: projectPath })
            return true
        } catch {
            return false
        }
    }

    async unstageFile(projectPath: string, filePath: string): Promise<boolean> {
        if (!await this.isGitRepository(projectPath)) return false

        try {
            const relativePath = filePath.replace(projectPath, '').replace(/^[\\/]/, '')
            await execAsync(`git reset HEAD "${relativePath}"`, { cwd: projectPath })
            return true
        } catch {
            return false
        }
    }

    async discardChanges(projectPath: string, filePath: string): Promise<boolean> {
        if (!await this.isGitRepository(projectPath)) return false

        try {
            const relativePath = filePath.replace(projectPath, '').replace(/^[\\/]/, '')
            await execAsync(`git checkout -- "${relativePath}"`, { cwd: projectPath })
            return true
        } catch {
            return false
        }
    }

    async commit(projectPath: string, message: string): Promise<{ success: boolean; error?: string }> {
        if (!await this.isGitRepository(projectPath)) {
            return { success: false, error: 'Not a git repository' }
        }

        try {
            // Escape the message for shell
            const escapedMessage = message.replace(/"/g, '\\"')
            await execAsync(`git commit -m "${escapedMessage}"`, { cwd: projectPath })
            return { success: true }
        } catch (error: any) {
            return { success: false, error: error.stderr || error.message }
        }
    }

    async createBranch(projectPath: string, branchName: string, checkout: boolean = false): Promise<boolean> {
        if (!await this.isGitRepository(projectPath)) return false

        try {
            const args = checkout ? `-b "${branchName}"` : `"${branchName}"`
            await execAsync(`git branch ${args}`, { cwd: projectPath })
            return true
        } catch {
            return false
        }
    }

    async checkoutBranch(projectPath: string, branchName: string): Promise<boolean> {
        if (!await this.isGitRepository(projectPath)) return false

        try {
            await execAsync(`git checkout "${branchName}"`, { cwd: projectPath })
            return true
        } catch {
            return false
        }
    }

    async pull(projectPath: string): Promise<{ success: boolean; output?: string; error?: string }> {
        if (!await this.isGitRepository(projectPath)) {
            return { success: false, error: 'Not a git repository' }
        }

        try {
            const { stdout, stderr } = await execAsync('git pull', { cwd: projectPath })
            return { success: true, output: stdout || stderr }
        } catch (error: any) {
            return { success: false, error: error.stderr || error.message }
        }
    }

    async push(projectPath: string): Promise<{ success: boolean; output?: string; error?: string }> {
        if (!await this.isGitRepository(projectPath)) {
            return { success: false, error: 'Not a git repository' }
        }

        try {
            const { stdout, stderr } = await execAsync('git push', { cwd: projectPath })
            return { success: true, output: stdout || stderr }
        } catch (error: any) {
            return { success: false, error: error.stderr || error.message }
        }
    }

    async getRemoteUrl(projectPath: string): Promise<string | null> {
        if (!await this.isGitRepository(projectPath)) return null

        try {
            const { stdout } = await execAsync('git remote get-url origin', { cwd: projectPath })
            return stdout.trim() || null
        } catch {
            return null
        }
    }
}
