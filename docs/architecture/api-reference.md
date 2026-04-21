# API Reference

All routes are under `/api/v1/`. The base URL for local development is `http://localhost:3000`.

## Authentication

| Mode | Header | Used by |
|------|--------|---------|
| `requireAuth` | `Authorization: Bearer <token>` | All write (POST/PUT/DELETE) routes and sensitive GET routes |
| `optionalAuth` | `Authorization: Bearer <token>` (optional) | Read-only routes accessible from the web UI without a token |

---

## 1. Health

### `GET /api/v1/health`

No auth required. Returns service status and version.

**Response**
```json
{
  "status": "ok",
  "version": "0.1.0",
  "timestamp": "2026-03-30T12:00:00.000Z"
}
```

**curl**
```bash
curl http://homeassistant:3001/api/v1/health
```

---

## 2. CRUD Resources

### Vendors

#### `GET /api/v1/vendors`

List all vendors, ordered by name.

- **Auth:** `requireAuth`
- **Response:** `Vendor[]` sorted by name

```bash
curl -H "Authorization: Bearer $TOKEN" /api/v1/vendors
```

#### `POST /api/v1/vendors`

Create a new vendor.

- **Auth:** `requireAuth`
- **Zod schema:** `createVendorSchema`

**Request body**
```json
{
  "name": "Polymaker",
  "website": "https://polymaker.com",
  "country": "CN",
  "notes": "PolyTerra, PolyLite lines"
}
```

**Response:** `201 Vendor`

```bash
curl -X POST /api/v1/vendors \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Polymaker","country":"CN"}'
```

#### `GET /api/v1/vendors/:id`

Get a single vendor.

- **Auth:** `requireAuth`
- **Response:** `Vendor` or `404`

```bash
curl -H "Authorization: Bearer $TOKEN" /api/v1/vendors/<uuid>
```

#### `PUT /api/v1/vendors/:id`

Update a vendor. All fields optional.

- **Auth:** `requireAuth`
- **Body fields:** `name`, `website`, `country`, `logoUrl`, `bambuPrefix`, `notes`
- **Response:** `Vendor` or `404`

```bash
curl -X PUT /api/v1/vendors/<uuid> \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"bambuPrefix":"GF"}'
```

#### `DELETE /api/v1/vendors/:id`

Delete a vendor. Fails if filaments reference it (RESTRICT).

- **Auth:** `requireAuth`
- **Response:** Deleted `Vendor` or `404`

```bash
curl -X DELETE -H "Authorization: Bearer $TOKEN" /api/v1/vendors/<uuid>
```

---

### Filaments

#### `GET /api/v1/filaments`

List filaments with vendor. Supports optional filters.

- **Auth:** `requireAuth`
- **Query params:** `?material=PLA`, `?vendor_id=<uuid>`
- **Response:** `Filament[]` (includes nested `vendor`)

```bash
curl -H "Authorization: Bearer $TOKEN" "/api/v1/filaments?material=PETG"
```

#### `POST /api/v1/filaments`

Create a filament definition.

- **Auth:** `requireAuth`
- **Zod schema:** `createFilamentSchema`

**Request body**
```json
{
  "vendorId": "<uuid>",
  "name": "PLA Matte Charcoal",
  "material": "PLA",
  "colorName": "Charcoal",
  "colorHex": "2B2B2D",
  "diameter": 1.75,
  "spoolWeight": 1000,
  "nozzleTempDefault": 220,
  "bambuIdx": "GFA00"
}
```

**Response:** `201 Filament`

```bash
curl -X POST /api/v1/filaments \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"vendorId":"<uuid>","name":"PLA Matte Charcoal","material":"PLA","colorHex":"2B2B2D"}'
```

#### `GET /api/v1/filaments/:id`

Get a single filament with vendor.

- **Auth:** `requireAuth`
- **Response:** `Filament` (with `vendor`) or `404`

#### `PUT /api/v1/filaments/:id`

Update a filament. All fields optional.

