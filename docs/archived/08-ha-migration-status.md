# HA Addon Migration — Status & Resume Guide

**Last updated:** 2026-04-06
**Current branch:** main
**Stable rollback tag:** `v1.0.0` (pre-migration, Vercel+Postgres)

## TL;DR for resuming

Phases 1-7 are **done and committed**. The app now has dual-driver support (Postgres + SQLite), a working HA addon structure, ingress proxy, and a tested data migration script. **Next step: Phase 8** — start the app locally on this Mac with SQLite to verify everything works end-to-end before Docker/HA deployment.

## Phase Status

| Phase | Task | Status | Commit |
|-------|------|--------|--------|
| 1 | SQLite schema (`lib/db/schema-sqlite.ts`) | ✅ Done | b4442b7 |
| 2 | Dual-driver DB connection (`lib/db/index.ts`) | ✅ Done | b4442b7 |
| 3 | SQL compatibility helpers (`lib/db/sql-helpers.ts`) | ✅ Done | b4442b7 |
| 4 | Next.js standalone build + HA addon structure | ✅ Done | b4442b7 |
| 5 | HA ingress proxy (`proxy.ts`) | ✅ Done | 3dde5fc |
| 6 | (merged into Phase 4) | ✅ Done | b4442b7 |
| 7 | Postgres→SQLite migration script | ✅ Done + tested | 0e79479 |
| **8** | **Local SQLite testing on this Mac** | ⏳ **NEXT** | — |
| 9 | Docker build + deploy to HA | ⏳ Pending | — |
| 10 | Update HA automations (localhost URL) | ⏳ Pending | — |

## Phase 8 — How to resume (start here after compact)

### Step 1: Generate fresh SQLite DB from current Postgres data
```bash
rm -f ./data/haspoolmanager.db
npx tsx scripts/migrate-pg-to-sqlite.ts ./data/haspoolmanager.db
```
Expected: all 16 tables migrated, row counts match. Last tested result:
```
settings: 2, vendors: 7, shops: 7, printers: 1, filaments: 35,
spools: 56, tag_mappings: 19, orders: 7, order_items: 42,
ams_slots: 6, prints: 22, print_usage: 25, shop_listings: 20,
shopping_list_items: 1, sync_log: 4407
```

### Step 2: Start dev server with SQLite
```bash
DATABASE_PROVIDER=sqlite SQLITE_PATH=./data/haspoolmanager.db npm run dev
```
Open http://localhost:3000 and manually verify:
- [ ] Dashboard loads (stat cards, charts)
- [ ] Spools page loads (56 spools)
- [ ] Inventory page (printer + rack grid)
- [ ] Orders page (7 orders)
- [ ] Print history (22 prints)
- [ ] Spool history (25 usage events)
- [ ] Admin → Sync Log
- [ ] Create a new spool (write test)
- [ ] Edit an existing spool

### Step 3: Fix any bugs that appear
Known risks:
- Raw SQL in routes not using `sql-helpers.ts` (grep for `::int`, `NOW()`, `INTERVAL` one more time)
- Drizzle relations with type mismatches between pg/sqlite schemas
- JSONB fields — SQLite stores as TEXT, parse on read

### Step 4: Run integration tests (if time permits)
Tests currently target Postgres. For Phase 8.5 (optional): create a test DB runner with sqlite. **Can be skipped — manual verification in Phase 8 is enough.**

### Step 5: Move to Phase 9 when Phase 8 works
Phase 9 = Docker build + HA deploy (see below)

---

## Architecture Summary

### Database abstraction (`lib/db/index.ts`)
```
DATABASE_PROVIDER=postgres (default)  → Neon HTTP + schema.ts
DATABASE_PROVIDER=sqlite              → better-sqlite3 + schema-sqlite.ts
```
Both schemas have IDENTICAL table/column names. Application code imports from
`schema.ts` for types — works with both drivers because columns match.

### SQL helpers (`lib/db/sql-helpers.ts`)
13 helper functions branch on `DATABASE_PROVIDER`:
- `sqlCount()`, `sqlCountDistinct()`, `sqlCoalesceSum()`, `sqlCoalesceSumProduct()`
- `sqlSumProductDesc()`, `sqlRatioBelowHalf()`
- `sqlExtractYear()`, `sqlExtractMonth()`, `sqlGroupByYear()`, `sqlGroupByMonth()`
- `sqlSixMonthsAgo()`, `sqlNowMinusSixMonths()`, `sqlNowMinusHours()`
- `sqlCoalesceSumCostAsText()`

All raw SQL in `lib/queries.ts` and API routes uses these helpers.

### HA Addon structure (`ha-addon/haspoolmanager/`)
- `config.yaml` — addon manifest (ingress, panel, options)
- `Dockerfile` — multi-stage (node:22-alpine builder + runner)
- `run.sh` — reads `/data/options.json`, sets env vars, execs `node server.js`
- `DOCS.md` — user docs
- Icons are placeholders (`icon.png.placeholder`, `logo.png.placeholder`)

### Ingress proxy (`proxy.ts`)
Next.js 16 `proxy.ts` (not `middleware.ts`). Only active when `HA_ADDON=true`.
Lightweight — HA's proxy strips the ingress prefix before forwarding, so no URL rewriting needed. All app links are already relative.

### Standalone build (`next.config.ts`)
- `output: "standalone"` — required for Docker
- `X-Frame-Options: SAMEORIGIN` when `HA_ADDON=true` (HA ingress uses iframes)
- `X-Frame-Options: DENY` otherwise

