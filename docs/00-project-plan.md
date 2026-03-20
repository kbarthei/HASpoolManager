# HASpoolManager — Project Plan

## Vision

A modern, self-hosted 3D printing filament lifecycle manager that covers the full journey from purchase to empty spool. Replaces Spoolman with a Next.js application that integrates deeply with Home Assistant and Bambu Lab printers.

## Scope

```
DISCOVER → PURCHASE → RECEIVE → STORE → LOAD → PRINT → MONITOR → REORDER
```

| Phase | What happens | Where |
|---|---|---|
| Discover | Browse filament, compare prices | App (future: price API) |
| Purchase | Record order, vendor, cost | App: Orders page |
| Receive | Create spools, assign location, map NFC tag | App: Quick-Add flow |
| Store | Track location (shelf, dry box, AMS) | App: Inventory |
| Load | Detect spool in AMS via RFID/tag | HA → App webhook |
| Print | Track usage, match spool, deduct weight | HA → App webhook |
| Monitor | Low stock alerts, cost analytics | App: Dashboard + Analytics |
| Reorder | Suggest reorders based on thresholds | App: Orders page |

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 16 (App Router), shadcn/ui, Tailwind CSS, Recharts |
| Backend | Next.js API Routes (serverless functions) |
| Database | Neon Postgres (via Vercel Marketplace) |
| ORM | Drizzle ORM + drizzle-kit migrations |
| Hosting | Vercel (free tier initially) |
| Auth | API key (HA), simple password (web UI) |
| Integration | HA REST commands (webhooks), Spoolman REST API (migration) |

## Architecture Overview

```
Bambu Lab H2S ─── MQTT ──→ Home Assistant
                              │
                    HA Automations
                    (lifecycle events)
                              │
                    rest_command (webhook)
                              │
                              ▼
                    HASpoolManager (Vercel)
                    ├── Next.js App Router
                    ├── /api/v1/events/*  (webhooks from HA)
                    ├── /api/v1/spools/*  (CRUD)
                    ├── /api/v1/match     (spool matching)
                    ├── /api/v1/stats     (analytics)
                    └── /dashboard        (UI)
                              │
                              ▼
                    Neon Postgres
                    (vendors, filaments, spools,
                     prints, orders, tag_mappings)
```

## Database Schema

11 tables: `vendors`, `filaments`, `spools`, `tag_mappings`, `printers`, `ams_slots`, `prints`, `print_usage`, `orders`, `order_items`, `api_keys`

Full SQL in `docs/01-architecture-backend.md`.

## Key Features

### 1. Dual Spool Matching
- **RFID tagged (Bambu):** Exact match via `tag_uid` → instant, 100% confidence
- **Untagged (third-party):** Fuzzy scoring on material, color (CIE Delta-E), vendor, name tokens, AMS location
- **Unknown RFID:** Prompt user to map tag to spool, then future matches are instant

### 2. Print Lifecycle Tracking
- Print started → capture filament data, create print record
- Filament changed mid-print → track multi-filament usage (new capability!)
- Print finished/canceled → deduct weight, calculate cost
- Offline fallback → HA keeps working with local Spoolman script

### 3. Procurement
- Order tracking with vendor, items, costs, delivery status
- "Mark Received" flow → auto-creates spools in inventory
- Reorder suggestions based on configurable thresholds
- Cost analytics: spend per material, per vendor, per month

### 4. AMS Visualization
- Live view of all AMS slots with spool colors and remaining %
- Spool picker for empty slots
- Auto-sync via HA webhook on slot changes

### 5. Mobile-First Dashboard
- PWA for iPhone (add to home screen)
- Bottom navigation, large touch targets
- Quick spool lookup at the printer
- HA panel/iframe integration (compact + full mode)

## Virtual Project Team

