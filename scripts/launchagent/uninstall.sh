#!/usr/bin/env bash
# Uninstalls the marketing-screenshots LaunchAgent.

set -euo pipefail

PLIST_NAME="com.haspoolmanager.screenshots"
DST_PLIST="$HOME/Library/LaunchAgents/$PLIST_NAME.plist"

if [ -f "$DST_PLIST" ]; then
  launchctl unload "$DST_PLIST" 2>/dev/null || true
  rm -f "$DST_PLIST"
  echo "Uninstalled: $DST_PLIST"
else
  echo "No agent installed at $DST_PLIST — nothing to do."
fi
