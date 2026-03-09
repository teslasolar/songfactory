#!/bin/bash
# extract.sh — Pull audio + artwork from a YouTube video
# Usage: ./extract.sh VIDEO_ID "Song Title"
#
# Requirements:
#   - yt-dlp (pip install yt-dlp)
#   - ImageMagick (apt install imagemagick) OR ffmpeg
#
# Output: release_bundles/<TITLE>/<TITLE>.wav + <TITLE>_artwork.jpg

set -euo pipefail

VIDEO_ID="${1:?Usage: ./extract.sh VIDEO_ID \"Song Title\"}"
TITLE="${2:-$VIDEO_ID}"

# Sanitize title for filesystem
SAFE_TITLE=$(echo "$TITLE" | sed 's/[^a-zA-Z0-9_\- ]//g' | tr ' ' '_' | cut -c1-80)
BUNDLE_DIR="release_bundles/${SAFE_TITLE}"
URL="https://youtube.com/watch?v=${VIDEO_ID}"

mkdir -p "$BUNDLE_DIR"

echo "=== Song Factory: Extracting ${TITLE} ==="
echo "Video: ${URL}"
echo "Bundle: ${BUNDLE_DIR}"

# Step 1: Download best audio as WAV
echo ""
echo "--- Downloading audio (WAV) ---"
yt-dlp -x --audio-format wav --audio-quality 0 \
  -o "${BUNDLE_DIR}/${SAFE_TITLE}.wav" \
  "$URL"

# Step 2: Grab the thumbnail
echo ""
echo "--- Downloading thumbnail ---"
yt-dlp --write-thumbnail --skip-download \
  -o "${BUNDLE_DIR}/${SAFE_TITLE}" \
  "$URL"

# Step 3: Convert thumbnail to 3000x3000 JPG (DistroKid requirement)
echo ""
echo "--- Converting artwork to 3000x3000 JPG ---"
THUMB_FILE=$(find "$BUNDLE_DIR" -maxdepth 1 \( -name "*.webp" -o -name "*.png" -o -name "*.jpg" \) ! -name "*_artwork*" | head -1)

if [ -n "$THUMB_FILE" ]; then
  if command -v convert &> /dev/null; then
    convert "$THUMB_FILE" -resize 3000x3000! \
      -quality 95 -colorspace sRGB \
      "${BUNDLE_DIR}/${SAFE_TITLE}_artwork.jpg"
  elif command -v ffmpeg &> /dev/null; then
    ffmpeg -i "$THUMB_FILE" -vf "scale=3000:3000" -q:v 2 \
      "${BUNDLE_DIR}/${SAFE_TITLE}_artwork.jpg"
  else
    echo "WARNING: Neither ImageMagick nor ffmpeg found. Artwork not converted."
  fi
else
  echo "WARNING: No thumbnail downloaded."
fi

# Summary
echo ""
echo "=== Bundle ready ==="
ls -la "$BUNDLE_DIR/"
echo ""
echo "Audio:   ${BUNDLE_DIR}/${SAFE_TITLE}.wav"
echo "Artwork: ${BUNDLE_DIR}/${SAFE_TITLE}_artwork.jpg"
