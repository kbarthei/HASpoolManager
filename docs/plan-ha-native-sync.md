# Plan: Native HA Integration (Zero-Config, Event-Based Sync)

> **Status:** Planning — research complete
> **Goal:** Replace manual rest_command + automation YAML with addon-internal,
> event-based, zero-config sync. No user setup required — printers are
> auto-discovered on first print event.

## 1. Problem

Current setup requires the user to:
1. Add a `rest_command` to `configuration.yaml` (full HA restart needed)
2. Create two automations in `automations.yaml` (timer + state-change)
3. Hardcode 10+ sensor entity names (language-dependent)
4. Know the printer UUID
5. Remove two template sensors after migration

This is fragile, error-prone, and doesn't scale to multiple printers.

## 2. Target: Zero-Config

After this change:
- **User installs addon** → done
- **First print starts** → addon auto-discovers the printer via `bambu_lab_event`
- **No YAML editing**, no entity mapping, no HA restart
- **Multiple printers** supported automatically
- **Event-driven** with watchdog fallback — no 60-second polling waste

## 3. Research Findings

### Bambu Lab MQTT Protocol

The printer communicates via MQTT over TLS (port 8883). All status arrives as
JSON in `device/{serial}/report` → `print.push_status`. Updates are **event-driven**
(not polled) — the printer pushes on every state change. During active prints,
updates arrive every few seconds.

### bambu_lab HA Integration (greghesp/ha-bambulab)

Creates ~77 entities per printer. Entirely event-driven (no polling interval).
HA's DataUpdateCoordinator deduplicates: only actual value changes fire
`state_changed` events.

**8 custom device trigger events** via `bambu_lab_event`:

| Event | Trigger |
|-------|---------|
| `event_print_started` | gcode_state: idle-like → non-idle |
| `event_print_finished` | gcode_state → FINISH |
| `event_print_canceled` | print_error == 50348044 (user cancel) |
| `event_print_failed` | gcode_state → FAILED (not cancel) |
| `event_print_error` | Print error set |
| `event_print_error_cleared` | Print error cleared |
| `event_printer_error` | HMS error detected |
| `event_printer_error_cleared` | HMS error cleared |

### Filament Runout Sequence

When filament runs out during a print (no auto-refill available):

```
1. RUNNING, print_error=0                     ← Normal printing
2. PAUSE,   print_error=0x07038011            ← Runout detected (error code
                                                 encodes which AMS slot: 07=AMS,
                                                 03=tray index, 8011=runout)
3. PAUSE    (user removes empty spool)        ← Tray sensor: empty=true,
                                                 all fields reset
4. PAUSE    (user inserts new spool)          ← Tray sensor: new filament data
                                                 RFID: tag_uid changes
                                                 Non-RFID: tag_uid stays 0000...
5. RUNNING, print_error=0                     ← User presses Resume
```

**Key insight:** `print_error` contains the **exact slot** that ran out, encoded
in the error code. The PAUSE → tray empty → tray filled → RUNNING sequence is
unambiguous even without RFID — we know a swap happened because of the runout
error + tray empty/refill cycle.

### Per-Tray Print Weight from 3MF

The `print_weight` sensor has per-tray attributes (confirmed via HA API):
```
State: 752.76
AMS 1 Tray 4: 752.76
```
This is parsed from the 3MF file at print start — slicer-estimated weight per
tray, not real-time consumption.

### HA Websocket API

- **Connection:** `ws://supervisor/core/websocket`
- **Auth:** `SUPERVISOR_TOKEN` env var (available when `homeassistant_api: true`)
- **Subscribe events:** `{"type": "subscribe_events", "event_type": "bambu_lab_event"}`
- **Subscribe triggers:** `{"type": "subscribe_trigger", "trigger": {"platform": "state", "entity_id": "..."}}`
- **Read state:** `http://supervisor/core/api/states/{entity_id}`

## 4. Architecture

