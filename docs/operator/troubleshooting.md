# Troubleshooting

Common breakages, in the order you're likely to hit them.

For data-quality issues (wrong weights, stuck prints, missing usage),
see [`operations-runbook.md`](operations-runbook.md).

---

## The addon won't start

### Symptom: `ha addons restart local_haspoolmanager` hangs or fails

1. **Check the log tail:**
   ```bash
   ssh root@homeassistant "ha addons logs local_haspoolmanager 2>&1 | tail -50"
   ```

2. **Common culprits:**

| Log message | Cause | Fix |
|---|---|---|
| `SUPERVISOR_TOKEN not available` | Token not loaded from s6 env | `run.sh` normally loads it from `/run/s6/container_environment/`; if broken, reinstall addon |
| `Error: sqlite: database is malformed` | Corrupted `.db` file | See runbook §8 |
| `[migrate] Error in "..."` | A migration's `apply()` threw | Check the specific error; common: `ALTER TABLE DROP COLUMN` on SQLite <3.35 (upgrade better-sqlite3) |
| `ENOSPC: no space left on device` | HA storage full | `df -h` on the HA host; clear old addon tarballs in `/addons/` |
| `[health-check] errors=N` (N>0) | Data-integrity issue prevented startup sanity checks | Check `data_quality_log` table; usually advisory, not fatal |
| No output after `==> starting nginx` | Next.js crashed silently | Check `/app/` exists inside the container: `docker exec addon_local_haspoolmanager ls /app/server.js` |

3. **Last resort:** reinstall the addon from the tarball:
   ```bash
   scp /tmp/haspoolmanager-addon.tar.gz root@homeassistant:/addons/
   ssh root@homeassistant "rm -rf /addons/haspoolmanager && \
     tar -xzf /addons/haspoolmanager-addon.tar.gz -C /addons/ && \
     ha addons reload && ha addons start local_haspoolmanager"
   ```

---

## UI loads but HA ingress 404s

### Symptom: `/ingress/api/v1/*` returns 404, or CSS/JS assets fail to load

Usually the addon is running but nginx can't reach Next.js, or the
base-path rewriting is wrong.

1. **Check direct access on port 3001:**
   ```bash
   curl -sI http://homeassistant:3001/api/v1/health
   ```
   If this returns 200 → nginx → Next.js path is fine; issue is in HA ingress.
   If this 404s or refuses connection → Next.js itself is down.

2. **Check the HA ingress URL:** in HA UI, open the addon page, click
   "Open Web UI". Note whether the URL contains `/api/hassio_ingress/<token>`.
   If not, the addon config's `ingress: true` may not have been applied —
   restart HA Supervisor.

3. **Check nginx config inside container:**
   ```bash
   ssh root@homeassistant "docker exec addon_local_haspoolmanager cat /etc/nginx/nginx.conf | grep -A2 'location'"
   ```
   Expected: a `location /` block proxying to `127.0.0.1:3002`.

---

## Sync worker is connected to HA but nothing updates

### Symptom: you manually trigger a print, printer runs, but app doesn't reflect state changes

1. **Verify sync-worker process is running:**
   ```bash
   ssh root@homeassistant "docker exec addon_local_haspoolmanager ps aux | grep sync-worker"
   ```
   Expect one `node /app/sync-worker.js` process.

2. **Check WS connection:**
   ```bash
   ssh root@homeassistant "ha addons logs local_haspoolmanager 2>&1 | grep -E '\[ha-ws\]|\[sync-worker\]' | tail -20"
   ```
   Expected pattern:
   ```
   [ha-ws] connected
   [ha-ws] authenticated (HA 2026.x.y)
   [sync-worker] subscribed to bambu_lab_event
   [sync-worker] subscribed to state_changed
   [sync-worker] registered printer "..."
   [sync-worker] state_changed: N events received in last 60s
   ```

3. **Sync-worker subscribed but no events arriving** — likely the HA
   Bambu Lab integration has disconnected from your printer. Verify
   in HA: Settings → Devices & Services → Bambu Lab → the printer
   should show "connected".

4. **Events arriving but DB not updating** — check for a route-level
   error:
   ```bash
   ssh root@homeassistant "ha addons logs local_haspoolmanager 2>&1 | grep 'printer-sync' | tail -20"
   ```

5. **Last resort:** restart the addon to force a fresh WS handshake
   and initial-sync pull:
   ```bash
   ssh root@homeassistant "ha addons restart local_haspoolmanager"
   ```

---

## Sync worker reconnects every few minutes

### Symptom: `[ha-ws] disconnected` → `[ha-ws] connected` loops in logs

1. **Check HA Core health** — HA itself may be restarting or
   unhealthy: `ha core info`
2. **Check CPU pressure** — the sync worker needs ~1% CPU steady. If
   the HA host is maxed out (other addons? 4K camera streams?), the
   WS connection times out and reconnects.
3. **Firewall between addon and HA core?** — addon talks to
   `supervisor/core/websocket` which is a unix-socket hop, not over
   the network. If this breaks, something exotic is misconfigured.

---

## Port 3001 unreachable from my phone

### Symptom: LAN devices can't reach `http://homeassistant:3001`

