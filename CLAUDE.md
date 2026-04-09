# HASpoolManager

## Project Overview

3D Printing Filament Lifecycle Manager — a modern Next.js application replacing Spoolman. Covers the full filament journey: Purchase → Inventory → Storage → AMS Loading → Print Tracking → Usage Deduction → Cost Analytics → Reorder Alerts.

## Architecture

- **Frontend:** Next.js 16 (App Router), shadcn/ui, Tailwind CSS, Recharts, dark mode primary
- **Backend:** Next.js API Routes + Server Actions
- **Database:** SQLite (better-sqlite3), Drizzle ORM
- **Hosting:** Home Assistant Add-on (Docker container with nginx + Next.js standalone)
- **Auth:** Bearer API key for HA integration + web UI via HA ingress
- **Integration:** Home Assistant (webhooks via rest_command), Bambu Lab H2S printer (via HA)

## Key Documents

Read these before starting any implementation:

- `docs/00-project-plan.md` — Master plan with 8 phases, file structure, timeline
- `docs/01-architecture-backend.md` — SQLite schema (20 tables), API endpoints with TypeScript contracts, matching algorithm
- `docs/02-frontend-ux.md` — Complete UX spec with wireframes, component hierarchy, design system
- `docs/03-ha-integration.md` — HA automations, webhook contracts, data flows, offline fallback

## Context

- The user has a Bambu Lab H2S printer with AMS (4 slots) + AMS HT (1 slot)
- Home Assistant runs on a separate machine, accessible via SMB at /Volumes/config
- This app replaced Spoolman (30 spools migrated successfully)
- Bambu spools have RFID tags (exact match), third-party spools need fuzzy matching
- The HA config repo is at github.com/kbarthei/kb_homeassistant

## Development Commands

```bash
npm run dev                # Start dev server (Turbopack)
npm run build              # Production build
npm run test:unit          # Unit tests (419 tests, no DB needed)
npm run test:integration   # Integration tests (59 tests, per-worker SQLite harness)
npm run test:e2e           # E2e tests (25 tests, Docker nginx + ingress simulator)
npm run db:push            # Push schema to local SQLite
npm run db:studio          # Open Drizzle Studio
./ha-addon/deploy.sh       # Build + deploy addon to HA (bump version, scp, install)
```

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
- German-speaking user, but UI and code in English

## CRITICAL: Bash Commands

**NEVER prefix bash commands with `cd /path/to/project &&`.** The working directory is already the project root. Run commands directly:
- CORRECT: `npm run build`
- WRONG: `cd "/Users/kbarthei/Library/..." && npm run build`

This applies to ALL agents, subagents, and sessions. The `cd` prefix breaks auto-approve permission rules and forces manual approval of every command.