- **Auth:** `requireAuth`
- **Body fields:** all `createFilamentSchema` fields
- **Response:** `Filament` or `404`

#### `DELETE /api/v1/filaments/:id`

Delete a filament. Fails if spools reference it (RESTRICT).

- **Auth:** `requireAuth`
- **Response:** Deleted `Filament` or `404`

---

### Spools

#### `GET /api/v1/spools`

List spools with filament + vendor + tag mappings.

- **Auth:** `optionalAuth`
- **Query params:** `?status=active`, `?location=storage`, `?filament_id=<uuid>`
- **Response:** `Spool[]` (with `filament.vendor`, `tagMappings`)

```bash
curl /api/v1/spools?status=active
```

#### `POST /api/v1/spools`

Register a new spool.

- **Auth:** `requireAuth`
- **Zod schema:** `createSpoolSchema`

**Request body**
```json
{
  "filamentId": "<uuid>",
  "initialWeight": 1000,
  "purchasePrice": 24.99,
  "currency": "EUR",
  "purchaseDate": "2026-03-15",
  "location": "storage",
  "status": "active",
  "lotNumber": "B2024Q1",
  "notes": "Imported via CSV"
}
```

**Response:** `201 Spool`

```bash
curl -X POST /api/v1/spools \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"filamentId":"<uuid>","initialWeight":1000}'
```

#### `GET /api/v1/spools/:id`

Get a spool with filament + vendor + tag mappings + print usage history.

- **Auth:** `optionalAuth`
- **Response:** `Spool` (with `filament.vendor`, `tagMappings`, `printUsage`) or `404`

#### `PUT /api/v1/spools/:id`

Update a spool (e.g. adjust remaining weight, change status/location).

- **Auth:** `requireAuth`
- **Body:** Any subset of spool fields
- **Response:** `Spool` or `404`

```bash
curl -X PUT /api/v1/spools/<uuid> \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"remainingWeight":450,"status":"active"}'
```

#### `DELETE /api/v1/spools/:id`

Delete a spool. Fails if print_usage references it (RESTRICT).

- **Auth:** `requireAuth`
- **Response:** Deleted `Spool` or `404`

---

### Printers

#### `GET /api/v1/printers`

List all printers with AMS slot data.

- **Auth:** `optionalAuth`
- **Response:** `Printer[]` (with `amsSlots`)

```bash
curl /api/v1/printers
```

#### `POST /api/v1/printers`

Register a printer.

- **Auth:** `requireAuth`
- **Zod schema:** `createPrinterSchema`

**Request body**
```json
{
  "name": "Bambu H2S",
  "model": "H2S",
  "ipAddress": "192.168.1.100",
  "amsCount": 2
}
```

**Response:** `201 Printer`

#### `GET /api/v1/printers/:id`

Get a printer with full AMS slot state (each slot includes the loaded spool).

- **Auth:** `optionalAuth`
- **Response:** `Printer` (with `amsSlots.spool`) or `404`

```bash
curl /api/v1/printers/<uuid>
```

#### `PUT /api/v1/printers/:id`

Update printer settings.

- **Auth:** `requireAuth`
- **Body:** Any subset of printer fields
- **Response:** `Printer` or `404`

#### `DELETE /api/v1/printers/:id`

Delete a printer and cascade-delete its AMS slots and prints.

- **Auth:** `requireAuth`
- **Response:** Deleted `Printer` or `404`

---

### Prints

#### `GET /api/v1/prints`

List print jobs with printer info and usage records. Paginated.

- **Auth:** `requireAuth`
- **Query params:** `?status=finished`, `?printer_id=<uuid>`, `?limit=50`, `?offset=0`
- **Response:** `Print[]` ordered by `started_at` DESC (with `printer`, `usage`)

```bash
curl -H "Authorization: Bearer $TOKEN" "/api/v1/prints?limit=20&status=finished"
```

#### `POST /api/v1/prints`

Manually create a print record (typically done via webhook events).

