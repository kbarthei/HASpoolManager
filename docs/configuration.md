# Configuration Reference

## 1. HA Addon Configuration

Options set in the Home Assistant addon UI are stored in `/data/options.json` inside the container.

| Option | Values | Default | Description |
|--------|--------|---------|-------------|
| `log_level` | debug, info, warning, error | info | Controls addon log verbosity |
| `api_key` | string | — | Bearer token for webhook auth (maps to `API_SECRET_KEY` env var) |
| `anthropic_api_key` | string | — | Claude API key for AI order parsing |

## 2. Environment Variables

| Variable | Context | Description |
|----------|---------|-------------|
| `SQLITE_PATH` | Both | Path to SQLite DB. Addon: `/config/haspoolmanager.db`. Dev: `./data/haspoolmanager.db` |
| `API_SECRET_KEY` | Both | Bearer token for API auth |
| `ANTHROPIC_API_KEY` | Both | Claude API key for AI features |
| `HA_ADDON` | Addon only | Set to `"true"` to enable `basePath=/ingress` |
| `NODE_ENV` | Both | `production` in addon, `development` locally |

## 3. Home Assistant Integration

The addon syncs with HA via a `rest_command` and an automation that fires every 60 seconds.

### rest_command (configuration.yaml)

```yaml
rest_command:
  haspoolmanager_sync:
    url: "http://local-haspoolmanager:3000/api/v1/events/printer-sync"
    method: POST
    headers:
      Authorization: "Bearer YOUR_API_KEY"
    content_type: "application/json"
    payload: >-
      { "printer_id": "YOUR_PRINTER_ID", "gcode_state": "{{ states('sensor.h2s_druckstatus') }}", ... }
```

Changes to `rest_command` require a full HA restart.

### Automation (automations.yaml)

Two automation triggers keep the addon in sync:

- **Timer-based:** fires every 60 seconds for continuous polling.
- **State-change-based:** fires immediately on printer state transitions (e.g. RUNNING, FINISH, FAILED).

Automation changes only need a reload (Developer Tools > YAML > Reload Automations), not a full restart.

## 4. Printer Setup

Create a printer via the API:

```bash
curl -X POST http://homeassistant:3001/api/v1/printers \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name": "H2S", "model": "Bambu Lab H2S", "amsCount": 2}'
```

## 5. AMS Slot Types

| Type | Slots | RFID | Description |
|------|-------|------|-------------|
| `ams` | 4 | Yes | Main AMS unit |
| `ams_ht` | 1 | Yes | AMS HT (high temp) |
| `external` | 1 | No | External spool holder |

## 6. Spool Rack

Default grid is 4 rows x 8 columns (32 slots). Positions use the format `rack:R-C`:

- `rack:1-1` = Row 1, Column 1 (top-left)
- `rack:4-8` = Row 4, Column 8 (bottom-right)

## 7. Network Ports

| Port | Purpose | Auth |
|------|---------|------|
| 3000 | HA ingress (nginx) | HA session |
| 3001 | Direct PWA access (nginx) | None |
| 3002 | Next.js internal | Not exposed |
