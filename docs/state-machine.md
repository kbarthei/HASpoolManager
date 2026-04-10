# HASpoolManager — Print Tracking State Machine

> Generated from the actual implementation in `app/api/v1/events/printer-sync/route.ts`,
> `lib/printer-sync-helpers.ts`, and `lib/matching.ts`. Documents what the code does,
> not aspirational behavior.

---

## 1. Printer State Classification

The sync endpoint receives `gcode_state` (coarse, 10 values) and `print_state` / `stg_cur`
(fine-grained, 68+ values). Lifecycle decisions use `gcode_state` exclusively via
`classifyGcodeState()`. The `stg_cur` value is stored for display only.

### `classifyGcodeState()` mapping

| `gcode_state` | Lifecycle | Description |
|---|---|---|
| `RUNNING` | **active** | Actively printing (all sub-stages: homing, heating, extruding) |
| `PREPARE` | **active** | Job accepted, printer preparing (downloading, parsing) |
| `SLICING` | **active** | Cloud slicing in progress |
| `INIT` | **active** | Initializing print sequence (brief transitional state) |
| `PAUSE` | **active** | Print paused (user, M400, filament runout, error) — recoverable |
| `FINISH` | **finished** | Print completed successfully |
| `FAILED` | **failed** | Print failed due to error |
| `CANCELED` / `CANCELLED` | **failed** | User cancelled — treated identically to failed |
| `IDLE` | **idle** | No job active |
| `OFFLINE` | **ambiguous** | Printer unreachable — do not change running state |
| `UNKNOWN` / empty | **ambiguous** | State unknown — do not change running state |

**Implementation** (`lib/printer-sync-helpers.ts`):

```typescript
const GCODE_ACTIVE = new Set(["RUNNING", "PREPARE", "SLICING", "INIT", "PAUSE"]);
const GCODE_FINISH = new Set(["FINISH"]);
const GCODE_FAILED = new Set(["FAILED", "CANCELED", "CANCELLED"]);
const GCODE_IDLE   = new Set(["IDLE"]);
// Everything else → "ambiguous"
```

### Calibration filter

Before creating a print record, the sync endpoint checks `isCalibrationJob(printName)`.
Calibration routines cycle through `IDLE -> RUNNING -> FINISH -> IDLE` like real prints
but are filtered out by name matching:

| Calibration name pattern | Example |
|---|---|
| `auto_cali` | Auto-calibration routine |
| `auto_calibration` | Auto-calibration (alternate) |
| `user_param` | User parameter calibration |
| `default_param` | Default parameter calibration |

---

## 2. Print Lifecycle State Machine

### Mermaid statechart

```mermaid
stateDiagram-v2
    [*] --> no_print

    no_print --> running : gcode_state ∈ {RUNNING, PREPARE, SLICING, INIT, PAUSE}\n&& !isCalibrationJob(name)\n→ INSERT prints (status=running)\n→ snapshot slot remains\n→ match active spool

    running --> running : gcode_state ∈ {RUNNING, PREPARE, SLICING, INIT, PAUSE}\n→ UPDATE printWeight\n→ accumulate activeSpoolIds

    running --> finished : gcode_state = FINISH\nOR (gcode_state = IDLE && !printError)\n→ SET status=finished\n→ createPrintUsage(fullWeight)\n→ deduct from spool(s)

    running --> failed : gcode_state ∈ {FAILED, CANCELED, CANCELLED}\n→ SET status=failed\n→ createPrintUsage(partialWeight)\n→ deduct scaled by progress

    running --> running : gcode_state = IDLE && printError=true\n→ keep running (filament runout / spool swap)

    running --> running : gcode_state ∈ {OFFLINE, UNKNOWN}\n→ no change (ambiguous, printer may still be printing)

    finished --> no_print : (next sync cycle)
    failed --> no_print : (next sync cycle)

    no_print --> no_print : gcode_state = IDLE\n→ no-op

    no_print --> no_print : gcode_state ∈ {RUNNING, PREPARE, ...}\n&& isCalibrationJob(name)\n→ skip (calibration, not a print)

    no_print --> no_print : gcode_state ∈ {OFFLINE, UNKNOWN}\n→ no-op
```