- **Auth:** `requireAuth`
- **Body fields:** `printerId`, `name`, `gcodeFile`, `status`, `startedAt`, `totalLayers`, `printWeight`, `printLength`, `haEventId`
- **Response:** `201 Print`

#### `GET /api/v1/prints/:id`

Get a print with printer info and per-spool usage (each usage includes the spool).

- **Auth:** `requireAuth`
- **Response:** `Print` (with `printer`, `usage.spool`) or `404`

#### `PUT /api/v1/prints/:id`

Update a print record (e.g. add notes, correct status).

- **Auth:** `requireAuth`
- **Body:** Any subset of print fields; `finishedAt` parsed as ISO date
- **Response:** `Print` or `404`

---

### Orders

#### `GET /api/v1/orders`

List all orders with vendor and line items (each item includes filament).

- **Auth:** `requireAuth`
- **Response:** `Order[]` ordered by `order_date` DESC (with `vendor`, `items.filament`)

```bash
curl -H "Authorization: Bearer $TOKEN" /api/v1/orders
```

#### `POST /api/v1/orders`

Create an order.

- **Auth:** `requireAuth`

**Request body**
```json
{
  "vendorId": "<uuid>",
  "orderNumber": "INV-2026-001",
  "orderDate": "2026-03-30",
  "expectedDelivery": "2026-04-05",
  "status": "ordered",
  "shippingCost": "4.99",
  "totalCost": "74.97",
  "currency": "EUR",
  "sourceUrl": "https://shop.example.com/orders/INV-2026-001"
}
```

**Response:** `201 Order`

#### `GET /api/v1/orders/:id`

Get an order with vendor and full line items (including filament and linked spool).

- **Auth:** `requireAuth`
- **Response:** `Order` (with `vendor`, `items.filament`, `items.spool`) or `404`

#### `PUT /api/v1/orders/:id`

Update an order (e.g. mark as delivered, add tracking).

- **Auth:** `requireAuth`
- **Response:** `Order` or `404`

#### `DELETE /api/v1/orders/:id`

Delete an order (cascade-deletes its items).

- **Auth:** `requireAuth`
- **Response:** Deleted `Order` or `404`

---

### Tags

#### `GET /api/v1/tags`

List all tag mappings with the linked spool.

- **Auth:** `optionalAuth`
- **Response:** `TagMapping[]` (with `spool`)

```bash
curl /api/v1/tags
```

#### `POST /api/v1/tags`

Map a tag UID to a spool.

- **Auth:** `requireAuth`
- **Zod schema:** `createTagSchema`

**Request body**
```json
{
  "tagUid": "0A1B2C3D4E5F",
  "spoolId": "<uuid>",
  "source": "bambu"
}
```

**Response:** `201 TagMapping`

```bash
curl -X POST /api/v1/tags \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"tagUid":"0A1B2C3D4E5F","spoolId":"<uuid>","source":"bambu"}'
```

#### `GET /api/v1/tags/:tag_uid`

Look up a tag UID, returning the mapped spool with filament + vendor.

- **Auth:** `optionalAuth`
- **Response:** `TagMapping` (with `spool.filament.vendor`) or `404`

```bash
curl /api/v1/tags/0A1B2C3D4E5F
```

#### `DELETE /api/v1/tags/:tag_uid`

Remove a tag mapping.

- **Auth:** `requireAuth`
- **Response:** Deleted `TagMapping` or `404`

```bash
curl -X DELETE -H "Authorization: Bearer $TOKEN" /api/v1/tags/0A1B2C3D4E5F
```

---

## 3. Events (Home Assistant Webhooks)

All event routes use `requireAuth`. These are called by HA automations.

### `POST /api/v1/events/print-started`

Called when `gcode_state` changes to `RUNNING`. Creates a print record. Idempotent via `ha_event_id`.

- **Auth:** `requireAuth`
- **Zod schema:** `printStartedSchema`

