#!/usr/bin/env bash
# Installs HASpoolManager LaunchAgents on this Mac. Idempotent — re-running
# it overwrites and reloads each agent.
#
# Usage:
#   bash scripts/launchagent/install.sh             # all agents
#   bash scripts/launchagent/install.sh screenshots # specific agent
#   bash scripts/launchagent/install.sh verify-backups

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

# Map short name → plist label (and source filename).
declare -a AGENTS=(
  "screenshots:com.haspoolmanager.screenshots"
  "verify-backups:com.haspoolmanager.verify-backups"
)

filter="${1:-}"
installed_any=0

# Pre-flight (informational, doesn't block install).
if ! curl -fsS --max-time 5 "http://homeassistant.local:3001/api/v1/health" >/dev/null 2>&1; then
  echo "INFO: addon not reachable at http://homeassistant.local:3001 — agents that need it"
  echo "      (e.g. screenshots) will fail until the Mac is on the same LAN as HA."
fi

mkdir -p "$HOME/Library/LaunchAgents"

for entry in "${AGENTS[@]}"; do
  short="${entry%%:*}"
  label="${entry##*:}"
  [ -n "$filter" ] && [ "$filter" != "$short" ] && continue

  src="$REPO_ROOT/scripts/launchagent/$label.plist"
  dst="$HOME/Library/LaunchAgents/$label.plist"

  if [ ! -f "$src" ]; then
    echo "ERROR: source plist missing at $src"
    continue
  fi

  sed "s|__REPO_ROOT__|$REPO_ROOT|g" "$src" > "$dst"
  launchctl unload "$dst" 2>/dev/null || true
  launchctl load "$dst"

  echo "✓ installed $label ($short) → $dst"
  installed_any=1
done

if [ "$installed_any" = "0" ]; then
  echo "No agents matched filter '$filter'. Known: screenshots, verify-backups."
  exit 1
fi

echo
echo "Schedule:"
echo "  screenshots     — daily 03:00 (live capture, redacted, commit to /screenshots/)"
echo "  verify-backups  — daily 03:30 (sqlite3 PRAGMA integrity_check on testdata/db-snapshots/*.db)"
echo
echo "Manual smoke-test:"
echo "  launchctl start com.haspoolmanager.screenshots"
echo "  launchctl start com.haspoolmanager.verify-backups"
echo
echo "Uninstall: bash scripts/launchagent/uninstall.sh"