| Role | Responsibilities | Skills Used |
|---|---|---|
| **Project Lead** | Plan, coordinate, review | writing-plans, executing-plans |
| **Backend Developer** | DB schema, API routes, matching algorithm | Next.js, Drizzle, Postgres |
| **Frontend Developer** | UI components, pages, responsive design | shadcn/ui, Tailwind, Recharts |
| **Integration Engineer** | HA automations, webhook handling, Spoolman migration | HA YAML, REST APIs |
| **Security Reviewer** | API auth, input validation, CORS | OWASP, auth patterns |
| **QA Tester** | Test matching algorithm, webhook flows, UI | Testing, edge cases |

## Implementation Phases

### Phase 0: Project Setup (Day 1)
- [ ] Initialize Next.js 16 project with shadcn/ui
- [ ] Set up Vercel project, link to GitHub
- [ ] Provision Neon Postgres via Vercel Marketplace
- [ ] Configure Drizzle ORM, create initial migration
- [ ] Set up environment variables (DB URL, API secrets)
- [ ] Deploy hello-world to Vercel

### Phase 1: Database & Core API (Days 2-4)
- [ ] Implement full database schema (11 tables)
- [ ] Run migrations against Neon
- [ ] CRUD API routes for vendors, filaments, spools
- [ ] API key authentication middleware
- [ ] Seed data: import existing spools from Spoolman API
- [ ] Tests for all CRUD operations

### Phase 2: Spool Matching Engine (Days 5-6)
- [ ] Implement RFID exact match (Tier 1)
- [ ] Implement fuzzy matching with CIE Delta-E color distance (Tier 2)
- [ ] Implement unknown tag mapping flow (Tier 3)
- [ ] `/api/v1/match` endpoint with confidence scoring
- [ ] Tests with real Bambu filament data from current HA entities
- [ ] Configurable match weights

### Phase 3: Event Webhooks (Days 7-8)
- [ ] `/api/v1/events/print-started` endpoint
- [ ] `/api/v1/events/print-finished` endpoint with auto-deduction
- [ ] `/api/v1/events/filament-changed` endpoint (multi-filament)
- [ ] `/api/v1/events/ams-slot-changed` endpoint
- [ ] Idempotency via `ha_event_id`
- [ ] HA automations (rest_commands + automations YAML)
- [ ] End-to-end test: simulate print lifecycle via webhook calls

### Phase 4: Frontend — Core Pages (Days 9-14)
- [ ] App shell: sidebar (desktop) + bottom nav (mobile)
- [ ] Dashboard page with stats, AMS mini-view, alerts
- [ ] Spool inventory page (grid/list, filters, search)
- [ ] Spool detail page (info, usage history, cost)
- [ ] AMS status page with slot visualization
- [ ] Quick-add spool dialog/sheet
- [ ] Dark mode, responsive design

### Phase 5: Frontend — Extended Pages (Days 15-18)
- [ ] Print history page with cost breakdown
- [ ] Orders/procurement page (order tracking, mark received)
- [ ] Analytics page (charts: monthly spend, material breakdown, vendor comparison)
- [ ] Settings page (printers, API keys, thresholds, locations)
- [ ] HA panel/iframe modes (?mode=panel, ?mode=compact)
- [ ] PWA manifest + service worker

### Phase 6: HA Integration (Days 19-20)
- [ ] Create HA rest_commands in configuration.yaml
- [ ] Replace `3DPrinter_Druck_finished` automation with webhook version
- [ ] Add new automations: filament-changed, ams-slot-changed
- [ ] Add REST sensors reading from HASpoolManager API
- [ ] Add panel_iframe to HA configuration
- [ ] Keep Spoolman script as offline fallback
- [ ] End-to-end test: real print on Bambu H2S

### Phase 7: Data Migration & Polish (Days 21-23)
- [ ] Spoolman → HASpoolManager migration script (vendors, filaments, spools, tag mappings)
- [ ] Import print history from HA database
- [ ] Tag UID mapping for existing Bambu spools
- [ ] Security review: API auth, input validation, CORS, rate limiting
- [ ] Performance testing: 100+ spools, dashboard load time
- [ ] Documentation: setup guide, API reference

