#!/usr/bin/env bash
# Mirrors HASpoolManager's canonical /screenshots/ tree into video/public/
# so Remotion's staticFile() can resolve them. Idempotent — safe to re-run.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SHOTS_SRC="$REPO_ROOT/screenshots"
SHOTS_DST="$REPO_ROOT/video/public/screenshots"

if [ ! -d "$SHOTS_SRC" ]; then
  echo "ERROR: screenshots not found at $SHOTS_SRC"
  echo "       Run 'npm run screenshots' from $REPO_ROOT first."
  exit 1
fi

# Refresh — wipe + copy. Cheap (rsync handles deltas if we want later).
rm -rf "$SHOTS_DST"
mkdir -p "$SHOTS_DST"

# Copy only the trees Remotion uses. Keep the layout matching staticFile() paths.
for theme in dark light; do
  for vp in desktop mobile social-square; do
    SRC="$SHOTS_SRC/$theme/$vp"
    DST="$SHOTS_DST/$theme/$vp"
    [ -d "$SRC" ] || continue
    mkdir -p "$DST"
    cp -R "$SRC/." "$DST/"
  done
done

# Section clips (desktop only)
if [ -d "$SHOTS_SRC/light/desktop/sections" ]; then
  mkdir -p "$SHOTS_DST/light/desktop/sections"
  cp -R "$SHOTS_SRC/light/desktop/sections/." "$SHOTS_DST/light/desktop/sections/"
fi
if [ -d "$SHOTS_SRC/dark/desktop/sections" ]; then
  mkdir -p "$SHOTS_DST/dark/desktop/sections"
  cp -R "$SHOTS_SRC/dark/desktop/sections/." "$SHOTS_DST/dark/desktop/sections/"
fi

COUNT=$(find "$SHOTS_DST" -type f -name "*.png" | wc -l | tr -d ' ')
echo "[setup:screenshots] mirrored $COUNT PNGs from $SHOTS_SRC → $SHOTS_DST"
