#!/usr/bin/env bash
# Uninstalls HASpoolManager LaunchAgents on this Mac.
#
# Usage:
#   bash scripts/launchagent/uninstall.sh             # all agents
#   bash scripts/launchagent/uninstall.sh screenshots # specific agent

set -euo pipefail

declare -a LABELS=(
  "com.haspoolmanager.screenshots"
  "com.haspoolmanager.verify-backups"
)

filter="${1:-}"

for label in "${LABELS[@]}"; do
  short="${label#com.haspoolmanager.}"
  [ -n "$filter" ] && [ "$filter" != "$short" ] && continue

  dst="$HOME/Library/LaunchAgents/$label.plist"
  if [ -f "$dst" ]; then
    launchctl unload "$dst" 2>/dev/null || true
    rm -f "$dst"
    echo "✓ uninstalled $label"
  else
    echo "(nothing installed at $dst)"
  fi
done
