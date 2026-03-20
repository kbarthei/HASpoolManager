# Current Home Assistant Setup — Context for HASpoolManager

## Bambu Lab H2S Printer Entities

### AMS Slot Sensors
- `sensor.h2s_ams_1_slot_1` through `sensor.h2s_ams_1_slot_4` (AMS unit 1, 4 slots)
- `sensor.h2s_ams_ht_1_slot_1` (AMS HT unit, 1 slot)
- `sensor.h2s_externalspool_externe_spule` (external spool holder)

Each slot sensor has these attributes:
- `name` — filament name (e.g., "Bambu PLA Basic")
- `type` — material type (e.g., "PLA", "PETG", "ABS-GF")
- `color` — hex color with alpha (e.g., "#161616FF")
- `tag_uid` — RFID tag UID (e.g., "B568B1A400000100", or "0000000000000000" for no tag)
- `tray_uuid` — unique tray identifier
- `filament_id` — Bambu filament code (e.g., "GFA00")
- `tray_weight` — spool weight in grams
- `remain` — remaining percentage (-1 = unknown)
- `remain_enabled` — whether remaining tracking is active
- `nozzle_temp_min` / `nozzle_temp_max` — temperature range
- `active` — whether this slot is currently printing
- `empty` — whether the slot is empty

### Print Data Sensors
- `sensor.h2s_gewicht_des_drucks` — total print weight in grams
- `sensor.h2s_drucklange` — total print length in meters
- `sensor.h2s_aktueller_arbeitsschritt` — print state (idle/printing/finished/canceled)
- `sensor.h2s_druckfortschritt` — print progress (0-100%)
- `sensor.h2s_aktiver_slot` — currently active filament slot (with same attributes as slot sensors)
- `sensor.h2s_name_der_aufgabe` — print job name
- `sensor.h2s_gesamtzahl_der_schichten` — total layers
- `sensor.h2s_aktuelle_schicht` — current layer
- `sensor.h2s_verbleibende_zeit` — remaining time in hours

### Input Helpers (capture filament at print start)
- `input_text.h2s_last_filament_name`
- `input_text.h2s_last_filament_type`
- `input_text.h2s_last_filament_color`
- `input_text.h2s_last_filament_tag_uid`
- `input_datetime.h2s_last_filament_seen`
- `counter.filamentverbrauch`

### Device Triggers
- `device_id: 1910f4da8324623b36d95efc4fec1c89` — Bambu Lab H2S
  - `event_print_finished` — print completed
  - `event_print_canceled` — print canceled

## Current Spoolman Setup
- Spoolman addon runs at `http://homeassistant:7912/`
- Config entry ID: `01KGDCYZCKTWHCY16EMH4MFCB9`
- 30 active spools
- HA integration creates ~500 entities (150 disabled for unwanted types)
- REST API available at `http://homeassistant:7912/api/v1/`
- Has stability issues (15-min restart automation)

## Current Automations (to be replaced by HASpoolManager)
- `3DPrinter_Druck_finished` — fuzzy matching + weight deduction (lines 818-1019 in automations.yaml)
- `3DPrinter_Merke aktives Filament waehrend Druck` — captures filament data at print start
- `h2s_spoolman_verbrauch_dynamisch_buchen` — script with hard-match variant
- `Restart Spoolman integration` — 15-min stability workaround

## Secrets Available
- `HA_API_ACCESS` — long-lived access token for HA REST API
- `haspoolmanager_api_token` — to be created for HASpoolManager auth

## Network
- HA host: `homeassistant.local:8123`
- Spoolman: `homeassistant.local:7912`
- Bambu H2S: `192.168.178.99` (local MQTT on port 8883)
