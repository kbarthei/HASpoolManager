# HASpoolManager — HA Addon Deployment Research

## 1. Can a Next.js App Run as a HA Addon?

**Yes.** HA addons are Docker containers managed by the HA Supervisor. Any application that can be containerized can be an addon. Next.js with `output: "standalone"` produces a minimal Node.js server perfect for this.

### Constraints

| Resource | Typical HA Hardware | HASpoolManager Needs |
|----------|-------------------|---------------------|
| CPU | 2-4 cores (RPi 4/5, NUC) | Low — mostly REST API calls, no SSR-heavy pages |
| RAM | 2-8 GB shared with HA | ~100-200 MB for Node.js + SQLite |
| Disk | 32-128 GB SD/SSD | ~200 MB image + DB grows slowly |
| Architectures | aarch64 (RPi), amd64 (NUC/x86) | Both supported by Node.js |

The app is a CRUD tool with occasional AI calls — far lighter than HA itself. A Raspberry Pi 4 or any NUC handles it easily.

### Architecture Support

HA addons declare supported architectures in `config.yaml`. The HA base images handle multi-arch automatically:
- **aarch64** — Raspberry Pi 4/5, most ARM SBCs
- **amd64** — Intel NUCs, x86 servers
- **armv7** — Older Pi models (optional, Node.js support limited)

## 2. How to Create a HA Addon

### Repository Structure

```
hassio-haspoolmanager/
├── repository.yaml          # Addon repo metadata
└── haspoolmanager/
    ├── config.yaml           # Addon configuration
    ├── build.yaml            # Multi-arch build settings
    ├── Dockerfile            # Container definition
    ├── run.sh                # Startup script
    ├── icon.png              # 128x128 addon icon
    ├── logo.png              # 128x128 addon logo
    ├── CHANGELOG.md
    ├── DOCS.md
    └── translations/
        └── en.yaml
```

### config.yaml (Draft)

```yaml
name: HASpoolManager
version: "0.1.0"
slug: haspoolmanager
description: 3D Printing Filament Lifecycle Manager
url: "https://github.com/kbarthei/HASpoolManager"
arch:
  - aarch64
  - amd64
startup: application
ingress: true
ingress_port: 3000
ingress_entry: /
init: false
map:
  - addon_config:rw        # Persistent data (SQLite DB)
options:
  log_level: "info"
schema:
  log_level: str
```

### Dockerfile (Draft — Multi-stage)

```dockerfile
# Stage 1: Build
FROM node:24-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# Stage 2: Production
FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Copy standalone output
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

EXPOSE 3000
CMD ["node", "server.js"]
```

### Ingress: How Authentication Works

When `ingress: true` is set:

1. HA Supervisor acts as a reverse proxy for the addon
2. Users access the addon through the HA sidebar — no separate login needed
3. HA authenticates the user first, then proxies to the addon on port 3000
4. The addon receives headers: `X-Ingress-Path`, `X-Remote-User-ID`, `X-Remote-User-Name`, `X-Remote-User-Display-Name`
5. Only connections from `172.30.32.2` (the HA Supervisor) are allowed
6. **No API key or password auth needed** — HA handles everything

**Critical path constraint:** Ingress serves the app under a dynamic sub-path like `/api/hassio_ingress/<token>/`. The app must use relative paths or read the `X-Ingress-Path` header. Next.js `basePath` is a **build-time** setting, so the addon must either:
- Use relative paths throughout (preferred)
- Build with a fixed `basePath` and configure ingress accordingly
- Use Next.js middleware to rewrite paths dynamically

### Development Workflow

1. Develop locally with `npm run dev` as usual
2. Build Docker image: `docker build -t haspoolmanager .`
3. Test locally: `docker run -p 3000:3000 haspoolmanager`
4. Push to a GitHub repo as an addon repository
5. Add the repo URL in HA: Settings > Add-ons > Repositories
6. Install from the HA addon store
7. Updates: bump version in `config.yaml`, rebuild image, HA detects the update

## 3. Database Considerations

### Current Setup: Neon Postgres (Cloud)

