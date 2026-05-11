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

# ── Pre-flight: are we on the printer LAN at all? ──────────────────────────
# Yesterday we wasted a build cycle (168MB tar, ~90s) before scp failed with
# "Connection closed" because the Mac wasn't on the right network. Now we
# fail in ~2 seconds instead.
if ! bash "$REPO_DIR/scripts/ha-reachable.sh"; then
  echo "==> deploy aborted — see message above. If you're sure the addon is reachable" >&2
  echo "    at a different host/IP, set HASPOOLMANAGER_SSH_HOST + HASPOOLMANAGER_HEALTH_URL." >&2
  exit 1
fi

# ── Version bump ────────────────────────────────────────────────────────────
if [ "${1:-}" != "--no-bump" ]; then
  current=$(grep -E '^version:' "$CONFIG_YAML" | sed -E 's/.*"([^"]+)".*/\1/')
  IFS='.' read -r maj min patch <<< "$current"
  new="${maj}.${min}.$((patch + 1))"
  sed -i '' "s/^version: \"${current}\"/version: \"${new}\"/" "$CONFIG_YAML"
  echo "==> version ${current} → ${new}"
fi
version=$(grep -E '^version:' "$CONFIG_YAML" | sed -E 's/.*"([^"]+)".*/\1/')

# Keep package.json version in sync with addon config so /api/v1/health
# reports the right version.
sed -i '' "s/\"version\": \"[^\"]*\"/\"version\": \"${version}\"/" "$REPO_DIR/package.json"

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

# ── GitHub Release ─────────────────────────────────────────────────────────
echo "==> creating GitHub release v${version}..."
git tag -a "v${version}" -m "Release v${version}" 2>/dev/null || echo "    (tag v${version} already exists, skipping)"
git push origin "v${version}" 2>/dev/null || true
if command -v gh &>/dev/null; then
  gh release create "v${version}" --generate-notes --latest 2>/dev/null || echo "    (release already exists)"
else
  echo "    (gh CLI not available, skipping release creation)"
fi

echo ""
echo "==> Live on HA:"
ssh "$HA_HOST" 'ha apps info local_haspoolmanager 2>&1 | grep -E "^(version|state):"'

# ── Post-deploy version-match guard ────────────────────────────────────────
# Poll /api/v1/health until the running version equals the one we just
# shipped, or fail loud after a timeout. Catches: addon failed to restart
# after install, ha apps update silently skipped, or the install picked
# up a stale tarball. Without this, the operator only finds out hours
# later when something breaks unexpectedly.
echo "==> verifying running version reports ${version}..."
HEALTH_URL_DEFAULT="http://homeassistant:3001/api/v1/health"
HEALTH_URL="${HASPOOLMANAGER_HEALTH_URL:-$HEALTH_URL_DEFAULT}"
deadline=$(($(date +%s) + 60))
seen=""
while [ "$(date +%s)" -lt "$deadline" ]; do
  seen=$(curl -fsS --max-time 4 "$HEALTH_URL" 2>/dev/null | sed -nE 's/.*"version":"([^"]+)".*/\1/p' || true)
  if [ "$seen" = "$version" ]; then
    echo "    ✓ /health reports v${version}"
    break
  fi
  sleep 3
done
if [ "$seen" != "$version" ]; then
  echo "==> WARNING — /health reports '${seen:-no-response}' but we just deployed v${version}." >&2
  echo "    Addon may not have restarted, or pulled a stale tar. Check 'ha apps logs local_haspoolmanager'." >&2
  exit 1
fi

echo "==> Deployed v${version}"
