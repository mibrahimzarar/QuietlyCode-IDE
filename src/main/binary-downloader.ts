import axios from 'axios'
import fs from 'fs'
import path from 'path'
import AdmZip from 'adm-zip'
import { execSync } from 'child_process'
import { app } from 'electron'

export class BinaryDownloader {
    private isDownloading = false
    private abortController: AbortController | null = null

    private static RELEASE_API_URL = 'https://api.github.com/repos/ggml-org/llama.cpp/releases/latest'

    async downloadBinary(
        targetDir: string,
        onProgress: (progress: number, status: string) => void
    ): Promise<{ success: boolean; path?: string; error?: string }> {
        if (this.isDownloading) {
            return { success: false, error: 'Download already in progress' }
        }

        this.isDownloading = true
        this.abortController = new AbortController()

        try {
            // 1. Get download URL
            onProgress(5, 'Fetching release info...')
            const { url: downloadUrl, filename } = await this.getDownloadUrl()

            // 2. Download archive
            onProgress(10, 'Downloading binary...')
            const tempPath = path.join(app.getPath('temp'), filename)
            await this.downloadFile(downloadUrl, tempPath, (p) => {
                onProgress(10 + p * 0.7, `Downloading: ${Math.round(p)}%`)
            })

            // 3. Extract to dedicated 'bin' subdirectory
            const binDir = path.join(targetDir, 'bin')
            onProgress(82, 'Extracting...')
            if (!fs.existsSync(binDir)) {
                fs.mkdirSync(binDir, { recursive: true })
            }

            if (filename.endsWith('.zip')) {
                const zip = new AdmZip(tempPath)
                zip.extractAllTo(binDir, true)
            } else {
                // .tar.gz — use system tar (always available on macOS/Linux)
                execSync(`tar -xzf "${tempPath}" -C "${binDir}"`)
            }

            fs.unlinkSync(tempPath)

            // 4. Find and verify binary
            onProgress(95, 'Verifying...')
            const binaryName = process.platform === 'win32' ? 'llama-server.exe' : 'llama-server'
            const found = this.findFileRecursive(binDir, binaryName)

            if (!found) {
                const extracted = this.listFilesRecursive(binDir).slice(0, 20).join(', ')
                throw new Error(`${binaryName} not found. Extracted: ${extracted}`)
            }

            // Make executable on macOS/Linux
            if (process.platform !== 'win32') {
                fs.chmodSync(found, 0o755)
            }

            onProgress(100, 'Done')
            this.isDownloading = false
            return { success: true, path: found }

        } catch (error: any) {
            this.isDownloading = false
            return { success: false, error: error.message }
        }
    }

    cancel() {
        if (this.abortController) {
            this.abortController.abort()
        }
        this.isDownloading = false
    }

    private async getDownloadUrl(): Promise<{ url: string; filename: string }> {
        const { platform, arch } = process

        // Priority-ordered patterns per platform
        // Actual release names look like: llama-b8287-bin-ubuntu-x64.tar.gz
        let patterns: string[]
        if (platform === 'win32') {
            patterns = [
                'bin-win-cpu-x64.zip',
                'bin-win-vulkan-x64.zip',
                'bin-win-cpu-arm64.zip',
            ]
        } else if (platform === 'darwin') {
            patterns = arch === 'arm64'
                ? ['bin-macos-arm64.tar.gz', 'bin-macos-x64.tar.gz']
                : ['bin-macos-x64.tar.gz', 'bin-macos-arm64.tar.gz']
        } else {
            // Linux
            patterns = [
                'bin-ubuntu-x64.tar.gz',
                'bin-ubuntu-vulkan-x64.tar.gz',
            ]
        }

        let lastError: string = ''

        try {
            const response = await axios.get(BinaryDownloader.RELEASE_API_URL, {
                headers: { 'User-Agent': 'QuietlyCode-IDE' },
                timeout: 15000,
            })

            const assets: Array<{ name: string; browser_download_url: string }> = response.data.assets

            for (const pattern of patterns) {
                const asset = assets.find((a) => a.name.toLowerCase().includes(pattern))
                if (asset) {
                    console.log('[BinaryDownloader] Matched asset:', asset.name)
                    return { url: asset.browser_download_url, filename: asset.name }
                }
            }

            const names = assets.map((a) => a.name).join(', ')
            lastError = `No matching asset for ${platform}/${arch}. Available: ${names}`
            console.error('[BinaryDownloader]', lastError)
        } catch (e: any) {
            lastError = `GitHub API request failed: ${e.message}`
            console.error('[BinaryDownloader]', lastError)
        }

        throw new Error(lastError || `Could not find compatible binary for ${platform}/${arch}`)
    }

    private findFileRecursive(dir: string, filename: string): string | null {
        const entries = fs.readdirSync(dir, { withFileTypes: true })
        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name)
            if (entry.isFile() && entry.name === filename) return fullPath
            if (entry.isDirectory()) {
                const found = this.findFileRecursive(fullPath, filename)
                if (found) return found
            }
        }
        return null
    }

    private listFilesRecursive(dir: string): string[] {
        const results: string[] = []
        try {
            const entries = fs.readdirSync(dir, { withFileTypes: true })
            for (const entry of entries) {
                const fullPath = path.join(dir, entry.name)
                if (entry.isFile()) results.push(fullPath)
                else if (entry.isDirectory()) results.push(...this.listFilesRecursive(fullPath))
            }
        } catch { /* ignore */ }
        return results
    }

    private async downloadFile(url: string, destPath: string, onProgress: (p: number) => void): Promise<void> {
        const writer = fs.createWriteStream(destPath)

        const response = await axios({
            url,
            method: 'GET',
            responseType: 'stream',
            signal: this.abortController?.signal,
            timeout: 0, // no timeout for large file downloads
        })

        const totalLength = parseInt(response.headers['content-length'], 10)
        let downloaded = 0

        response.data.on('data', (chunk: Buffer) => {
            downloaded += chunk.length
            if (totalLength) onProgress((downloaded / totalLength) * 100)
        })

        response.data.pipe(writer)

        return new Promise((resolve, reject) => {
            writer.on('finish', resolve)
            writer.on('error', reject)
            this.abortController?.signal.addEventListener('abort', () => {
                writer.destroy()
                reject(new Error('Cancelled'))
            })
        })
    }
}
