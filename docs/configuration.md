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

### Home Assistant Integration

The addon syncs with your printer automatically via the HA websocket API.
No manual configuration is needed.

**What happens under the hood:**
- The addon subscribes to `bambu_lab_event` and `state_changed` events
- Printers are auto-discovered from the bambu_lab integration
- Entity mapping uses the integration's `original_name` (supports English + German)
- Print lifecycle events trigger immediate sync
- A watchdog polls as fallback when events stop

**Legacy:** If you previously used `rest_command` + automations, they can be
safely removed. The addon's internal sync worker replaces them entirely.

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

## 7. Energy Tracking

Track electricity costs per print using a smart plug with energy monitoring.

**Settings** (configured via Admin > Energy Tracking):

| Setting | Description | Example |
|---------|-------------|---------|
| `energy_sensor_entity_id` | HA energy sensor entity (cumulative kWh) | `sensor.printer_plug_energy` |
| `electricity_price_per_kwh` | Flat rate in EUR per kWh | `0.32` |

**How it works:**
1. At print start, the sync worker reads the smart plug's cumulative kWh value
2. At print end, it reads again and calculates the difference
3. The difference is multiplied by the configured EUR/kWh price
4. Both filament cost and energy cost are stored on the print record
5. `totalCost = filamentCost + energyCost`

**Requirements:**
- Smart plug with energy monitoring connected to HA (e.g., Shelly Plug S, Zigbee outlet)
- The energy sensor must have `device_class: energy` and report cumulative kWh
- Feature is opt-in — no sensor configured means no energy tracking

## 8. Network Ports

| Port | Purpose | Auth |
|------|---------|------|
| 3000 | HA ingress (nginx) | HA session |
| 3001 | Direct PWA access (nginx) | None |
| 3002 | Next.js internal | Not exposed |
