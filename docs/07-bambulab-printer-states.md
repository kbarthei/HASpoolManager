# Bambu Lab Printer States — Complete Reference

> Deep research on the Bambu Lab MQTT protocol states, HA integration mapping, and
> recommended print-tracking logic for HASpoolManager.

---

## 1. MQTT Protocol: `gcode_state` Field

The Bambu Lab printer publishes status via MQTT on topic `device/{DEVICE_ID}/report`.
The `print` object contains a `gcode_state` string field with **exactly 10 possible values**
(per the ha-bambulab integration's `GCODE_STATE_OPTIONS`):

| `gcode_state` | Meaning |
|---|---|
| `IDLE` | Printer is idle, no job active |
| `PREPARE` | Job accepted, printer preparing (downloading file, parsing, pre-checks) |
| `SLICING` | Cloud slicing in progress (cloud print only) |
| `INIT` | Initializing print sequence (rare, brief transitional state) |
| `RUNNING` | Actively printing (includes all sub-stages like homing, leveling, heating) |
| `PAUSE` | Print paused (user pause, M400 pause, filament runout, error pause) |
| `FINISH` | Print completed successfully (note: "FINISH" not "FINISHED") |
| `FAILED` | Print failed due to error |
| `OFFLINE` | Printer is offline / not reachable |
| `unknown` | State could not be determined |

**Key insight:** The `gcode_state` is coarse-grained. While printing, it stays `RUNNING`
regardless of whether the printer is homing, heating, calibrating, or actually extruding.
The detailed sub-stage is in the `stg_cur` field.

### Other MQTT Status Fields

| Field | Type | Description |
|---|---|---|
| `mc_percent` | int | Print progress 0-100% |
| `mc_remaining_time` | int | Estimated seconds remaining |
| `mc_print_stage` | string | Numeric stage ID (same as `stg_cur`) |
| `mc_print_sub_stage` | int | Sub-stage within current stage |
| `stg_cur` | int | Current detailed stage (see section 2) |
| `print_error` | int | Error code (0 = no error, 50348044 = user cancelled) |
| `print_type` | string | `"idle"`, `"local"`, `"cloud"`, `"system"`, `"unknown"` |
| `gcode_file` | string | Current gcode filename |
| `subtask_name` | string | Print job name |
| `gcode_start_time` | string | Timestamp when gcode execution began |
| `gcode_file_prepare_percent` | string | File download/preparation progress |

---

## 2. MQTT Protocol: `stg_cur` Field (Detailed Stage)

The `stg_cur` integer field provides fine-grained status of what the printer is
currently doing. The ha-bambulab integration maps these to human-readable strings
via the `CURRENT_STAGE_IDS` dictionary (68 entries as of v2.2.x):

### Idle States

| `stg_cur` | HA Sensor Value | Description |
|---|---|---|
| -1 | `idle` | No activity |
| 255 | `idle` | No activity (alternate encoding) |

### Active Printing

| `stg_cur` | HA Sensor Value | Description |
|---|---|---|
| 0 | `printing` | Actively extruding / printing |

### Pre-Print Preparation (part of a print job)

| `stg_cur` | HA Sensor Value | Description |
|---|---|---|
| 1 | `auto_bed_leveling` | Automatic bed mesh leveling |
| 2 | `heatbed_preheating` | Heating bed to target temperature |
| 3 | `sweeping_xy_mech_mode` | XY mechanism sweep / vibration compensation |
| 7 | `heating_hotend` | Heating nozzle to target temperature |
| 9 | `scanning_bed_surface` | Lidar bed surface scan |
| 11 | `identifying_build_plate_type` | Detecting plate type (textured/smooth/etc.) |
| 13 | `homing_toolhead` | Homing X/Y/Z axes |
| 15 | `checking_extruder_temperature` | Verifying extruder temp is in range |
| 40 | `bed_level_high_temperature` | High-temp bed leveling (ABS/ASA) |
| 47 | `bed_level_phase_1` | Bed leveling phase 1 |
| 48 | `bed_level_phase_2` | Bed leveling phase 2 |
| 49 | `heating_chamber` | Heating enclosed chamber (X1C/P1S) |
| 50 | `heated_bedcooling` | Cooling heated bed between operations |
| 51 | `print_calibration_lines` | Printing purge/calibration lines |
| 52 | `check_material` | Verifying filament is loaded and correct |
| 54 | `waiting_for_heatbed_temperature` | Waiting for bed temp to stabilize |
| 55 | `check_material_position` | Checking filament position in extruder |
| 57 | `measuring_surface` | Measuring print surface |
| 58 | `thermal_preconditioning` | Thermal soak / chamber stabilization |
| 63 | `waiting_chamber_temperature_equalize` | Waiting for chamber temp to equalize |
| 64 | `preparing_hotend` | Preparing hotend for print |
| 66 | `purifying_chamber_air` | Running air purifier before print |
| 77 | `preparing_ams` | AMS preparation (filament routing) |

### Calibration (part of a print job)

| `stg_cur` | HA Sensor Value | Description |
|---|---|---|
| 8 | `calibrating_extrusion` | Flow rate / pressure advance calibration |
| 12 | `calibrating_micro_lidar` | Lidar calibration |
| 18 | `calibrating_micro_lidar` | Lidar calibration (alternate) |
| 19 | `calibrating_extrusion_flow` | Extrusion flow calibration |
| 25 | `calibrating_motor_noise` | Motor noise cancellation calibration |
| 36 | `check_absolute_accuracy_before_calibration` | Pre-calibration accuracy check |
| 37 | `absolute_accuracy_calibration` | Absolute accuracy calibration |
| 38 | `check_absolute_accuracy_after_calibration` | Post-calibration accuracy check |
| 39 | `calibrate_nozzle_offset` | Nozzle offset calibration (dual nozzle) |
| 43 | `laser_calibration` | Laser sensor calibration |
| 53 | `calibrating_live_view_camera` | Camera calibration |
| 56 | `calibrating_cutter_model_offset` | AMS cutter offset calibration |
| 60 | `calibrating_camera_offset` | Camera offset calibration |
| 65 | `calibrating_detection_nozzle_clumping` | Nozzle clumping detection calibration |

### Filament Handling (during print)

| `stg_cur` | HA Sensor Value | Description |
|---|---|---|
| 4 | `changing_filament` | AMS filament change (multi-color print) |
| 22 | `filament_unloading` | Filament retraction from extruder |
| 24 | `filament_loading` | Filament loading into extruder |

### Maintenance / Cleaning

| `stg_cur` | HA Sensor Value | Description |
|---|---|---|
| 14 | `cleaning_nozzle_tip` | Wiping nozzle on brush/wiper |
| 10 | `inspecting_first_layer` | Lidar first layer inspection |
| 29 | `cooling_chamber` | Active chamber cooling |
| 31 | `motor_noise_showoff` | Motor noise test (standalone calibration) |
| 41 | `check_quick_release` | Quick-release mechanism check |
| 42 | `check_door_and_cover` | Door/cover sensor verification |
| 44 | `check_plaform` | Build platform check |
| 45 | `check_birdeye_camera_position` | Camera position check |
| 46 | `calibrate_birdeye_camera` | Bird's-eye camera calibration |
| 59 | `homing_blade_holder` | AMS blade holder homing |
| 61 | `calibrating_blade_holder_position` | AMS blade position calibration |
| 62 | `hotend_pick_place_test` | Hotend pick/place test (dual nozzle) |

### Pause States (print interrupted but recoverable)

| `stg_cur` | HA Sensor Value | Description |
|---|---|---|
| 5 | `m400_pause` | Programmatic pause (M400 gcode) |
| 6 | `paused_filament_runout` | Filament ran out / AMS can't feed |
| 16 | `paused_user` | User pressed pause button |
| 17 | `paused_front_cover_falling` | Front cover opened during print |
| 20 | `paused_nozzle_temperature_malfunction` | Nozzle temp out of range |
| 21 | `paused_heat_bed_temperature_malfunction` | Bed temp out of range |
| 23 | `paused_skipped_step` | Stepper motor skipped steps |
| 26 | `paused_ams_lost` | AMS communication lost |
| 27 | `paused_low_fan_speed_heat_break` | Heat break fan speed too low |
| 28 | `paused_chamber_temperature_control_error` | Chamber temp control failure |
| 30 | `paused_user_gcode` | Paused by gcode command |
| 32 | `paused_nozzle_filament_covered_detected` | Filament blob on nozzle |
| 33 | `paused_cutter_error` | AMS cutter malfunction |
| 34 | `paused_first_layer_error` | First layer adhesion failure |
| 35 | `paused_nozzle_clog` | Nozzle clog detected |

### Unknown / Default

| `stg_cur` | HA Sensor Value | Description |
|---|---|---|
| (any unrecognized) | `unknown` | Firmware added a new stage not yet mapped |

---

## 3. HA Bambu Lab Integration Mapping

The ha-bambulab integration (`greghesp/ha-bambulab`) creates two relevant sensors:

### `sensor.<printer>_print_status` (derived from `gcode_state`)

Maps the raw MQTT `gcode_state` to a lowercase HA sensor value. The integration
validates against `GCODE_STATE_OPTIONS` and falls back to `"unknown"`.

| MQTT `gcode_state` | HA Sensor Value |
|---|---|
| `IDLE` | `idle` |
| `PREPARE` | `prepare` |
| `SLICING` | `slicing` |
| `INIT` | `init` |
| `RUNNING` | `running` |
| `PAUSE` | `pause` |
| `FINISH` | `finish` |
| `FAILED` | `failed` |
| `OFFLINE` | `offline` |
| (anything else) | `unknown` |

### `sensor.<printer>_current_stage` (derived from `stg_cur`)

Maps the numeric `stg_cur` MQTT field to a human-readable snake_case string via the
`CURRENT_STAGE_IDS` lookup table (see section 2 above). This is the sensor that
appears in HA as `sensor.h2s_aktueller_arbeitsschritt`.

**Important:** The HA integration does NOT translate or rename the values. It uses the
exact strings from `CURRENT_STAGE_IDS`. The German sensor name is just the HA entity
name (localized), but the sensor VALUES are always English snake_case.

### Device Triggers (Events)

The integration fires these HA events based on `gcode_state` transitions:

| Event | Trigger Condition |
|---|---|
| `event_print_started` | `gcode_state` transitions FROM `{IDLE, FAILED, FINISH}` TO any other state |
| `event_print_finished` | `gcode_state` transitions TO `FINISH` (from non-FINISH, non-unknown) |
| `event_print_failed` | `gcode_state` transitions TO `FAILED` (and `print_error != 50348044`) |
| `event_print_canceled` | `print_error` changes to `50348044` (user cancellation error code) |

---

## 4. Print Job Lifecycle — State Machine

### Normal Print (single filament)

```
                    ┌─────────────────────────────────────────────────┐
                    │                                                 │
  IDLE ──► PREPARE ──► RUNNING ──────────────────────────────► FINISH ──► IDLE
                        │                                        │
                        │  stg_cur sub-stages while RUNNING:     │
                        │                                        │
                        │  13 homing_toolhead                    │
                        │  2  heatbed_preheating                 │
                        │  7  heating_hotend                     │
                        │  1  auto_bed_leveling                  │
                        │  3  sweeping_xy_mech_mode              │
                        │  8  calibrating_extrusion              │
                        │  14 cleaning_nozzle_tip                │
                        │  51 print_calibration_lines            │
                        │  0  printing (actual extrusion)        │
                        │  10 inspecting_first_layer             │
                        │  0  printing ... (bulk of the job)     │
                        │                                        │
                        └────────────────────────────────────────┘
```

### Normal Print (multi-filament / AMS color change)

```
  ... same as above, but during RUNNING:

  0  printing
  4  changing_filament    ◄── AMS unloads old, loads new filament
  22 filament_unloading
  24 filament_loading
  14 cleaning_nozzle_tip  ◄── wipe nozzle after filament change
  0  printing             ◄── resume with new filament
  4  changing_filament    ◄── repeat for each color change
  ...
  0  printing
```

### Paused Print (user or error)

```
  RUNNING ──► PAUSE ──► RUNNING ──► FINISH
                │                      │
                │  stg_cur values:     │
                │  16 paused_user      │
                │  5  m400_pause       │
                │  6  paused_filament  │
                │     _runout          │
                │  17 paused_front     │
                │     _cover_falling   │
                │  35 paused_nozzle    │
                │     _clog            │
                │  etc.                │
                │                      │
                └──────────────────────┘
```

### Failed / Cancelled Print

```
  RUNNING ──► FAILED ──► IDLE     (error or user cancel)
               │
               │  print_error field:
               │  0         = actual failure
               │  50348044  = user cancelled
```

### Cloud Print with Slicing

```
  IDLE ──► PREPARE ──► SLICING ──► RUNNING ──► FINISH ──► IDLE
```

### Standalone Calibration (NOT a print job)

```
  IDLE ──► RUNNING ──► FINISH ──► IDLE
              │
              │  stg_cur: 25 calibrating_motor_noise
              │  stg_cur: 31 motor_noise_showoff
              │  stg_cur: 37 absolute_accuracy_calibration
              │
              │  subtask_name: "auto_cali" or similar
              │
              └── Should NOT create a print record
```

### Complete State Transition Diagram

```
                 ┌──────────┐
                 │   IDLE   │◄──────────────────────────────┐
                 └────┬─────┘                               │
                      │ print job sent                      │
                      ▼                                     │
                 ┌──────────┐                               │
                 │ PREPARE  │                               │
                 └────┬─────┘                               │
                      │ file ready                          │
                      ▼                                     │
                 ┌──────────┐   (cloud only)                │
                 │ SLICING  │──────────┐                    │
                 └────┬─────┘          │                    │
                      │                │                    │
                      ▼                ▼                    │
                 ┌──────────┐                               │
            ┌───►│ RUNNING  │◄──────────┐                   │
            │    └──┬───┬───┘           │                   │
            │       │   │               │                   │
            │       │   │  user/error   │  resume           │
            │       │   └──────►┌───────┴──┐                │
            │       │           │  PAUSE   │                │
            │       │           └──────────┘                │
            │       │                                       │
            │       ├── success ──► ┌──────────┐            │
            │       │               │  FINISH  │────────────┘
            │       │               └──────────┘
            │       │
            │       └── error ────► ┌──────────┐
            │                       │  FAILED  │────────────┐
            │                       └──────────┘            │
            │                                               │
            └───────────────────────────────────────────────┘
                         (restart after failure)

  Disconnected states (not part of print lifecycle):
  ┌──────────┐
  │ OFFLINE  │  Printer unreachable (HA integration reports this)
  └──────────┘
  ┌──────────┐
  │  INIT    │  Brief transitional state during printer boot
  └──────────┘
```

---

## 5. Classification for HASpoolManager Print Tracking

### States That Should START a New Print Record

| `gcode_state` | Condition | Action |
|---|---|---|
| `PREPARE` | No running print exists | Create print record with `status: "running"` |
| `RUNNING` | No running print exists AND `subtask_name` is not a calibration | Create print record |
| `SLICING` | No running print exists | Create print record |
| `INIT` | No running print exists | Create print record |

**Calibration filter:** Do NOT create a print record if `subtask_name` contains
`auto_cali`, `auto_calibration`, `user_param`, or `default_param`.

### States That Should CONTINUE a Running Print

| `gcode_state` | `stg_cur` | Action |
|---|---|---|
| `RUNNING` | 0 (printing) | Update weight, track active spool |
| `RUNNING` | 1-58 (any prep/cal stage) | Keep running, printer is working |
| `PAUSE` | 5,6,16,17,20-35 (any pause) | Keep running, print is paused but not done |
| `PREPARE` | any | Keep running (re-preparation after resume) |

### States That Should FINISH a Print Record

| `gcode_state` | Action |
|---|---|
| `FINISH` | Set `status: "finished"`, calculate usage, deduct weight |
| `IDLE` (with running print, no error) | Set `status: "finished"` (missed the FINISH event) |

### States That Should FAIL a Print Record

| `gcode_state` | `print_error` | Action |
|---|---|---|
| `FAILED` | any | Set `status: "failed"`, record partial usage |
| `IDLE` (with running print + error) | non-zero | Set `status: "failed"` |

### States That Should Be IGNORED (no print tracking impact)

| `gcode_state` | Condition | Reason |
|---|---|---|
| `IDLE` | No running print | Normal idle state |
| `OFFLINE` | Any | Connectivity issue, not a state change |
| `unknown` | Any | Transient, wait for real state |
| `RUNNING` | `subtask_name` is calibration | Standalone calibration, not a print |

---

## 6. Edge Cases and Gotchas

### 6.1 FINISH vs FINISHED
The MQTT protocol uses `FINISH` (not `FINISHED`). The HA sensor value is `finish`.
Always check for both to be safe.

### 6.2 PAUSE Does Not Mean Stopped
`PAUSE` is recoverable. The print may resume. Do NOT close the print record on PAUSE.
Wait for `FINISH`, `FAILED`, or `IDLE`.

### 6.3 Filament Changes Are RUNNING, Not PAUSE
During multi-color AMS filament changes (`stg_cur: 4`), the `gcode_state` stays
`RUNNING`. The printer unloads the old filament, loads the new one, and continues.
The active spool changes during this process — HASpoolManager must track this to
record ALL spools used in a print.

### 6.4 Calibration Routines Look Like Print Jobs
Standalone calibrations (motor noise, flow, vibration) cycle through
`IDLE → RUNNING → FINISH → IDLE` just like a real print. Distinguish them by:
- `subtask_name` containing "auto_cali", "user_param", etc.
- `print_type: "system"` (sometimes)
- `stg_cur` being 25, 31, 37 etc. without any `stg_cur: 0` (printing)

### 6.5 OFFLINE Does Not Mean Print Stopped
If the MQTT connection drops (Wi-Fi glitch, HA restart), the printer reports
`OFFLINE`. The print is still running on the printer. Do NOT close the print
record. When connectivity returns, the state will update to `RUNNING` or `FINISH`.

### 6.6 PREPARE Can Be Long
For cloud prints, `PREPARE` can last several minutes while the file downloads.
For local prints, it is usually brief. Either way, PREPARE is the start of a
print job and should create the print record.

### 6.7 Error Code 50348044 = User Cancel
When `print_error` changes to `50348044`, the user cancelled the print. The
`gcode_state` will transition to `FAILED`. Treat this as a cancellation, not a
hardware failure. Record partial filament usage.

### 6.8 `stg_cur` Values Keep Growing
Bambu Lab adds new `stg_cur` values with firmware updates (stage 54 was added for
"waiting for heatbed temperature", stages 59-66 for H2S-specific operations).
Unknown stage IDs should default to "active" behavior — keep the print running.

### 6.9 Weight Data Timing
The `mc_percent` and filament weight data are only accurate while `gcode_state`
is `RUNNING`. When the state transitions to `FINISH`, capture the final weight
immediately — the printer clears this data when it returns to `IDLE`.

### 6.10 Rapid State Transitions
The printer can publish state changes very frequently (up to ~70/minute per
ha-bambulab issue #992). The sync endpoint must be idempotent and handle
receiving the same state multiple times without creating duplicate records.

### 6.11 Active Slot Clears on Idle
The printer's active slot sensor (`sensor.h2s_aktiver_slot`) reports which AMS
slot is currently feeding filament. This value is only valid during RUNNING.
When the printer goes IDLE, the active slot data may become empty/stale.
Capture spool identity during RUNNING, not at FINISH/IDLE.

### 6.12 AMS Remain Percentage
The `remain` percentage from AMS slots (via RFID) is approximate and should only
be used for weight sync when the printer is IDLE (post-print calibration).
During printing, use the print weight from the slicer metadata instead.

---

## 7. Recommended Logic for HASpoolManager

### Current Implementation Status

The current `printer-sync-helpers.ts` already handles most states correctly.
Comparing against this research:

**Correct in current implementation:**
- RUNNING, PRINTING, PREPARE, SLICING, PAUSE classified as active
- FINISH/FINISHED, COMPLETE/COMPLETED classified as finished
- FAILED, CANCELED/CANCELLED, ERROR classified as failed
- IDLE classified as idle
- Calibration name filtering (auto_cali, user_param, etc.)
- Multi-spool tracking via `activeSpoolIds`
- Weight sync only when idle
- OFFLINE/UNKNOWN treated as active (keeps print running)

**Improvements to consider:**

1. **Add INIT to active states** — currently missing from `ACTIVE_STATES`
2. **Remove German variants** — `DRUCKEN`, `VORBEREITEN` are not real sensor values;
   the HA integration always reports English values
3. **Distinguish PREPARE from RUNNING** — currently both are "active" which is correct,
   but PREPARE could be logged separately for better diagnostics
4. **Add SLICING awareness** — cloud prints pass through SLICING state
5. **Detect cancel vs failure** — check `print_error == 50348044` to distinguish
   user cancellation from hardware failure in the print record

### Recommended State Sets (updated)

```typescript
// MQTT gcode_state values (uppercase, from GCODE_STATE_OPTIONS)
export const ACTIVE_STATES = new Set([
  // Core MQTT protocol states
  "RUNNING", "PREPARE", "SLICING", "INIT", "PAUSE",
  // HA sensor values (lowercase variants, for safety)
  "PRINTING",
  // All stg_cur sub-stages reported by HA current_stage sensor
  "CALIBRATING_EXTRUSION", "CLEANING_NOZZLE_TIP", "SWEEPING_XY_MECH_MODE",
  "HEATBED_PREHEATING", "NOZZLE_PREHEATING", "HEATING_HOTEND",
  "CHANGE_FILAMENT", "CHANGING_FILAMENT",
  "M400_PAUSE", "FILAMENT_RUNOUT_PAUSE", "FRONT_COVER_PAUSE",
  "AUTO_BED_LEVELING", "HOMING_TOOLHEAD", "HOMING",
  "CHECKING_EXTRUDER_TEMP", "CHECKING_EXTRUDER_TEMPERATURE",
  "HEATING", "BED_LEVELING",
  "CALIBRATING_MOTOR_NOISE", "CALIBRATING_EXTRUSION_FLOW",
  "SCANNING_BED_SURFACE", "INSPECTING_FIRST_LAYER",
  "IDENTIFYING_BUILD_PLATE_TYPE", "CALIBRATING_MICRO_LIDAR",
  "FILAMENT_LOADING", "FILAMENT_UNLOADING",
  "PRINT_CALIBRATION_LINES", "CHECK_MATERIAL",
  "WAITING_FOR_HEATBED_TEMPERATURE", "PREPARING_AMS",
  "THERMAL_PRECONDITIONING", "HEATING_CHAMBER",
  "PREPARING_HOTEND", "PURIFYING_CHAMBER_AIR",
  // Connectivity loss — printer is still printing
  "OFFLINE", "UNKNOWN",
]);

export const FINISH_STATES = new Set(["FINISH", "FINISHED", "COMPLETE", "COMPLETED"]);
export const FAILED_STATES = new Set(["FAILED", "CANCELED", "CANCELLED", "ERROR"]);
export const IDLE_STATES = new Set(["IDLE", ""]);
```

---

## 8. Sources

- [OpenBambuAPI MQTT Documentation](https://github.com/Doridian/OpenBambuAPI/blob/main/mqtt.md)
- [Bambu Lab Cloud API MQTT](https://github.com/coelacant1/Bambu-Lab-Cloud-API/blob/main/API_MQTT.md)
- [ha-bambulab Integration](https://github.com/greghesp/ha-bambulab) — `pybambu/const.py` (CURRENT_STAGE_IDS, GCODE_STATE_OPTIONS)
- [ha-bambulab Device Triggers](https://github.com/greghesp/ha-bambulab/blob/main/docs/DeviceTrigger.md)
- [ha-bambulab Issue #992](https://github.com/greghesp/ha-bambulab/issues/992) — State change frequency
- [ha-bambulab Issue #1833](https://github.com/greghesp/ha-bambulab/issues/1833) — Missing stg_cur values
- [Bambu Lab Forum: MQTT Report Specification](https://forum.bambulab.com/t/x1c-mqtt-report-specification-eg-list-of-gcode-state-values/169693)