### Transition detail

| From | To | Condition | DB Actions |
|---|---|---|---|
| `no_print` | `running` | `!runningPrint && isActive && !isCalibrationJob` | `INSERT prints` with haEventId, remainSnapshot, activeSpoolId(s) |
| `running` | `finished` | `runningPrint && (isFinished \|\| (isIdle && !printError))` | `UPDATE prints SET status=finished`, `createPrintUsage(fullWeight)` |
| `running` | `failed` | `runningPrint && isFailed` | `UPDATE prints SET status=failed`, `createPrintUsage(partialWeight)` |
| `running` | `running` | `runningPrint && isActive` | `UPDATE prints SET printWeight`, accumulate `activeSpoolIds` |
| `running` | `running` | `runningPrint && isIdle && printError` | No change — waiting for spool swap or user action |
| `running` | `running` | `runningPrint && lifecycle=ambiguous` | No change — OFFLINE/UNKNOWN do not alter state |
| `no_print` | `no_print` | `!runningPrint && !isActive` | No-op |

### Flow: Normal print

```
IDLE → PREPARE → RUNNING → FINISH → IDLE
  │                                    │
  └── sync: started ──────────────── sync: finished
```

### Flow: Failed / cancelled print

```
IDLE → PREPARE → RUNNING → FAILED → IDLE
  │                          │
  └── sync: started ──── sync: failed (partial weight × progress%)
```

### Flow: Pause and resume

```
RUNNING → PAUSE → RUNNING → FINISH
   │         │        │
   │         │        └── still "active" lifecycle, no transition
   │         └── "active" lifecycle, print stays running
   └── print remains running throughout
```

### Flow: Filament runout (spool swap)

```
RUNNING → PAUSE(stg_cur=6) → IDLE+error → ... → IDLE-error → RUNNING → FINISH
   │           │                   │                              │
   │           │                   └── runningPrint kept alive     │
   │           └── "active" lifecycle                              │
   └── activeSpoolIds accumulates new spool on resume
```

The key mechanism: when `gcode_state=IDLE` but `printError=true`, the print stays
in `running` status. When the error clears (`IDLE + !printError`), it transitions
to `finished` (not started as a new print).

### Flow: Calibration skip

```
IDLE → RUNNING(name="auto_cali") → FINISH → IDLE
                    │
                    └── isCalibrationJob=true → no print record created
```

---

## 3. Weight Deduction Logic

```mermaid
flowchart TD
    A[Print ends: finished or failed] --> B{Failed?}

    B -->|No: finished| C[totalWeight = printWeight from slicer or last sync]
    B -->|Yes: failed| D{printProgress > 0?}

    D -->|Yes| E["partialWeight = totalWeight × (progress / 100)"]
    D -->|No| F{"printLayersCurrent > 0\n&& printLayersTotal > 0?"}

    F -->|Yes| G["partialWeight = totalWeight × (currentLayer / totalLayers)"]
    F -->|No| H[partialWeight = totalWeight — full charge as fallback]

    C --> I[createPrintUsage]
    E --> I
    G --> I
    H --> I

    I --> J{Multiple spools?\nactiveSpoolIds.length > 1}

    J -->|Yes| K{remainSnapshot available\nfor start AND end?}
    J -->|No: single spool| L[Full weight to that spool]

    K -->|Yes| M[Compute remain deltas per slot:\nstartRemain - endRemain for each spool]
    K -->|No| L2[Equal split: totalWeight / spoolCount]

    M --> N{totalDelta > 0?}
    N -->|Yes| O["Proportional: spoolWeight = totalWeight × (spoolDelta / totalDelta)"]
    N -->|No: all zero| L2

    L --> P[For each spool:]
    L2 --> P
    O --> P

    P --> Q[Idempotency check: skip if print_usage exists for printId+spoolId]
    Q --> R["Deduct: spool.remainingWeight -= weightForSpool"]
    R --> S{"remainingWeight <= 0?"}
    S -->|Yes| T["SET spool.status = 'empty'"]
    S -->|No| U["Keep spool.status = 'active'"]

    R --> V["Calculate cost: (weightForSpool / initialWeight) × purchasePrice"]
    V --> W[INSERT print_usage record]
    W --> X["UPDATE print.totalCost (sum of all usage costs)"]
```

