# Test Strategy — HASpoolManager

> **Last rewritten:** 2026-04-07 (post HA-migration, post dual-driver cleanup).
> Supersedes the 2026-03-31 Vercel-centric draft.

## 0. Why this rewrite

HA addon is the **only deployment target**. Vercel and Postgres are gone. The old strategy assumed Vercel+Neon, a dual-driver DB, and a dev-server-based test setup — none of that is reality anymore.

This rewrite:
- **Single runtime target**: HA addon container (SQLite + nginx + Next.js 16)
- **Single DB driver**: SQLite via better-sqlite3. No Postgres, no Neon, no `DATABASE_URL` secret in CI
- **E2e tests run against the real artifact**: built HA addon container + ingress simulator, not a bare `npm run dev`
- **Aligns CI with what we ship**: the addon tar is the artifact; tests exercise that artifact

## 1. Test Pyramid

```
┌──────────────────────────────────────────────┐
│ Smoke (bash, container URL)                  │  ~15 checks
├──────────────────────────────────────────────┤
│ E2e (Playwright via ingress simulator)       │  ~15 specs     ← rewritten
├──────────────────────────────────────────────┤
│ Integration (Vitest + SQLite file DB)        │  ~80 tests
├──────────────────────────────────────────────┤
│ Unit (Vitest, no DB)                         │  ~260 tests
└──────────────────────────────────────────────┘
```

### Layer responsibilities

| Layer | Runs against | Tests | Does NOT test |
|-------|-------------|-------|---------------|
| **Unit** | Pure functions, no IO | Helpers (num/str/bool), matching scores, colour normalisation, Zod schemas, date math, weight-delta math, storage moves, Bambu state classification, sync helpers | DB, HTTP, React rendering |
| **Integration** | Real SQLite file DB via in-process Next.js | API round-trips: printer-sync lifecycle, AMS slot matching, spool auto-create, usage/cost delta, CRUD endpoints, auth rules | UI, nginx rewriting, hydration, client JS |
| **E2e** | **Built HA addon container + ingress-simulator** (Playwright) | User journeys from the browser perspective, exercising nginx ingress rewriting, basePath injection, hydration, client-side navigation, form interactions, RSC fetches | API edge cases (covered by integration), pure logic (covered by units) |
| **Smoke** | Running container (CI) or live HA (manual) | 15 key endpoints return expected status/shape | Detailed correctness |

### What changed vs. old strategy

| Old layer | Status | Why |
|-----------|--------|-----|
| Vercel production smoke (`haspoolmanager.vercel.app`) | **REMOVED** | No more Vercel |
| Postgres integration path | **REMOVED** | Single-driver world |
| Neon branch secrets in CI | **REMOVED** | No external DB dependency |
| E2e against bare dev server | **REPLACED** by containerised e2e | Dev server doesn't exercise nginx ingress; Phase-10 bugs would have slipped through |

## 2. Database: SQLite only

- Integration tests boot a fresh SQLite file per test run at `tests/tmp/test-<workerid>.db`
- Schema created by importing `lib/db/schema.ts` and calling `drizzle-kit push` programmatically (or via a pre-generated migration SQL)
- Fixtures in `tests/fixtures/seed.ts` take a Drizzle `db` instance — no globals
- After suite: `rm tests/tmp/test-*.db`
- E2e container uses the same mechanism: copy a pre-seeded test DB into the container at startup

### Prerequisite cleanup (see §5 Chunk 0)

Before rewriting tests, the codebase must lose its dual-driver baggage:
- `lib/db/schema.ts` becomes SQLite-only (merge current `schema-sqlite.ts` into it, delete the old file)
- `lib/db/index.ts` becomes a single `better-sqlite3` import
- `lib/db/sql-helpers.ts` branches collapse to SQLite-only expressions
- `DATABASE_PROVIDER` env var removed everywhere
- `proxy.ts` (Phase-5 artifact, superseded by nginx) removed
- `.env.example` updated — no `DATABASE_URL`
- `scripts/migrate-pg-to-sqlite.ts` — **keep as one-shot historical tool**, move to `scripts/archive/`
- `package.json` — remove `@neondatabase/serverless`, `@vercel/*`, `drizzle-kit` configs for pg