---

## Phase 9 — Docker + HA Deploy (pending)

### Build Docker image locally
```bash
docker build -t haspoolmanager:dev -f ha-addon/haspoolmanager/Dockerfile .
```

### Test Docker image locally
```bash
docker run --rm -p 3000:3000 \
  -v $(pwd)/data:/config \
  -e DATABASE_PROVIDER=sqlite \
  -e SQLITE_PATH=/config/haspoolmanager.db \
  -e HA_ADDON=true \
  haspoolmanager:dev
```

### Deploy to HA
Two options:

**A) HA addon repository (recommended)**
1. Create a separate repo: `kbarthei/HASpoolManager-addon`
2. Copy `ha-addon/` contents to that repo
3. In HA: Supervisor → Add-on Store → ⋮ → Repositories → Add `https://github.com/kbarthei/HASpoolManager-addon`
4. Install addon from the store
5. Configure `anthropic_api_key` in addon options
6. Copy `./data/haspoolmanager.db` to `/config/haspoolmanager.db` on HA host (via SMB to `/Volumes/config/`)
7. Start addon

**B) Local addon (for testing)**
1. Copy `ha-addon/haspoolmanager/` to `/Volumes/config/addons/haspoolmanager/`
2. In HA: Supervisor → Add-on Store → ⋮ → Reload
3. Install "HASpoolManager" from "Local add-ons"
4. Same as step 6-7 above

---

## Phase 10 — HA Automations Update (pending)

Current automations send webhooks to `https://haspoolmanager.vercel.app/api/v1/events/printer-sync`.

After addon is running, update to use ingress URL. The addon is accessible at:
- From HA automations (host network): `http://localhost:3000/api/v1/events/printer-sync` or `http://a0d7b954-haspoolmanager:3000/api/v1/events/printer-sync`
- From outside HA: via ingress (requires HA auth token)

File to edit: HA config repo `kb_homeassistant/rest_command.yaml` (or wherever the webhook URL is defined). Check via:
```bash
ls /Volumes/config/
grep -r "haspoolmanager.vercel.app" /Volumes/config/
```

## Files Changed in Migration (so far)

### New files
- `lib/db/schema-sqlite.ts` — SQLite version of all 14 tables
- `lib/db/sql-helpers.ts` — 13 DB-agnostic SQL fragment helpers
- `proxy.ts` — HA ingress proxy (Next.js 16)
- `scripts/migrate-pg-to-sqlite.ts` — Data migration script
- `ha-addon/haspoolmanager/config.yaml`
- `ha-addon/haspoolmanager/Dockerfile`
- `ha-addon/haspoolmanager/run.sh`
- `ha-addon/haspoolmanager/DOCS.md`
- `ha-addon/haspoolmanager/icon.png.placeholder`
- `ha-addon/haspoolmanager/logo.png.placeholder`
- `ha-addon/repository.yaml`

### Modified files
- `lib/db/index.ts` — dual-driver (postgres | sqlite)
- `lib/queries.ts` — uses `sql-helpers.ts`
- `app/api/v1/admin/sync-log/route.ts` — uses `sql-helpers.ts`
- `app/api/v1/events/printer-sync/route.ts` — uses `sql-helpers.ts`
- `app/api/v1/prints/[id]/usage/[usageId]/route.ts` — uses `sql-helpers.ts`
- `next.config.ts` — `output: "standalone"` + conditional X-Frame-Options
- `package.json` — added `better-sqlite3` + `@types/better-sqlite3`
- `.gitignore` — added `data/`

### Unchanged (important)
- `lib/db/schema.ts` — Postgres schema still the source of truth for types
- All Vercel deployment config

## Rollback instructions

If the migration breaks anything:
```bash
git checkout v1.0.0          # Last stable Vercel version
vercel --prod --yes           # Redeploy stable version
```

Vercel deployment is **not affected** by any of these changes — Postgres is still the default driver.

## Known gotchas

1. **Neon client is tagged-template only.** Use `pgQuery.query(sql, params)` for dynamic SQL (tables).
2. **Postgres-only columns exist** that aren't in SQLite schema (`spools.lot_number`, `orders.auto_supply_log_id`, etc.). Migration script filters these out — data is preserved in Postgres but not migrated. NOT a data loss issue as these columns aren't used in the app yet.
3. **JSONB fields.** Currently: `prints.active_spool_ids`, `prints.remain_snapshot`, `sync_log.response_json`. In SQLite these are stored as TEXT. Drizzle's `{ mode: "json" }` handles serialization automatically.
4. **Timestamps with timezone.** SQLite has no timezone support — stored as ISO-8601 text. App code uses `new Date(row.createdAt)` which works for both.

## Environment variables

### Vercel (production, no changes)
```
DATABASE_URL=<neon connection>
ANTHROPIC_API_KEY=<key>
BAMBU_API_KEY=<key>
API_KEY=<internal API key for HA webhook auth>
```

### Local SQLite testing (this Mac)
```
DATABASE_PROVIDER=sqlite
SQLITE_PATH=./data/haspoolmanager.db
# DATABASE_URL still needed for migration script
DATABASE_URL=<neon connection>
ANTHROPIC_API_KEY=<key>
```

### HA addon runtime (set by run.sh)
```
DATABASE_PROVIDER=sqlite
SQLITE_PATH=/config/haspoolmanager.db
HA_ADDON=true
ANTHROPIC_API_KEY=<from options.json>
LOG_LEVEL=<from options.json>
```
