#!/usr/bin/env bash
# Fetch a Pixabay CC0 music bed for the demo video. Idempotent; safe to re-run.
# Source: Pixabay CDN — "Content License" (free for use, attribution not required).
# https://pixabay.com/service/license-summary/
set -uo pipefail

DEST="public/music.mp3"
URL="https://cdn.pixabay.com/audio/2022/05/27/audio_1808fbf07a.mp3"
UA="Mozilla/5.0 (compatible; HASpoolManager-DemoVideo/1.0)"

if [[ -f "$DEST" ]]; then
  echo "music: $DEST already exists ($(stat -f%z "$DEST" 2>/dev/null || stat -c%s "$DEST") bytes), skipping"
  exit 0
fi

mkdir -p "$(dirname "$DEST")"
echo "music: fetching $URL → $DEST"
if curl -fsSL --max-time 30 -A "$UA" "$URL" -o "$DEST.tmp"; then
  mv "$DEST.tmp" "$DEST"
  echo "music: ok ($(stat -f%z "$DEST" 2>/dev/null || stat -c%s "$DEST") bytes)"
else
  rm -f "$DEST.tmp"
  echo "music: download failed — render will be silent (this is fine)"
  exit 0
fi
