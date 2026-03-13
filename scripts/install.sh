#!/usr/bin/env bash
# Quietly Installer for Linux
# Usage: curl -fsSL https://quietlycode.netlify.app/install.sh | bash
set -euo pipefail

# ── Configuration ─────────────────────────────────────────────────────────────
GH_REPO="mibrahimzarar/Quietly"
INSTALL_DIR="$HOME/.local/bin"
APP_DIR="$HOME/.local/share/quietly"
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

# ── Fetch latest release from GitHub ──────────────────────────────────────────
echo "Fetching latest Quietly release from GitHub..."

RELEASE_JSON=$(curl -fsSL --max-time 15 "https://api.github.com/repos/${GH_REPO}/releases/latest" 2>/dev/null) || {
  echo "Could not reach GitHub. Check your internet connection."
  exit 1
}

VERSION=$(echo "$RELEASE_JSON" | grep -oP '"tag_name"\s*:\s*"\K[^"]+')
if [ -z "$VERSION" ]; then
  echo "Could not determine latest version."
  exit 1
fi

# Strip leading 'v' for filename matching
VER_NUM="${VERSION#v}"

# Find the AppImage download URL for this architecture
APPIMAGE_PATTERN="Quietly-${VER_NUM}${ARCH_SUFFIX}.AppImage"
DOWNLOAD_URL=$(echo "$RELEASE_JSON" | grep -oP '"browser_download_url"\s*:\s*"\K[^"]+' | grep -F "$APPIMAGE_PATTERN" | head -1)

if [ -z "$DOWNLOAD_URL" ]; then
  # Try matching any .AppImage if exact name doesn't match
  DOWNLOAD_URL=$(echo "$RELEASE_JSON" | grep -oP '"browser_download_url"\s*:\s*"\K[^"]+' | grep '\.AppImage$' | head -1)
fi

if [ -z "$DOWNLOAD_URL" ]; then
  echo "No AppImage found for ${ARCH} in release ${VERSION}."
  echo "Visit https://github.com/${GH_REPO}/releases/latest for manual download."
  exit 1
fi

echo "Installing Quietly ${VERSION} (${ARCH})..."

# ── Download ─────────────────────────────────────────────────────────────────
mkdir -p "$APP_DIR" "$INSTALL_DIR" "$DESKTOP_DIR" "$ICON_DIR"

curl -fsSL --progress-bar -o "$APP_DIR/Quietly.AppImage" "$DOWNLOAD_URL"
chmod +x "$APP_DIR/Quietly.AppImage"

# ── Symlink to PATH ───────────────────────────────────────────────────────────
ln -sf "$APP_DIR/Quietly.AppImage" "$INSTALL_DIR/quietly"

# ── Extract icon from AppImage ────────────────────────────────────────────────
cd /tmp
"$APP_DIR/Quietly.AppImage" --appimage-extract quietly.png 2>/dev/null || true
if [ -f /tmp/squashfs-root/quietly.png ]; then
  cp /tmp/squashfs-root/quietly.png "$ICON_DIR/quietly.png"
  rm -rf /tmp/squashfs-root
fi
cd - > /dev/null

# ── Desktop entry ─────────────────────────────────────────────────────────────
cat > "$DESKTOP_DIR/quietly.desktop" <<EOF
[Desktop Entry]
Name=Quietly
Comment=Offline-First Local AI IDE
Exec=$APP_DIR/Quietly.AppImage
Icon=quietly
Type=Application
Categories=Development;IDE;TextEditor;
Keywords=IDE;AI;Code;Editor;LLM;
StartupWMClass=Quietly
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
echo "Quietly ${VERSION} installed."
echo "  Run:     quietly"
echo "  Or find it in your application launcher."
