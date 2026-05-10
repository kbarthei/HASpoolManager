# HASpoolManager

3D-Print Filament Lifecycle Manager for Bambu Lab printers — tracks
spools from purchase through print: weight deduction, cost analytics,
RFID + fuzzy spool matching, AI order parsing, 3MF metadata pull,
multi-rack inventory, supply forecasting.

> **📖 Full documentation lives on GitHub.** This page is just the
> install + first-run reference; everything below the line points
> back to the canonical docs that ship with each release.

## First-run setup

1. Install the addon, click **Start**.
2. Open it via the HA sidebar (**Spool Manager**) — the addon
   auto-discovers your Bambu Lab printer through Home Assistant's
   websocket API, no `rest_command`, no automations, no YAML.
3. (Optional) Enter the printer's **8-digit Access Code**
   (Drucker-LCD → Settings → WLAN → Access Code) on the addon's
   **Admin** page → Bambu Access Code card. Enables the FTPS auto-pull
   of the sliced 3MF on every print start (cover, filament plan,
   weight + time prediction). Cloud / MakerWorld / mobile app keep
   working — the access code does not flip the printer's "LAN Only
   Mode" toggle.

## Configuration options

| Option | Type | Default | Description |
|---|---|---|---|
| `log_level` | enum | `info` | `debug` / `info` / `warning` / `error` |
| `api_key` | string | empty | Bearer token for external HA webhooks. Leave empty when accessing via the HA sidebar (ingress) or LAN-only direct port. |
| `anthropic_api_key` | string | empty | Claude API key for AI order parsing. Optional — manual entry works without it. |

## Access methods

| Method | URL | Auth | Use case |
|---|---|---|---|
| HA sidebar | "Spool Manager" tab | HA login | Normal use within HA |
| Direct / PWA | `http://homeassistant:3001` | none (LAN-only) | Add to iOS home screen, use at the printer |

**Install as iOS PWA:** open `http://homeassistant:3001` in Safari →
Share → *Add to Home Screen*. Opens standalone, no browser chrome,
respects the bottom nav-bar layout.

## Data + backup

- Database: `/config/haspoolmanager.db` (SQLite, included in HA backups).
- Manual backup: stop the addon, copy `*.db` + `*.db-wal` + `*.db-shm`.
- All data lives in the HA config directory — uninstalling the addon
  preserves your spools, prints, and orders.

---

## Full documentation

The current, authoritative docs ship in the GitHub repo and are
updated in lock-step with every code change (a CI scanner enforces it):

- 🚀 [**README**](https://github.com/kbarthei/HASpoolManager#readme) — feature tour with screenshots
- 📖 [**Operator user guide**](https://github.com/kbarthei/HASpoolManager/blob/main/docs/operator/user-guide.md) — every workflow, end-to-end (10 sections)
- 🛠️ [**Operations runbook**](https://github.com/kbarthei/HASpoolManager/blob/main/docs/operator/operations-runbook.md) — break-fix recipes with admin SQL
- ⚙️ [**Configuration reference**](https://github.com/kbarthei/HASpoolManager/blob/main/docs/operator/configuration.md) — all addon options + env vars
- 🏗️ [**Architecture overview**](https://github.com/kbarthei/HASpoolManager/blob/main/docs/architecture/overview.md) — how the pieces fit together
- 🔌 [**API reference**](https://github.com/kbarthei/HASpoolManager/blob/main/docs/reference/api.md) — every `/api/v1/*` endpoint
- 🩺 [**Sync worker internals**](https://github.com/kbarthei/HASpoolManager/blob/main/docs/architecture/sync-worker.md) — printer sync, FTP pull, late-bind logic
- 🔐 [**Security model**](https://github.com/kbarthei/HASpoolManager/blob/main/docs/architecture/security-model.md) — auth tiers, two-port model, SSRF guardrails

The **Änderungsprotokoll** link (top of this addon page) shows the
inline changelog, auto-generated from conventional commits.

## When something breaks

1. **Settings → Add-ons → HASpoolManager → Log tab** — addon logs.
2. The app's own **Admin → Diagnostics** page surfaces 9 live data-quality
   checks (RFID drift, stuck prints, missing weights, sync errors, …).
3. **Admin → Sync Log** filtered to `transition = ftp-pull` shows
   per-step diagnostics for the 3MF auto-pull pipeline.
4. Issue tracker: <https://github.com/kbarthei/HASpoolManager/issues>
