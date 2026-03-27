#!/bin/bash
# Smoke test: verify the app starts and key pages respond
# Usage: ./scripts/smoke-test.sh [base_url]

BASE="${1:-http://localhost:3000}"
PASS=0
FAIL=0

check() {
  local name="$1"
  local url="$2"
  local expect_text="$3"

  local status
  local body
  body=$(curl -s -o /dev/null -w "%{http_code}" "$url" 2>/dev/null)

  if [ "$body" = "200" ]; then
    if [ -n "$expect_text" ]; then
      local content
      content=$(curl -s "$url" 2>/dev/null)
      if echo "$content" | grep -q "$expect_text"; then
        echo "  ✓ $name ($url)"
        PASS=$((PASS + 1))
      else
        echo "  ✗ $name — 200 but missing '$expect_text'"
        FAIL=$((FAIL + 1))
      fi
    else
      echo "  ✓ $name ($url)"
      PASS=$((PASS + 1))
    fi
  else
    echo "  ✗ $name — HTTP $body ($url)"
    FAIL=$((FAIL + 1))
  fi
}

echo "Smoke test: $BASE"
echo ""

# Wait for server to be ready (max 30s)
echo "Waiting for server..."
for i in $(seq 1 30); do
  if curl -s -o /dev/null "$BASE/api/v1/health" 2>/dev/null; then
    echo "Server ready after ${i}s"
    echo ""
    break
  fi
  if [ "$i" = "30" ]; then
    echo "  ✗ Server not responding after 30s"
    exit 1
  fi
  sleep 1
done

echo "API endpoints:"
check "Health" "$BASE/api/v1/health" '"status":"ok"'
check "Spools API" "$BASE/api/v1/spools" '"filament"'
check "Printers API" "$BASE/api/v1/printers" '"amsSlots"'
check "Tags API" "$BASE/api/v1/tags" '"tagUid"'

echo ""
echo "Pages:"
check "Dashboard" "$BASE" "Active Spools"
check "Spools" "$BASE/spools" "spools"
check "AMS" "$BASE/ams" "AMS"
check "Storage" "$BASE/storage" "Spool Rack"
check "Orders" "$BASE/orders" "Orders"
check "Print History" "$BASE/prints" "Print History"
check "Spool History" "$BASE/history" "Spool History"

echo ""
echo "Result: $PASS passed, $FAIL failed"

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
