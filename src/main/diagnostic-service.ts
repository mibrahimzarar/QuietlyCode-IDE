import { exec } from 'child_process'
import { promisify } from 'util'
import { existsSync } from 'fs'
import { join } from 'path'

const execAsync = promisify(exec)

export interface CodeProblem {
    path: string
    message: string
    line: number
    character: number
    severity: number // 1: Error, 2: Warning
}

export class DiagnosticService {
    async lintCodebase(projectPath: string): Promise<{ success: boolean; problems?: CodeProblem[]; error?: string }> {
        if (!projectPath || !existsSync(projectPath)) {
            return { success: false, error: 'Project path not found' }
        }

        try {
            // Run tsc to get diagnostics. 
            // --noEmit for just checking, --pretty false for easier parsing
            // We use npx to ensure tsc is available from node_modules
            const { stdout, stderr } = await execAsync('npx tsc --noEmit --pretty false', {
                cwd: projectPath,
                maxBuffer: 10 * 1024 * 1024 // 10MB buffer
            }).catch(err => {
                // tsc returns non-zero code on errors, which is normal for linting
                return { stdout: err.stdout as string, stderr: err.stderr as string }
            })

            const problems = this.parseTscOutput(stdout, projectPath)
            return { success: true, problems }
        } catch (err: any) {
            return { success: false, error: err.message }
        }
    }

    private parseTscOutput(output: string, projectPath: string): CodeProblem[] {
        const problems: CodeProblem[] = []
        const lines = output.split('\n')

        // Pattern: path/to/file.ts(line,char): error TSXXXX: message
        const regex = /^(.+)\((\d+),(\d+)\): error TS\d+: (.*)$/

        for (const line of lines) {
            const match = line.match(regex)
            if (match) {
                const [_, relativePath, lineStr, charStr, message] = match
                problems.push({
                    path: join(projectPath, relativePath),
                    line: parseInt(lineStr),
                    character: parseInt(charStr),
                    message: message.trim(),
                    severity: 1 // Error
                })
            }
        }

        return problems
    }
}
