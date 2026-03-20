# Spoolman Data Migration Reference

## How to Export Current Data

The Spoolman REST API at `http://homeassistant:7912/api/v1/` provides:

```bash
# Export all vendors
curl http://homeassistant:7912/api/v1/vendor

# Export all filaments
curl http://homeassistant:7912/api/v1/filament

# Export all spools
curl http://homeassistant:7912/api/v1/spool

# Export with all details
curl "http://homeassistant:7912/api/v1/spool?limit=100"
```

## Key Fields to Migrate

### Vendor → vendors table
- `id`, `name`, `url`

### Filament → filaments table
- `id`, `vendor_id`, `name`, `material`, `color_hex`, `diameter`, `density`
- `settings_extruder_temp`, `settings_bed_temp`
- `spool_weight` (net weight per spool)

### Spool → spools table
- `id`, `filament_id`, `remaining_weight`, `used_weight`
- `first_used`, `last_used`
- `price` (purchase price)
- `location` (storage location or AMS slot)
- `lot_nr` (lot number)
- `comment`
- `tag_uid` (RFID tag → tag_mappings table)
- `archived` (boolean → status field)

## Existing Spool Count
- 30 active spools
- Various vendors: Bambu Lab, Polymaker, eSun, Creality, R3D, Sunlu
- Materials: PLA, PETG, ABS, ABS-GF, TPU, ASA
- Most Bambu spools have RFID tags
- Third-party spools have no RFID tags

## Migration Script Location
Create as `scripts/migrate-from-spoolman.ts` in the HASpoolManager project.
Query the Spoolman API, transform data, and insert into Neon Postgres.
