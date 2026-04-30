# HA Entity Mapping

The sync worker auto-discovers Bambu Lab entities from HA and maps
them to internal field names. HA localizes `original_name` to the
installed UI language, so the map supports **English** and **German**
variants side-by-side. Additional languages can be added by extending
the table in `lib/ha-discovery.ts`.

---

## 1. Regular-sensor mapping (`ENTITY_NAME_MAP`)

Mapped by exact `original_name` match.

| English `original_name` | German `original_name` | Internal field | Notes |
|---|---|---|---|
| `Print Status` | `Druckstatus` | `gcode_state` | Coarse lifecycle: `IDLE`, `RUNNING`, `FINISH`, `FAILED`, `PAUSE`, etc. |
| `Current Stage` | `Aktueller Arbeitsschritt` | `print_state` | Fine-grained: 68+ values; used for display, not lifecycle decisions |
| `Task Name` | `Name der Aufgabe` | `print_name` | e.g. the 3MF filename |
| `Print Error` | `Druckfehler` | `print_error` | Integer error code (see `error-codes.md`) |
| `Print Progress` | `Druckfortschritt` | `print_progress` | 0–100 |
| `Print Weight` | `Gewicht des Drucks` | `print_weight` | Grams; state value is total, attributes carry per-tray breakdown |
| `Total Layer Count` | `Gesamtzahl der Schichten` | `print_layers_total` | |
| `Current Layer` | `Aktuelle Schicht` | `print_layers_current` | |
| `Remaining Time` | `Verbleibende Zeit` | `print_remaining_time` | **Hours** with minute-precision (e.g. `21.1333` = 21h 08min). Convert to minutes at the UI boundary in `lib/queries.ts`. |
| `Active Tray` | `Aktiver Slot` | `active_slot` | State = slot name; attributes carry type/color/tag_uid/filament_id |
| `Online` | *(no DE variant)* | `online` | Printer reachability |
| `External Spool` | `Externe Spule` | `slot_ext` | External spool holder (non-AMS) |
| `Drying` | `Trocknen` | `ams_drying` | Per AMS unit |
| `Remaining Drying Time` | `Verbleibende Trocknungszeit` | `ams_drying_remaining` | Minutes |
| `Cover Image` | `Titelbild` | `cover_image` | 3D-model preview from slicer (URL) |
| `Camera` | `Kamera` | `camera` | Camera stream URL |
| `HMS Errors` | `HMS-Fehler` | `hms_errors` | Boolean binary_sensor — "any HMS event active" |

---

## 2. AMS tray mapping (special-cased)

AMS tray entities are named `Tray 1`..`Tray 4` (EN) or `Slot 1`..`Slot 4`
(DE). The sync worker needs to disambiguate which AMS unit the tray
belongs to — inspected via the parent device's `model` field.

Tray disambiguation logic (`lib/ha-discovery.ts`):

| parent `device.model` contains | Internal field |
|---|---|
| `"ams ht"` or `"ams-ht"` | `slot_ht_<amsIndex>` (amsIndex=1 by convention) |
| `"ams"` (but not HT) | `slot_ams_<amsIndex>_<trayIndex>` (amsIndex=0 for 1-AMS setup) |
| anything else | `slot_ams_0_<trayIndex>` (conservative fallback) |

So in a 1-AMS H2S setup, entity mapping becomes:

| Entity `original_name` | Parent `device.model` | Internal field |
|---|---|---|
| `Tray 1` / `Slot 1` | `AMS 1` | `slot_ams_0_0` |
| `Tray 2` / `Slot 2` | `AMS 1` | `slot_ams_0_1` |
| `Tray 3` / `Slot 3` | `AMS 1` | `slot_ams_0_2` |
| `Tray 4` / `Slot 4` | `AMS 1` | `slot_ams_0_3` |
| `Tray 1` / `Slot 1` | `AMS HT` | `slot_ht_1` |
| `External Spool` / `Externe Spule` | (printer device) | `slot_ext` |

Each tray entity has these attributes in its state:

| Attribute | Internal suffix | Meaning |
|---|---|---|
| `type` | `_type` | Material string: `PLA`, `PETG`, `ABS-GF`, etc. |
| `color` | `_color` | `RRGGBBAA` hex (alpha always `FF`) |
| `tag_uid` | `_tag` | RFID tag ID (16 hex chars); `0000000000000000` if no RFID |
| `filament_id` | `_filament_id` | Bambu filament code, e.g. `GFA00` |
| `remain` | `_remain` | Remaining percent, 0–100; `-1` if unknown |
| `empty` | `_empty` | Boolean |

Resulting sync payload keys (for one AMS unit + HT + external):

```
slot_ams_0_0_type, _color, _tag, _filament_id, _remain, _empty
slot_ams_0_1_…
slot_ams_0_2_…
slot_ams_0_3_…
slot_ht_1_…
slot_ext_…
```

---

## 3. Multi-AMS topology

When more than one AMS unit is installed, discovery generates
additional `slot_ams_<amsIndex>_*` keys. The `amsIndex` assignment is
done by `lib/ha-discovery.ts` based on the order of related devices:

- Regular AMS units → `amsIndex` 0, 2, 3, … (1 reserved for HT by legacy convention)
- AMS HT → `amsIndex` 1

So an H2S with two AMS + one HT produces:

```
slot_ams_0_0..3   (AMS 1)
slot_ams_2_0..3   (AMS 2)
slot_ht_1         (AMS HT)
slot_ext          (External)
```

The `printer_ams_units` table stores the enabled set and user-facing
display names (see
[`../architecture/sync-worker.md`](../architecture/sync-worker.md) §4).

---

## 4. `bambu_lab_event` payloads

Not entity-based — these are structured events from the `ha-bambulab`
integration. Subscribed via `ws.subscribe_events("bambu_lab_event", …)`:

| `event.data.type` | When it fires | Our handler |
|---|---|---|
| `event_print_error` | HMS error condition | `parseRunoutError()` → queue `pendingSwap` |
| `event_print_error_cleared` | Error cleared (e.g. filament replaced) | Reset runout flag |
| `event_printer_data_update` | Generic state-update notification | Ignored (state_changed carries the data) |

---

## 5. Where to find the code

- **Map definition:** `lib/ha-discovery.ts` → `ENTITY_NAME_MAP`,
  `TRAY_NAMES_EN`, `TRAY_NAMES_DE`
- **Discovery entry point:** `lib/ha-discovery.ts` →
  `discoverPrinters(entities, devices)`
- **Event subscription:** `lib/sync-worker.ts` →
  `startSyncWorker()` → `subscribeEvents("state_changed" | "bambu_lab_event")`
- **Payload construction:** `lib/sync-worker.ts` → `buildSyncPayload(printer)`

---

## 6. Adding a new language

1. Grab the localized `original_name` strings from an HA install in
   that language (Developer Tools → States → filter by
   `bambu_lab.*`).
2. Add entries to `ENTITY_NAME_MAP` in `lib/ha-discovery.ts` (matching
   the existing per-language block structure).
3. Extend `TRAY_NAMES_XX` if the tray naming differs (e.g. FR might
   use `Plateau 1..4`).
4. Add a unit test in `tests/unit/ha-discovery.test.ts` asserting the
   new locale resolves to the correct field names.

---

## 7. Testing

- Unit: no dedicated `ha-discovery.test.ts` today (see audit
  follow-ups in [`../development/testing.md`](../development/testing.md))
- Integration: `tests/integration/ams-units-api.test.ts` exercises the
  discovery-upsert flow; `tests/integration/printer-sync.test.ts`
  covers the full EN-named tray → sync-payload → DB write path
