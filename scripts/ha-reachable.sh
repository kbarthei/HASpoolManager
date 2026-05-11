#!/usr/bin/env bash
# Fast pre-flight check: can we reach the HA addon for deploy / live
# admin queries from THIS Mac right now?
#
# Returns 0 + silent on success.
# Returns 1 + one-line diagnostic on failure (stderr).
#
# Two probes, both with short timeouts so we never hang:
#   1. Hostname `homeassistant` resolves at all (DNS / mDNS / .ssh/config)
#   2. The addon's /api/v1/health responds within 4 seconds
#
# Used by:
#   - ha-addon/deploy.sh   (fail-fast before building 168MB tar)
#   - .claude/hooks        (refuse deploy/admin curl commands when off-LAN)
#   - any script wanting a yes/no on "are we on the printer network"

set -uo pipefail

# Custom URL override — useful when HA lives at a non-default IP, e.g. the
# 10.10.20.2 route this Mac currently uses.
HEALTH_URL="${HASPOOLMANAGER_HEALTH_URL:-http://homeassistant:3001/api/v1/health}"
HOST_PROBE="${HASPOOLMANAGER_SSH_HOST:-homeassistant}"

# 1. Hostname resolution. `getent` is missing on macOS; use a guarded ping
#    that just resolves+sends one ICMP packet with a 2s deadline.
if ! ping -c 1 -t 2 "$HOST_PROBE" >/dev/null 2>&1; then
  echo "ha-reachable: cannot resolve/reach '$HOST_PROBE' (off-LAN or DNS down)" >&2
  exit 1
fi

# 2. Addon HTTP. -fsS: fail on HTTP errors, silent, show errors only on fail.
#    --max-time 4: we want this entire check to stay under ~6 seconds total.
if ! curl -fsS --max-time 4 "$HEALTH_URL" >/dev/null 2>&1; then
  echo "ha-reachable: '$HOST_PROBE' resolves but $HEALTH_URL didn't respond (addon down or 3001 firewalled)" >&2
  exit 1
fi

exit 0
