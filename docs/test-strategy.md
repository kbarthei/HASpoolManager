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
| `01-smoke.spec.ts` | Load home page → nav appears → dashboard shows stat cards | Title, nav links prefixed, stat cards visible, no console errors |
| `02-navigation.spec.ts` | Click through all top-level pages (Spools, Inventory, Orders, Prints, History, Admin, Storage, Scan) | Each page loads with `[data-testid=page-<name>]` visible, URL contains ingress prefix, back-button works |
| `03-spools-list.spec.ts` | Visit /spools, filter by vendor, open a detail page | List renders with seeded spools, filter reduces count, detail page shows remaining weight |
| `04-spools-edit.spec.ts` | Open spool detail, edit remaining weight, save, verify update | Form submits, toast appears, value persists after reload |
| `05-spool-create.spec.ts` | Click "new spool", fill form, save | New row appears in /spools list |
| `06-orders-create.spec.ts` | New order form → add line items → save | Order appears in /orders with correct total |
| `07-prints-history.spec.ts` | Open /history, verify prints from seed appear | Rows visible, usage events counted |
| `08-admin-config.spec.ts` | Open /admin, verify DB + AI + HA sections render, sync log loads | Shows configured sync URL, shows SQLite as DB driver, sync log populates |
| `09-ingress-asset-loads.spec.ts` | Load home → verify CSS, fonts, static chunks all loaded | Zero 404s except known-harmless ABORTED RSC prefetches |
| `10-hydration-clean.spec.ts` | Load every top-level page → assert no React #418 or other hydration errors | Console error count == 0 for each page |

#### Nice-to-have (Chunk 3 extension)

| Spec | Journey |
|------|---------|
| `11-dark-mode.spec.ts` | Toggle theme, verify CSS variable changes, reload persists |
| `12-scan-flow.spec.ts` | /scan page — paste synthetic tag, assert match result |
| `13-order-parse.spec.ts` | Paste mock invoice text, verify AI parse returns items (AI mocked) |
| `14-storage-drag.spec.ts` | Drag a spool between rack slots, verify position persists |
| `15-mobile-viewport.spec.ts` | All key pages render correctly at 375x667 |

### Test data

One shared fixture file `tests/e2e/fixtures.ts` exports:
- `seedMinimalFixtures(baseUrl, apiKey)` — creates 2 vendors, 3 filaments, 4 spools, 1 printer, 2 prints
- `cleanupE2eFixtures(baseUrl, apiKey)` — deletes all records with `e2e_` prefix

Each spec calls `seedMinimalFixtures` in `beforeAll` unless the spec has its own seed needs.

### Ingress-specific assertions

Every spec inherits a shared `test.beforeEach` via a fixture that asserts:
- No `/ingress/_next/...` unprefixed 404s
- No React hydration errors in console
- Page URL stays under `/api/hassio_ingress/<token>/ingress/...`

These catch regressions in nginx.conf rewriting without needing dedicated tests.

### Running e2e locally

```bash
npm run test:e2e              # builds container, starts it, runs simulator, runs Playwright
npm run test:e2e -- --ui      # headed mode for debugging
npm run test:e2e -- --grep navigation  # single spec
```

## 5. Implementation roadmap

Broken into PR-sized chunks. Each chunk leaves `main` green and testable.

### Chunk 0 — Cleanup: remove Vercel, Neon, Postgres

Prerequisite for everything else.

- Merge `lib/db/schema-sqlite.ts` into `lib/db/schema.ts` (delete the sqlite version)
- Simplify `lib/db/index.ts` to single-driver (better-sqlite3 only)
- Collapse `lib/db/sql-helpers.ts` branches to SQLite expressions
- Remove `DATABASE_PROVIDER` env branching across the codebase
- Delete `proxy.ts` (superseded by nginx)
- Move `scripts/migrate-pg-to-sqlite.ts` → `scripts/archive/`
- Update `.env.example` — no `DATABASE_URL`, just `SQLITE_PATH`
- Remove deps: `@neondatabase/serverless`, `@vercel/*`, `vercel` CLI from package.json, drizzle pg dialect config
- Update `drizzle.config.ts` to SQLite-only
- Remove `.vercel/` ignore line (still keep gitignore entry)
- Remove Vercel badge from README
- `next.config.ts` — remove Vercel-specific bits
- Verify `npm run build` still works
- Verify the current addon still builds + deploys
- **Deliverable**: one big PR, all existing tests still pass or are explicitly disabled with clear TODOs

### Chunk 1 — Test harness

- `tests/harness/sqlite-db.ts` — function that returns `{ db, cleanup }`, creates fresh SQLite file, pushes schema
- `tests/harness/next-app.ts` — spawns Next.js in-process bound to harness DB (uses `next().prepare()` API)
- `tests/fixtures/seed.ts` rewritten to take a `db` argument
- Migrate `tests/integration/api-health.test.ts` as proof-of-concept
- `npm run test:integration` starts the harness automatically
- **Deliverable**: 1 integration test green against harness; old tests still pass against their current setup (gated by env)

### Chunk 2 — Migrate integration tests

Rewrite each file to use the harness:
- `api-health.test.ts` (done in Chunk 1)
- `api-crud.test.ts`
- `api-match.test.ts`
- `api-events.test.ts` (if still relevant — check if endpoints still exist)
- `api-admin-sync-log.test.ts`
- `printer-sync.test.ts` (the big one — last, expect 2-3 days)
- Delete any tests for deprecated endpoints
- **Deliverable**: all integration tests run via harness, no DB env vars needed

### Chunk 3 — E2e layer

- `tests/harness/docker-addon.ts` — builds addon image, runs container, seeds DB, exposes `:3000`, cleanup
- `tests/harness/ingress-simulator.ts` — promoted from root, typed as TS
- `tests/e2e/fixtures.ts` — seed + cleanup helpers (via HTTP to running container)
- Write specs 01-10 from §4 (must-have)
- Delete old `tests/e2e/*.spec.ts` files
- Add required `data-testid` attributes to components as needed
- `npm run test:e2e` orchestrates docker build + run + Playwright
- **Deliverable**: e2e suite runs green in <5 min locally

### Chunk 4 — CI rewrite

- New `.github/workflows/ci.yml`:
  - Single job: lint + typecheck + unit + integration (parallel where possible)
  - On main push: additionally run e2e (docker build in CI)
  - No secrets beyond `GITHUB_TOKEN`
- Remove `.github/workflows/*vercel*` or similar
- Remove `scripts/smoke-test.sh` (or rewrite for container URL in CI)
- **Deliverable**: CI green on a draft PR

### Chunk 5 — Polish + docs

- Update `CLAUDE.md` testing section
- Add `tests/README.md` with how-to-run-each-layer
- Add `data-testid` audit — ensure all pages have at least `page-<name>`
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
