import axios from 'axios'
import fs from 'fs'
import path from 'path'
import AdmZip from 'adm-zip'
import { app } from 'electron'

export class BinaryDownloader {
    private isDownloading = false
    private abortController: AbortController | null = null

    // URL to fetch latest release data (repo moved from ggerganov to ggml-org)
    private static RELEASE_API_URLS = [
        'https://api.github.com/repos/ggml-org/llama.cpp/releases/latest',
        'https://api.github.com/repos/ggerganov/llama.cpp/releases/latest'
    ]

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
            const downloadUrl = await this.getDownloadUrl()

            if (!downloadUrl) {
                throw new Error('Could not find compatible windows binary in latest release')
            }

            // 2. Download Zip
            onProgress(10, 'Downloading binary...')
            const zipPath = path.join(app.getPath('temp'), 'llama-server.zip')
            await this.downloadFile(downloadUrl, zipPath, (p) => {
                // Map 0-100 download progress to 10-80 overall progress
                const overall = 10 + (p * 0.7)
                onProgress(overall, `Downloading: ${Math.round(p)}%`)
            })

            // 3. Extract to dedicated 'bin' subdirectory to avoid DLL conflicts
            const binDir = path.join(targetDir, 'bin')
            onProgress(80, 'Extracting...')
            if (!fs.existsSync(binDir)) {
                fs.mkdirSync(binDir, { recursive: true })
            }

            const zip = new AdmZip(zipPath)
            zip.extractAllTo(binDir, true)

            // Cleanup zip
            fs.unlinkSync(zipPath)

            // 4. Verify — search recursively since zip may have subdirectories
            const binaryName = process.platform === 'win32' ? 'llama-server.exe' : 'llama-server'
            const found = this.findFileRecursive(binDir, binaryName)
            if (found) {
                onProgress(100, 'Done')
                this.isDownloading = false
                return { success: true, path: found }
            } else {
                // List what was extracted for debugging
                console.log('Extracted contents:', fs.readdirSync(targetDir))
                throw new Error(`${binaryName} not found in extracted files`)
            }

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

    private findFileRecursive(dir: string, filename: string): string | null {
        const entries = fs.readdirSync(dir, { withFileTypes: true })
        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name)
            if (entry.isFile() && entry.name === filename) {
                return fullPath
            }
            if (entry.isDirectory()) {
                const found = this.findFileRecursive(fullPath, filename)
                if (found) return found
            }
        }
        return null
    }

    private async getDownloadUrl(): Promise<string | null> {
        const patterns = [
            'bin-win-avx2-x64.zip',
            'bin-win-avx-x64.zip',
            'bin-win-cpu-x64.zip',
            'bin-win-x64.zip',
            'win-x64.zip'
        ]

        for (const url of BinaryDownloader.RELEASE_API_URLS) {
            try {
                const response = await axios.get(url)
                const assets = response.data.assets

                for (const pattern of patterns) {
                    const asset = assets.find((a: any) => a.name.toLowerCase().includes(pattern))
                    if (asset) {
                        console.log('Found binary asset:', asset.name, 'from', url)
                        return asset.browser_download_url
                    }
                }

                console.log('No matching binary in', url, '— assets:', assets.map((a: any) => a.name))
            } catch (e) {
                console.warn('Failed to fetch from:', url, e)
            }
        }

        return null
    }

    private async downloadFile(url: string, destPath: string, onProgress: (p: number) => void): Promise<void> {
        const writer = fs.createWriteStream(destPath)

        const response = await axios({
            url,
            method: 'GET',
            responseType: 'stream',
            signal: this.abortController?.signal
        })

        const totalLength = parseInt(response.headers['content-length'], 10)
        let downloaded = 0

        response.data.on('data', (chunk: Buffer) => {
            downloaded += chunk.length
            const progress = (downloaded / totalLength) * 100
            onProgress(progress)
        })

        response.data.pipe(writer)

        return new Promise((resolve, reject) => {
            writer.on('finish', resolve)
            writer.on('error', reject)
            this.abortController?.signal.addEventListener('abort', () => {
                writer.destroy() // cleanup
                reject(new Error('Cancelled'))
            })
        })
    }
}
