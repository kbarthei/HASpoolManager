# Configuration Guide

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | Neon Postgres connection string |
| `API_SECRET_KEY` | Yes | Bearer token for HA webhook auth |
| `ANTHROPIC_API_KEY` | No | Claude API key for order parsing |
| `NEXT_PUBLIC_SENTRY_DSN` | No | Sentry error monitoring DSN |
| `SENTRY_ORG` | No | Sentry organization slug |
| `SENTRY_PROJECT` | No | Sentry project slug |
| `NEXT_PUBLIC_APP_URL` | No | App URL for CORS (default: http://localhost:3000) |

## Printer Setup

HASpoolManager supports Bambu Lab printers with AMS. The printer is configured via the API:

```bash
curl -X POST /api/v1/printers \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "H2S",
    "model": "Bambu Lab H2S",
    "serialNumber": "YOUR_SERIAL",
    "amsCount": 2
  }'
```

### AMS Slot Types

| Type | Slots | RFID | Description |
|------|-------|------|-------------|
| `ams` | 4 | Yes | Main AMS unit |
| `ams_ht` | 1 | Yes | AMS HT (high temp) |
| `external` | 1 | No | External spool holder |

## Spool Rack Configuration

The default rack is 4 rows × 8 columns (32 slots). This is currently configured in the code. Future versions will allow changing it in settings.

Rack positions use the format `rack:R-C`:
- `rack:1-1` = Row 1, Column 1 (top-left)
- `rack:4-8` = Row 4, Column 8 (bottom-right)

## Home Assistant Integration

### Webhook Configuration

Add to your HA `configuration.yaml`:

```yaml
rest_command:
  spool_print_started:
    url: "https://your-app.vercel.app/api/v1/events/print-started"
    method: POST
    headers:
      Authorization: "Bearer YOUR_API_SECRET_KEY"
      Content-Type: "application/json"
    payload: >
      {
        "printer_id": "{{ printer_id }}",
        "name": "{{ name }}",
        "ha_event_id": "{{ ha_event_id }}"
      }
```

### Automations

Create automations that fire on printer state changes:
- `sensor.h2s_gcode_state` → "RUNNING" → call `spool_print_started`
- `sensor.h2s_gcode_state` → "FINISH"/"FAILED" → call `spool_print_finished`
- AMS slot sensors → call `spool_ams_slot_changed`
