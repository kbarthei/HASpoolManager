# HASpoolManager

## Project Overview

3D Printing Filament Lifecycle Manager — a modern Next.js application replacing Spoolman. Covers the full filament journey: Purchase → Inventory → Storage → AMS Loading → Print Tracking → Usage Deduction → Cost Analytics → Reorder Alerts.

## Architecture

- **Frontend:** Next.js 16 (App Router), shadcn/ui, Tailwind CSS, Recharts, dark mode primary
- **Backend:** Next.js API Routes (serverless functions on Vercel)
- **Database:** Neon Postgres via Vercel Marketplace, Drizzle ORM
- **Hosting:** Vercel
- **Auth:** API key for HA integration, simple password for web UI
- **Integration:** Home Assistant (webhooks via rest_command), Bambu Lab H2S printer (via HA)

## Key Documents

Read these before starting any implementation:

- `docs/00-project-plan.md` — Master plan with 8 phases, file structure, timeline
- `docs/01-architecture-backend.md` — Full Postgres schema (11 tables), API endpoints with TypeScript contracts, matching algorithm
- `docs/02-frontend-ux.md` — Complete UX spec with wireframes, component hierarchy, design system
- `docs/03-ha-integration.md` — HA automations, webhook contracts, data flows, offline fallback

## Context

- The user has a Bambu Lab H2S printer with AMS (4 slots) + AMS HT (1 slot)
- Home Assistant runs on a separate machine, accessible via SMB at /Volumes/config
- Currently uses Spoolman (HA addon) for spool inventory — this app replaces it
- 30 existing spools need to be migrated from Spoolman
- Bambu spools have RFID tags (exact match), third-party spools need fuzzy matching
- The HA config repo is at github.com/kbarthei/kb_homeassistant

## Development Commands

```bash
npm run dev          # Start dev server
npm run build        # Production build
npm run test:unit    # Run unit tests (246 tests, no DB needed)
npm run test:integration  # Run integration tests (50 tests, needs DB + dev server)
npm run db:push      # Push schema to Neon
npm run db:studio    # Open Drizzle Studio
```

## Testing Convention

**Every code change must include appropriate tests.** Follow the test pyramid:

### What to test where

| Change type | Required tests | Command |
|-------------|---------------|---------|
| Pure function in `lib/` | Unit test in `tests/unit/` | `npm run test:unit` |
| API endpoint | Integration test in `tests/integration/` | `npm run test:integration` |
| New UI page/route | E2e spec in `tests/e2e/` + update smoke test | `npx playwright test` |
| Schema change | Update fixtures in `tests/fixtures/seed.ts` | — |

### Rules

- **Import real code** in unit tests — never re-implement logic inline
- **Use `data-testid`** for e2e selectors — never match on text content
- **Extract pure functions** from route handlers into `lib/` modules for testability
- **Run `npm run test:unit` before committing** — must pass
- **Run `npm run test:integration` if backend changed** — must pass

### Test file locations

```
tests/
  unit/              # Pure functions, no DB (vitest)
  integration/       # API endpoints with real DB (vitest)
  e2e/               # Browser tests (playwright)
  fixtures/seed.ts   # Factory functions for test data
```

### Templates

See `docs/test-templates.md` for copy-paste patterns.

### CI Pipeline

- **Always** (PR + push): lint + typecheck + unit tests
- **Backend changes** (push to main): integration tests
- **Main only**: e2e tests + smoke tests against production

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
