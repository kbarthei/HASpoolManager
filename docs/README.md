# HASpoolManager Documentation

3D Printing Filament Lifecycle Manager — a Home Assistant addon that tracks
your filament spools across Purchase → Inventory → Storage → AMS → Printer →
Usage Deduction → Cost Analytics → Reorder Alerts.

---

## I want to…

### …install and use the addon
Start here → [`operator/installation.md`](operator/installation.md)

Day-to-day reference:
- [`operator/configuration.md`](operator/configuration.md) — every config option explained
- [`operator/user-guide.md`](operator/user-guide.md) — typical workflows
- [`operator/ios-pwa-setup.md`](operator/ios-pwa-setup.md) — iOS home-screen PWA
- [`operator/operations-runbook.md`](operator/operations-runbook.md) — investigate stuck prints, roll back, recover
- [`operator/troubleshooting.md`](operator/troubleshooting.md) — common breakages

### …understand how it works under the hood
Start here → [`architecture/overview.md`](architecture/overview.md)

Deep dives:
- [`architecture/data-model.md`](architecture/data-model.md) — every DB table + ER diagram
- [`architecture/state-machine.md`](architecture/state-machine.md) — print-lifecycle state machine
- [`architecture/sync-worker.md`](architecture/sync-worker.md) — how HA events become DB writes
- [`architecture/matching-engine.md`](architecture/matching-engine.md) — RFID, Bambu-idx, fuzzy spool matching
- [`architecture/supply-engine.md`](architecture/supply-engine.md) — reorder rules, alerts, order optimizer
- [`architecture/color-system.md`](architecture/color-system.md) — CIE ΔE color matching and vendor palettes
- [`architecture/security-model.md`](architecture/security-model.md) — auth tiers, SSRF, port 3001 model

### …look something up
- [`reference/api.md`](reference/api.md) — every `/api/v1/*` endpoint with request + response
- [`reference/bambu-printer-states.md`](reference/bambu-printer-states.md) — full Bambu MQTT state catalogue
- [`reference/env-vars.md`](reference/env-vars.md) — `SQLITE_PATH`, `API_SECRET_KEY`, `HA_ADDON`, …
- [`reference/error-codes.md`](reference/error-codes.md) — print_error, HMS, internal API error shapes
- [`reference/ha-entities.md`](reference/ha-entities.md) — German/English HA entity-name → field mapping

### …contribute to the code
Start here → [`development/getting-started.md`](development/getting-started.md)

When you need them:
- [`development/testing.md`](development/testing.md) — test pyramid + spec catalogue
- [`development/test-templates.md`](development/test-templates.md) — copy-paste templates per test layer
- [`development/database-changes.md`](development/database-changes.md) — schema → Drizzle → `migrate-db.js` workflow
- [`development/release-process.md`](development/release-process.md) — version bump → deploy → verify → rollback
- [`development/contributing.md`](development/contributing.md) — commit style, PR checklist, CI expectations

---

## Quick reference

- **Tech stack:** Next.js 16 App Router · SQLite + Drizzle ORM · Tailwind + shadcn/ui · Vitest + Playwright
- **Runtime:** Home Assistant addon (Alpine Linux container; nginx + Next.js standalone + background sync worker)
- **Auth:** Bearer token via `API_SECRET_KEY` for HA and direct LAN access; optional auth for UI reads through HA ingress
- **Data:** single SQLite file at `/config/haspoolmanager.db` inside the addon, mirrored to `./data/haspoolmanager.db` in dev
- **Repo home:** [github.com/kbarthei/HASpoolManager](https://github.com/kbarthei/HASpoolManager)
- **Live version:** see `ha-addon/haspoolmanager/config.yaml` (`version:` key)

---

## Keeping this docs tree current

`CLAUDE.md` at the repo root enforces three sync rules:
- API endpoint changes → update [`reference/api.md`](reference/api.md)
- Test additions/removals → update [`development/testing.md`](development/testing.md)
- Schema changes → update [`architecture/data-model.md`](architecture/data-model.md) + the migration recipe in [`development/database-changes.md`](development/database-changes.md)
