# Error Codes

Three kinds of error codes flow through HASpoolManager:
1. **Bambu `print_error` codes** (integer fields from MQTT) — identify
   which tray ran out, cancelled the job, etc.
2. **Bambu HMS codes** (Health Management System, structured format) —
   broader printer warnings, not limited to prints
3. **Internal API errors** (our own `{error: string}` responses) —
   what the UI shows on failed requests

---

## 1. Bambu `print_error` codes

Numeric error code on the `print_error` sensor. Parsed by
`lib/sync-worker.ts:parseRunoutError()` to identify the exact
runout slot.

### Format

```
0xMMSS8011
  MM  = module byte:   0x07 = AMS,   0x18 = AMS HT
  SS  = slot:          0x00–0x03 (AMS trays 1–4), 0x00 (AMS HT), 0xFF (external)
  8011 = runout-error suffix (constant)
```

### Known values

| Hex | Decimal | Meaning | Our handling |
|---|---|---|---|
| `0x00000000` | 0 | No error | `printError = false` |
| `0x0300800C` | 50348044 | User cancel | Maps to `gcode_state = FAILED` → print status `"failed"` |
| `0x07008011` | — | AMS tray 0 runout (slot 1) | `printError = true`; sync keeps print `"running"`; `pendingSwaps` queued |
| `0x07018011` | — | AMS tray 1 runout (slot 2) | same |
| `0x07028011` | — | AMS tray 2 runout (slot 3) | same |
| `0x07038011` | — | AMS tray 3 runout (slot 4) | same |
| `0x18008011` | — | AMS HT tray 0 runout | same |
| `0x07FF8011` | — | External spool runout | same |

### Runout behavior

When `print_error` becomes non-zero with a runout code:
1. `parseRunoutError(code)` decodes `{amsUnit, trayIndex}`
2. Print stays `running` (the printer will pause for filament change)
3. `pendingSwaps` on the per-printer sync-worker state queues the swap
4. Next `state_changed` on the tray sensor reconciles against the pending
   swap to record the exact moment the spool was replaced (for
   proportional weight split)

`event_print_error_cleared` resets the runout flag.

See also [`../architecture/state-machine.md`](../architecture/state-machine.md) §5.

---

## 2. Bambu HMS codes (Health Management System)

Emitted separately from `print_error`. Structured format covering
broader printer state (filament jams, lidar warnings, heatbed issues,
etc.).

### Format

16 hex digits, often rendered as `AAAA_BBBB_CCCC_DDDD`:

```
AAAA = attr >> 16    module byte (high) + AMS-unit sub-byte (low)
BBBB = attr & 0xFFFF part ID (not currently used for semantics)
CCCC = code >> 16    slot/tray index (high) + unused (low)
DDDD = code & 0xFFFF severity level
```

`lib/printer-sync-helpers.ts:parseHmsCode(attr, code)` decodes into a
`ParsedHmsCode`:

```ts
{
  fullCode: "0700_2000_0002_0001",
  module: "ams",            // see HMS_MODULES table below
  moduleId: 0x07,
  amsUnit: 0,                // 0=AMS-A, 1=AMS-B
  severity: "fatal",         // see HMS_SEVERITY table below
  slotKey: "slot_3",          // "slot_1".."slot_4", "slot_ht", or null
  slotIndex: 3,               // 1-based; null for non-AMS modules
}
```

### Modules (`HMS_MODULES`)

| Module ID | Name | What it covers |
|---|---|---|
| `0x03` | `mc` | Motion controller — heatbed, motors, sensors |
| `0x05` | `mainboard` | System-level faults |
| `0x07` | `ams` | Automatic Material System — filament runout, jam, RFID, drying |
| `0x08` | `toolhead` | Extruder + nozzle issues |
| `0x0C` | `xcam` | LiDAR / camera — spaghetti detection, first-layer inspection |
| other | `unknown` | Reserved / undocumented |

### Severity (`HMS_SEVERITY`)

| Level | Label | Meaning |
|---|---|---|
| `1` | `fatal` | Print must stop; manual intervention required |
| `2` | `serious` | Significant issue, may need intervention |
| `3` | `common` | Standard warning |
| `4` | `info` | Informational only |

### Storage

Every HMS event is logged in the `hms_events` table with:
- `printer_id`, `print_id`, `spool_id`, `filament_id` (best-effort correlation)
- Raw `hms_code`, `module`, `severity`, `slot_key`
- Optional `wiki_url` pointing at the Bambu wiki entry for the code

