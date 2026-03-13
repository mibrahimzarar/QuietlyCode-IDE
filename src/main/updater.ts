import { autoUpdater } from 'electron-updater'
import { BrowserWindow, dialog, app } from 'electron'
import log from 'electron-log'

// Route electron-updater logs through electron-log (shows in userData/logs/)
autoUpdater.logger = log
;(autoUpdater.logger as any).transports.file.level = 'info'

// Do NOT auto-install immediately — prompt the user first
autoUpdater.autoInstallOnAppQuit = true
autoUpdater.autoDownload = true

export function initUpdater(window: BrowserWindow): void {
    // Only run in packaged production builds
    if (!app.isPackaged) return

    // ── Send updater events to renderer ──────────────────────────────────────
    autoUpdater.on('checking-for-update', () => {
        window.webContents.send('update:checking')
    })

    autoUpdater.on('update-available', (info) => {
        window.webContents.send('update:available', {
            version: info.version,
            releaseDate: info.releaseDate,
            releaseName: info.releaseName
        })
    })

    autoUpdater.on('update-not-available', () => {
        window.webContents.send('update:not-available')
    })

    autoUpdater.on('download-progress', (progress) => {
        window.webContents.send('update:download-progress', {
            percent: Math.round(progress.percent),
            transferred: formatBytes(progress.transferred),
            total: formatBytes(progress.total),
            bytesPerSecond: formatBytes(progress.bytesPerSecond) + '/s'
        })
    })

    autoUpdater.on('update-downloaded', (info) => {
        window.webContents.send('update:downloaded', { version: info.version })

        // Show a native dialog so the user knows an update is ready
        dialog.showMessageBox(window, {
            type: 'info',
            title: 'Update Ready',
            message: `QuietlyCode ${info.version} is ready to install.`,
            detail: 'The update will be applied the next time you restart the app.',
            buttons: ['Restart Now', 'Later'],
            defaultId: 0
        }).then(({ response }) => {
            if (response === 0) autoUpdater.quitAndInstall(false, true)
        })
    })

    autoUpdater.on('error', (err) => {
        window.webContents.send('update:error', { message: err.message })
        log.error('Updater error:', err)
    })

    // Check for updates 5 seconds after launch, then every 4 hours
    setTimeout(() => autoUpdater.checkForUpdates(), 5_000)
    setInterval(() => autoUpdater.checkForUpdates(), 4 * 60 * 60 * 1_000)
}

// IPC handler — renderer can trigger a manual check
export function checkForUpdatesManually(): void {
    if (!app.isPackaged) return
    autoUpdater.checkForUpdates()
}

function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
