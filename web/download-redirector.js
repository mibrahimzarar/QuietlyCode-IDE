/**
 * Quietly OS-aware download redirector
 *
 * Serves GET /download → detects OS from User-Agent → 302-redirects to the
 * correct installer hosted on your own releases server. No GitHub URLs exposed.
 *
 * Usage (standalone):
 *   node download-redirector.js
 *
 * Usage (Express middleware):
 *   const { downloadHandler } = require('./download-redirector')
 *   app.get('/download', downloadHandler)
 */

'use strict'

// ── Configuration ─────────────────────────────────────────────────────────────
// Replace with your actual releases server URL.
// Files are expected at:  RELEASES_BASE/latest/<filename>
const RELEASES_BASE = process.env.RELEASES_BASE || 'https://releases.quietlycode.app'

// VERSION is injected by CI (sed replacement) or resolved from your server.
// Leave as 'latest' to always serve from the /latest symlink directory.
const VERSION = process.env.APP_VERSION || 'latest'

// ── Asset URL builder ─────────────────────────────────────────────────────────
function assets(v) {
  const dir = `${RELEASES_BASE}/${v}`
  return {
    win: {
      x64:   `${dir}/Quietly-Setup-${v}.exe`,
      arm64: `${dir}/Quietly-Setup-${v}-arm64.exe`,
    },
    mac: {
      universal: `${dir}/Quietly-${v}-universal.dmg`,
    },
    linux: {
      appimage_x64:   `${dir}/Quietly-${v}.AppImage`,
      appimage_arm64: `${dir}/Quietly-${v}-arm64.AppImage`,
      deb_x64:        `${dir}/Quietly-${v}.deb`,
      deb_arm64:      `${dir}/Quietly-${v}-arm64.deb`,
      rpm_x64:        `${dir}/Quietly-${v}.rpm`,
    },
  }
}

// ── OS + arch detection from User-Agent ───────────────────────────────────────
function detectPlatform(ua) {
  if (!ua) return { os: 'unknown', arch: 'x64' }
  const u = ua.toLowerCase()
  let os = 'unknown'
  if (u.includes('windows'))                          os = 'windows'
  else if (u.includes('macintosh') || u.includes('mac os')) os = 'macos'
  else if (u.includes('linux'))                       os = 'linux'
  const arch = (u.includes('arm64') || u.includes('aarch64')) ? 'arm64' : 'x64'
  return { os, arch }
}

// ── Main handler ──────────────────────────────────────────────────────────────
async function downloadHandler(req, res) {
  const ua     = req.headers['user-agent'] || ''
  const { os, arch } = detectPlatform(ua)
  const format = req.query?.format?.toLowerCase()
  const a      = assets(VERSION)

  let url = null
  if (os === 'windows') {
    url = arch === 'arm64' ? a.win.arm64 : a.win.x64
  } else if (os === 'macos') {
    url = a.mac.universal
  } else if (os === 'linux') {
    if      (format === 'deb') url = arch === 'arm64' ? a.linux.deb_arm64 : a.linux.deb_x64
    else if (format === 'rpm') url = a.linux.rpm_x64
    else                       url = arch === 'arm64' ? a.linux.appimage_arm64 : a.linux.appimage_x64
  }

  if (url) {
    res.writeHead(302, { Location: url })
  } else {
    // Unknown OS — send to the download page
    res.writeHead(302, { Location: '/download' })
  }
  res.end()
}

// ── Standalone HTTP server ────────────────────────────────────────────────────
if (require.main === module) {
  const http = require('http')
  const url  = require('url')
  const PORT = process.env.PORT || 3000

  http.createServer((req, res) => {
    const parsed = url.parse(req.url, true)
    req.query = parsed.query
    if (parsed.pathname === '/download') {
      downloadHandler(req, res)
    } else if (parsed.pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'text/plain' })
      res.end('ok')
    } else {
      res.writeHead(404)
      res.end('Not found')
    }
  }).listen(PORT, () => {
    console.log(`Quietly download redirector → :${PORT}`)
    console.log(`  GET /download               auto-detect OS`)
    console.log(`  GET /download?format=deb    force .deb`)
    console.log(`  GET /download?format=rpm    force .rpm`)
  })
}

module.exports = { downloadHandler, detectPlatform }
