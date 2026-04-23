# Printer Sync System

Technical reference for the printer sync pipeline -- the core runtime loop of HASpoolManager.

---

## 1. Overview

The addon contains a background **sync worker** (`lib/sync-worker.ts`) that
connects directly to Home Assistant via websocket and posts state snapshots
to `POST /api/v1/events/printer-sync`. Three paths feed the endpoint:

| Path | Trigger | Frequency | Purpose |
|---|---|---|---|
| **WebSocket `state_changed`** | HA entity value change (`gcode_state`, AMS tray sensors, etc.) | Real-time, ~seconds | Immediate print-start/-end, AMS-tray swap |
| **WebSocket `bambu_lab_event`** | Bambu HMS events (`event_print_error`) | On demand | Precise runout / error codes |
| **Watchdog REST poll** | Timer | Every 2 min (active print) / 5 min (idle) | Fallback against missed events, reconnect recovery |

**Auto-discovery:** Printers are discovered automatically from the bambu_lab
integration's entity registry. Entity mapping uses `original_name` with
support for English and German HA installations (see `lib/ha-discovery.ts`).

**Background process:** The sync worker runs as a separate Node.js process
alongside Next.js, started by `run.sh`. Both share the same SQLite database.

The sync handler processes each payload through four stages:

1. **Print lifecycle** — detect state transitions, create/finish/fail print records.
2. **AMS slot tracking** — update slot assignments, remain percentages, colors, material types.
3. **Spool matching** — identify which spool is in each slot using RFID, Bambu index, or fuzzy scoring.
4. **Weight deduction** — calculate and apply filament usage when a print finishes or fails.

---

## 2. Print Lifecycle State Machine

```
IDLE --> RUNNING --> FINISH (success)
IDLE --> RUNNING --> FAILED/CANCELED (failure)
IDLE --> RUNNING --> IDLE+error (filament runout, keeps print "running")
```

The raw `gcode_state` from the Bambu Lab MQTT protocol (10 possible values) is classified into four lifecycle categories:

| gcode_state               | Lifecycle    | Description                              |
|---------------------------|-------------|------------------------------------------|
| RUNNING, PREPARE, SLICING | active      | Print in progress                        |
| FINISH                    | finished    | Print completed successfully             |
| FAILED, CANCELED, CANCELLED | failed   | Print failed or was cancelled by user    |
| IDLE, PAUSE               | idle        | No active print or print is paused       |
| OFFLINE, UNKNOWN          | ambiguous   | Printer unreachable; do not change state |

Transitions only fire when the lifecycle category changes. Repeated syncs with the same category are no-ops. The `OFFLINE` and `UNKNOWN` states are explicitly ignored to avoid false print-end events during network interruptions.

---

## 3. Print Weight Deduction

Weight is deducted from the active spool(s) when a print transitions to `finished` or `failed`.

### Finished prints

The full slicer-reported weight is deducted from the active spool.

### Failed or cancelled prints

Weight is scaled by the print progress percentage:

1. **Primary:** `mc_percent` (print progress 0--100).
2. **Fallback:** `currentLayer / totalLayers` ratio.
3. **Last resort:** Full slicer weight (if no progress data is available).

### Multi-spool prints

When multiple AMS slots are active during a print, weight is distributed proportionally using the delta in each slot's `remain%` between print start and print end.

### Single spool without RFID (remain = -1)

Third-party spools report `remain% = -1` because they lack RFID weight data. In this case, progress-based scaling from the slicer weight is used instead.

---

## 4. Spool Matching (3 Tiers)

Each AMS slot payload includes tray metadata (tag_uid, material type, color, Bambu filament index). The matcher runs through three tiers in order, stopping at the first match.

### Tier 1a: RFID Exact Match

Looks up `tag_uid` in the `tag_mappings` table. Bambu Lab spools carry factory-programmed RFID tags with globally unique UIDs.

- Confidence: **1.0**
- Deterministic, no ambiguity.

### Tier 1b: Bambu Index Match

Matches the `bambu_idx` field from the tray against the filament catalog's `bambuIdx` attribute. This covers Bambu spools whose RFID was not previously registered.

- Confidence: **0.95**

### Tier 2: Fuzzy Scoring

When no exact match exists, a weighted score is computed:

| Factor        | Points | Method                                |
|---------------|--------|---------------------------------------|
| bambu_idx     | 40     | Exact match on Bambu filament index   |
| material type | 20     | Exact match (PLA, PETG, ABS, etc.)    |
| color         | 25     | CIE Delta-E distance (lower is better)|
| vendor        | 10     | Name similarity                       |
| AMS location  | 5      | Last-known slot assignment            |

The highest-scoring spool above a minimum threshold is selected.

---

## 5. Auto-Creation

### Bambu Lab spools (valid RFID, no match)

When a Bambu spool with a valid RFID tag appears in an AMS slot but has no existing match, the system auto-creates:

- Vendor record (if Bambu Lab vendor does not exist)
- Filament record (material type, color, Bambu index)
- Spool record (linked to filament, initial weight from RFID data)
- Tag mapping (tag_uid to spool_id)

### Draft spools (no RFID, unmatched)

When a tray has no RFID (`tag_uid` empty or null) and fuzzy matching fails, a draft spool is created with status `"draft"`. Draft spools appear in the UI for the user to review, confirm, or merge with an existing spool.

---

## 6. AMS Slot Tracking

### Slot state updates

Every sync updates each AMS slot record with:

- Current spool assignment (matched or auto-created spool ID)
- `remain%` from the tray sensor
- Color hex value
- Material type string

### Location transitions

Spool location is tracked through these states:

```
ams --> workbench --> surplus --> rack
```

- **ams**: Spool is loaded in an AMS slot.
- **workbench**: Spool was removed from AMS but is still near the printer.
- **surplus**: Spool has been set aside (partial or empty).
- **rack**: Spool is stored on the filament rack.

### Weight sync from AMS remain%

For RFID-equipped spools, the spool's remaining weight can be synced from the AMS `remain%` reading. This only happens when:

1. The printer is **idle** (not during a print).
2. The delta between the stored weight and the AMS-reported weight exceeds **5%** of the spool's initial weight.

This prevents noisy small updates while still catching manual spool swaps or partial usage outside of tracked prints.

---

## 7. Sync Log

Every incoming sync payload is logged to the `sync_log` table with:

- Raw printer state payload
- Detected lifecycle transition (if any)
- Active print name and ID
- AMS slot change summary

The sync log is viewable on the `/admin` page for debugging.

**Auto-cleanup:** Log entries older than 72 hours are automatically deleted during each sync cycle to prevent unbounded database growth.

---

## 8. Idempotency

The sync system is designed to handle duplicate or replayed payloads safely.

| Mechanism              | Implementation                                                  |
|------------------------|------------------------------------------------------------------|
| Print creation         | Unique `ha_event_id` prevents duplicate print records            |
| Usage records          | Composite uniqueness on `print_id + spool_id` prevents double deduction |
| Slot updates           | Upsert semantics; repeated syncs with identical data are no-ops  |
| Lifecycle transitions  | Only fire on category change, not on repeated identical states   |
