#!/usr/bin/env bash
# Installs the marketing-screenshots LaunchAgent on this Mac.
# Idempotent: re-running it overwrites the existing agent and reloads it.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PLIST_NAME="com.haspoolmanager.screenshots"
SRC_PLIST="$REPO_ROOT/scripts/launchagent/$PLIST_NAME.plist"
DST_PLIST="$HOME/Library/LaunchAgents/$PLIST_NAME.plist"

if [ ! -f "$SRC_PLIST" ]; then
  echo "ERROR: source plist missing at $SRC_PLIST"
  exit 1
fi

# Verify the addon is reachable before scheduling the agent.
if ! curl -fsS --max-time 5 "http://homeassistant.local:3001/api/v1/health" >/dev/null 2>&1; then
  echo "WARNING: cannot reach http://homeassistant.local:3001/api/v1/health"
  echo "         The agent will be installed, but the first run will fail until"
  echo "         the Mac is on the same LAN as Home Assistant."
fi

# Substitute __REPO_ROOT__ placeholder before installing.
mkdir -p "$HOME/Library/LaunchAgents"
sed "s|__REPO_ROOT__|$REPO_ROOT|g" "$SRC_PLIST" > "$DST_PLIST"

# Reload (unload-or-ignore, then load).
launchctl unload "$DST_PLIST" 2>/dev/null || true
launchctl load "$DST_PLIST"

echo "Installed: $DST_PLIST"
echo "Schedule:  daily at 03:00 local time"
echo "Logs:      $REPO_ROOT/marketing/launchagent.{stdout,stderr}.log"
echo
echo "Trigger now (smoke test):"
echo "  launchctl start $PLIST_NAME"
echo
echo "Uninstall:"
echo "  bash scripts/launchagent/uninstall.sh"