The schema in `lib/db/schema.ts` uses 17 tables with Postgres-specific features:
- `uuid()` primary keys with `defaultRandom()`
- `pgTable()` definitions
- `timestamp({ withTimezone: true })`
- `jsonb()` columns (in `auto_supply_log`)
- `numeric()` with precision/scale
- `real()` columns
- `text().array()` (in `api_keys.permissions`)
- `check()` constraints
- `uniqueIndex()` and `index()`

### SQLite Migration: What Changes

| Postgres Feature | SQLite Equivalent | Migration Effort |
|-----------------|-------------------|-----------------|
| `uuid()` PK | `text()` PK + `crypto.randomUUID()` | Medium — change all FK types too |
| `pgTable()` | `sqliteTable()` | Find-and-replace |
| `timestamp({ withTimezone })` | `integer()` (Unix epoch) or `text()` (ISO string) | Medium — affects queries |
| `jsonb()` | `text()` + JSON.parse/stringify | Low — only 1 column |
| `numeric(precision, scale)` | `real()` | Low — lose precision guarantees |
| `text().array()` | `text()` + JSON | Low — only 1 column |
| `check()` constraints | Not supported natively in Drizzle SQLite | Remove or enforce in app code |
| `date()` type | `text()` (ISO date strings) | Low |
| `@neondatabase/serverless` | `better-sqlite3` | Change `lib/db/index.ts` |
| `drizzle-orm/neon-http` | `drizzle-orm/better-sqlite3` | Change driver import |

### Estimated Migration Effort

**Schema file:** 2-4 hours. Rewrite `lib/db/schema.ts` to use `sqliteTable`, `text` for UUIDs, `integer` for timestamps. The schema is ~650 lines with 17 tables — substantial but mechanical.

**Database connector:** 30 minutes. Replace `lib/db/index.ts` with `better-sqlite3` driver.

**Drizzle config:** 10 minutes. Change dialect to `sqlite` in `drizzle.config.ts`.

**Query adjustments:** 2-4 hours. Audit all queries for Postgres-specific SQL (timezone handling, array operations, JSON queries). Most Drizzle queries are dialect-agnostic, but raw SQL fragments need review.

**Data migration script:** 1-2 hours. Export from Neon, transform UUIDs/timestamps, import to SQLite.

**Total: ~1-2 days of focused work.**

### Dual-Driver Approach (Alternative)

Instead of rewriting the schema, support both backends:

```
lib/db/
  schema-pg.ts        # Current Postgres schema
  schema-sqlite.ts    # SQLite schema
  index.ts            # Selects driver based on DATABASE_PROVIDER env var
```

This doubles the schema maintenance burden. **Not recommended** unless you want to run both Vercel and HA addon simultaneously long-term.

## 4. Key Differences: Vercel vs. HA Addon

