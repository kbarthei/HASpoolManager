# HASpoolManager

## Project Overview

3D Printing Filament Lifecycle Manager — a modern Next.js application covering the full filament journey: Purchase → Inventory → Storage → AMS Loading → Print Tracking → Usage Deduction → Cost Analytics → Reorder Alerts.

## Architecture

- **Frontend:** Next.js 16 (App Router), shadcn/ui, Tailwind CSS, Recharts, dark mode primary
- **Backend:** Next.js API Routes + Server Actions
- **Database:** SQLite (better-sqlite3), Drizzle ORM
- **Hosting:** Home Assistant Add-on (Docker container with nginx + Next.js standalone)
- **Auth:** Bearer API key for HA integration + web UI via HA ingress
- **Integration:** Home Assistant (native websocket sync worker, zero-config), Bambu Lab H2S printer (via HA)

## Key Documents

Read these before starting any implementation:

- `docs/architecture.md` — System architecture, container layout, request flow, matching engine
- `docs/configuration.md` — All config options, HA integration, network ports
- `docs/printer-sync.md` — Print lifecycle, weight deduction, spool matching, AMS tracking
- `docs/architecture/api-reference.md` — All 22 API endpoints with request/response examples
- `docs/architecture/data-model.md` — ER diagram and all 20 tables explained

## Context

- The user has a Bambu Lab H2S printer with AMS (4 slots) + AMS HT (1 slot)
- Home Assistant runs on a separate machine, accessible via SMB at /Volumes/config
- Managing 30+ spools across physical storage and AMS slots
- Bambu spools have RFID tags (exact match), third-party spools need fuzzy matching
- The HA config repo is at github.com/kbarthei/kb_homeassistant

## Development Commands

```bash
npm run dev                # Start dev server (Turbopack)
npm run build              # Production build
npm run test:unit          # Unit tests (419 tests, no DB needed)
npm run test:integration   # Integration tests (75 tests, per-worker SQLite harness)
npm run test:e2e           # E2e tests (25 tests, Docker nginx + ingress simulator)
npm run db:push            # Push schema to local SQLite
npm run db:studio          # Open Drizzle Studio
./ha-addon/deploy.sh       # Build + deploy addon to HA (bump version, scp, install)
```

## Test Data (gitignored, local only)

```
testdata/
  db-snapshots/          # Production DB copies (prod-YYYY-MM-DD.db)
  csv-imports/           # Sample CSVs for order import testing
```

- Snapshot the prod DB before risky changes: `cp data/haspoolmanager.db testdata/db-snapshots/prod-$(date +%Y-%m-%d).db`
- Keep test CSVs and sample invoices in `testdata/csv-imports/`
- This directory is gitignored — never committed, local only

## Testing Convention

**Every code change must include appropriate tests.** Follow the test pyramid:

### What to test where

| Change type | Required tests | Command |
|-------------|---------------|---------|
| Pure function in `lib/` | Unit test in `tests/unit/` | `npm run test:unit` |
| API endpoint | Integration test in `tests/integration/` | `npm run test:integration` |
| New UI page/route | E2e spec in `tests/e2e/` | `npm run test:e2e` |
| Schema change | Update fixtures + regenerate migrations | `npx drizzle-kit generate` |

### Rules

- **Import real code** in unit tests — never re-implement logic inline
- **Use `data-testid`** for e2e selectors — never match on text content
- **Extract pure functions** from route handlers into `lib/` modules for testability
- **Run `npm run test:unit` before committing** — must pass
- **Run `npm run test:integration` if backend changed** — must pass
- **New pages need `data-testid="page-<name>"`** on the root element
- **Keep `docs/test-strategy.md` in sync** — when adding/removing/renaming specs or changing test counts, update the spec catalogue in §4 and the pyramid counts in §1. The strategy doc is the single source of truth for what is tested and what is planned.

### Test architecture

```
tests/
  harness/
    sqlite-db.ts        # Per-worker SQLite DB with schema migration
    request.ts          # NextRequest helpers for direct route-handler calls
    addon-stack.ts       # E2e orchestrator: Next.js standalone + Docker nginx + ingress simulator
    ingress-simulator.ts # Node.js proxy mimicking HA's aiohttp ingress
  fixtures/seed.ts       # Factory functions (makeVendor, makeFilament, makeSpool, etc.)
  unit/                  # Pure functions, no DB (vitest)
  integration/           # Route handlers called directly against SQLite harness (vitest)
  e2e/                   # Playwright specs against the full addon stack
```

Integration tests call route handlers directly via `NextRequest` — no dev server, no HTTP. The per-worker SQLite harness (`setupTestDb()`) ensures complete isolation from production data. A safety guard refuses to run if `SQLITE_PATH` points outside `tests/tmp/`.

E2e tests run against the real HA addon stack: `npm run build` with `HA_ADDON=true` (basePath=/ingress), Docker nginx with the production `nginx.conf`, and a Node.js ingress simulator. Requires Docker (OrbStack or Docker Desktop).

### CI Pipeline

- **Always** (PR + push): lint + typecheck + unit tests + integration tests
- **Main push only**: e2e tests (Docker nginx + Playwright)
- No external secrets needed — everything runs against local SQLite

## Conventions

- Apple Health inspired design, light + dark mode (system preference), teal accent
- Mobile-first responsive design (use at the printer)
- Dense layout (compact padding, tight rows)
- All API routes under /api/v1/
- API key auth via Authorization: Bearer header
- German-speaking user, but **all UI text and code in English** — no hardcoded German strings in components

## Data Integrity

This app tracks physical objects (filament spools) connected to real hardware (3D printer).
Wrong data = wrong cost tracking, missed prints, incorrect inventory. Treat data bugs as critical.

