#!/usr/bin/env bash
set -e

# Read addon options
CONFIG_PATH=/data/options.json

if [ -f "$CONFIG_PATH" ]; then
  export LOG_LEVEL=$(jq -r '.log_level // "info"' "$CONFIG_PATH")

  ANTHROPIC_KEY=$(jq -r '.anthropic_api_key // ""' "$CONFIG_PATH")
  if [ -n "$ANTHROPIC_KEY" ] && [ "$ANTHROPIC_KEY" != "null" ]; then
    export ANTHROPIC_API_KEY="$ANTHROPIC_KEY"
  fi
fi

# Ensure data directory exists
mkdir -p /config

# Set database path
export SQLITE_PATH=/config/haspoolmanager.db
export DATABASE_PROVIDER=sqlite
export HA_ADDON=true

echo "Starting HASpoolManager..."
echo "  Database: $SQLITE_PATH"
echo "  Log Level: $LOG_LEVEL"

exec node server.js
