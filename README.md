# HASpoolManager

> 3D Printing Filament Lifecycle Manager — from purchase to print, every gram tracked.

[![CI](https://github.com/kbarthei/HASpoolManager/actions/workflows/ci.yml/badge.svg)](https://github.com/kbarthei/HASpoolManager/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

---

## Overview

HASpoolManager is a self-hosted Home Assistant addon that replaces Spoolman for Bambu Lab printer setups. It manages the complete filament lifecycle — from ordering new spools to tracking per-print costs — across 30+ spools with RFID exact matching for Bambu filaments and CIE Delta-E color-distance fuzzy matching for third-party brands. The mobile-first UI is designed for use at the printer, with direct PWA access on port 3001.

**Purchase -- Inventory -- Storage -- AMS Loading -- Print Tracking -- Usage Deduction -- Cost Analytics**

<!-- Screenshot: save a dashboard PNG to docs/images/dashboard.png and uncomment -->
<!-- ![Dashboard](docs/images/dashboard.png) -->

---

## Key Features

| Feature | Description |
|---|---|
| **AI Order Parsing** | Paste an order confirmation email — Claude extracts filament line items, quantities, unit prices, and shops automatically |
| **Smart Inventory** | Track 30+ spools across rack, AMS, surplus, and workbench with full lifecycle state machine |
| **AMS Integration** | Real-time slot status for AMS (4-slot) and AMS HT (1-slot); RFID exact match plus CIE Delta-E fuzzy matching |
| **Cost Analytics** | Per-print filament costs, per-gram price history, shopping list with live price crawling |
| **Digital Rack Twin** | Configurable 4x8 grid mirrors the physical spool rack — drag-and-drop positions, overflow areas, archive mode |
| **Full Lifecycle** | Order, receive, store, load, print, track, archive — with confidence-scored spool matching at every step |
| **Home Assistant Addon** | Webhook-based event system for print start, filament change, and finish — automatic weight deduction, no polling |
| **Apple Health Design** | Clean light/dark UI with teal accent, Geist fonts, dense mobile-first layout optimized for use at the printer |

---

## Architecture

```mermaid
graph TB
    subgraph "Home Assistant"
        HA[HA Core]
        ADDON[HASpoolManager Addon]
        NGINX[nginx reverse proxy]
    end

    subgraph "Addon Container"
        NEXT[Next.js 16 Standalone]
        API[REST API Endpoints]
        SA[Server Actions]
        ME[Spool Matching Engine]
        AI[AI Order Parser]
        PC[Price Crawler]
    end

    subgraph "Data"
        DB[(SQLite · /config/haspoolmanager.db)]
    end

    subgraph "External"
        CLAUDE[Anthropic Claude]
        SHOPS[Shop Websites]
        PWA[PWA on port 3001]
    end

    HA -->|Ingress| NGINX
    NGINX --> NEXT
    NEXT --> API
    NEXT --> SA
    API --> DB
    SA --> DB
    ME --> DB
    AI --> CLAUDE
    PC --> SHOPS
    HA -->|Webhooks| API
    PWA --> NGINX
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 16 (App Router, Server Components, Turbopack) |
| UI | shadcn/ui, Tailwind CSS v4, Geist fonts, Recharts |
| Backend | Next.js API Routes, Server Actions, Zod validation |
| Database | SQLite (better-sqlite3), Drizzle ORM |
| AI | Anthropic Claude (order parsing, price extraction) |
| Hosting | Home Assistant addon (Docker: Alpine + nginx + Next.js standalone) |
| Auth | Bearer API key (HA integration), web UI via HA ingress, direct PWA on port 3001 |
| Testing | Vitest (unit + integration with SQLite harness), Playwright (e2e) |
| CI/CD | GitHub Actions, `./ha-addon/deploy.sh` for addon deploys |

---

## Quick Start

### Prerequisites

- Node.js 22+
- Home Assistant instance with SSH access (for addon deployment)
- Anthropic API key (for AI order parsing)

### Local Development

```bash
git clone https://github.com/kbarthei/HASpoolManager.git
cd HASpoolManager
npm install
cp .env.example .env.local
# Edit .env.local — set API_SECRET_KEY and ANTHROPIC_API_KEY
npm run db:push
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Deploy to Home Assistant

```bash
./ha-addon/deploy.sh     # bumps version, builds tar, scp + install on HA
```

Requires SSH key auth to `root@homeassistant` and a writable `/addons/` directory on the HA host.

### PWA Install

After deploying the addon, open `http://<ha-host>:3001` on your phone and add to home screen for a native app experience at the printer.

### Commands

```bash
npm run dev                # Dev server (Turbopack)
npm run build              # Production build
npm run test:unit          # Unit tests (no DB needed)
npm run test:integration   # Integration tests (per-worker SQLite)
npm run test:e2e           # E2e tests (Docker nginx + ingress simulator)
npm run db:push            # Push schema to local SQLite
npm run db:studio          # Drizzle Studio
./ha-addon/deploy.sh       # Build + deploy to HA
```

---

## Documentation

| Document | Description |
|----------|-------------|
| [Architecture](docs/architecture.md) | System design, data flow, tech decisions |
| [Installation](docs/installation.md) | Installation and setup guide |
| [Configuration](docs/configuration.md) | Configuration reference |
| [API Reference](docs/architecture/api-reference.md) | All API endpoints with request/response examples |
| [Printer Sync](docs/printer-sync.md) | Printer sync, RFID matching, and fuzzy matching |
| [Test Strategy](docs/test-strategy.md) | Test pyramid, CI pipeline, spec catalogue |
| [User Stories](docs/user-stories/) | Procurement, printing, and spool management workflows |

---

## Testing

| Level | Tests | Files |
|-------|------:|------:|
| Unit | 419 | 10 |
| Integration | 60 | 6 |
| E2e | 25 | 10 |
| **Total** | **504** | **26** |

Unit tests cover the spool matching engine (RFID, CIE Delta-E, fuzzy), API route validation (Zod schemas), cost calculation, and data transformation utilities. Integration tests call route handlers directly against a per-worker SQLite harness. E2e tests run against the full addon stack: Next.js standalone, Docker nginx with production config, and a Node.js ingress simulator.

**CI pipeline:** lint + typecheck + unit + integration on every PR; e2e on main push.

---

## License

MIT — see [LICENSE](LICENSE).

---

Built with [Claude Code](https://claude.ai/code) by [@kbarthei](https://github.com/kbarthei)