```
┌─────────────────────────────────────────────────────────────┐
│ Addon                                                       │
│                                                             │
│  Sync Worker (background Node.js process)                   │
│    │                                                        │
│    ├─ HA Websocket Client                                   │
│    │    ├── subscribe: bambu_lab_event (print lifecycle)     │
│    │    ├── subscribe: state_changed (AMS tray swaps)       │
│    │    └── auto-reconnect with backoff                     │
│    │                                                        │
│    ├─ Auto-Discovery                                        │
│    │    ├── on unknown device_id → query HA entity registry  │
│    │    ├── map entities by original_name (English, stable)  │
│    │    ├── create printer record in DB                      │
│    │    └── cache entity_id → field mapping                  │
│    │                                                        │
│    ├─ Event Handler                                         │
│    │    ├── on event → read all entity states via REST API   │
│    │    ├── build sync payload from original_name lookup     │
│    │    └── call existing sync engine (unchanged)            │
│    │                                                        │
│    ├─ Spool Swap Tracker                                    │
│    │    ├── detect: print_error 0xNN_8011 (runout per slot)  │
│    │    ├── track: tray empty → tray refilled → RUNNING      │
│    │    ├── snapshot progress% at swap point                  │
│    │    └── split per-tray weight across swapped spools       │
│    │                                                        │
│    └─ Watchdog                                              │
│         ├── active print + no event 2 min → poll once        │
│         ├── idle/offline → heartbeat every 5 min             │
│         └── reset on every incoming event                    │
│                                                             │
│  Next.js (existing web UI + API)                            │
│    └── shares SQLite DB with sync worker                    │
└─────────────────────────────────────────────────────────────┘
         │
         │ ws://supervisor/core/websocket
         │ http://supervisor/core/api/states/*
         ▼
┌─────────────────────┐
│ Home Assistant Core  │
│  bambu_lab (MQTT)    │
└─────────────────────┘
         │
         │ MQTT over TLS (:8883)
         ▼
┌─────────────────────┐
│ Bambu Lab Printer(s) │
└─────────────────────┘
```

## 5. Entity Resolution (Auto-Discover + User Override)

Every bambu_lab entity has an `original_name` (always English, set by the
integration, stable across HA language settings). The addon resolves entities
by querying the HA entity registry for a given `device_id` and matching on
`original_name`.

### Default lookup table (built-in, serves as initial mapping)

```typescript
const DEFAULT_ENTITY_MAP: Record<string, string> = {
  // Print status
  "Print Status":       "gcode_state",
  "Current Stage":      "print_state",
  "Task Name":          "print_name",
  "Print Error":        "print_error",
  "Print Progress":     "print_progress",
  "Print Weight":       "print_weight",
  "Total Layer Count":  "print_layers_total",
  "Current Layer":      "print_layers_current",
  "Remaining Time":     "print_remaining_time",
  // Active tray
  "Active Tray":        "active_slot",
  // AMS trays (per-device: AMS has Tray 1-4, AMS HT has Tray 1)
  "Tray 1":             "slot_N",   // N derived from parent device
  "Tray 2":             "slot_N",
  "Tray 3":             "slot_N",
  "Tray 4":             "slot_N",
  // External spool
  "External Spool":     "slot_ext",
  // Online status
  "Online":             "online",
};
```

**Tray numbering:** The AMS and AMS HT both have entities named "Tray 1".
Disambiguation uses the parent device: AMS trays → slot_1..4, AMS HT tray →
slot_ht. The entity registry contains the `device_id` for each entity, and
devices have a `model` or `name` field that identifies AMS vs AMS HT.

### Persisted mapping (DB, user-editable)

The resolved mapping is stored in `printer_entity_mappings` table:

```sql
printer_entity_mappings (
  printer_id  TEXT REFERENCES printers(id),
  field       TEXT NOT NULL,          -- e.g. "gcode_state"
  entity_id   TEXT NOT NULL,          -- e.g. "sensor.h2s_druckstatus"
  original_name TEXT,                 -- e.g. "Print Status"
  source      TEXT DEFAULT 'auto',    -- 'auto' | 'manual'
  status      TEXT DEFAULT 'ok',      -- 'ok' | 'missing' | 'unknown'
  UNIQUE(printer_id, field)
)
```

- **`source: auto`** — resolved from default lookup table during discovery
- **`source: manual`** — overridden by user in Admin UI (survives re-discovery)
- **`status: ok`** — entity exists and is mapped
- **`status: missing`** — expected entity not found (e.g., bambu_lab renamed it)
- **`status: unknown`** — bambu_lab entity exists but no default mapping for it

### Admin UI: Printer Entity Mappings