**Request body**
```json
{
  "printer_id": "<uuid>",
  "name": "benchy.gcode",
  "gcode_file": "benchy.gcode",
  "total_layers": 120,
  "print_weight": 14.5,
  "print_length": 4823.0,
  "ha_event_id": "ha_evt_20260330_001",
  "started_at": "2026-03-30T10:00:00Z"
}
```

**Response**
```json
{ "print_id": "<uuid>", "status": "created" }
```
or `200 { "print_id": "<uuid>", "status": "already_exists" }` if idempotent.

```bash
curl -X POST /api/v1/events/print-started \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"printer_id":"<uuid>","ha_event_id":"evt_001","name":"benchy.gcode"}'
```

---

### `POST /api/v1/events/print-finished`

Called when `gcode_state` changes to `FINISH`, `FAILED`, or is cancelled. Closes the print record, deducts filament weight from spools, and calculates cost. Idempotent — skips re-processing if print is already finished.

- **Auth:** `requireAuth`
- **Zod schema:** `printFinishedSchema`

**Request body**
```json
{
  "ha_event_id": "ha_evt_20260330_001",
  "status": "finished",
  "finished_at": "2026-03-30T10:45:00Z",
  "duration_seconds": 2700,
  "print_weight": 14.2,
  "usage": [
    {
      "spool_id": "<uuid>",
      "weight_used": 14.2,
      "length_used": 4750.0
    }
  ]
}
```

**Response**
```json
{
  "print_id": "<uuid>",
  "status": "finished",
  "deductions": [
    {
      "spool_id": "<uuid>",
      "previous_weight": 850,
      "new_weight": 836,
      "cost": 0.35
    }
  ],
  "total_cost": 0.35,
  "warnings": []
}
```

```bash
curl -X POST /api/v1/events/print-finished \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"ha_event_id":"evt_001","status":"finished","usage":[{"spool_id":"<uuid>","weight_used":14.2}]}'
```

---

### `POST /api/v1/events/filament-changed`

Called when the printer switches filament mid-print. Records usage for the outgoing spool and identifies the incoming spool via the matching engine.

- **Auth:** `requireAuth`

**Request body**
```json
{
  "ha_event_id": "ha_evt_20260330_001",
  "old_spool": {
    "spool_id": "<uuid>",
    "weight_used": 45.0
  },
  "new_tray": {
    "tag_uid": "0A1B2C3D4E5F",
    "tray_info_idx": "GFA00",
    "tray_type": "PLA",
    "tray_color": "FF5733FF",
    "printer_id": "<uuid>",
    "ams_index": 0,
    "tray_index": 1
  }
}
```

**Response**
```json
{
  "print_id": "<uuid>",
  "status": "filament_changed",
  "old_spool_usage": {
    "spool_id": "<uuid>",
    "weight_used": 45.0,
    "cost": 1.12
  },
  "new_spool_match": {
    "spool_id": "<uuid>",
    "confidence": 1.0,
    "method": "rfid"
  }
}
```

---

### `POST /api/v1/events/ams-slot-changed`

Called by HA when an AMS slot sensor state changes (spool inserted, removed, or RFID read). Upserts the slot record and runs the matching engine.

- **Auth:** `requireAuth`
- **Zod schema:** `amsSlotChangedSchema`

**Request body**
```json
{
  "printer_id": "<uuid>",
  "slot_type": "ams",
  "ams_index": 0,
  "tray_index": 2,
  "tray_info_idx": "GFA00",
  "tray_type": "PLA",
  "tray_color": "2B2B2DFF",
  "tag_uid": "0A1B2C3D4E5F",
  "tray_sub_brands": "Bambu Lab",
  "remain": 85,
  "is_empty": false
}
```

**Response**
```json
{
  "slot_id": "<uuid>",
  "ams_index": 0,
  "tray_index": 2,
  "is_empty": false,
  "matched_spool": {
    "spool_id": "<uuid>",
    "filament_name": "PLA Matte Charcoal",
    "vendor_name": "Bambu Lab",
    "confidence": 1.0,
    "match_method": "rfid"
  },
  "candidates": []
}
```