1. **Verify addon exposes port 3001:** Settings → Addons → HASpoolManager
   → Configuration → "Network" section should show "3001/tcp: 3001".
2. **Ping HA from your phone:** `ping homeassistant.local` — should
   resolve. If not, mDNS isn't working on your phone's wifi → use the
   HA host's IP address instead.
3. **HA firewall blocking?** — HA doesn't run its own firewall, but
   your router might. Check router admin for port filtering on 3001.
4. **Not using port 3001 directly?** — then the PWA lives at
   `/ingress/...` which only works when authenticated with HA. That's
   the full-fat UI, not the fast LAN mode.

---

## "Anthropic API key invalid" during order-paste

### Symptom: `/orders` → "Paste Email" returns "AI parse failed"

1. **Check the key is set:** Settings → Addons → HASpoolManager →
   Configuration → `anthropic_api_key` option
2. **Validate the key:**
   ```bash
   curl -sI https://api.anthropic.com/v1/messages \
     -H "x-api-key: sk-ant-..."
   ```
   Expect 401 "missing model" (means key is valid, call is just
   incomplete). 403 or 401 "invalid api key" → key is bad.
3. **Key valid but parse still fails** — check the addon logs for the
   Anthropic-side error. Common: exceeded monthly budget → top up;
   rate-limited → try again in a minute.
4. **No key set and you want the feature** — get one at
   console.anthropic.com; free tier works for occasional parses.

---

## HA notification: "HASpoolManager: Kein Spool zugeordnet"

### Symptom: HA persistent notification when a print starts

Appears when the printer-sync route creates a new `prints` record and
cannot match any spool to the active AMS slot. The print still runs
normally, but **filament usage won't be deducted** until the match is
established (usually via a swap event or manual fix).

Common causes:
- The AMS tray has a Bambu spool whose RFID tag is not yet mapped to
  an inventory record — scan the tag or map it from `/scan`.
- The spool in the AMS is a third-party roll that hasn't been added to
  inventory at all — add it via Inventory → "+ Add Spool" and load it
  into the slot.
- The active-slot reported by HA is `slot_ext` but the external holder
  in inventory is empty / points at the wrong spool.

Quick check on the live DB:

```sql
SELECT id, name, active_spool_ids, started_at
FROM prints
WHERE status = 'running';
```

If `active_spool_ids` is `[]`, the warning was correct. Fix by editing
the print record with the right `active_spool_ids` (via `/admin/sql/execute`
or the Prints detail page) before the print finishes — otherwise the
`print_usage` row won't be created at finish.

---

## `/admin/diagnostics` shows "Stuck Prints" that are not stuck

### Symptom: finished prints show in the stuck list

The threshold is 24h of `running` with no updates. If you're hitting
this for legitimately long prints, increase the threshold — but
ideally confirm `updated_at` is bumping on each sync cycle:

```sql
SELECT id, name, status,
       started_at,
       updated_at,
       (julianday('now') - julianday(updated_at)) * 24 AS hours_since_update
FROM prints
WHERE status = 'running'
ORDER BY started_at DESC;
```

If `hours_since_update > 1` for a truly running print → the sync
worker isn't reaching this printer. See "Sync worker is connected but
nothing updates" above.

---

## Tests pass locally but CI fails

### Symptom: `npm run test:e2e` green on your machine, red in GitHub Actions

1. **iCloud filesystem corruption** (macOS only):
   ```bash
   rm -rf .next && npm run build
   ```
   The `iCloud + Turbopack` memory entry documents this; it doesn't
   affect Linux CI.
2. **e2e flakes** — Playwright against Docker nginx can race on
   startup. Check the CI log for `networkidle` or click timeouts; our
   fix pattern is `expect.toPass({timeout: 15000})` retry-loops, not
   `waitForLoadState('networkidle')`.
3. **DB drift** — if you edited `lib/db/schema.ts` but didn't
   `npx drizzle-kit generate`, test harness uses old migrations. Run
   generate + commit the new SQL file.

---

## Deploy script fails partway

### Symptom: `./ha-addon/deploy.sh` errors out mid-run

| Phase | Symptom | Fix |
|---|---|---|
| `npm run build` | Next.js build error | Fix TypeScript / lint errors first |
| `npm run build` | `ENOTEMPTY rmdir .next/server/app` | iCloud race → `rm -rf .next` and retry |
| `scp` | Host unreachable | Check SSH: `ssh root@homeassistant "echo ok"` |
| `extract` | tar error | Previous deploy left junk; `ssh root@homeassistant "rm -rf /addons/haspoolmanager"` and retry |
| `ha addons reload` | version unchanged | HA cache — `ssh root@homeassistant "ha addons restart local_haspoolmanager"` |

To re-deploy the same version without bumping:
```bash
./ha-addon/deploy.sh --no-bump
```

---

## Getting help

1. Check [`operations-runbook.md`](operations-runbook.md) for data-specific recipes
2. `/admin/diagnostics` — live health checks
3. Search commit history: `git log --oneline --all | grep -i <keyword>`
4. Search memory: `ls ~/.claude/projects/-Users-*/memory/` — past lessons on recurring issues
5. Open an issue on GitHub with the log excerpt + what you tried