## 3. Current state audit

| File | Current | Action |
|------|---------|--------|
| `tests/unit/color.test.ts` | ✅ imports real code | Keep |
| `tests/unit/date.test.ts` | ✅ imports real code | Keep |
| `tests/unit/matching-scoring.test.ts` | ✅ imports real code | Keep |
| `tests/unit/order-parsing.test.ts` | ✅ imports real code | Keep |
| `tests/unit/price-crawler.test.ts` | ? audit for external deps | Audit |
| `tests/unit/printer-sync-helpers.test.ts` | ✅ 590 LOC, imports real code | Keep |
| `tests/unit/storage-moves.test.ts` | ? | Audit |
| `tests/unit/theme.test.ts` | ✅ | Keep |
| `tests/unit/validations.test.ts` | ✅ 616 LOC | Keep |
| `tests/unit/weight-adjustment.test.ts` | ✅ | Keep |
| `tests/integration/printer-sync.test.ts` (850 LOC) | Postgres + running dev server | **Rewrite** onto SQLite harness |
| `tests/integration/api-health.test.ts` | Postgres dev server | Rewrite |
| `tests/integration/api-crud.test.ts` | Postgres dev server | Rewrite |
| `tests/integration/api-events.test.ts` | Postgres dev server | Rewrite |
| `tests/integration/api-match.test.ts` | Postgres dev server | Rewrite |
| `tests/integration/api-admin-sync-log.test.ts` | Postgres dev server | Rewrite |
| `tests/fixtures/seed.ts` | Postgres-coupled | Rewrite driver-agnostic |
| `tests/e2e/dashboard.spec.ts` etc. (7 files) | dev server, no ingress | **Delete**, replace (§4) |
| `scripts/smoke-test.sh` | Targets vercel.app | Rewrite for container URL |
| `.github/workflows/ci.yml` | Vercel smoke + Neon secrets | **Rewrite** (§5 Chunk 4) |
| `test-ingress.mjs` (repo root) | Draft harness from Phase 10 | Promote to `tests/harness/` |
| `ingress-simulator.mjs` (repo root) | Draft sim from Phase 10 | Promote to `tests/harness/` |

### New files to create
- `tests/harness/sqlite-db.ts` — spin up per-worker SQLite DB + schema push
- `tests/harness/next-app.ts` — start Next.js in-process bound to the test DB
- `tests/harness/docker-addon.ts` — build + run + cleanup the HA addon container
- `tests/harness/ingress-simulator.ts` — promoted from repo root, typed
- `tests/e2e/*.spec.ts` — new specs per §4

## 4. E2e test specification (expanded)

### Principles

1. **Every spec runs against the real built container behind the ingress simulator.** No bare dev server.
2. **Each spec seeds its own data** via API calls in `beforeAll`, then asserts the UI reflects it.
3. **Selectors are `data-testid`**. If a selector is missing, add it to the component first.
4. **One user journey per spec file.** No omnibus specs.
5. **Assertions are explicit and UI-observable**. Not internal state.
6. **Fixture data is scoped and cleaned up** via distinct names (`e2e_` prefix) before and after the spec.

### Journey catalogue

The following specs replace the old `tests/e2e/*.spec.ts` files. Each file is ~50-150 lines of Playwright, seeds minimal data, runs 3-8 assertions.

#### Must-have (ships in Chunk 3)

