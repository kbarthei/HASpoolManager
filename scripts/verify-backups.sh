#!/usr/bin/env bash
# Verify integrity of every prod-DB snapshot in testdata/db-snapshots/
#
# We restore from these snapshots to seed the local dev DB. If a snapshot
# is silently corrupt (bad sector on the source SMB mount, interrupted
# copy, partial WAL flush), we'd only notice at restore time — by which
# point the original prod DB might have moved on.
#
# Run manually:
#   bash scripts/verify-backups.sh
#
# Or wire into a periodic LaunchAgent / cron (see docs/operator/operations-runbook.md).
#
# Exit codes:
#   0  every snapshot passed PRAGMA integrity_check
#   1  at least one snapshot is corrupt
#   2  no snapshots found (probably missing testdata/ — fresh clone?)

set -e

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SNAPSHOT_DIR="${REPO_ROOT}/testdata/db-snapshots"

if [ ! -d "$SNAPSHOT_DIR" ]; then
  echo "✗ no snapshot directory at $SNAPSHOT_DIR"
  echo "  (testdata/ is gitignored — copy a snapshot or skip this check on fresh clones)"
  exit 2
fi

# Use ls + bash glob; fall back gracefully if no .db files match.
shopt -s nullglob 2>/dev/null || true
snapshots=( "$SNAPSHOT_DIR"/*.db )
if [ ${#snapshots[@]} -eq 0 ]; then
  echo "✗ no *.db files in $SNAPSHOT_DIR"
  exit 2
fi

passed=0
failed=0
failed_files=()

echo "==> Verifying ${#snapshots[@]} snapshot(s) in $SNAPSHOT_DIR"
echo ""

for snap in "${snapshots[@]}"; do
  name="$(basename "$snap")"
  size_kb=$(du -k "$snap" | cut -f1)
  result=$(sqlite3 "$snap" "PRAGMA integrity_check;" 2>&1 | head -1)
  if [ "$result" = "ok" ]; then
    printf '  \033[32m✓\033[0m %-55s  %5s KB\n' "$name" "$size_kb"
    passed=$((passed + 1))
  else
    printf '  \033[31m✗\033[0m %-55s  %5s KB  → %s\n' "$name" "$size_kb" "$result"
    failed=$((failed + 1))
    failed_files+=("$name")
  fi
done

echo ""
echo "==> Result: $passed/${#snapshots[@]} ok"

if [ $failed -gt 0 ]; then
  echo ""
  echo "Corrupt snapshot(s):"
  for f in "${failed_files[@]}"; do
    echo "  - $f"
  done
  echo ""
  echo "Investigation steps:"
  echo "  1. cp \"<corrupt>\" /tmp/check.db && sqlite3 /tmp/check.db .dump > /dev/null"
  echo "     (will hard-fail at the bad page if the file is truly damaged)"
  echo "  2. If the snapshot was copied from /Volumes/config/, the SMB session"
  echo "     may have been interrupted — re-copy with the printer offline."
  echo "  3. Delete the corrupt file. Other snapshots still cover restore use cases."
  exit 1
fi

exit 0
