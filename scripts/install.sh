#!/usr/bin/env bash
# QuietlyCode Installer for Linux
# Usage: curl -fsSL https://quietlycode.app/install.sh | bash
set -euo pipefail

# ── Configuration ─────────────────────────────────────────────────────────────
# Replace with your actual releases server URL
RELEASES_BASE="https://releases.quietlycode.app"
INSTALL_DIR="$HOME/.local/bin"
APP_DIR="$HOME/.local/share/quietlycode"
DESKTOP_DIR="$HOME/.local/share/applications"
ICON_DIR="$HOME/.local/share/icons/hicolor/512x512/apps"

# ── Detect architecture ───────────────────────────────────────────────────────
ARCH=$(uname -m)
case "$ARCH" in
  x86_64)  ARCH_SUFFIX=""      ;;   # primary, no suffix
  aarch64) ARCH_SUFFIX="-arm64" ;;
  *)
    echo "Unsupported architecture: $ARCH"
    exit 1
    ;;
esac

# ── Fetch latest version from release server ──────────────────────────────────
echo "Fetching latest QuietlyCode release..."
# The server exposes a plain-text version file updated on each deploy.
# Fall back to resolving the 'latest' symlink directory.
if VERSION=$(curl -fsSL --max-time 10 "${RELEASES_BASE}/version.txt" 2>/dev/null); then
  VERSION="${VERSION// /}"   # trim whitespace
else
  echo "Could not determine latest version. Check your internet connection."
  exit 1
fi

APPIMAGE_NAME="QuietlyCode-${VERSION}${ARCH_SUFFIX}.AppImage"
DOWNLOAD_URL="${RELEASES_BASE}/latest/${APPIMAGE_NAME}"

echo "Installing QuietlyCode ${VERSION} (${ARCH})..."

# ── Download ─────────────────────────────────────────────────────────────────
mkdir -p "$APP_DIR" "$INSTALL_DIR" "$DESKTOP_DIR" "$ICON_DIR"

curl -fsSL --progress-bar -o "$APP_DIR/QuietlyCode.AppImage" "$DOWNLOAD_URL"
chmod +x "$APP_DIR/QuietlyCode.AppImage"

# ── Symlink to PATH ───────────────────────────────────────────────────────────
ln -sf "$APP_DIR/QuietlyCode.AppImage" "$INSTALL_DIR/quietlycode"

# ── Extract icon from AppImage ────────────────────────────────────────────────
cd /tmp
"$APP_DIR/QuietlyCode.AppImage" --appimage-extract quietlycode.png 2>/dev/null || true
if [ -f /tmp/squashfs-root/quietlycode.png ]; then
  cp /tmp/squashfs-root/quietlycode.png "$ICON_DIR/quietlycode.png"
  rm -rf /tmp/squashfs-root
fi
cd - > /dev/null

# ── Desktop entry ─────────────────────────────────────────────────────────────
cat > "$DESKTOP_DIR/quietlycode.desktop" <<EOF
[Desktop Entry]
Name=QuietlyCode
Comment=Offline-First Local AI IDE
Exec=$APP_DIR/QuietlyCode.AppImage
Icon=quietlycode
Type=Application
Categories=Development;IDE;TextEditor;
Keywords=IDE;AI;Code;Editor;LLM;
StartupWMClass=QuietlyCode
EOF

update-desktop-database "$DESKTOP_DIR" 2>/dev/null || true

# ── Add ~/.local/bin to PATH if needed ────────────────────────────────────────
if [[ ":$PATH:" != *":$INSTALL_DIR:"* ]]; then
  SHELL_RC="$HOME/.bashrc"
  [[ "$SHELL" == */zsh  ]] && SHELL_RC="$HOME/.zshrc"
  [[ "$SHELL" == */fish ]] && SHELL_RC="$HOME/.config/fish/config.fish"
  echo "export PATH=\"\$PATH:$INSTALL_DIR\"" >> "$SHELL_RC"
  echo "Added $INSTALL_DIR to PATH in $SHELL_RC — restart your terminal or: source $SHELL_RC"
fi

echo ""
echo "QuietlyCode ${VERSION} installed."
echo "  Run:     quietlycode"
echo "  Or find it in your application launcher."