| Spec file | Journey | Key assertions |
|-----------|---------|----------------|
| `01-smoke.spec.ts` | Load home page → dashboard shows stat cards, health API reachable through full stack | Title, stat cards visible, no fatal console errors, `GET /api/v1/health` → 200 |
| `02-navigation.spec.ts` | Navigate to all 7 real pages (Spools, Inventory, Orders, Prints, History, Admin, Scan) | Each page loads with `[data-testid=page-<name>]` visible, URL retains ingress prefix |
| `03-spools-list.spec.ts` | Visit /spools, filter by vendor, open a detail page | List renders with seeded spools, filter reduces count, detail page shows remaining weight |
| `04-spools-edit.spec.ts` | Open spool detail, edit remaining weight, save, verify update | Form submits, toast appears, value persists after reload |
| `05-spool-create.spec.ts` | Click "new spool", fill form, save | New row appears in /spools list |
| `06-orders-create.spec.ts` | New order form → add line items → save | Order appears in /orders with correct total |
| `07-prints-history.spec.ts` | Open /history, verify prints from seed appear | Rows visible, usage events counted |
| `08-admin-config.spec.ts` | Open /admin, verify DB + AI + HA sections render | Shows SQLite as DB driver, API key status visible |
| `09-ingress-asset-loads.spec.ts` | Load home → verify CSS, fonts, static chunks all loaded | Zero 404s except known-harmless ABORTED RSC prefetches |
| `10-hydration-clean.spec.ts` | Load every top-level page → assert no React #418 or other hydration errors | Console error count == 0 for each page |

> **Pages note:** `/ams` and `/storage` redirect to `/inventory` — they are NOT standalone pages and have no `page-<name>` testid.
> Real pages with anchors: dashboard, spools, inventory, orders, prints, history, admin, scan (8 total, 7 navigable + root).

#### Nice-to-have (Chunk 3 extension)

| Spec | Journey |
|------|---------|
| `11-dark-mode.spec.ts` | Toggle theme, verify CSS variable changes, reload persists |
| `12-scan-flow.spec.ts` | /scan page — paste synthetic tag, assert match result |
| `13-order-parse.spec.ts` | Paste mock invoice text, verify AI parse returns items (AI mocked) |
| `14-inventory-sections.spec.ts` | Verify AMS + Rack + Surplus + Workbench sections render on /inventory |
| `15-mobile-viewport.spec.ts` | All key pages render correctly at 375x667 |

### Test data

`tests/e2e/fixtures.ts` exports `openE2eDb()` which opens the shared SQLite
file at `E2E_DB_PATH` (set by the global-setup harness) directly via
better-sqlite3 in WAL mode. This is faster and more reliable than HTTP seeding:
the test process inserts fixtures, the standalone Next.js server reads them
through the same SQLite file.

Each spec that needs seed data calls `openE2eDb()` in `test.beforeAll`.

### Ingress-specific assertions

Specs 09 and 10 explicitly cover asset loading and hydration. Other specs
naturally validate that the ingress path works because they navigate via
the simulator's base URL and any prefix mismatch causes immediate 404s.

### Running e2e locally

```bash
npm run test:e2e              # builds container, starts it, runs simulator, runs Playwright
npm run test:e2e -- --ui      # headed mode for debugging
npm run test:e2e -- --grep navigation  # single spec
```

## 5. Implementation roadmap

Broken into PR-sized chunks. Each chunk leaves `main` green and testable.

### Chunk 0 — Cleanup: remove Vercel, Neon, Postgres ✅

Done. Single-driver SQLite world, Vercel/Neon artifacts deleted, admin page shows SQLite, README/CONTRIBUTING/CI updated.

### Chunk 1 — Test harness ✅

Done. `tests/harness/sqlite-db.ts` creates a per-worker SQLite file, runs drizzle migrator, sets `SQLITE_PATH` before the lazy `@/lib/db` singleton initialises. Safety guard refuses to run against paths outside `tests/tmp/`. POC test (api-health) green.

### Chunk 2 — Migrate integration tests ✅