```
Admin → Printers → "H2S"

  Entity Mappings
  ┌────────────────────┬──────────────────────────────────┬──────────┬────────┐
  │ Field              │ Entity                           │ Source   │ Status │
  ├────────────────────┼──────────────────────────────────┼──────────┼────────┤
  │ Print Status       │ sensor.h2s_druckstatus           │ auto     │   ✓    │
  │ Print Weight       │ sensor.h2s_gewicht_des_drucks    │ auto     │   ✓    │
  │ Tray 1 (AMS)       │ sensor.h2s_ams_1_slot_1          │ auto     │   ✓    │
  │ Tray 1 (AMS HT)    │ sensor.h2s_ams_ht_1_slot_1       │ auto     │   ✓    │
  │ Active Tray        │ sensor.h2s_some_renamed_entity    │ manual   │   ✓    │
  │ ???                │ sensor.h2s_new_bambu_entity       │ —        │   ⚠    │
  │ Remaining Time     │ (not found)                      │ auto     │   ✗    │
  └────────────────────┴──────────────────────────────────┴──────────┴────────┘
                                       [ Override ▾ ]  [ Re-Discover ]

  ⚠ 1 unknown entity — may need mapping after bambu_lab integration update
  ✗ 1 missing entity — check if bambu_lab integration is up to date
```

**User can:**
- See all auto-discovered mappings transparently
- Override any mapping via dropdown (lists all entities for this device)
- Re-discover: re-runs auto-discovery, but preserves `source: manual` overrides
- See warnings for unknown/missing entities immediately

**Resilience to bambu_lab changes:**
- If bambu_lab renames `original_name`: auto-mapped entity shows `status: missing`,
  the new entity shows `status: unknown` — user sees both and can fix with one click
- Manual overrides survive re-discovery
- Sync continues working for all `status: ok` fields; missing fields are logged
  but don't break the sync

## 6. Auto-Discovery Flow

```
bambu_lab_event arrives: {device_id: "abc123", type: "event_print_started"}
  │
  ├─ device_id known? (cached from previous discovery)
  │   │
  │   ├─ YES → read all cached entity states → build sync payload → sync
  │   │
  │   └─ NO → Auto-discover:
  │        1. GET /api/config/entity_registry/list
  │           → filter by platform "bambu_lab"
  │           → filter by device_id "abc123" and related AMS device_ids
  │        2. Map each entity by original_name → field name
  │        3. GET /api/config/device_registry/list
  │           → find device name, model, serial for the printer
  │        4. Create printer record in DB (name, model, serial, ams_count)
  │        5. Cache entity_id → field mapping
  │        6. Subscribe to state_changed for tray entities (swap detection)
  │        7. Proceed with sync
  │
  └─ Read all entity states → build sync payload → call sync engine
```

**Multi-printer:** Each `device_id` gets its own printer record and entity cache.
Discovery happens independently per device on first event.

## 7. Event Strategy

### Primary: bambu_lab_event (print lifecycle)

Subscribe once: `{"type": "subscribe_events", "event_type": "bambu_lab_event"}`

| Event | Action |
|-------|--------|
| `event_print_started` | Full sync (creates print record) |
| `event_print_finished` | Full sync (finalizes print, deducts weight) |
| `event_print_canceled` | Full sync (marks failed, deducts partial weight) |
| `event_print_failed` | Full sync (marks failed, deducts partial weight) |
| `event_print_error` | Check if filament runout (0xNN_8011) → start swap tracking |
| `event_print_error_cleared` | End swap tracking if active |

### Secondary: state_changed (progress + swap detection)

Subscribe once: `{"type": "subscribe_events", "event_type": "state_changed"}`
Filter client-side by cached entity_ids.

| Entity change | Action |
|---------------|--------|
| print_status changes | Update running print state |
| active_tray changes | Update active spool tracking |
| tray sensor: empty→filled during print pause | Detect spool swap (with runout context) |
| online → offline | Log, stop watchdog |

### Tertiary: Watchdog fallback

| Condition | Action |
|-----------|--------|
| Active print + no event for 2 min | Poll all states once via REST |
| Idle / offline | Heartbeat poll every 5 min |
| Websocket disconnect | Reconnect with backoff, immediate poll on reconnect |

## 8. Mid-Print Spool Swap Detection

