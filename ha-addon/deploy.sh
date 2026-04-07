#!/usr/bin/env bash
# Full deploy cycle: bump version, build, ship via scp+ssh.
#
#   ./ha-addon/deploy.sh          # bumps patch version, deploys
#   ./ha-addon/deploy.sh --no-bump # use current version (for quick re-deploy after ssh issue)
#
# Assumes SSH key auth to root@homeassistant and that /addons/ exists on HA.
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
CONFIG_YAML="$REPO_DIR/ha-addon/haspoolmanager/config.yaml"
TAR_LOCAL="/tmp/haspoolmanager-addon.tar.gz"
HA_HOST="root@homeassistant"
HA_ADDON_DIR="/addons/haspoolmanager"
HA_TAR_PATH="/addons/haspoolmanager-addon.tar.gz"

cd "$REPO_DIR"

# ── Version bump ────────────────────────────────────────────────────────────
if [ "${1:-}" != "--no-bump" ]; then
  current=$(grep -E '^version:' "$CONFIG_YAML" | sed -E 's/.*"([^"]+)".*/\1/')
  IFS='.' read -r maj min patch <<< "$current"
  new="${maj}.${min}.$((patch + 1))"
  sed -i '' "s/^version: \"${current}\"/version: \"${new}\"/" "$CONFIG_YAML"
  echo "==> version ${current} → ${new}"
fi
version=$(grep -E '^version:' "$CONFIG_YAML" | sed -E 's/.*"([^"]+)".*/\1/')

# ── Build ───────────────────────────────────────────────────────────────────
bash ha-addon/build-addon.sh

# ── Transfer tar ────────────────────────────────────────────────────────────
echo "==> scp tar to $HA_HOST..."
scp -q "$TAR_LOCAL" "$HA_HOST:$HA_TAR_PATH"

# ── Remote extract ──────────────────────────────────────────────────────────
echo "==> extracting on HA..."
ssh "$HA_HOST" "rm -rf $HA_ADDON_DIR && tar -xzf $HA_TAR_PATH -C /addons/ && rm -f $HA_TAR_PATH"

# ── Reload store + auto-update addon ────────────────────────────────────────
echo "==> reloading HA addon store..."
ssh "$HA_HOST" 'ha store reload >/dev/null 2>&1 && ha apps update local_haspoolmanager 2>&1 | tail -1'

echo ""
echo "==> Live on HA:"
ssh "$HA_HOST" 'ha apps info local_haspoolmanager 2>&1 | grep -E "^(version|state):"'
echo "==> Deployed v${version}"