### Phase 8: Go Live (Day 24)
- [ ] Final deployment to Vercel production
- [ ] Switch HA automations to HASpoolManager webhooks
- [ ] Verify all print lifecycle events flow correctly
- [ ] Remove Spoolman entity disable automation (no longer needed)
- [ ] Celebrate

## Open Questions

1. **Vercel vs. Ionos?** Vercel is easier (serverless, managed), Ionos gives more control (persistent process, local network access). For Bambu MQTT direct access (future), Ionos would be needed.
2. **Keep Spoolman running in parallel?** During migration, yes. After migration, Spoolman can be the offline fallback or removed entirely.
3. **Multi-printer?** Schema supports it. UI designed for it. But initially one printer (H2S).
4. **Price API integration?** Future: scrape/API for filament prices from Amazon/vendors. Not in v1.
5. **NFC tag writing?** Future: FilaMan hardware or OpenSpoolman for writing tags on third-party spools.

## File Structure

```
HASpoolManager/
├── app/
│   ├── layout.tsx                 # Root layout, theme, fonts
│   ├── (app)/
│   │   ├── layout.tsx             # App shell (sidebar + bottom nav)
│   │   ├── page.tsx               # Dashboard
│   │   ├── spools/
│   │   │   ├── page.tsx           # Inventory
│   │   │   ├── [id]/page.tsx      # Detail
│   │   │   └── new/page.tsx       # Add spool
│   │   ├── ams/page.tsx           # AMS status
│   │   ├── prints/page.tsx        # Print history
│   │   ├── orders/
│   │   │   ├── page.tsx           # Orders list
│   │   │   └── [id]/page.tsx      # Order detail
│   │   ├── analytics/page.tsx     # Charts & stats
│   │   └── settings/page.tsx      # Configuration
│   └── api/
│       └── v1/
│           ├── vendors/route.ts
│           ├── filaments/route.ts
│           ├── spools/route.ts
│           ├── printers/route.ts
│           ├── prints/route.ts
│           ├── orders/route.ts
│           ├── tags/route.ts
│           ├── match/route.ts
│           ├── events/
│           │   ├── print-started/route.ts
│           │   ├── print-finished/route.ts
│           │   ├── filament-changed/route.ts
│           │   └── ams-slot-changed/route.ts
│           ├── stats/route.ts
│           └── health/route.ts
├── components/
│   ├── layout/                    # Sidebar, bottom nav, top bar
│   ├── spool/                     # Spool card, list, filters, progress
│   ├── ams/                       # AMS unit, slot visualization
│   ├── prints/                    # Print entry card, cost summary
│   ├── orders/                    # Order card, reorder suggestions
│   ├── analytics/                 # Charts, stat cards
│   └── shared/                    # Alert banner, search, data table
├── lib/
│   ├── db/
│   │   ├── schema.ts              # Drizzle ORM schema
│   │   ├── index.ts               # DB connection
│   │   └── migrations/            # SQL migrations
│   ├── auth.ts                    # API key verification
│   ├── matching.ts                # Spool matching algorithm
│   ├── color.ts                   # CIE Delta-E color distance
│   └── utils.ts                   # Shared utilities
├── docs/
│   ├── 00-project-plan.md         # This file
│   ├── 01-architecture-backend.md # DB schema, API design
│   ├── 02-frontend-ux.md          # UX spec, wireframes
│   └── 03-ha-integration.md       # HA automations, data flows
├── drizzle.config.ts
├── next.config.ts
├── tailwind.config.ts
├── package.json
└── README.md
```

## Design Principles

1. **Dark mode first** — workshop/printer room environment
2. **Mobile-first** — use at the printer with one hand
3. **Offline resilient** — HA keeps working if app is down
4. **No entity explosion** — minimal HA entities, business logic in the app
5. **Exact before fuzzy** — RFID match first, fuzzy only as fallback
6. **One source of truth** — the app's Postgres DB, not scattered HA helpers
