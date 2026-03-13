# Quietly — Commercial Deployment Guide

Source code stays in a **private** GitHub repo. Installers are served from
**your own domain** — no GitHub URLs are ever exposed to users.

---

## Architecture overview

```
Private GitHub repo (source only)
        │
        │  git push --tags v1.x.x
        ▼
GitHub Actions CI  (ubuntu / windows / macos runners)
        │
        │  scp / rsync
        ▼
Your release server  https://releases.quietlycode.app
  /v1.0.0/  Quietly-Setup-1.0.0.exe
            Quietly-1.0.0-universal.dmg
            Quietly-1.0.0.AppImage
            Quietly-1.0.0.deb
            Quietly-1.0.0.rpm
            latest.yml / latest-mac.yml / latest-linux.yml
  /latest → symlink to /v1.0.0/
  version.txt  →  "1.0.0"
        │
        │  auto-updater (electron-updater generic provider)
        │  download page (web/download.html)
        │  install script (scripts/install.sh)
        ▼
End users — never see GitHub
```

---

## 1  One-time setup

### 1.1  Replace domain placeholders

Search the repo for `releases.quietlycode.app` and `quietlycode.app`
and replace with your actual domain in:

| File | Change |
|------|--------|
| `electron-builder.yml` | `publish.url` |
| `web/download.html` | `RELEASES_BASE`, `INSTALL_URL` |
| `web/download-redirector.js` | `RELEASES_BASE` default |
| `scripts/install.sh` | `RELEASES_BASE` |
| `build/PKGBUILD` | `_base` |

### 1.2  App identity

Edit `electron-builder.yml`:
- `appId` — reverse-DNS, e.g. `com.yourcompany.quietlycode`
- `copyright` — your legal name

Edit `package.json`:
- `version` — start at `1.0.0`

---

## 2  Release server setup

On your server (nginx / Caddy / Apache):

```
/var/www/releases.quietlycode.app/public/
  v1.0.0/
    Quietly-Setup-1.0.0.exe
    Quietly-1.0.0-universal.dmg
    Quietly-1.0.0.AppImage
    ...
    latest.yml
    latest-linux.yml
    latest-mac.yml
  latest   →  symlink  →  v1.0.0/
  version.txt            (contains: 1.0.0)
```

Serve the directory as static files. No auth — files are public by URL.

**Nginx example:**
```nginx
server {
    server_name releases.quietlycode.app;
    root /var/www/releases.quietlycode.app/public;
    autoindex off;
    location / { try_files $uri $uri/ =404; }
}
```

### SSH deploy key

Generate a dedicated deploy key (no passphrase):
```bash
ssh-keygen -t ed25519 -C "quietlycode-ci" -f ~/.ssh/quietlycode_deploy
```
- Add the **public key** to `~/.ssh/authorized_keys` on your server
- Add the **private key** as `DEPLOY_KEY` GitHub secret (see §5)

---

## 3  Code signing

### Windows (Authenticode)

1. Buy an OV or EV code-signing cert (DigiCert, Sectigo, SSL.com).
2. Export as `.pfx`, base64-encode it:
   ```bash
   base64 -i certificate.pfx | tr -d '\n'
   ```
3. Add GitHub secrets: `WIN_CSC_LINK` (base64) + `WIN_CSC_KEY_PASSWORD`
4. Uncomment the `CSC_LINK` lines in `.github/workflows/release.yml`.

### macOS (Notarization)

1. Join the [Apple Developer Program](https://developer.apple.com) ($99/yr).
2. Create a **Developer ID Application** certificate → export as `.p12`.
3. Get an **App-Specific Password** from appleid.apple.com.
4. Find your **Team ID** at developer.apple.com/account.
5. Add secrets: `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`, `MAC_CSC_LINK`, `MAC_CSC_KEY_PASSWORD`.
6. Uncomment the Apple env vars in the workflow.

---

## 4  Build icons

Run once before first release:
```bash
bash scripts/prepare-icons.sh
```
Requires ImageMagick. Output: `build/icon.{png,ico,icns}`.

---

## 5  Releasing a new version

```bash
# 1. Bump version
npm version patch    # or minor / major

# 2. Push tag — CI starts automatically
git push --follow-tags
```

CI will:
1. Build on all three platforms in parallel
2. SCP the installers to your server under `/v<version>/`
3. Update the `latest` symlink and copy `latest.yml` files to the root
4. Patch `web/download.html` with the real version and commit back to main
5. Write `version.txt` so the Linux install script knows the current version

---

## 6  GitHub secrets summary

| Secret | Purpose |
|--------|---------|
| `DEPLOY_HOST` | Your server hostname, e.g. `releases.quietlycode.app` |
| `DEPLOY_USER` | SSH username on the server, e.g. `deploy` |
| `DEPLOY_KEY` | Contents of the private deploy SSH key |
| `DEPLOY_PATH` | Remote directory, e.g. `/var/www/releases.quietlycode.app/public` |
| `WIN_CSC_LINK` | base64-encoded Windows .pfx cert |
| `WIN_CSC_KEY_PASSWORD` | Windows .pfx password |
| `APPLE_ID` | Apple ID email |
| `APPLE_APP_SPECIFIC_PASSWORD` | App-specific password |
| `APPLE_TEAM_ID` | 10-char Apple Team ID |
| `MAC_CSC_LINK` | base64-encoded macOS .p12 cert |
| `MAC_CSC_KEY_PASSWORD` | macOS .p12 password |

Add at: **GitHub repo → Settings → Secrets and variables → Actions**

---

## 7  Auto-updater

`src/main/updater.ts` uses `electron-updater` with the `generic` provider.
It reads `latest.yml` from `https://releases.quietlycode.app/latest.yml`.
No configuration needed — `electron-builder.yml` supplies the URL.

---

## 8  Download page

Copy `web/download.html` into your website. It auto-detects the visitor's OS
and shows the correct download button, with all other platforms listed below.

For a smart `/download` redirect (Node.js/Express):
```js
const { downloadHandler } = require('./web/download-redirector')
app.get('/download', downloadHandler)
```

---

## 9  Linux one-line install

Host `scripts/install.sh` at `https://quietlycode.app/install.sh`.
Users install with:
```bash
curl -fsSL https://quietlycode.app/install.sh | bash
```
The script reads `version.txt` from your release server to resolve the current version.
