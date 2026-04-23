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
│ E2e (Playwright + Docker nginx + ingress)    │  47 tests (18 specs)
├──────────────────────────────────────────────┤
│ Integration (Vitest + SQLite file DB)        │ 134 tests (15 files)
├──────────────────────────────────────────────┤
│ Unit (Vitest, no DB)                         │  525 tests (17 files)
└──────────────────────────────────────────────┘
Total: 706 tests — CI runs all three layers, ~2 min total.
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

## 3. Current state (all done)

| Layer | Files | Status |
|-------|-------|--------|
| `tests/unit/` (12 files, 479 tests) | color, date, matching-scoring, order-parsing, price-crawler, printer-sync-helpers (incl. calculateEnergyCost, parseHmsCode), storage-moves, theme, validations, weight-adjustment, color-lookup, supply-engine | ✅ All import real code, no DB |
| `tests/integration/` (11 files, 110 tests) | api-health, api-crud, api-match, api-events, api-admin-sync-log, printer-sync (incl. energy tracking), hms-events, spool-manage, data-quality, diagnostics (incl. health-check rollup), sql-execute | ✅ All use per-worker SQLite harness + direct route handler calls |
| `tests/e2e/` (15 specs, 41 tests) | 01-smoke through 14-analytics-page, 15-diagnostics (incl. diagnostics dashboard + orders 2-column + issue-banner plumbing) | ✅ Run against addon stack (Docker nginx + ingress simulator) |
| `tests/fixtures/seed.ts` | Factory functions (makeVendor, makeFilament, makeSpool, makePrinter, makeAmsSlot, makeTagMapping) | ✅ Uses `@/lib/db` singleton (lazy, binds to harness DB) |
| `tests/harness/` | sqlite-db.ts, request.ts, addon-stack.ts, ingress-simulator.ts | ✅ Complete harness infrastructure |
| `.github/workflows/ci.yml` | 3-stage pipeline: lint+unit → integration → e2e (main push) | ✅ No external secrets |

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

#### Implemented (43 tests across 17 spec files) ✅

| Spec file | Journey | Tests |
|-----------|---------|-------|
| `01-smoke.spec.ts` | Home page renders stat cards + health API reachable through full stack | 2 |
| `02-navigation.spec.ts` | Navigate to all 7 real pages, assert `page-<name>` testid visible, URL retains ingress prefix | 7 |
| `03-spools-list.spec.ts` | Seed 2 spools, visit /spools, assert they render | 1 |
| `04-admin-config.spec.ts` | Visit /admin, assert SQLite + HA Integration + AI Integration sections visible | 1 |
| `05-ingress-asset-loads.spec.ts` | Load home, collect all network responses, assert zero 404s | 1 |
| `06-prints-history.spec.ts` | Seed a finished print, verify /prints shows print name, /history renders | 2 |
| `07-hydration-clean.spec.ts` | Load all 8 pages, assert zero console errors and no React #418 hydration messages | 8 |
| `08-orders-page.spec.ts` | Seed shop + order + item, assert /orders renders | 1 |
| `09-scan-page.spec.ts` | Visit /scan, assert "Scan a Spool" heading visible | 1 |
| `10-inventory-page.spec.ts` | Seed printer + AMS slots + spool, assert /inventory renders | 1 |
| `11-dark-mode.spec.ts` | Toggle theme, verify CSS variable changes, reload persists | 3 |
| `12-scan-flow.spec.ts` | Paste synthetic tag on /scan, assert match result | 2 |
| `13-mobile-viewport.spec.ts` | All key pages render correctly at 375×667 | 5 |
| `14-analytics-page.spec.ts` | /analytics renders (page-analytics testid) + reachable via top-tabs nav | 2 |
| `11-inventory-multi.spec.ts` | Inventory renders enabled AMS unit by displayName, hides disabled unit; both rack-section testids visible | 2 |
| `12-admin-racks.spec.ts` | Admin RacksCard renders seeded rack; "Add Rack" opens new-rack dialog | 2 |
| `13-admin-ams-units.spec.ts` | Admin AmsUnitsCard renders seeded unit row; toggle switch present with aria-checked | 2 |

> **Pages note:** `/inventory` is the single entry point for AMS + rack + workbench + surplus. Older `/ams` and `/storage` routes were removed in the 3.2 redesign (2026-04-21).
> Real pages with anchors: dashboard, spools, inventory, orders, prints, history, admin, scan (8 total, 7 navigable + root).

#### Not yet implemented (future work)

| Spec | Journey | Notes |
|------|---------|-------|
| `11-spools-edit.spec.ts` | Open spool detail, edit remaining weight, save, verify update | Needs weight-adjuster testids |
| `12-spool-create.spec.ts` | Click "new spool", fill form, save, verify new row | Needs add-spool dialog testids |
| `13-orders-create.spec.ts` | New order form → add line items → save | Needs add-order dialog testids |
| `14-inventory-sections.spec.ts` | Verify AMS + Rack + Surplus + Workbench sections render on /inventory | Testids exist (`printer-section`, `rack-section`, etc.) |

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
