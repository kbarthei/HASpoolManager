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

## Printer Sync Setup

The addon syncs printer state via a rest_command that fires every 60 seconds.

### 1. Add rest_command to configuration.yaml

```yaml
rest_command:
  haspoolmanager_sync:
    url: "http://local-haspoolmanager:3000/api/v1/events/printer-sync"
    method: POST
    headers:
      Authorization: "Bearer YOUR_API_KEY"
    content_type: "application/json"
    payload: >-
      {
        "printer_id": "YOUR_PRINTER_UUID",
        "gcode_state": "{{ states('sensor.PRINTER_gcode_state') }}",
        "print_state": "{{ states('sensor.PRINTER_print_state') }}",
        "print_name": "{{ states('sensor.PRINTER_task_name') }}",
        "print_progress": "{{ states('sensor.PRINTER_print_progress') }}",
        "print_weight": "{{ states('sensor.PRINTER_print_weight') }}",
        "print_error": "{{ states('binary_sensor.PRINTER_print_error') }}",
        ... (slot data)
      }
```

Replace `PRINTER` with your actual printer entity prefix and `YOUR_API_KEY` with the key from your addon configuration.

After adding rest_command, a **full HA restart** is required (not just a config reload).

### 2. Add automation to automations.yaml

Create a time-pattern automation that calls `rest_command.haspoolmanager_sync` every minute:

```yaml
- alias: "Spool Manager - Printer Sync"
  trigger:
    - platform: time_pattern
      seconds: "/60"
  action:
    - service: rest_command.haspoolmanager_sync
```

Automation changes only need a **reload**, not a full restart.

### 3. Get your printer ID

After the first successful sync, go to the admin page in the Spool Manager UI to see the printer UUID. Use this value as `printer_id` in your rest_command payload.

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

### Sync not working

1. Verify the rest_command URL uses `http://local-haspoolmanager:3000` (not the external port 3001)
2. Check the API key matches between rest_command and addon config
3. Check the admin page sync log for errors
4. After adding rest_command: did you do a full HA restart (not just reload)?

### Server Actions fail on port 3001

If mutations (order creation, spool editing) fail with 500 errors on the direct access port, check the addon log for "Invalid Server Actions request". This was fixed in v1.0.27.

### Date/time shows in English format

Ensure addon version is 1.0.25 or newer, which includes full ICU data for de-DE locale support.

### PWA not updating after addon upgrade

Force-close the PWA and reopen it. iOS caches the previous version aggressively.
