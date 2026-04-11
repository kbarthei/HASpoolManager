#!/usr/bin/env bash
# Builds the Next.js standalone output and stages a complete addon package
# OUTSIDE of iCloud (in /tmp) so file copies aren't munged by iCloud sync.
# The final tar is written to /tmp/haspoolmanager-addon.tar.gz.
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ADDON_SRC="$REPO_DIR/ha-addon/haspoolmanager"
STAGE_DIR="/tmp/haspool-addon-build"
TAR_OUT="/tmp/haspoolmanager-addon.tar.gz"

cd "$REPO_DIR"

echo "==> Building Next.js standalone (HA_ADDON=true)..."
HA_ADDON=true npm run build

echo "==> Staging into $STAGE_DIR..."
rm -rf "$STAGE_DIR"
mkdir -p "$STAGE_DIR/haspoolmanager"

# Copy addon files (config.yaml, Dockerfile, nginx.conf, run.sh, etc.)
# Exclude any old app/ subfolder from the source.
for f in config.yaml Dockerfile nginx.conf run.sh DOCS.md icon.png.placeholder logo.png.placeholder; do
  if [ -f "$ADDON_SRC/$f" ]; then
    cp "$ADDON_SRC/$f" "$STAGE_DIR/haspoolmanager/$f"
  fi
done

# Copy the standalone server (includes minimal node_modules)
mkdir -p "$STAGE_DIR/haspoolmanager/app"
cp -R .next/standalone/. "$STAGE_DIR/haspoolmanager/app/"
mkdir -p "$STAGE_DIR/haspoolmanager/app/.next"
cp -R .next/static "$STAGE_DIR/haspoolmanager/app/.next/static"
cp -R public "$STAGE_DIR/haspoolmanager/app/public"

# Bundle the sync worker (TypeScript → single JS file via esbuild)
echo "==> Bundling sync worker..."
npx esbuild scripts/start-sync-worker.ts \
  --bundle --platform=node --target=node22 --format=esm \
  --external:better-sqlite3 --external:ws \
  --outfile="$STAGE_DIR/haspoolmanager/app/sync-worker.js" 2>&1 | tail -1

# Ensure ws is in the standalone node_modules (may not be traced by Next.js)
if [ ! -d "$STAGE_DIR/haspoolmanager/app/node_modules/ws" ] && [ -d "node_modules/ws" ]; then
  cp -R node_modules/ws "$STAGE_DIR/haspoolmanager/app/node_modules/ws"
fi

# Sanity checks
if [ ! -f "$STAGE_DIR/haspoolmanager/app/node_modules/next/package.json" ]; then
  echo "ERROR: next package.json missing — cp lost files during staging"
  exit 1
fi
if [ ! -f "$STAGE_DIR/haspoolmanager/app/server.js" ]; then
  echo "ERROR: server.js missing"
  exit 1
fi

echo "==> Packing tar..."
rm -f "$TAR_OUT"
tar -czf "$TAR_OUT" -C "$STAGE_DIR" haspoolmanager

ls -lh "$TAR_OUT"
echo "==> Done. Copy $TAR_OUT to /Volumes/addons/ on HA host."
