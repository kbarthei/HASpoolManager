# Release Process

How HASpoolManager goes from a green CI run to a running addon on Home
Assistant. Single-user app, deploys are cheap, but the steps below
keep them repeatable and reversible.

---

## 1. The deploy pipeline at a glance

```
feature branch → PR → CI green (lint + typecheck + unit + integration)
                                ↓
                          merge to main
                                ↓
                   CI re-runs + e2e tests on main
                                ↓
                     ./ha-addon/deploy.sh
                                ↓
           bump ha-addon/.../config.yaml version
           sync package.json version
           npm run build (standalone output)
           tar + scp to HA (/addons/haspoolmanager-addon.tar.gz)
           extract, ha addons reload, ha addons restart
                                ↓
                    container boots:
                      run.sh → migrate-db.js → Next.js + sync worker
                                ↓
          smoke test: /api/v1/health returns current version
```

No CD pipeline. Every deploy is a human running `deploy.sh`. See
[`../architecture/overview.md`](../architecture/overview.md) §7 for the
container layout.

---

## 2. Pre-deploy checklist

Before hitting `./ha-addon/deploy.sh`:

- [ ] On `main` (or a branch you explicitly want live)
- [ ] CI is green — `gh run list --limit 3` all green
- [ ] No uncommitted changes outside `ha-addon/haspoolmanager/config.yaml` (deploy.sh will modify it)
- [ ] **If the change touches the schema:** pre-deploy snapshot taken (see §4)
- [ ] **If the change touches the sync worker:** plan to tail logs after deploy (§6)

---

## 3. Running deploy.sh

```bash
./ha-addon/deploy.sh
```

What it does, in order:

1. **Bumps the patch version** in `ha-addon/haspoolmanager/config.yaml`
   (e.g. `1.1.3 → 1.1.4`)
2. **Syncs `package.json`** version to match (so `/api/v1/health` reports
   the right number)
3. **Cleans `.next`** (avoids iCloud+Turbopack leftovers) and runs
   `HA_ADDON=true npm run build`
4. **Copies the Next.js standalone output** and static assets into
   `ha-addon/haspoolmanager/app/`
5. **Tars the addon directory** to `ha-addon/dist/haspoolmanager-v<version>.tar.gz`
6. **SCPs the tar** to `root@homeassistant:/addons/haspoolmanager-addon.tar.gz`
7. **Extracts on HA**: `rm -rf /addons/haspoolmanager && tar -xzf ...`
8. **Reloads + restarts**: `ha addons reload && ha addons restart local_haspoolmanager`

Typical runtime: 60-90 seconds depending on network.

---

## 4. Pre-deploy snapshot (schema changes only)

Always mandatory when the change modifies `lib/db/schema.ts` or adds a
migration entry to `scripts/migrate-db.js`. The snapshot is your escape
hatch if the migration corrupts data.

```bash
# SMB mount must be connected (Finder → Go → Connect to Server → smb://homeassistant.local/config)
mkdir -p testdata/db-snapshots
cp /Volumes/config/haspoolmanager.db     testdata/db-snapshots/prod-$(date +%Y-%m-%d)-pre-<change-name>.db
cp /Volumes/config/haspoolmanager.db-wal testdata/db-snapshots/prod-$(date +%Y-%m-%d)-pre-<change-name>.db-wal 2>/dev/null
cp /Volumes/config/haspoolmanager.db-shm testdata/db-snapshots/prod-$(date +%Y-%m-%d)-pre-<change-name>.db-shm 2>/dev/null
```

**Always copy all three files** (`.db`, `.db-wal`, `.db-shm`). Data in
the WAL is invisible without them — restoring only `.db` loses the most
recent writes.

The snapshots go into `testdata/db-snapshots/` (gitignored). Keep them
around for at least 30 days after a feature ships. See
[`../operator/operations-runbook.md`](../operator/operations-runbook.md) §3
for the restore sequence.

**Note on automated backups:** the sync-worker runs a daily gzipped
backup at 03:00 Europe/Berlin into `/config/haspoolmanager/backups/`
(retention 14d). That cadence is a safety net for day-to-day
corruption — it does **not** replace the named pre-deploy snapshot
above. Always snapshot manually before schema changes.

---

## 5. Post-deploy verification

### Smoke test

```bash
# Wait ~20 seconds for container boot + migrations
curl -s http://homeassistant:3001/api/v1/health | jq .
```

Expected:

```json
{"status": "ok", "version": "1.1.4", "timestamp": "2026-04-22T18:30:00.000Z"}
```

The `version` must match `package.json`'s version. If it's still the
old number, the build step shipped stale files — reject the deploy.

### Migration success

```bash
ssh root@homeassistant "ha addons logs local_haspoolmanager 2>&1 | grep '\[migrate\]' | tail"
```

Every schema change should print `[migrate] Applying: <name>` → `[migrate] Applied N migration(s)` on first boot. Subsequent boots
log `[migrate] DB is up-to-date`.

### Sync worker online

```bash
ssh root@homeassistant "ha addons logs local_haspoolmanager 2>&1 | grep '\[sync-worker\]' | tail -20"
```

