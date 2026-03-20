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
npm run db:push      # Push schema to Neon
npm run db:studio    # Open Drizzle Studio
```

## Conventions

- Dark mode first (workshop environment)
- Mobile-first responsive design (use at the printer)
- All API routes under /api/v1/
- API key auth via Authorization: Bearer header
- German-speaking user, but UI and code in English