### Scenario: Filament runs out, user replaces spool in same tray

**Detection (works with AND without RFID):**

The `print_error` code identifies the exact slot: `0x07XX8011` where `XX` is
the tray index (00-03 for AMS, 00 for AMS HT via `0x18XX8011`).

```
State sequence (all observable via websocket):
1. event_print_error → print_error matches 0xNN_8011 pattern
   → Extract slot index from error code
   → Snapshot current print_progress
   → Record: {tray_index, old_spool_id, progress_at_runout}

2. state_changed: tray sensor → empty=true
   → Confirms spool removed from expected slot

3. state_changed: tray sensor → empty=false, new filament data
   → For RFID: tag_uid changed → identify new spool
   → For non-RFID: tag_uid still 0000... → identify by matching
     (material + color + AMS slot → fuzzy match)
   → Record: {new_spool_id, progress_at_insert}

4. event_print_error_cleared → print_error back to 0
5. print_status: PAUSE → RUNNING → print resumes

6. On print finish: split per-tray 3MF weight:
   → Spool A: tray_weight × (progress_at_runout / final_progress)
   → Spool B: tray_weight × ((final_progress - progress_at_runout) / final_progress)
```

**Multiple swaps:** Each swap adds an entry to the swap log. Weight is split
proportionally across all segments.

### Non-RFID spool identification after swap

When a non-RFID spool is inserted during a swap, we can't identify it by
tag_uid. Options in order of preference:

1. **filament_id changed** → different Bambu filament, identifiable
2. **Material/color changed** → fuzzy match against inventory
3. **Same material/color** → prompt user in UI: "Which spool did you load in Tray 4?"
   (notification on the print detail page, resolvable any time)

## 9. Implementation Plan

### Phase 1: Addon HA API access
- [ ] Add `homeassistant_api: true` to addon `config.yaml`
- [ ] Verify `SUPERVISOR_TOKEN` available in container
- [ ] Build `lib/ha-api.ts` — REST client for supervisor API
  - Read entity state + attributes
  - List entity registry (filter by platform + device_id)
  - List device registry

### Phase 2: Sync worker + websocket client
- [ ] `scripts/sync-worker.ts` — standalone Node.js background process
- [ ] `run.sh` starts both Next.js AND sync worker
- [ ] HA websocket client with auto-reconnect (exponential backoff)
- [ ] Subscribe to `bambu_lab_event` + `state_changed`
- [ ] Sequential event processing queue

### Phase 3: Auto-discovery + entity mapping persistence
- [ ] On unknown device_id → query entity + device registry
- [ ] Map entities by `original_name` using default lookup table
- [ ] Resolve AMS vs AMS HT tray numbering via parent device
- [ ] Create printer record in DB with device_id, name, model, serial
- [ ] Persist mapping to `printer_entity_mappings` table (source='auto', status='ok')
- [ ] Flag unmapped bambu_lab entities as status='unknown'
- [ ] Flag expected but missing entities as status='missing'
- [ ] Cache resolved mapping in memory for fast event handling

### Phase 3b: Admin UI — entity mapping editor
- [ ] Admin page: "Printers" section shows discovered printers
- [ ] Per printer: table of field → entity_id → source → status
- [ ] Color-coded status: ✓ ok (green), ⚠ unknown (amber), ✗ missing (red)
- [ ] Override: dropdown to reassign any field to a different entity (sets source='manual')
- [ ] Re-Discover button: re-runs auto-discovery, preserves manual overrides
- [ ] Warnings banner: count of unknown + missing mappings

### Phase 4: Event-driven sync
- [ ] On bambu_lab_event → read all entity states → build sync payload
- [ ] Call existing `printer-sync` logic internally (no HTTP, direct function call)
- [ ] On state_changed for tracked entities → update running print / AMS slots

### Phase 5: Watchdog + heartbeat
- [ ] Watchdog: active print + no event 2 min → poll once
- [ ] Heartbeat: idle/offline → poll every 5 min
- [ ] Reset on every event
- [ ] Log watchdog triggers in sync_log

### Phase 6: Mid-print spool swap tracking
- [ ] Parse print_error code for runout slot identification
- [ ] Track swap sequence: runout → tray empty → tray filled → resume
- [ ] Snapshot progress at each swap point
- [ ] Store swap log on print record (new `spool_swaps` JSON column)
- [ ] On print finish: split per-tray 3MF weight across swapped spools
- [ ] For RFID swaps: use remain% deltas (more accurate)
- [ ] For non-RFID same-type swaps: prompt user in UI

