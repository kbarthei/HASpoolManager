# HASpoolManager

## Overview

3D printing filament lifecycle manager for Bambu Lab printers with AMS. Tracks spools from purchase to print -- weight deduction, cost analytics, spool matching, order parsing via AI.

## Configuration

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| log_level | list | info | Log verbosity: debug, info, warning, error |
| api_key | string | (empty) | Bearer token for webhook authentication. Set this to a random string and use the same value in your rest_command config |
| anthropic_api_key | string | (empty) | Anthropic Claude API key for AI order parsing. Optional -- order parsing works without it but requires manual entry |

## Access Methods

| Method | URL | Auth | Use case |
|--------|-----|------|----------|
| HA Sidebar | Click "Spool Manager" in sidebar | HA login | Normal use within HA |
| Direct/PWA | `http://homeassistant:3001` | None | iOS home screen app, use at the printer |

### Install as iOS App

1. Open `http://homeassistant:3001` in Safari
2. Tap Share > "Add to Home Screen"
3. The app opens standalone without Safari bars

## Printer Sync

The addon syncs with your Bambu Lab printer automatically via Home Assistant's
websocket API. No configuration needed — zero-config.

**How it works:**
1. On startup, the addon discovers all Bambu Lab printers connected to HA
2. It subscribes to state change events via websocket
3. Print lifecycle events (start, finish, fail) trigger immediate sync
4. A watchdog polls every 2 minutes during active prints, every 5 minutes when idle

**No rest_command, no automations, no YAML editing required.**

The addon requires `homeassistant_api` access (configured automatically in the addon manifest).

## Network Ports

| Port | Purpose |
|------|---------|
| 3000 | HA ingress (internal, managed by HA) |
| 3001 | Direct web access / PWA (exposed to network) |

## Data and Backup

- **Database:** `/config/haspoolmanager.db` (SQLite)
- Included in standard HA backups automatically
- Manual backup: copy the `.db` file while the addon is stopped
- The database is stored in the HA config directory, not inside the addon container

## Troubleshooting

### Addon won't start

Check the addon log in HA: Settings > Add-ons > HASpoolManager > Log tab.

### Sync worker not starting
Check the addon log for `[sync-worker]` messages. The worker requires `SUPERVISOR_TOKEN`
which is loaded from `/run/s6/container_environment/`. If missing, verify that
`homeassistant_api: true` is set in the addon config.

### Events not being received
The sync worker subscribes to `bambu_lab_event` and `state_changed`. Verify the
bambu_lab integration is installed and your printer is connected. Check the addon
log for `discovered 1 printer(s)` and entity mapping counts.

### Server Actions fail on port 3001

If mutations (order creation, spool editing) fail with 500 errors on the direct access port, check the addon log for "Invalid Server Actions request". This was fixed in v1.0.27.

### Date/time shows in English format

Ensure addon version is 1.0.25 or newer, which includes full ICU data for de-DE locale support.

### PWA not updating after addon upgrade

Force-close the PWA and reopen it. iOS caches the previous version aggressively.