```bash
curl -X POST /api/v1/events/ams-slot-changed \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"printer_id":"<uuid>","ams_index":0,"tray_index":0,"tray_type":"PLA","tag_uid":"0A1B2C3D","is_empty":false}'
```

---

## 4. Intelligence

### `POST /api/v1/match`

Run the spool matching engine directly. Useful for debugging or manual identification.

- **Auth:** `requireAuth`
- **Zod schema:** `matchRequestSchema`
- **Requirement:** At least one of `tag_uid`, `tray_info_idx`, `tray_type`, or `tray_color` must be provided.

**Request body**
```json
{
  "tag_uid": "0A1B2C3D4E5F",
  "tray_info_idx": "GFA00",
  "tray_type": "PLA",
  "tray_color": "2B2B2DFF",
  "tray_sub_brands": "Bambu Lab",
  "printer_id": "<uuid>",
  "ams_index": 0,
  "tray_index": 0
}
```

**Response**
```json
{
  "match": {
    "spool_id": "<uuid>",
    "filament_name": "PLA Matte Charcoal",
    "vendor_name": "Bambu Lab",
    "confidence": 1.0,
    "match_method": "rfid"
  },
  "candidates": [
    {
      "spool_id": "<uuid>",
      "filament_name": "PLA Matte Charcoal",
      "confidence": 0.85,
      "match_method": "fuzzy"
    }
  ]
}
```

```bash
curl -X POST /api/v1/match \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"tag_uid":"0A1B2C3D4E5F"}'
```

---

### `POST /api/v1/orders/parse`

Parse order information from free text (email confirmation, product URL, or search query). Uses Claude AI to extract structured data and fuzzy-matches extracted items against existing filaments in the database.

- **Auth:** `optionalAuth`
- **Zod schema:** `orderParseSchema`

**Request body**
```json
{
  "text": "https://shop.bambulab.com/products/pla-matte-filament"
}
```

or

```json
{
  "text": "Order confirmation: 3 x Bambu Lab PLA Matte Charcoal 1kg - EUR 74.97"
}
```

**Response**
```json
{
  "type": "url",
  "parsed": {
    "shop": "Bambu Lab",
    "orderNumber": null,
    "orderDate": null,
    "items": [
      {
        "name": "PLA Matte Charcoal",
        "vendor": "Bambu Lab",
        "material": "PLA",
        "colorName": "Charcoal",
        "colorHex": "2B2B2D",
        "weight": 1000,
        "quantity": 1,
        "price": 24.99,
        "currency": "EUR",
        "url": "https://...",
        "matchedFilamentId": "<uuid>",
        "matchedFilamentName": "Bambu Lab PLA Matte Charcoal",
        "matchConfidence": "exact"
      }
    ]
  }
}
```

Input `type` is auto-detected as `url`, `email`, or `search`. For URLs the endpoint fetches page content before parsing.

```bash
curl -X POST /api/v1/orders/parse \
  -H "Content-Type: application/json" \
  -d '{"text":"Bambu Lab PLA Matte Charcoal 1kg 24.99 EUR"}'
```

---

### `POST /api/v1/prices/refresh`

Crawl current prices for shop listings. Operates on all active listings or a specific filament.

- **Auth:** `optionalAuth`
- **Body:** `{ "filamentId": "<uuid>" }` — omit to refresh all active listings

**Response**
```json
{
  "refreshed": 3,
  "results": [
    {
      "listingId": "<uuid>",
      "filamentId": "<uuid>",
      "url": "https://shop.example.com/product",
      "price": 24.99,
      "currency": "EUR",
      "source": "crawled",
      "inStock": true
    }
  ]
}
```

```bash
curl -X POST /api/v1/prices/refresh \
  -H "Content-Type: application/json" \
  -d '{"filamentId":"<uuid>"}'
```

---