### Weight source priority

1. **Finished print**: `printWeight` from the current sync payload, falling back to
   `runningPrint.printWeight` (stored during the print).
2. **Failed print**: Same source, then scaled by `progress / 100`.

### Multi-spool proportional distribution

When a print uses multiple spools (tracked via `activeSpoolIds`), the system uses
AMS `remain` percentage deltas to distribute weight proportionally:

1. At print **start**: snapshot `remain` values for all slots → stored in `prints.remainSnapshot`
2. At print **end**: read current `remain` values from the sync payload
3. For each spool: `delta = startRemain[slot] - endRemain[slot]`
4. Proportional weight: `spoolWeight = totalWeight * (spoolDelta / sumOfAllDeltas)`
5. **Fallback**: if all deltas are zero or remain data is missing → equal split

### Single spool

When only one spool was used (or for backward compatibility with `activeSpoolId`),
the full weight goes to that spool. No proportional calculation needed.

### Spool swap mid-print

The current implementation handles spool swaps by accumulating `activeSpoolIds` during
the print. Each time the active spool changes (detected via RFID or fuzzy matching
on each sync), the new spool ID is appended to the array. At print end, proportional
weight distribution uses remain deltas to split weight between all spools used.

**Note**: The planned `print_error` code parsing for exact runout slot identification
(documented in `docs/plan-ha-native-sync.md`) is not yet implemented. The current
`printError` field is a boolean, not the raw integer error code.

---

## 4. Spool Matching Decision Tree

```mermaid
flowchart TD
    A["Slot data arrives:\ntag_uid, tray_info_idx, tray_type, tray_color"] --> B{"tag_uid present\n&& != 0000000000000000?"}

    B -->|Yes| C["Tier 1a: RFID exact match\nLookup tag_mappings by tag_uid"]
    C --> D{Found?}
    D -->|Yes| Z["MATCH: confidence=1.0\nmethod=rfid_exact"]

    D -->|No| E{"tray_info_idx present\n&& printer_id + slot known?"}

    B -->|No| E

    E -->|Yes| F["Tier 1b: Bambu index + slot match\nLookup ams_slots by printer+ams+tray\nVerify filament.bambuIdx == tray_info_idx"]
    F --> G{Found + idx matches?}
    G -->|Yes| Y["MATCH: confidence=0.95\nmethod=bambu_idx_exact"]

    G -->|No| H["Tier 2: Fuzzy scoring\nAll active spools evaluated"]

    E -->|No| H

    H --> I["Score components (max 100 points):\n1. bambu_idx: 40 pts (exact) / 12 pts (product line prefix)\n2. color ΔE: 25 pts (ΔE<2.3) / 20 (ΔE<5) / 10 (ΔE<10) / 2.5 (ΔE<20)\n3. material: 20 pts (exact match)\n4. vendor: 10 pts (tray_sub_brands contains vendor name)\n5. location: 5 pts (spool is in AMS/AMS-HT)"]

    I --> J{"confidence >= 0.20?"}
    J -->|Yes| K["Return top candidate as match\n(>= 0.95 returned directly;\n< 0.95 returned with alternatives)"]
    J -->|No| L[No fuzzy match]

    K --> M{Match found?}
    L --> M
    M -->|Yes| Z2["Update spool.location to match slot type"]

    M -->|No| N{"tag_uid present\n&& tag_uid != all zeros\n&& len > 8?"}

    N -->|Yes| O["AUTO-CREATE Bambu spool:\n1. Find/create 'Bambu Lab' vendor\n2. Find/create filament by bambuIdx+color\n3. Create spool (status=active, weight=1000g)\n4. Create tag_mapping (source=bambu)"]

    N -->|No| P{"tray_type present\n&& (no tag OR tag=all zeros)?"}

    P -->|Yes| Q{"Existing spool already\nassigned to this slot?"}
    Q -->|Yes| R[Return existing spool ID — no duplicate]
    Q -->|No| S["AUTO-CREATE draft spool:\n1. Find/create 'Unknown' vendor\n2. Find/create generic filament (material+color)\n3. Create spool (status=draft, weight=1000g)\n4. No tag_mapping created"]

    P -->|No| T[No match — slot tracked without spool link]
```