Look for:
- `[sync-worker] Connected to Home Assistant WebSocket`
- `[sync-worker] Discovered printer <id>`
- `[sync-worker] Watchdog poll loop started`

If the sync worker isn't up, the printer won't sync — check the
supervisor token path (see [`../architecture/sync-worker.md`](../architecture/sync-worker.md) §7).

### UI smoke

Open https://homeassistant.local/hassio/ingress/local_haspoolmanager
(or the direct LAN URL) → Inventory page loads → AMS section populates
→ a spool detail opens. That's enough.

---

## 6. Rollback

Three scenarios, three flavors of rollback:

### A. Bad addon build, DB intact

```bash
# Ship the previous tar (if you kept it)
scp ha-addon/dist/haspoolmanager-v<prev>.tar.gz root@homeassistant:/addons/haspoolmanager-addon.tar.gz
ssh root@homeassistant "rm -rf /addons/haspoolmanager && \
  tar -xzf /addons/haspoolmanager-addon.tar.gz -C /addons/ && \
  ha addons reload && ha addons restart local_haspoolmanager"
```

If you didn't keep the previous tar:

```bash
git checkout v<prev>           # tag or commit before the bad deploy
./ha-addon/deploy.sh            # rebuild + reship
```

### B. Bad schema migration, data corrupt

Stop the addon first (so WAL writes don't race your restore), restore
the snapshot, ship the previous tar:

```bash
ssh root@homeassistant "ha addons stop local_haspoolmanager"

cp testdata/db-snapshots/prod-YYYY-MM-DD-pre-<change>.db     /Volumes/config/haspoolmanager.db
cp testdata/db-snapshots/prod-YYYY-MM-DD-pre-<change>.db-wal /Volumes/config/haspoolmanager.db-wal 2>/dev/null
cp testdata/db-snapshots/prod-YYYY-MM-DD-pre-<change>.db-shm /Volumes/config/haspoolmanager.db-shm 2>/dev/null

scp ha-addon/dist/haspoolmanager-v<prev>.tar.gz root@homeassistant:/addons/haspoolmanager-addon.tar.gz
ssh root@homeassistant "rm -rf /addons/haspoolmanager && \
  tar -xzf /addons/haspoolmanager-addon.tar.gz -C /addons/ && \
  ha addons reload && ha addons start local_haspoolmanager"
```

### C. Sync worker crashloop

Often fixed by restarting the container — transient WebSocket issues or
HA API rate limits:

```bash
ssh root@homeassistant "ha addons restart local_haspoolmanager"
```

If it still crashloops, roll back to the previous tar (scenario A).

---

## 7. Version scheme

`MAJOR.MINOR.PATCH` in both `ha-addon/.../config.yaml` and `package.json`.
They must stay in sync — `deploy.sh` enforces this automatically.

| Bump | When |
|---|---|
| **PATCH** | Any deploy (default; `deploy.sh` always bumps patch) |
| **MINOR** | New feature shipped (manual bump in `config.yaml` + `package.json` on the feature commit) |
| **MAJOR** | Breaking change to schema, API, or UX (rare — single-user app, so we rarely need this) |

Tag after every minor/major:

```bash
git tag v1.2.0
git push --tags
```

Patches don't get tags (they come and go).

---

## 8. CI expectations

- **PR + push to any branch:** lint + typecheck + unit + integration tests
- **Push to `main`:** all of the above + e2e tests against the real addon stack (Docker nginx + ingress simulator)
- **Weekly:** `npm audit` + static analysis
- **After every push:** `gh run list --limit 5` — must be all green before next deploy

A `UserPromptSubmit` hook in `.claude/settings.json` checks CI status at
the start of every conversation and warns about failures.

### Screenshots

`scripts/capture-screenshots.ts` captures the running addon (live data,
real spools) and writes everything under `screenshots/` in git. Two
redaction layers (regex on text nodes + selector-targeted on admin
label/value pairs) replace IPs, Amazon order numbers, Bambu device IDs
and serials with placeholders before each shot, so the output is safe
to commit.

Trigger paths:

- **Manual:** `npm run screenshots` (full set), `-- --no-video` /
  `-- --video-only` flags for partial runs
- **Nightly:** `bash scripts/launchagent/install.sh` schedules a
  daily 03:00 local-time run on the maintainer's Mac

There is no CI-side screenshot job — the Mac is the single source of
truth, since it's the only machine on the same LAN as the printer.

---

## 9. Changelog

Auto-generated from Conventional Commit prefixes (`feat:`, `fix:`, etc.)
on every push to `main`:

- GitHub Action: `.github/workflows/changelog.yml`
- Output: `CHANGELOG.md` (committed back with `[skip ci]`)

Don't edit `CHANGELOG.md` by hand. Write a descriptive commit message
with the right prefix — that's the changelog entry.

---

## 10. Related

- [`database-changes.md`](database-changes.md) — the schema-change three-step dance
- [`contributing.md`](contributing.md) — commit style, code review expectations
- [`../operator/operations-runbook.md`](../operator/operations-runbook.md) — rollback recipes with SQL
- [`../architecture/overview.md`](../architecture/overview.md) §7 — container layout