Done. All 6 test files rewritten to call route handlers directly via `tests/harness/request.ts` (synthesised `NextRequest`). No dev server, no external DB. `next/cache` mocked so `revalidatePath()` doesn't need a server context. 59/59 green.

### Chunk 3 — E2e layer (in progress)

Infrastructure done (Chunk 3a):
- `tests/harness/addon-stack.ts` — orchestrates Next.js standalone + Docker nginx (real `nginx.conf`) + ingress simulator. SQLite test DB at `tests/tmp/e2e.db`. No HA base image needed.
- `tests/harness/ingress-simulator.ts` — typed, binds ephemeral port
- `tests/e2e/global-setup.ts` / `global-teardown.ts` — Playwright lifecycle hooks
- `tests/e2e/fixtures.ts` — `openE2eDb()` for direct SQLite seeding
- `tests/e2e/01-smoke.spec.ts` — 2 tests green (home page + health API)
- Old specs (7 files) and root draft files (2 files) deleted

Remaining (Chunk 3b):
- Write specs 02–10 from §4 (must-have)
- Add `data-testid` anchors to pages and components as each spec requires
- **Deliverable**: e2e suite with 10+ specs, runs green in <60s locally

### Chunk 4 — CI rewrite ✅ (partial)

CI workflow rewritten for SQLite harness (no Neon secrets, no dev server). Lint + typecheck + unit + integration stages work. E2e stage commented out with TODO — to be enabled once Chunk 3b is complete and Docker-in-CI is validated.

### Chunk 5 — Polish + docs

- Update `CLAUDE.md` testing section to reflect the harness
- `data-testid` coverage audit
- Coverage report via `vitest --coverage` in CI (non-blocking)
- **Deliverable**: docs match reality, new contributor can run full suite first try

## 6. Coverage goals

| Area | Target | How measured |
|------|--------|--------------|
| `lib/printer-sync-helpers.ts` | 95% | vitest --coverage |
| `lib/matching.ts` | 90% | vitest --coverage |
| `lib/db/sql-helpers.ts` | 80% | vitest --coverage (after simplification) |
| `lib/color.ts` | 95% | vitest --coverage |
| `lib/validations.ts` | 80% | vitest --coverage |
| `/api/v1/events/printer-sync` | 90% (via integration) | functional |
| Nginx ingress behaviour | Binary (all e2e green) | e2e suite |
| Hydration correctness | Binary (zero errors on every page) | spec 10 |

## 7. Scripts (package.json)

```jsonc
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint",
    "typecheck": "tsc --noEmit",
    "test": "npm run test:unit && npm run test:integration",
    "test:unit": "vitest run tests/unit",
    "test:integration": "vitest run tests/integration",
    "test:e2e": "playwright test",
    "test:smoke": "bash scripts/smoke-test.sh",
    "test:all": "npm run test && npm run test:e2e",
    "db:push": "drizzle-kit push",
    "db:studio": "drizzle-kit studio"
  }
}
```

## 8. Anti-patterns

- **Conceptual tests** that re-implement logic inline. Always import the real function.
- **Text selectors in Playwright**. Use `data-testid`.
- **Testing implementation details**. Test observable behaviour.
- **`waitForTimeout`**. Use auto-waiting.
- **Mocking the DB**. Use a real SQLite file.
- **Bare dev server e2e**. Go through the container + ingress simulator.
- **Postgres-isms**. No `::int`, no `NOW()`, no `INTERVAL`. SQLite only.
- **Global fixtures that leak across tests**. Use per-test seeding with `e2e_` / test-specific prefixes.

## 9. Feature shipping checklist

Every PR:

```
□ Pure logic extracted to lib/ with unit tests
□ API endpoint has an integration test (happy + error + auth)
□ Zod schema validates request body
□ If UI-facing: e2e spec or extension of existing spec
□ New UI elements have data-testid
□ SQL fits SQLite dialect (no Postgres leftovers)
□ CI green
□ If changing the addon artifact: deploy.sh test run succeeded
```