### Fuzzy scoring weights

| Factor | Points | Condition |
|---|---|---|
| `bambu_idx` exact | 40 | `filament.bambuIdx === tray_info_idx` |
| `bambu_idx` prefix | 12 | First 3 chars match (same product line) |
| Material | 20 | Case-insensitive exact match |
| Color (ΔE < 2.3) | 25 | Imperceptible difference |
| Color (ΔE < 5) | 20 | Close match |
| Color (ΔE < 10) | 10 | Perceptible but similar |
| Color (ΔE < 20) | 2.5 | Different but same family |
| Vendor | 10 | `tray_sub_brands` contains vendor name |
| Location | 5 | Spool is currently in AMS or AMS-HT |

Minimum confidence threshold: **0.20** (20 out of 100 points).
High confidence threshold: **0.95** (returned without alternatives).

---

## 5. AMS Slot Lifecycle

```mermaid
stateDiagram-v2
    [*] --> storage : spool created (default location)

    storage --> ams : loaded into AMS slot\n(sync detects spool in tray)
    storage --> ams_ht : loaded into AMS HT\n(sync detects spool in tray)

    ams --> workbench : swapped out (replaced by different spool in same slot)
    ams --> surplus : slot emptied (tray_type="" or isEmpty=true)
    ams_ht --> workbench : swapped out
    ams_ht --> surplus : slot emptied

    workbench --> ams : reloaded into AMS
    workbench --> ams_ht : reloaded into AMS HT
    workbench --> storage : manually moved back

    surplus --> ams : reloaded into AMS
    surplus --> ams_ht : reloaded into AMS HT
    surplus --> storage : manually moved back

    note right of ams : location="ams"
    note right of ams_ht : location="ams-ht"
    note right of workbench : location="workbench"
    note right of surplus : location="surplus"
    note right of storage : location="storage"
```

### Slot definitions (hardcoded)

| Key | Slot Type | AMS Index | Tray Index | Physical Position |
|---|---|---|---|---|
| `slot_1` | `ams` | 0 | 0 | AMS slot 1 |
| `slot_2` | `ams` | 0 | 1 | AMS slot 2 |
| `slot_3` | `ams` | 0 | 2 | AMS slot 3 |
| `slot_4` | `ams` | 0 | 3 | AMS slot 4 |
| `slot_ht` | `ams_ht` | 1 | 0 | AMS HT slot |
| `slot_ext` | `external` | -1 | 0 | External spool holder |

### Location transitions triggered by sync

| Scenario | Old spool location set to | New spool location set to |
|---|---|---|
| Slot was occupied, now empty | `surplus` | (no new spool) |
| Slot was occupied, now different spool | `workbench` | `ams` / `ams-ht` / `external` |
| Slot was empty, now occupied | (no old spool) | `ams` / `ams-ht` / `external` |

### Spool status values (application-level, not sync-driven)

| Status | Meaning |
|---|---|
| `active` | In use, has remaining filament |
| `draft` | Auto-created, needs user review |
| `empty` | Remaining weight reached 0 after print |
| `archived` | User manually archived |
| `returned` | Returned to vendor |

---

## 6. Sync Event Processing

