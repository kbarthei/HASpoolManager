# Getting Started

You're a new contributor (or your future self returning after a few months).
This doc gets you from zero to productive: dev server running, tests green,
first change landed.

---

## 1. Prerequisites

| Tool | Version | Notes |
|---|---|---|
| Node.js | ≥ 22 LTS | `node --version` |
| npm | shipped with Node | no alternatives configured |
| Docker | any recent | only needed for e2e tests (OrbStack or Docker Desktop) |
| SQLite CLI | any | optional, handy for ad-hoc inspection |
| macOS / Linux | — | dev tested on macOS; Linux should Just Work |

No global Next.js / Drizzle install needed; everything comes from
`package.json`.

## 2. Clone + install

```bash
git clone git@github.com:kbarthei/HASpoolManager.git
cd HASpoolManager
npm install
cp .env.example .env.local
```

Then edit `.env.local`:

```bash
SQLITE_PATH=./data/haspoolmanager.db    # local DB file
API_SECRET_KEY=test-dev-key-2026         # any string; used by curl + e2e
ANTHROPIC_API_KEY=                       # leave empty unless testing AI parse
```

## 3. Seed a local database

Two options:

**Option A — empty DB** (fresh install simulation):
```bash
npm run db:push      # applies schema via Drizzle
```
The first addon start inside `run.sh` would also run `scripts/migrate-db.js`, but for local dev `db:push` is enough.

**Option B — copy production snapshot** (recommended for real feature work):
```bash
cp testdata/db-snapshots/prod-YYYY-MM-DD-*.db* data/
mv data/prod-YYYY-MM-DD-*.db data/haspoolmanager.db
mv data/prod-YYYY-MM-DD-*.db-wal data/haspoolmanager.db-wal 2>/dev/null || true
mv data/prod-YYYY-MM-DD-*.db-shm data/haspoolmanager.db-shm 2>/dev/null || true
```
Now you're debugging against the real spool catalogue and print history.

## 4. Run the dev server

```bash
npm run dev
```

- Dev URL: http://localhost:3000
- Hot-reload via Turbopack
- `clean-cache.js` wipes `.next/` first to dodge iCloud-sync corruption (see CLAUDE.md: iCloud + Turbopack quirk)

The sync worker does **not** run in dev — it connects to HA only when
`SUPERVISOR_TOKEN` is set (addon runtime). In dev, the UI works against the
local DB directly; you won't see AMS live data without the addon stack.

## 5. Run the tests

Three layers, independent:

```bash
npm run test:unit          # 485 tests, ~1s — pure logic, no DB
npm run test:integration   # 130 tests, ~2s — per-worker SQLite, route handlers
npm run test:e2e           # ~50 tests, ~2min — Docker nginx + Playwright
```

**Watch mode** while coding:
```bash
npm run test:watch         # any file change re-runs touched specs
```

Run a single test:
```bash
npm run test:unit -- --run tests/unit/migration-multi-ams.test.ts
npm run test:integration -- --run tests/integration/racks-api.test.ts
npm run test:e2e -- --grep "admin RacksCard"
```

See [`testing.md`](testing.md) for the strategy and [`test-templates.md`](test-templates.md)
for copy-paste starter code per layer.

## 6. Repo layout

```
HASpoolManager/
├── app/                  Next.js App Router
│   ├── (app)/            User-facing pages (dashboard, spools, inventory, admin, …)
│   └── api/v1/           REST endpoints (see reference/api.md)
├── components/           Reusable React components (shadcn/ui + domain-specific)
├── lib/                  All business logic — pure functions, DB access, HA integration
│   ├── db/               Drizzle schema + migrations
│   ├── sync-worker.ts    Background process that talks to HA via websocket
│   ├── matching.ts       Spool-matching engine (RFID / bambu_idx / fuzzy)
│   ├── supply-engine.ts  Reorder-alert computation
│   ├── printer-sync-helpers.ts  Pure helpers used by the sync route
│   └── …
├── scripts/              CLI utilities — migrate-db.js (startup), health-check.js, cleanup tools
├── ha-addon/             HA addon packaging (Dockerfile, config.yaml, nginx.conf, run.sh, deploy.sh)
├── tests/
│   ├── unit/             Pure logic tests (no DB)
│   ├── integration/      Route handler tests (per-worker SQLite)
│   ├── e2e/              Playwright specs (Docker nginx + real addon container)
│   ├── fixtures/         Factory functions (makeVendor, makeFilament, …)
│   └── harness/          Per-worker DB setup + request helpers + addon stack
├── docs/                 This directory
├── testdata/             Gitignored — prod DB snapshots, sample CSVs
└── workdir/              Gitignored — implementation plans, research notes
```

## 7. Typical dev workflow

1. **Check memory + CLAUDE.md** for project conventions (Apple Health design, mobile-first, etc.)
2. **Edit** under `lib/` first if logic, `components/` for UI, `app/` for page/route
3. **Write/update tests** before or alongside code per project's TDD convention
4. `npm run test:unit && npm run test:integration`
5. For UI: `npm run dev`, browse to http://localhost:3000, click through
6. Commit with a conventional prefix: `feat:`, `fix:`, `docs:`, `chore:`, `test:`, `refactor:`
7. Push to a feature branch; merge to main when CI green

## 8. Querying the production DB

Three ways, in order of preference:

**A. Admin API on port 3001** (no SMB needed, fast):
```bash
curl -s -X POST http://homeassistant:3001/api/v1/admin/query \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"sql":"SELECT COUNT(*) FROM spools"}' | jq
```
Or the SQL execute endpoint with `dryRun: true` to preview a mutation.

**B. Admin UI** — `/admin/diagnostics` has live health checks, drift detectors, and a SQL runner.

**C. SMB snapshot** — only when you need the raw `.db` file (e.g. before a destructive deploy):
```bash
cp /Volumes/config/haspoolmanager.db* testdata/db-snapshots/prod-$(date +%Y-%m-%d).db*
```
Then open with `sqlite3` or Drizzle Studio locally.

## 9. Making a schema change

The three-step dance (see [`database-changes.md`](database-changes.md) for full details):

```
1. Edit lib/db/schema.ts
2. npx drizzle-kit generate          → new lib/db/migrations/NNNN_*.sql
3. Add idempotent { check, apply } entry to scripts/migrate-db.js
```

## 10. Deploying to Home Assistant

```bash
./ha-addon/deploy.sh       # bumps patch version, builds, scp+ssh installs
```

Full release flow: [`release-process.md`](release-process.md).

---

## Where to go next

- Big picture → [`../architecture/overview.md`](../architecture/overview.md)
- Specific system → pick a doc under `docs/architecture/`
- Looking up an endpoint → [`../reference/api.md`](../reference/api.md)
- Stuck? → [`../operator/troubleshooting.md`](../operator/troubleshooting.md) covers the common breakages
