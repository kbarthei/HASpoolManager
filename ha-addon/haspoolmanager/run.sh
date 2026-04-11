#!/bin/sh
set -e

CONFIG_PATH=/data/options.json

if [ -f "$CONFIG_PATH" ]; then
  export LOG_LEVEL=$(jq -r '.log_level // "info"' "$CONFIG_PATH")
  ANTHROPIC_KEY=$(jq -r '.anthropic_api_key // ""' "$CONFIG_PATH")
  if [ -n "$ANTHROPIC_KEY" ] && [ "$ANTHROPIC_KEY" != "null" ]; then
    export ANTHROPIC_API_KEY="$ANTHROPIC_KEY"
  fi
  API_KEY_OPT=$(jq -r '.api_key // ""' "$CONFIG_PATH")
  if [ -n "$API_KEY_OPT" ] && [ "$API_KEY_OPT" != "null" ]; then
    # Next.js lib/auth.ts reads API_SECRET_KEY for Bearer token auth
    export API_SECRET_KEY="$API_KEY_OPT"
  fi
fi

mkdir -p /config /run/nginx

export SQLITE_PATH=/config/haspoolmanager.db
export HA_ADDON=true
export HOSTNAME=127.0.0.1
export PORT=3002

echo "==> HASpoolManager starting"
echo "    DB: $SQLITE_PATH"
echo "    Next.js will listen on 127.0.0.1:3002"
echo "    nginx will listen on :3000 (HA ingress) + :3001 (direct PWA access)"

# Start Next.js in background
cd /app && node server.js &
NEXT_PID=$!

# Start sync worker in background (waits 5s for Next.js to boot)
if [ -n "$SUPERVISOR_TOKEN" ]; then
  echo "==> starting sync worker (HA API available)"
  (sleep 5 && cd /app && node sync-worker.js) &
  SYNC_PID=$!
else
  echo "==> sync worker skipped (no SUPERVISOR_TOKEN — not running as HA addon)"
  SYNC_PID=""
fi

# Forward signals to all processes
trap "kill $NEXT_PID $SYNC_PID 2>/dev/null || true; exit 0" TERM INT

# Start nginx in foreground (auto-retries upstream while Next.js boots)
echo "==> starting nginx"
exec nginx -c /etc/nginx/nginx.conf -g "daemon off;"
