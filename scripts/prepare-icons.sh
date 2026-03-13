#!/usr/bin/env bash
# Converts assets/images/logo.png → build/icon.{png,ico,icns}
# Run once before packaging. Requires: imagemagick, png2icns (optional)
set -euo pipefail

SRC="assets/images/logo.png"
DEST="build"

echo "Preparing icons from $SRC..."

# ── Linux icon (512×512 PNG) ──────────────────────────────────────────────────
convert "$SRC" -resize 512x512 "$DEST/icon.png"
echo "  ✓ build/icon.png (Linux)"

# ── Windows icon (.ico with multiple sizes) ───────────────────────────────────
convert "$SRC" \
  \( -clone 0 -resize 16x16   \) \
  \( -clone 0 -resize 32x32   \) \
  \( -clone 0 -resize 48x48   \) \
  \( -clone 0 -resize 64x64   \) \
  \( -clone 0 -resize 128x128 \) \
  \( -clone 0 -resize 256x256 \) \
  -delete 0 "$DEST/icon.ico"
echo "  ✓ build/icon.ico (Windows)"

# ── macOS icon (.icns) ────────────────────────────────────────────────────────
# Method 1: png2icns (install with: brew install libicns)
if command -v png2icns &>/dev/null; then
  TMP=$(mktemp -d)
  for size in 16 32 64 128 256 512 1024; do
    convert "$SRC" -resize "${size}x${size}" "$TMP/icon_${size}x${size}.png"
  done
  png2icns "$DEST/icon.icns" "$TMP"/*.png
  rm -rf "$TMP"
  echo "  ✓ build/icon.icns (macOS — via png2icns)"

# Method 2: iconutil on macOS
elif command -v iconutil &>/dev/null; then
  ICONSET=$(mktemp -d)/icon.iconset
  mkdir -p "$ICONSET"
  for size in 16 32 64 128 256 512; do
    convert "$SRC" -resize "${size}x${size}"     "$ICONSET/icon_${size}x${size}.png"
    convert "$SRC" -resize "$((size*2))x$((size*2))" "$ICONSET/icon_${size}x${size}@2x.png"
  done
  iconutil -c icns -o "$DEST/icon.icns" "$ICONSET"
  rm -rf "$(dirname "$ICONSET")"
  echo "  ✓ build/icon.icns (macOS — via iconutil)"
else
  echo "  ⚠ Skipping .icns: install imagemagick + png2icns (Linux) or run on macOS"
  echo "    brew install libicns    # macOS/Homebrew"
fi

echo ""
echo "Done. Icons written to build/"