| Aspect | Vercel (Current) | HA Addon |
|--------|-----------------|----------|
| **Hosting cost** | Free tier (limited), then $20/mo | Free (runs on HA hardware) |
| **Latency to HA** | Internet round-trip (~100-500ms) | Localhost (~1ms) |
| **Database** | Neon Postgres (cloud, free tier) | SQLite (local file, zero cost) |
| **AI features** | Anthropic API (needs internet) | Same — still needs internet |
| **Updates** | `git push` -> auto-deploy | Docker rebuild, manual or CI |
| **Availability** | 99.9% (cloud) | Only when HA is running |
| **Auth** | API key + password login | HA ingress (zero config) |
| **Cold starts** | Neon wake-up (1-5s on free tier) | None — always running |
| **HTTPS** | Automatic via Vercel | Via HA (if configured with Let's Encrypt) |
| **Sentry/monitoring** | Built-in | Would need self-hosted or cloud Sentry |
| **Printer data flow** | HA -> internet -> Vercel -> internet -> Neon | HA -> localhost -> SQLite |
| **Offline operation** | Fails without internet | Fully functional offline |
| **Multi-user access** | Anyone with URL + password | Anyone with HA access |
| **Remote access** | Always (public URL) | Only via HA remote access (Nabu Casa / VPN) |
| **Development** | `npm run dev` + Vercel preview deploys | Same local dev + Docker testing |
| **Database backups** | Neon handles it | Must configure (HA backup system) |
| **Scalability** | Serverless, scales automatically | Single instance, limited by hardware |

## 5. The Key Advantage: Eliminating the Internet Round-trip

### Current Data Flow (Vercel)

```
Bambu H2S -> MQTT -> Home Assistant -> rest_command (HTTP)
    -> INTERNET -> Vercel (serverless function)
    -> INTERNET -> Neon Postgres (cloud DB)
    -> INTERNET <- Response back to Vercel
    <- INTERNET <- Response back to HA
```

**Problems observed:**
- `rest_command` timeouts when Vercel has cold starts
- Neon free tier has wake-up delays (1-5 seconds)
- Print events can be lost if internet is down
- Every sync cycle adds 200-1000ms of latency
- API key management between HA and Vercel

### Proposed Data Flow (HA Addon)

```
Bambu H2S -> MQTT -> Home Assistant -> rest_command (HTTP)
    -> localhost:3000 (addon, always running)
    -> SQLite file (local, instant)
    <- Response (< 10ms total)
```

**Advantages:**
- Zero internet dependency for core functionality
- No cold starts — addon is always running
- Sub-10ms response times for all sync operations
- No API key needed — HA ingress handles auth
- Print events never lost due to connectivity
- `rest_command` becomes 100% reliable
- HA backups automatically include the SQLite database

### What Still Needs Internet

- Anthropic AI features (auto-supply agent)
- Price checking / web scraping
- Remote access to the UI (via Nabu Casa or VPN)
- Future: push notifications

These are all non-critical, async operations that can gracefully degrade when offline.

## 6. Existing Examples & Precedents

### Spoolman HA Addon (dimquea/hassio)

Spoolman — the app HASpoolManager replaces — runs as an HA addon:
- **Base image:** `ghcr.io/hassio-addons/base:20.0.1` (Alpine Linux)
- **Architectures:** aarch64, amd64, armv7
- **Port:** 7912
- **Database:** SQLite by default (file in addon data dir)
- **No ingress** — uses direct port mapping, accessed via `http://homeassistant:7912`
- **Config:** Minimal — log level, auto backup, debug mode

**Key lesson:** Spoolman proves a filament manager works well as a local HA addon. Users prefer it running alongside HA rather than as a separate cloud service.

### Node-RED Addon

- Full Node.js application running as HA addon
- Supports ingress
- Demonstrates Node.js + ingress works well in practice

### Other Node.js Addons

Several community addons run Node.js servers (Zigbee2MQTT dashboard, Grocy, etc.), confirming the pattern is well-established.

## 7. Hybrid Approaches

### Option A: HA Addon + Neon Postgres (Cloud DB)

Run locally but keep the cloud database.

| Pro | Con |
|-----|-----|
| No schema migration needed | Still internet-dependent for DB |
| Remote access to data | Latency for every DB query |
| Keep Vercel as backup | Neon cold starts still apply |

**Verdict:** Defeats the main purpose. Not recommended.

### Option B: HA Addon + SQLite (Full Local)

Run everything locally.

| Pro | Con |
|-----|-----|
| Zero internet dependency | Schema migration work (~2 days) |
| Sub-10ms latency | No remote access without Nabu Casa/VPN |
| Free forever | Limited by HA hardware |
| HA handles auth + backups | Single point of failure |

**Verdict:** Best option for reliability. Recommended.

### Option C: HA Addon + SQLite + Cloud Sync

Run locally with optional cloud sync for remote access.

| Pro | Con |
|-----|-----|
| Best of both worlds | Complex to build |
| Works offline | Conflict resolution needed |
| Remote dashboard via Vercel | Two deployments to maintain |

**Verdict:** Over-engineered for a single-user filament tracker. Consider only if remote access is critical.

### Option D: Keep Vercel, Improve Reliability

Stay on Vercel but fix the reliability issues.

| Pro | Con |
|-----|-----|
| No migration work | Ongoing cost (Neon, Vercel) |
| Already working | Internet dependency remains |
| Remote access built-in | Cold starts will always exist |

Possible improvements:
- Upgrade Neon to a paid plan (always-on compute)
- Add retry logic in HA automations
- Queue failed events and replay

**Verdict:** Band-aids on a fundamental architectural mismatch. The app serves a local printer — it should run locally.

## 8. Recommendation

**Go with Option B: Full local HA addon with SQLite.**

### Why

1. **The use case is inherently local.** A single printer, a single user, standing at the printer. Cloud hosting adds complexity without proportional value.

2. **Reliability is non-negotiable.** Print tracking events must not be lost. Internet outages, cold starts, and timeouts currently cause data loss.

3. **Cost goes to zero.** No Vercel plan, no Neon plan, no Sentry plan. The HA hardware is already paid for.

4. **Auth becomes trivial.** HA ingress handles everything. No API keys, no password management, no CORS configuration.

5. **Spoolman proved the model.** The app being replaced runs exactly this way — as a local HA addon with SQLite.

6. **Migration is bounded.** ~2 days of work for the schema rewrite. The Drizzle ORM abstraction means most application code stays identical.

### Migration Plan

| Phase | Work | Estimate |
|-------|------|----------|
| 1. Standalone build | Add `output: "standalone"` to `next.config.ts` | 30 min |
| 2. SQLite schema | Rewrite `lib/db/schema.ts` for `sqliteTable` | 4 hours |
| 3. DB connector | Replace `lib/db/index.ts` with `better-sqlite3` | 1 hour |
| 4. Query audit | Fix Postgres-specific SQL fragments | 2-4 hours |
| 5. Ingress paths | Ensure all routes use relative paths or read `X-Ingress-Path` | 2-4 hours |
| 6. Dockerfile | Create multi-stage Dockerfile for HA | 2 hours |
| 7. Addon config | `config.yaml`, `build.yaml`, `run.sh` | 1 hour |
| 8. HA automation update | Change `rest_command` URLs to `http://localhost:3000` | 30 min |
| 9. Data migration | Export Neon -> transform -> import SQLite | 2 hours |
| 10. Testing | End-to-end testing in HA environment | 4 hours |
| **Total** | | **~3-4 days** |

### What to Keep from Vercel

- **Development workflow:** Keep using `npm run dev` locally
- **CI/CD:** GitHub Actions for tests (already set up)
- **Preview deploys:** Optional — can still deploy to Vercel for testing/demos
- **The codebase:** Same repo, just add Dockerfile + addon config

### Open Questions

1. **`basePath` for ingress:** Need to test whether Next.js works behind HA ingress with dynamic token paths. May need custom middleware.
2. **WebSocket support:** If future features need real-time updates, ingress supports WebSocket forwarding.
3. **`better-sqlite3` compilation:** Requires native compilation. The HA addon base image (Alpine) needs `build-base` and `python3` for building. Pre-built binaries may be available for common architectures.
4. **Backup strategy:** HA's built-in backup system includes addon data, but should we add an export-to-JSON feature for extra safety?

## Sources

- [HA Addon Configuration Docs](https://developers.home-assistant.io/docs/apps/configuration/)
- [HA Addon Presentation/Ingress Docs](https://developers.home-assistant.io/docs/apps/presentation/)
- [HA Ingress Architecture (DeepWiki)](https://deepwiki.com/home-assistant/supervisor/6.3-proxy-and-ingress)
- [Spoolman HA Addon (dimquea/hassio)](https://github.com/dimquea/hassio)
- [Spoolman HA Addon - deprecated (gschmidl/hassio-spoolman)](https://github.com/gschmidl/hassio-spoolman)
- [Next.js Docker Example (vercel/next.js)](https://github.com/vercel/next.js/blob/canary/examples/with-docker/README.md)
- [Next.js Standalone Output Docs](https://nextjs.org/docs/pages/api-reference/config/next-config-js/output)
- [Next.js basePath Docs](https://nextjs.org/docs/app/api-reference/config/next-config-js/basePath)
- [HA Addons Example Repo](https://github.com/home-assistant/addons-example)
- [better-sqlite3 (GitHub)](https://github.com/WiseLibs/better-sqlite3)
- [Drizzle ORM SQLite Docs](https://orm.drizzle.team/docs/get-started/sqlite-new)
- [Drizzle ORM Migrations](https://orm.drizzle.team/docs/migrations)
- [HA Ingress Introduction Blog Post](https://www.home-assistant.io/blog/2019/04/15/hassio-ingress/)
- [hass_ingress Custom Component](https://github.com/lovelylain/hass_ingress)