### Phase 7: Per-tray weight from 3MF
- [ ] Read `print_weight` sensor attributes for per-tray breakdown
- [ ] Use per-tray weights for multi-material prints
- [ ] Combined with swap tracking for accurate per-spool deduction
- [ ] Fallback to single weight + proportional remain% if per-tray unavailable

### Phase 8: Migration + cleanup
- [ ] Keep REST API endpoint working (backward compatibility)
- [ ] Document migration: delete rest_command + automations from HA config
- [ ] Remove template sensors from HA:
  - `sensor.h2s_filament_key_aktiv`
  - `sensor.h2s_filament_name_aktiv`
- [ ] Update docs (DOCS.md, configuration.md, printer-sync.md)
- [ ] Update CLAUDE.md with new architecture

## 10. Technical Details

### Background sync worker

`run.sh` starts two processes:

```bash
# Start sync worker in background
node /app/sync-worker.js &
SYNC_PID=$!

# Start Next.js in background
cd /app && node server.js &
NEXT_PID=$!

# Forward signals to both
trap "kill $SYNC_PID $NEXT_PID 2>/dev/null; exit 0" TERM INT
```

Worker and Next.js share the SQLite database file. Worker writes sync data,
Next.js reads it for the UI. SQLite WAL mode handles concurrent access.

### Websocket reconnect strategy

```
Connect → Auth → Subscribe → Listen
   ↑                            │
   └── on disconnect:           │
       attempt 1-3: wait 5s ────┘
       attempt 4-6: wait 30s
       attempt 7+:  wait 5 min
       on reconnect: immediate full poll to catch up
```

### Event processing queue

Events processed sequentially to avoid race conditions:

```
Event arrives → Queue (FIFO) → Process one at a time → Update DB
```

Critical for rapid state transitions (e.g., PREPARE → RUNNING fires two
events in quick succession).

### Runout error code parsing

```typescript
function parseRunoutError(errorCode: number): { amsUnit: number; trayIndex: number } | null {
  const hex = errorCode.toString(16).padStart(8, '0');
  // AMS: 07XX8011, AMS HT: 18XX8011, External: 07FF8011
  if (!hex.endsWith('8011')) return null;
  const module = parseInt(hex.slice(0, 2), 16);
  const slot = parseInt(hex.slice(2, 4), 16);
  if (module === 0x07) return { amsUnit: 0, trayIndex: slot };  // AMS
  if (module === 0x18) return { amsUnit: 1, trayIndex: slot };  // AMS HT
  return null;
}
```

## 11. What Gets Deleted After Migration

| Item | Location | Action |
|------|----------|--------|
| `rest_command.haspoolmanager_sync` | `/Volumes/config/configuration.yaml` | Delete (requires HA restart) |
| Automation: "HASpoolManager: Sync Printer State" | `/Volumes/config/automations.yaml` | Delete |
| Automation: "HASpoolManager: Sync on State Change" | `/Volumes/config/automations.yaml` | Delete |
| `sensor.h2s_filament_key_aktiv` | `/Volumes/config/templates.yaml` or similar | Delete |
| `sensor.h2s_filament_name_aktiv` | `/Volumes/config/templates.yaml` or similar | Delete |

## 12. Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Websocket instability in Docker | Exponential backoff + watchdog poll catches gaps |
| HA supervisor restarts addon | Worker auto-starts, reconnects, polls to catch up |
| Event ordering (rapid transitions) | Sequential queue, not parallel processing |
| bambu_lab renames `original_name` | Auto-mapped field shows `status: missing`, new entity shows `status: unknown` — user sees both in Admin UI and reassigns with one click. Manual overrides persist across re-discovery. Sync continues for all ok-mapped fields. |
| bambu_lab adds new entities | Show as `status: unknown` in Admin UI with amber warning — user can assign to a field or ignore |
| Non-RFID spool swap identification | Fallback chain: filament_id → fuzzy match → user prompt |
| Multiple printers racing | Per-printer event queue, independent discovery |
| Backward compatibility | REST API endpoint stays available for existing automations |
