# Test Strategy — HASpoolManager

## 1. Test Pyramid

```
┌──────────────────────────────────────────────┐
│ E2e (Playwright + Docker nginx + ingress)    │  ~50 tests (18 specs)
├──────────────────────────────────────────────┤
│ Integration (Vitest + SQLite file DB)        │ 165 tests (19 files)
├──────────────────────────────────────────────┤
│ Unit (Vitest, no DB)                         │ 514 tests (20 files)
└──────────────────────────────────────────────┘
Total: ~729 tests — CI runs unit + integration on every push,
e2e only on `main` push (~2 min total).
```

### Layer responsibilities

| Layer | Runs against | Tests | Does NOT test |
|-------|--------------|-------|---------------|
| **Unit** | Pure functions, no IO | Helpers (num/str/bool), matching scores, color normalisation, Zod schemas, date math, weight-delta math, storage moves, Bambu state classification, sync helpers, slot-def building | DB, HTTP, React rendering |
| **Integration** | Real SQLite file DB via in-process Next.js | API round-trips: printer-sync lifecycle, AMS slot matching, spool auto-create, usage/cost delta, CRUD endpoints, auth rules, racks + AMS units APIs, multi-AMS sync | UI, nginx rewriting, hydration, client JS |
| **E2e** | Built HA addon container + ingress simulator (Playwright) | User journeys from the browser perspective, exercising nginx ingress rewriting, basePath injection, hydration, client-side navigation, form interactions | API edge cases (covered by integration), pure logic (covered by units) |

## 2. Database

- Integration tests boot a fresh SQLite file per worker at `tests/tmp/test-<workerid>.db` via the per-worker harness (`tests/harness/sqlite-db.ts`).
- Schema is applied by importing `lib/db/schema.ts` and running the Drizzle migrator against the generated SQL files in `lib/db/migrations/`.
- Fixtures in `tests/fixtures/seed.ts` take a Drizzle `db` instance — no globals.
- Safety guard refuses to set `SQLITE_PATH` outside `tests/tmp/`, so a misconfigured run can never touch production data.
- E2e: dedicated SQLite file at `tests/tmp/e2e.db`, accessed by both the running addon container and the test process via WAL mode.

## 3. E2e specification

### Principles

1. Every spec runs against the real built container behind the ingress simulator. No bare dev server.
2. Each spec seeds its own data via direct SQLite writes in `beforeAll`, then asserts the UI reflects it.
3. Selectors are `data-testid`. If a selector is missing, add it to the component first.
4. One user journey per spec file. No omnibus specs.
5. Assertions are explicit and UI-observable. Not internal state.
6. Fixture data is scoped via distinct names (`e2e-` prefix).

### Spec catalogue

| Spec file | Journey |
|-----------|---------|
| `01-smoke.spec.ts` | Home page renders stat cards + health API reachable through full stack |
| `02-navigation.spec.ts` | Navigate to all 7 real pages, assert `page-<name>` testid visible, URL retains ingress prefix |
| `03-spools-list.spec.ts` | Seed 2 spools, visit /spools, assert they render |
| `04-admin-config.spec.ts` | Visit /admin, assert SQLite + HA Integration + AI Integration sections visible |
| `05-ingress-asset-loads.spec.ts` | Load home, collect all network responses, assert zero 404s |
| `06-prints-history.spec.ts` | Seed a finished print, verify /prints shows print name, /history renders |
| `07-hydration-clean.spec.ts` | Load all 8 pages, assert zero console errors and no React #418 hydration messages |
| `08-orders-page.spec.ts` | Seed shop + order + item, assert /orders renders |
| `09-scan-page.spec.ts` | Visit /scan, assert "Scan a Spool" heading visible |
| `10-inventory-page.spec.ts` | Seed printer + AMS slots + spool, assert /inventory renders |
| `11-dark-mode.spec.ts` | Toggle theme, verify CSS variable changes, reload persists |
| `11-inventory-multi.spec.ts` | Inventory renders enabled AMS unit by displayName, hides disabled unit; both rack-section testids visible |
| `12-admin-racks.spec.ts` | Admin RacksCard renders seeded rack + Add Rack entry-point |
| `12-scan-flow.spec.ts` | Paste synthetic tag on /scan, assert match result |
| `13-admin-ams-units.spec.ts` | Admin AmsUnitsCard renders seeded unit row + enabled-toggle state |
| `13-mobile-viewport.spec.ts` | All key pages render correctly at 375×667 |
| `14-analytics-page.spec.ts` | /analytics renders + reachable via top-tabs nav |
| `15-diagnostics.spec.ts` | Diagnostics dashboard renders sections + admin links to it |

