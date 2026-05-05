#!/usr/bin/env bash
# Symlinks the canonical /screenshots/ tree into video/public/screenshots/ so
# Remotion's staticFile() resolves them. Single source of truth — no duplication,
# no sync drift. Idempotent — safe to re-run.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SHOTS_SRC_ABS="$REPO_ROOT/screenshots"
SHOTS_DST="$REPO_ROOT/video/public/screenshots"
SHOTS_DST_PARENT="$REPO_ROOT/video/public"

if [ ! -d "$SHOTS_SRC_ABS" ]; then
  echo "ERROR: screenshots not found at $SHOTS_SRC_ABS"
  echo "       Run 'npm run screenshots' from $REPO_ROOT first."
  exit 1
fi

# Wipe whatever is at the destination — file, dir, or stale symlink.
rm -rf "$SHOTS_DST"
mkdir -p "$SHOTS_DST_PARENT"

# Relative symlink so the repo is portable across machines.
# From video/public/, walk up to repo root, then into screenshots.
ln -s ../../screenshots "$SHOTS_DST"

# Verify
if [ ! -d "$SHOTS_DST" ]; then
  echo "ERROR: symlink creation failed"
  exit 1
fi
COUNT=$(find -L "$SHOTS_DST" -maxdepth 4 -type f -name "*.png" 2>/dev/null | wc -l | tr -d ' ')
echo "[setup:screenshots] symlinked $SHOTS_DST → ../../screenshots ($COUNT PNGs reachable)"
