import { exec } from 'child_process'
import { promisify } from 'util'
import { existsSync } from 'fs'
import { join, extname } from 'path'

const execAsync = promisify(exec)

export class FormatService {
    private async hasPrettier(projectPath: string): Promise<boolean> {
        const prettierPath = join(projectPath, 'node_modules', '.bin', process.platform === 'win32' ? 'prettier.cmd' : 'prettier')
        return existsSync(prettierPath)
    }

    private async hasESLint(projectPath: string): Promise<boolean> {
        const eslintPath = join(projectPath, 'node_modules', '.bin', process.platform === 'win32' ? 'eslint.cmd' : 'eslint')
        return existsSync(eslintPath)
    }

    async formatDocument(filePath: string, projectPath: string): Promise<{ success: boolean; content?: string; error?: string }> {
        const ext = extname(filePath).toLowerCase()
        
        // Check if we can format this file type
        const supportedExts = ['.ts', '.tsx', '.js', '.jsx', '.json', '.md', '.css', '.scss', '.less', '.html', '.yaml', '.yml']
        if (!supportedExts.includes(ext)) {
            return { success: false, error: 'File type not supported for formatting' }
        }

        // Try Prettier first
        if (await this.hasPrettier(projectPath)) {
            return this.formatWithPrettier(filePath, projectPath)
        }

        // Fall back to npx prettier
        try {
            return this.formatWithNpxPrettier(filePath)
        } catch (error) {
            return { success: false, error: 'Prettier not available. Install it with: npm install --save-dev prettier' }
        }
    }

    private async formatWithPrettier(filePath: string, projectPath: string): Promise<{ success: boolean; content?: string; error?: string }> {
        const isWin = process.platform === 'win32'
        const prettierCmd = join(projectPath, 'node_modules', '.bin', isWin ? 'prettier.cmd' : 'prettier')
        
        try {
            const { stdout, stderr } = await execAsync(
                `"${prettierCmd}" --write "${filePath}"`,
                { cwd: projectPath }
            )
            
            // Read the formatted file
            const fs = await import('fs')
            const content = fs.readFileSync(filePath, 'utf-8')
            
            return { success: true, content }
        } catch (error: any) {
            return { 
                success: false, 
                error: error.stderr || error.message || 'Prettier formatting failed' 
            }
        }
    }

    private async formatWithNpxPrettier(filePath: string): Promise<{ success: boolean; content?: string; error?: string }> {
        const isWin = process.platform === 'win32'
        
        try {
            const { stdout, stderr } = await execAsync(
                `${isWin ? 'npx.cmd' : 'npx'} -y prettier --write "${filePath}"`,
                { cwd: process.cwd() }
            )
            
            // Read the formatted file
            const fs = await import('fs')
            const content = fs.readFileSync(filePath, 'utf-8')
            
            return { success: true, content }
        } catch (error: any) {
            return { 
                success: false, 
                error: error.stderr || error.message || 'Prettier formatting failed' 
            }
        }
    }

    async checkFormatting(filePath: string, projectPath: string): Promise<{ formatted: boolean; error?: string }> {
        if (!await this.hasPrettier(projectPath)) {
            return { formatted: true } // Can't check, assume formatted
        }

        const isWin = process.platform === 'win32'
        const prettierCmd = join(projectPath, 'node_modules', '.bin', isWin ? 'prettier.cmd' : 'prettier')
        
        try {
            await execAsync(
                `"${prettierCmd}" --check "${filePath}"`,
                { cwd: projectPath }
            )
            return { formatted: true }
        } catch (error: any) {
            // Prettier exits with code 1 if file needs formatting
            if (error.code === 1) {
                return { formatted: false }
            }
            return { formatted: true, error: error.stderr || error.message }
        }
    }

    async getPrettierConfig(projectPath: string): Promise<any | null> {
        const configFiles = [
            '.prettierrc',
            '.prettierrc.json',
            '.prettierrc.yml',
            '.prettierrc.yaml',
            '.prettierrc.js',
            'prettier.config.js',
            '.prettierrc.mjs',
            'prettier.config.mjs'
        ]

        const fs = await import('fs')
        
        for (const configFile of configFiles) {
            const configPath = join(projectPath, configFile)
            if (existsSync(configPath)) {
                try {
                    if (configFile.endsWith('.js') || configFile.endsWith('.mjs')) {
                        // For JS config files, we'd need to require them
                        // For now, just return that a config exists
                        return { exists: true, path: configPath }
                    } else {
                        const content = fs.readFileSync(configPath, 'utf-8')
                        if (configFile.endsWith('.json')) {
                            return JSON.parse(content)
                        } else if (configFile.endsWith('.yml') || configFile.endsWith('.yaml')) {
                            // Simple YAML parsing for basic cases
                            const config: any = {}
                            content.split('\n').forEach(line => {
                                const match = line.match(/^(\w+):\s*(.+)$/)
                                if (match) {
                                    const value = match[2].trim()
                                    config[match[1]] = value === 'true' ? true : value === 'false' ? false : 
                                                      !isNaN(Number(value)) ? Number(value) : value
                                }
                            })
                            return config
                        }
                    }
                } catch (e) {
                    // Continue to next config file
                }
            }
        }

        // Check package.json
        const packageJsonPath = join(projectPath, 'package.json')
        if (existsSync(packageJsonPath)) {
            try {
                const content = fs.readFileSync(packageJsonPath, 'utf-8')
                const pkg = JSON.parse(content)
                if (pkg.prettier) {
                    return pkg.prettier
                }
            } catch (e) {
                // Ignore
            }
        }

        return null
    }
}