Full Bambu wiki catalogue:
[wiki.bambulab.com/en/hms/error-code](https://wiki.bambulab.com/en/hms/error-code).

### Parser tests

`tests/unit/printer-sync-helpers.test.ts` covers `parseHmsCode()` +
`parseHmsCodeString()` with known codes across all modules + severities.

### Message catalog (853 entries)

In addition to parser-derived metadata (module, severity, slot), every
HMS code has a human-readable description in the bundled catalog at
`lib/data/hms-codes.json`. Loaded via `lib/hms-code-catalog.ts`:

```ts
import { lookupHmsMessage } from "@/lib/hms-code-catalog";

const entry = lookupHmsMessage("0300_8004");
// → { code, message_en, wiki_url }
```

**Where it's used:**

- **Write path** — `POST /api/v1/events/hms` uses the catalog as fallback
  when the sender doesn't provide `message` or `wiki_url`. New rows are
  self-descriptive in the DB.
- **Read path** — the admin Diagnostics HMS-event list renders the
  catalog message when the stored `message` column is null. Ensures
  historical events get Klartext too.

**Normalization:** `lookupHmsMessage` accepts the 2-segment short form
(`"0300_8004"`) and the 4-segment long form (`"0300_8004_0002_0001"`) —
it strips to the first two segments before lookup.

**Source + license:** catalog is imported from
[Bambuddy's `hms_errors.py`](https://github.com/maziggy/bambuddy/blob/main/backend/app/services/hms_errors.py),
which itself scraped the Bambu Lab wiki via
[`greghesp/ha-bambulab`](https://github.com/greghesp/ha-bambulab).
Bambuddy is AGPL-3.0 — the `_meta.license` field in the JSON records
this attribution. Re-generate the catalog with a script when Bambuddy
publishes new entries; don't edit `hms-codes.json` by hand.

---

## 3. Internal API errors

Every `/api/v1/*` route returns errors in a consistent shape:

```json
{ "error": "string description" }
```

Status-code conventions:

| Status | When | Body example |
|---|---|---|
| `400` | Invalid input (Zod validation fail) | `{"error": "name: String must contain at least 1 character(s)"}` |
| `401` | Missing / invalid Bearer token | `{"error": "Missing Authorization header"}` or `{"error": "Invalid API key"}` |
| `403` | Forbidden (rare — used in a few admin paths for permission denial) | `{"error": "Forbidden"}` |
| `404` | Resource not found (e.g. rack ID doesn't exist) | `{"error": "Rack not found"}` |
| `500` | Server error (SQL, unexpected exception) | `{"error": "Internal server error"}` — **always generic**; details go to server logs |

### Sanitization

Internal SQL errors, file paths, stack traces are **never** returned in
the response body. See [`../architecture/security-model.md`](../architecture/security-model.md) §5.

### Validation error format

Zod errors include field path and message:

```json
{"error": "name: String must contain at least 1 character(s); rows: Number must be greater than or equal to 1"}
```

Multiple fields joined by `; `.

### Write SQL endpoint specifically

`/api/v1/admin/sql/execute` has stricter error shapes:

```json
{"error": "Write operations and multi-statements not allowed"}
{"error": "DDL operations are not allowed"}
{"error": "SQL payload exceeds 10KB"}
{"error": "Syntax error"}  // sanitized — not the raw sqlite message
```

---

## 4. Where each code surfaces in the UI

| Source | UI location |
|---|---|
| `print_error` (int) | Prints → job detail → "Error" badge; sync-log on `/admin/diagnostics` |
| HMS event | `/admin/diagnostics` → HMS Events card, grouped by filament |
| API 4xx | Client side: toast notification from `lib/fetch-wrapper` (where used) |
| API 500 | Client side: generic "Something went wrong" toast + full stack in browser console + server console |

---

## 5. Related

- [`../architecture/state-machine.md`](../architecture/state-machine.md) — print-lifecycle transitions including error paths
- [`../architecture/sync-worker.md`](../architecture/sync-worker.md) §6 — sync-worker error handling
- [`../architecture/security-model.md`](../architecture/security-model.md) — generic-error contract
- [`../operator/troubleshooting.md`](../operator/troubleshooting.md) — operator-facing breakage recipes