```mermaid
sequenceDiagram
    participant HA as Home Assistant
    participant API as POST /api/v1/events/printer-sync
    participant CLS as classifyGcodeState()
    participant DB as SQLite
    participant Match as matchSpool()
    participant Usage as createPrintUsage()

    HA->>API: POST (flat key-value body every 60s)
    API->>API: Parse & normalize (num, bool, str)
    API->>CLS: classifyGcodeState(gcode_state)
    CLS-->>API: lifecycle (active/finished/failed/idle/ambiguous)

    API->>DB: Query running print for this printer

    alt No running print + active + not calibration
        API->>Match: Match active spool (RFID or fuzzy)
        Match-->>API: startActiveSpoolId
        API->>API: Snapshot remain values for all slots
        API->>DB: INSERT prints (status=running, haEventId, remainSnapshot)
        Note over API: printTransition = "started"
    else Running print + finished (or idle+no error)
        API->>DB: UPDATE prints SET status=finished
        API->>Usage: createPrintUsage(fullWeight, endRemains)
        Usage->>DB: For each spool: INSERT print_usage, UPDATE spool weight
        Note over API: printTransition = "finished"
    else Running print + failed
        API->>API: Scale weight by progress (or layer ratio, or full)
        API->>DB: UPDATE prints SET status=failed
        API->>Usage: createPrintUsage(partialWeight, endRemains)
        Usage->>DB: For each spool: INSERT print_usage, UPDATE spool weight
        Note over API: printTransition = "failed"
    else Running print + active
        API->>Match: Match current active spool
        Match-->>API: activeSpoolId
        API->>DB: UPDATE prints (weight, activeSpoolIds accumulate)
    else Running print + idle + error
        Note over API: No change — keep print running (spool swap)
    else Running print + ambiguous
        Note over API: No change — OFFLINE/UNKNOWN
    end

    loop For each of 6 slot definitions
        API->>API: Check if slot data present in payload
        API->>Match: matchSpool(tag, idx, type, color)
        alt No match + RFID tag present
            API->>DB: autoCreateBambuSpool()
        else No match + no RFID + has type
            API->>DB: autoCreateDraftSpool()
        end
        alt Old spool swapped/removed
            API->>DB: UPDATE old spool location (surplus or workbench)
        end
        API->>DB: UPSERT ams_slots
        alt Idle + RFID + remain% available
            API->>API: calculateWeightSync()
            opt Should update (delta > 5% of initial, would decrease)
                API->>DB: UPDATE spool.remainingWeight
            end
        end
    end

    API->>DB: INSERT sync_log (fire-and-forget)
    opt Random 1.7% chance
        API->>DB: DELETE sync_log older than 72 hours
    end

    alt printTransition != "none"
        API->>API: revalidatePath(/, /prints, /inventory, /spools)
    end
    alt slotsUpdated > 0
        API->>API: revalidatePath(/, /inventory)
    end

    API-->>HA: JSON response (synced, lifecycle, transition, slots, weight_syncs)
```

---

## 7. Idempotency Guards

| Mechanism | Location | Purpose |
|---|---|---|
| **`ha_event_id` uniqueness** | `prints` table | Prevents duplicate print records for the same job. Built from `sync_{printerId}_{date}_{name}`. If a record with the same prefix exists, a counter suffix `_2`, `_3` etc. is appended. |
| **`print_usage` composite check** | `createPrintUsage()` | Before inserting a usage record, queries for existing `(printId, spoolId)` pair. Skips if already exists. |
| **Draft spool duplicate prevention** | `autoCreateDraftSpool()` | Before creating a draft spool, checks if the target AMS slot already has a spool assigned. Returns existing `spoolId` if so. Prevents creating 100+ drafts on every 60s sync cycle. |
| **Tag mapping race guard** | `autoCreateBambuSpool()` | Before creating a new Bambu spool, checks if a `tag_mappings` record already exists for that `tagUid`. Returns existing `spoolId` if found. |
| **Ambiguous state no-op** | Lifecycle classification | `OFFLINE` and `UNKNOWN` states return `"ambiguous"`, which triggers no state transitions. Prevents closing prints during connectivity drops. |
| **Calibration filter** | Print creation guard | `isCalibrationJob()` prevents auto-calibration routines from creating spurious print records, even though they cycle through the same `RUNNING -> FINISH` states. |
| **Weight sync guards** | `calculateWeightSync()` | Multiple guards prevent spurious weight updates: only when idle, only with valid RFID, only when weight would decrease, only when delta exceeds 5% of initial weight. |
| **Running print singleton** | Print start guard | A new print is only created when `!runningPrint && isActive`. While a print is running, no second print record can be created for the same printer. |