## 6. Settings

### `GET /api/v1/settings/energy`

Returns energy tracking configuration.

- **Auth:** `optionalAuth`

**Response**
```json
{
  "energy_sensor_entity_id": "sensor.printer_plug_energy",
  "electricity_price_per_kwh": 0.32
}
```

### `PUT /api/v1/settings/energy`

Update energy tracking settings. Both fields are optional.

- **Auth:** `requireAuth`

**Request body**
```json
{
  "energy_sensor_entity_id": "sensor.printer_plug_energy",
  "electricity_price_per_kwh": 0.32
}
```

**Response**
```json
{ "ok": true }
```

**Notes:**
- Set `energy_sensor_entity_id` to `null` or `""` to disable energy tracking
- The sync worker reads these settings at startup. Changes take effect on next sync worker restart.
- `electricity_price_per_kwh` is in EUR. A typical German household rate is 0.30-0.35 EUR/kWh.

---

## 7. HMS Error Tracking

### `POST /api/v1/events/hms`

Store HMS (Health Management System) error events from the sync worker.

- **Auth:** `requireAuth`

**Request body**
```json
{
  "printer_id": "<uuid>",
  "events": [
    {
      "code": "0700_2000_0002_0001",
      "message": "AMS1 Slot2 filament has run out",
      "severity": "common",
      "wiki_url": "https://wiki.bambulab.com/en/h2/troubleshooting/hmscode/0700_2000_0002_0001"
    }
  ]
}
```

**Response**
```json
{ "stored": 1, "ids": ["<uuid>"] }
```

**Notes:**
- Auto-resolves spool/filament from AMS slot mapping when the code contains slot info
- Links to currently running print (if any)
- Deduplicates: same code for same printer within 60s is skipped
- Accepts multiple events per request

### `GET /api/v1/events/hms`

Query stored HMS events.

- **Auth:** `optionalAuth`
- **Query params:** `limit` (default 50, max 200)

**Response**
```json
{
  "data": [
    {
      "id": "<uuid>",
      "hmsCode": "0700_2000_0002_0001",
      "module": "ams",
      "severity": "common",
      "message": "AMS1 Slot2 filament has run out",
      "wikiUrl": "https://wiki.bambulab.com/...",
      "spool": { "filament": { "name": "PLA", "vendor": { "name": "Bambu Lab" } } },
      "print": { "id": "<uuid>", "name": "bracket.3mf" },
      "createdAt": "2026-04-15T12:00:00.000Z"
    }
  ]
}
```

## 8. Admin SQL

Diagnostic and repair endpoints for data-integrity fixes. All routes require Bearer auth.

### `POST /api/v1/admin/query`

Run a read-only SELECT against the production database on a `readonly` SQLite connection.

- **Auth:** `requireAuth`
- **Body:** `{ "query": "SELECT ..." }` (or `sql`)
- **Blocks:** any write verb, semicolons, multi-statements.

**Response**
```json
{ "rows": [ ... ], "count": 12 }
```

### `POST /api/v1/admin/sql/execute`

Run a single write statement (UPDATE/INSERT/DELETE) with positional parameter binding. Designed for repair workflows driven from the Diagnostics page.

- **Auth:** `requireAuth`
- **Body:**
  ```json
  {
    "sql": "UPDATE spools SET remaining_weight = ? WHERE id = ?",
    "params": [120, "<spool-uuid>"],
    "dryRun": false
  }
  ```
- **Blocks:** SELECT (use `/query`), DDL (CREATE/DROP/ALTER/PRAGMA/VACUUM/REINDEX/ATTACH/DETACH), multi-statements, SQL longer than 10KB.
- **Dry run:** when `dryRun: true`, the statement runs inside a transaction that is always rolled back. `changes` still reflects what *would* have been affected, so callers can preview impact before committing.

**Response**
```json
{
  "operation": "UPDATE",
  "changes": 1,
  "lastInsertRowid": 0,
  "dryRun": false
}
```