- **Never assume event ordering.** The printer can go IDLE→RUNNING→FAILED in under a second. The sync worker may see events out of order after a restart.
- **Parse HA values defensively.** HA sends `"unavailable"`, `"unknown"`, `"None"`, `"on"/"off"` as strings. Use `str()`, `num()`, `bool()` helpers from `lib/printer-sync-helpers.ts` — never raw `parseInt()` or `=== true`.
- **`print_error` is an integer error code**, not a boolean. HA's `binary_sensor` gives `"on"/"off"`, but the actual error code (e.g., `0x07038011` for filament runout) comes only via `bambu_lab_event`. Don't parse it as `bool()`.
- **Failed prints with no progress data → skip weight deduction.** Don't charge full slicer weight when `progress` is null (print failed before extrusion started).
- **Stale prints:** If a print is "running" for >24h, auto-close as failed. Otherwise it blocks all future print tracking.
- **SQLite WAL:** When copying the DB (SCP, backup), always include `.db-wal` and `.db-shm` files. Data in the WAL is invisible without them.

## Sync Worker & HA Integration

The sync worker is the heart of the system — a background Node.js process alongside Next.js.

- **Token loading:** `SUPERVISOR_TOKEN` comes from `/run/s6/container_environment/`, not environment variables. Load it in `run.sh` BEFORE starting Next.js and the sync worker.
- **Entity mapping:** HA's `original_name` is **localized** (German "Druckstatus", not English "Print Status"). Map by both German and English names. Never assume English.
- **After restart, read initial state.** `isActive` starts as `false`. If a print is already running, the first `state_changed` event won't fire (state didn't change). Read `gcode_state` immediately after discovery.
- **Event throttling:** Only trigger full sync on important state changes (`gcode_state`, `print_error`, `active_slot`, tray changes). Skip progress%, layer count, remaining time — those are handled by watchdog poll.
- **Swap detection:** Use `bambu_lab_event: event_print_error`, not `binary_sensor` state. The binary_sensor only gives on/off, not the error code needed to identify which tray ran out.
- **Server Actions via nginx:** The direct-access nginx (port 3001) must set `Host: $host:$server_port` so `x-forwarded-host` matches the browser's `Origin` header. Without port, Server Actions reject with 500.

## Security Rules

- **Admin/mutation endpoints:** `requireAuth` (Bearer token required)
- **Read-only UI endpoints** (spools GET, printers GET, sync-log GET): `optionalAuth` (browser has no token, HA ingress handles auth)
- **Port 3001 is unauthenticated by design** — LAN-only PWA access. All sensitive endpoints must use `requireAuth`.
- **Raw SQL** (`sql.raw()`, `db.all()`): Use `better-sqlite3` readonly mode. Block semicolons and multi-statements. Sanitize error messages (don't expose table/column names).
- **No dynamic code execution** with user-controlled data
- **Validate URLs before server-side fetch** (order parser, price crawler) — prevent SSRF
- **Never expose raw error details** in API responses — log server-side, return generic message

## Component Standards

- Use `cn()` from `@/lib/utils` for conditional classNames — never template string concatenation
- shadcn/ui uses `@base-ui/react` (not Radix) — use `onClick` not `onSelect` for menu items
- Client components: handle fetch errors gracefully (non-200 responses, network failures). A failed API call must **never** break page rendering — show fallback UI or empty state.
- Server Components for data-heavy pages, Client wrappers only where interactivity needed
- CSS colors: use hex values (`#0d9488`), not `hsl(var(--primary))`. The CSS variables store hex, not HSL — `hsl()` wrapper produces invisible/black output.
- CSS animations: always add `@media (prefers-reduced-motion: reduce)` fallback
- Interactive elements with `role="button"`: handle both `Enter` and `Space` keys + set `aria-expanded` for toggles
- Inline styles with DB values (colors, etc.): sanitize with regex before interpolation
- `data-testid` on every new page root (`page-<name>`) and interactive component

## Database Changes

Schema changes require 3 steps — all three, every time:

1. **Edit `lib/db/schema.ts`** — add/modify the column
2. **Run `npx drizzle-kit generate`** — creates migration SQL in `lib/db/migrations/`
3. **Add to `scripts/migrate-db.js`** — idempotent check (`PRAGMA table_info`) + `ALTER TABLE`

The migration script runs automatically on every addon start before Next.js boots.
Integration tests use the Drizzle migrator — if the migration file is missing, tests will fail with "no such column".

Never edit a committed migration file — generate a follow-up migration instead.

## Code Quality

- Functions longer than 40 lines — split into smaller functions
- Logic duplicated more than twice — extract to `lib/` utility
- No `any` types — use real types or `unknown`
- `require()` is forbidden in TypeScript files — use ES `import` (lint rule)
- Don't shadow reserved names — use `moduleId` not `module`, `className` not `class`
- Async operations need error handling — `try/catch` or `.catch()`
- E2e tests: use `data-testid` selectors, not text content matchers. Use condition waits (`toBeVisible`, `toHaveAttribute`) instead of `waitForTimeout`.
- E2e paths: `"./"` for dashboard (root), `"ingress/<page>"` for sub-pages (matches ingress simulator convention)
- Empty directories need `.gitkeep` — Git doesn't track empty dirs, CI will fail if a build step expects them

## CRITICAL: Bash Commands

**NEVER prefix bash commands with `cd /path/to/project &&`.** The working directory is already the project root. Run commands directly:
- CORRECT: `npm run build`
- WRONG: `cd "/Users/kbarthei/Library/..." && npm run build`

This applies to ALL agents, subagents, and sessions. The `cd` prefix breaks auto-approve permission rules and forces manual approval of every command.