> **Pages anchored:** dashboard, spools, inventory, orders, prints, history, admin, scan (8 total, 7 navigable + root). Each has `data-testid="page-<name>"` on the root.
>
> **Note on duplicate numbers (11, 12, 13):** spec filenames duplicated when new tests landed beside legacy ones; functional, but a future renumbering pass would tidy it.

### Test data

`tests/e2e/fixtures.ts` exports `openE2eDb()` which opens the shared SQLite
file at `E2E_DB_PATH` directly via better-sqlite3 in WAL mode. Faster and
more reliable than HTTP seeding: the test process inserts fixtures, the
standalone Next.js server reads them through the same file.

### Ingress-specific assertions

Specs `05-ingress-asset-loads` and `07-hydration-clean` explicitly cover
asset loading and hydration. Other specs naturally validate that the
ingress path works because they navigate via the simulator's base URL,
and any prefix mismatch causes immediate 404s.

### Running e2e locally

```bash
npm run test:e2e              # builds container, starts it, runs simulator + Playwright
npm run test:e2e -- --ui      # headed mode for debugging
npm run test:e2e -- --grep navigation  # single spec
```

## 4. Coverage goals

| Area | Target | How measured |
|------|--------|--------------|
| `lib/printer-sync-helpers.ts` | 95% | vitest --coverage |
| `lib/matching.ts` | 90% | vitest --coverage |
| `lib/db/sql-helpers.ts` | 80% | vitest --coverage |
| `lib/color.ts` | 95% | vitest --coverage |
| `lib/validations.ts` | 80% | vitest --coverage |
| `/api/v1/events/printer-sync` | 90% (via integration) | functional |
| Nginx ingress behaviour | Binary (all e2e green) | e2e suite |
| Hydration correctness | Binary (zero errors on every page) | spec 07 |

## 5. Scripts

```jsonc
{
  "scripts": {
    "dev": "node scripts/clean-cache.js && next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint",
    "test": "vitest run",
    "test:unit": "vitest run tests/unit",
    "test:integration": "vitest run tests/integration",
    "test:e2e": "playwright test",
    "db:push": "drizzle-kit push",
    "db:studio": "drizzle-kit studio"
  }
}
```

## 6. Anti-patterns

- **Conceptual tests** that re-implement logic inline. Always import the real function.
- **Text selectors in Playwright.** Use `data-testid` (or `getByRole` for native semantics).
- **Testing implementation details.** Test observable behaviour.
- **`waitForTimeout`.** Use auto-waiting (`toBeVisible`, `toHaveAttribute`).
- **Mocking the DB.** Use a real SQLite file via the harness.
- **Bare dev-server e2e.** Go through the container + ingress simulator.
- **Global fixtures that leak across tests.** Use per-test seeding with `e2e-` / test-specific prefixes.
- **Wrapping list responses in `{ data: ... }`.** All `/api/v1/*` GETs return the bare array/object.

## 7. Feature shipping checklist

Every PR:

```
□ Pure logic extracted to lib/ with unit tests
□ API endpoint has an integration test (happy + error + auth)
□ Zod schema validates request body
□ data-testid on any new page root + interactive elements
□ E2e spec for any new user journey
□ docs/development/testing.md updated if pyramid counts or spec catalogue changed
□ CI green (lint + unit + integration on every push, e2e on main)
```

## 8. Adding a new schema migration

```
1. Edit lib/db/schema.ts (source of truth)
2. npx drizzle-kit generate          → new lib/db/migrations/NNNN_*.sql
3. Add idempotent {check, apply} entry to scripts/migrate-db.js
4. Pre-deploy verify via /api/v1/admin/sql/execute dryRun
5. Snapshot prod DB before deploy:
   cp /Volumes/config/haspoolmanager.db* testdata/db-snapshots/prod-YYYY-MM-DD-pre-X.db*
6. Deploy: ./ha-addon/deploy.sh
7. Watch addon logs for "Applying:" + "Applied N migration(s)"
8. Verify schema via /api/v1/admin/query against sqlite_master
```