---

## 8. Error Code Reference

### Current implementation

The sync endpoint receives `print_error` as a **boolean** (via the `bool()` parser from
HA's `binary_sensor.PRINTER_print_error`). It does NOT currently parse the raw integer
error code. The boolean is used solely to distinguish between:

| `gcode_state` | `printError` | Behavior |
|---|---|---|
| `IDLE` | `false` | Running print → `finished` (missed FINISH event) |
| `IDLE` | `true` | Running print → stays `running` (filament runout / spool swap in progress) |
| `FAILED` | (any) | Running print → `failed` |
| `FINISHED` | (any) | Running print → `finished` |

### Bambu Lab error codes (from MQTT `print_error` integer field)

These are documented in `docs/07-bambulab-printer-states.md` and `docs/plan-ha-native-sync.md`
but are **not yet parsed** by the current implementation:

| Error Code | Hex | Meaning | Current Handling |
|---|---|---|---|
| `0` | `0x00000000` | No error | `printError=false` |
| `50348044` | `0x0300800C` | User cancel | Mapped to `gcode_state=FAILED` → status `"failed"` |
| `0x07008011` | AMS tray 0 | AMS filament runout (slot 1) | `printError=true` → keep running |
| `0x07018011` | AMS tray 1 | AMS filament runout (slot 2) | `printError=true` → keep running |
| `0x07028011` | AMS tray 2 | AMS filament runout (slot 3) | `printError=true` → keep running |
| `0x07038011` | AMS tray 3 | AMS filament runout (slot 4) | `printError=true` → keep running |
| `0x18008011` | AMS HT tray 0 | AMS HT filament runout | `printError=true` → keep running |
| `0x07FF8011` | External | External spool runout | `printError=true` → keep running |

### Error code structure (planned, not implemented)

```
0xMMSS8011
  MM = module:  0x07 = AMS,  0x18 = AMS HT
  SS = slot:    0x00-0x03 (AMS),  0x00 (AMS HT),  0xFF (external)
  8011 = runout error suffix (constant)
```

### Planned improvement

The `docs/plan-ha-native-sync.md` describes parsing the raw integer error code to identify
the exact slot that ran out, enabling precise weight split at the runout point. This would
require receiving `print_error` as an integer rather than a boolean from HA.

---

## 9. Weight Sync from AMS Remain

Separate from print-based weight deduction, the sync endpoint also updates spool weights
from the AMS `remain` percentage (RFID-based estimate from the Bambu printer).

```mermaid
flowchart TD
    A["Slot has matched spool\n&& !isEmpty && remain >= 0"] --> B{"calculateWeightSync()"}

    B --> C{"Printer idle?"}
    C -->|No| X1["Skip: printer_active"]

    C -->|Yes| D{"Valid RFID tag?\n(not all zeros, len >= 8)"}
    D -->|No| X2["Skip: no_rfid"]

    D -->|Yes| E{"remain in 0-100 range?"}
    E -->|No| X3["Skip: invalid_remain"]

    E -->|Yes| F{"initialWeight > 0?"}
    F -->|No| X4["Skip: no_initial_weight"]

    F -->|Yes| G["calculatedWeight = round(initialWeight × remain / 100)"]

    G --> H{"calculatedWeight >= currentWeight?"}
    H -->|Yes| X5["Skip: would_increase\n(never increase weight from remain%)"]

    H -->|No| I{"delta = currentWeight - calculatedWeight\ndelta >= initialWeight × 5%?"}
    I -->|No| X6["Skip: below_threshold\n(avoid noise from ±1-2% fluctuation)"]

    I -->|Yes| J["UPDATE spool.remainingWeight = calculatedWeight"]
```

### Guards summary

1. Only when printer is **idle** (not during active printing)
2. Only for spools with valid **RFID tags** (Bambu spools)
3. Never **increases** weight (remain% can fluctuate upward due to estimation)
4. Minimum **5% delta** threshold to avoid noisy small updates
5. `remain` must be in valid 0-100 range
