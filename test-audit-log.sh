#!/bin/bash

# Test script for audit logging
# This tests the SQL execute endpoint with audit logging

API_URL="http://localhost:3000/api/v1/admin/sql/execute"
API_KEY="${API_SECRET_KEY:-test_key}"

echo "Testing audit logging for SQL execute endpoint..."
echo "================================================"
echo ""

# Test 1: Successful UPDATE (dry run)
echo "Test 1: Dry-run UPDATE"
curl -X POST "$API_URL" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "sql": "UPDATE spools SET notes = ? WHERE id = ?",
    "params": ["Test audit log", "test-id-123"],
    "dryRun": true
  }' \
  -w "\nStatus: %{http_code}\n\n"

# Test 2: Successful INSERT (dry run)
echo "Test 2: Dry-run INSERT"
curl -X POST "$API_URL" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "sql": "INSERT INTO settings (key, value) VALUES (?, ?)",
    "params": ["test_key", "test_value"],
    "dryRun": true
  }' \
  -w "\nStatus: %{http_code}\n\n"

# Test 3: Failed query (blocked SELECT)
echo "Test 3: Failed query (blocked SELECT)"
curl -X POST "$API_URL" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "sql": "SELECT * FROM spools LIMIT 1"
  }' \
  -w "\nStatus: %{http_code}\n\n"

# Test 4: Failed query (syntax error)
echo "Test 4: Failed query (syntax error)"
curl -X POST "$API_URL" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "sql": "UPDATE spools SET invalid_column = ? WHERE id = ?",
    "params": ["test", "test-id"],
    "dryRun": true
  }' \
  -w "\nStatus: %{http_code}\n\n"

echo "================================================"
echo "Checking audit log entries..."
echo ""

# Query the audit log
sqlite3 data/haspoolmanager.db <<EOF
.mode column
.headers on
SELECT 
  substr(id, 1, 8) as id,
  action,
  user_id,
  operation,
  dry_run,
  success,
  rows_affected,
  substr(error_message, 1, 30) as error,
  execution_time_ms as time_ms,
  datetime(created_at) as created
FROM audit_logs 
ORDER BY created_at DESC 
LIMIT 10;
EOF

echo ""
echo "Test complete!"

# Made with Bob
