# Sync Worker

The addon's second Node.js process. Owns everything between Home Assistant
and the addon's own `/api/v1/events/printer-sync` endpoint: websocket
connection, entity discovery, event filtering, watchdog fallback, HMS
error forwarding.

Source files: `lib/sync-worker.ts`, `lib/ha-websocket.ts`, `lib/ha-discovery.ts`, `lib/ha-api.ts`.

---

## 1. Why a separate process

The Next.js server is request-driven: each `/api/v1/*` request is a short-lived
handler. The sync worker needs a **long-lived websocket** to HA, a **timer** for
watchdog polls, and **in-memory per-printer state** (isActive, lastEventAt,
pendingSwaps, runoutSlot). Putting that inside Next.js would fight the
request model; putting it in a separate process keeps both clean.

They share the same SQLite file via `better-sqlite3` WAL mode — the sync
worker writes via HTTP calls to Next.js, not direct DB writes, so everything
goes through the same validation + logging path.

---

## 2. Startup sequence

`ha-addon/haspoolmanager/run.sh` does, in order:

1. Load `SUPERVISOR_TOKEN` from `/run/s6/container_environment/` into env
2. Start Next.js in background (`server.js`)
3. Start sync worker in background (`sync-worker.js`, waits 5s for Next.js)
4. Start nginx in foreground

If `SUPERVISOR_TOKEN` is missing (dev / non-addon run), the sync worker is skipped.

The sync worker bootstraps in `startSyncWorker()`:

```
1. new HAWebSocketClient({ onConnected, onDisconnected })
2. ws.connect() — auth via SUPERVISOR_TOKEN
3. onConnected fires:
     a. subscribeEvents("bambu_lab_event")
     b. subscribeEvents("state_changed")
     c. listEntityRegistry + listDeviceRegistry (one-shot)
     d. discoverPrinters(...) → for each: registerPrinter()
     e. loadEnergySettings()
     f. startWatchdog()
```

On reconnect, `onConnected` fires again → all of (a)–(f) repeat. That is by
design: subscriptions reset server-side on disconnect, and state might have
changed while we were away.

---

## 3. WebSocket layer (`lib/ha-websocket.ts`)

Simple WS wrapper around `ws` npm package; not a drop-in replacement for
the full HA websocket library — only what we need (auth, result, event).

### Protocol

HA websocket messages are JSON with a `type` field. Flow:

1. Connect to `ws://supervisor/core/websocket`
2. Server sends `{type: "auth_required"}`
3. Client replies `{type: "auth", access_token: SUPERVISOR_TOKEN}`
4. Server replies `{type: "auth_ok", ha_version: "..."}`
5. Client can now send `{id, type: "subscribe_events", event_type}` or `{id, type: "config/device_registry/list"}` etc.
6. Server replies with matching `id` in `{type: "result"}` or streams `{type: "event", id: <subscription-id>}`

### Reconnect strategy

On `close` event, `scheduleReconnect()` fires with exponential-ish backoff:

| Attempt | Delay |
|---|---|
| 1–3 | 5 s |
| 4–6 | 30 s |
| 7+ | 5 min (unbounded) |

No retry cap. On successful reconnect, `reconnectAttempts` resets to 0.

### Pending results

Each request gets a monotonic `msgId`. A `Map<number, {resolve, reject}>`
holds in-flight promises; `result` messages look up the id and settle.
`pendingResults.delete(id)` runs before resolution to avoid memory leaks on long-running sessions.

### Event subscriptions

`subscribeEvents(event_type, handler)` registers the handler under the
returned subscription id. On each `event` message, the handler fires
with the raw event payload. No debouncing or batching — that's the
caller's job.

---

## 4. Discovery (`lib/ha-discovery.ts`)

Called once per connect. Reads the HA entity + device registries and
figures out:
- Which devices are Bambu Lab printers (model does not start with "ams")
- For each printer, which related devices are AMS units (model starts with
  "ams" but not "external spool"), and what kind (`ams` / `ams_ht`)
- For each relevant entity on those devices, what internal field name to use

### Entity-name → field mapping

Bambu Lab integration names entities in the user's HA language, not English.
So the map (`ENTITY_NAME_MAP`) carries both:

```
"Print Status"   / "Druckstatus"              → gcode_state
"Print Error"    / "Druckfehler"               → print_error
"Active Tray"    / "Aktiver Slot"              → active_slot
"External Spool" / "Externe Spule"             → slot_ext
"Tray 1"         / "Slot 1"                    → slot_ams_<amsIndex>_0  (disambiguated by parent device model)
...
```

See `reference/ha-entities.md` for the full mapping table.

Tray entities need disambiguation because the same `"Tray 1"` entity can
live under the AMS, the AMS HT, or the external spool holder. The code
inspects the parent `device.model`:
- `"ams ht"` in model → `slot_ht_<amsIndex>`
- `"ams"` in model    → `slot_ams_<amsIndex>_<trayIndex>` (tray 0–3)
- else                 → `slot_ams_<amsIndex>_<trayIndex>` (conservative fallback)

### Multi-AMS topology

Discovery finds the list of AMS devices per printer and emits
`DiscoveredAmsDevice[]`. After `registerPrinter`, the sync worker POSTs
them to `/api/v1/printers/<id>/ams-units/discover`, which upserts rows
into `printer_ams_units`. Users can then rename or disable individual
units via `/admin`.

**Single-AMS today, multi-AMS-ready:** AMS units get `amsIndex=0` for the
regular AMS and `amsIndex=1` for the AMS HT (legacy convention preserved).
A second AMS would claim `amsIndex=2`, etc. — but today `lib/ha-discovery.ts`
hardcodes `amsIndex=0` for the tray mapping (line ~185). When you add a
second AMS, widen this mapping to use the order from `amsDevices[]`.

### Persistence vs. re-run

`registerPrinter` always upserts: a printer already in the DB keeps its
`haDeviceId` on re-discovery. The AMS units endpoint preserves
user-edited `displayName` and `enabled` on re-upsert; only
`discoveredAt` refreshes. So a user can rename "AMS 1" to "Werkstatt"
and re-discovery won't clobber it.

---

## 5. Event flow (`lib/sync-worker.ts`)

### `state_changed` handler

Fires on every HA entity change. Flow:

1. Resolve `event.entity_id` → our internal `field` name via `entityToField` map
2. If the field is not one of the sync-triggering fields, skip:

```ts
const syncTriggers = ["gcode_state", "print_state", "print_error",
                      "active_slot", "online"];
```

3. For tray changes (`slot_ams_*_*`, `slot_ht_*`, `slot_ext`), we DO trigger
   full sync — AMS slot updates are the whole point of this pipeline.
4. Build the sync payload from all mapped entities (REST poll under the hood —
   each `subscribe_events` message only carries the changed entity, not the
   full state).
5. POST to `/api/v1/events/printer-sync`.

**Throttling:** progress %, layer count, remaining time are excluded from the
trigger list because they fire every few seconds during a print. They're
picked up automatically by the watchdog poll.

### `bambu_lab_event` handler

Specific structured events from the `ha-bambulab` integration. Most
important is `event_print_error` — it carries the raw HMS error code that
`parseRunoutError()` decodes into `{amsUnit, trayIndex}` for precise
runout-slot identification.

Runout events get queued as `pendingSwaps` on the per-printer state;
the next sync reconciles them with actual AMS-slot changes to detect
spool-swap timing. `event_print_error_cleared` resets the runout flag.

### Watchdog (`startWatchdog`)

A `setInterval(…, 30_000)` loop. For each registered printer:

```
if (isActive && now - lastEventAt > 2 min) → full REST poll + sync POST
if (!isActive && now - lastEventAt > 5 min) → heartbeat poll
```

Watchdog catches:
- WS connected but HA integration hung (no events flowing)
- State change between reconnect frames lost
- Drucker-State sprang schnell IDLE→RUNNING→FAILED bevor WS aufholte

The 30s check interval is the floor; actual polls happen less often (2 or 5 min timeouts).

### Cover-image capture (race-condition-tolerant)

Bambu's HA integration emits `event_print_started` BEFORE it has uploaded the
new model preview to its `image.<printer>_titelbild` (DE) or
`image.<printer>_cover_image` (EN) entity. A direct fetch at print-start time
hits HA's `/api/image_proxy/` and gets a 500 — the image backend has no
payload yet. The cover usually shows up 30s–15min later.

Solution: **event-driven capture from `state_changed`**.

1. `event_print_started` triggers `tryCaptureCoverForPrinter()` once as a
   best-effort first attempt. Usually fails with the 500 above; that's logged
   at info level (not error) and is expected.
2. The `state_changed` handler treats `cover_image` specially: whenever the
   image entity updates (Bambu finally pushed the preview), it re-runs
   `tryCaptureCoverForPrinter()`.
3. The helper is **idempotent**: it skips if the running print already has a
   `kind: "cover"` entry in `photo_urls`. Repeat state_changed events from
   Bambu (same image pushed twice) don't create duplicate files.
4. The fetch+save logic is centralized in `lib/cover-capture.ts` so the same
   pure function powers (a) the sync-worker's automatic capture, (b) the
   manual "Camera" button via `captureCoverNowAction`, and (c) the
   `POST /api/v1/admin/capture-cover` HTTP wrapper.
5. A `MIN_COVER_BYTES = 2048` guard rejects the placeholder JPEG that Bambu
   serves before the real cover is ready, so the gallery never shows a
   1KB blank.

**Auth:** the addon Bearer (Supervisor identity) AND the URL `?token=...`
(HA core auth) are BOTH required for `image_proxy` requests — only one
yields 401.

### Initial sync on reconnect

Part of `registerPrinter`. After discovery, we call `buildSyncPayload`
+ `callSyncEngine` once, unconditionally — regardless of whether the
printer is idle. Rationale: when the addon restarts mid-print, the
printer is still `RUNNING`, but `state_changed` won't fire (nothing
changed). Without this one-shot sync, the DB would stay at the
pre-restart state for up to 5 min until the watchdog noticed.

---

## 6. Error handling

Every HTTP call to our own Next.js endpoint is wrapped:

```ts
try {
  await fetch(...)
} catch (error) {
  console.error("[sync-worker] ... failed:", error);
}
```

Sync worker NEVER throws up to `startSyncWorker`. A failed sync call logs
and the next event tries again. The watchdog is the ultimate safety net:
even 100 consecutive failures won't stop the next watchdog tick from
attempting a fresh poll.

There is no process-level respawn. If the Node.js sync-worker process
itself crashes (unhandled exception), it stays dead until the addon
restarts — by design, to avoid masking real bugs in a restart loop.

### Missing-spool warning on print start

When the printer-sync route creates a new `prints` record and cannot
match any spool to the active AMS slot, it:

1. Logs `[printer-sync] MISSING_SPOOL print_id=… printer=… type=… tag=… color=… filament_id=…` (findable via `ha addons logs local_haspoolmanager | grep MISSING_SPOOL`)
2. Sends a Home Assistant `persistent_notification` (titled "HASpoolManager: Kein Spool zugeordnet") with a unique `notification_id` of the form `haspoolmanager_missing_spool_<print-id>` — so duplicate notifications for the same print overwrite rather than stack

The notification is fire-and-forget; if the HA API call fails, the
error is logged and the print still records normally — just without
filament deduction until a swap event produces a match. See
`sendHaPersistentNotification` in `lib/ha-notifications.ts`.

---

## 7. Graceful shutdown

`stopSyncWorker()`:
1. Clears watchdog interval
2. Calls `wsClient.destroy()` (which cancels reconnect timer and closes WS)
3. Logs `[sync-worker] stopped`

`run.sh` forwards SIGTERM from the HA supervisor to all child processes.
Nginx exits first, then Next.js, then the sync worker; each signal
handler cleans up its own state.

---

## 8. Where to look in the code

| Behavior | File | Key symbol |
|---|---|---|
| WS connect + auth + reconnect | `lib/ha-websocket.ts` | `HAWebSocketClient.connect`, `scheduleReconnect` |
| Entity discovery | `lib/ha-discovery.ts` | `discoverPrinters` |
| Register printer + upsert units | `lib/sync-worker.ts` | `registerPrinter` (~line 529) |
| Build sync payload from HA state | `lib/sync-worker.ts` | `buildSyncPayload` (~line 105) |
| POST to printer-sync route | `lib/sync-worker.ts` | `callSyncEngine` (~line 163) |
| Watchdog interval | `lib/sync-worker.ts` | `startWatchdog` (~line 666) |
| HMS event parsing | `lib/sync-worker.ts` | `parseRunoutError` (top of file) |
| Cover-image + snapshot fetching | `lib/sync-worker.ts` | `captureCoverImage`, `captureSnapshot` |

## 9. Related docs

- [`state-machine.md`](state-machine.md) — what the printer-sync endpoint does with each payload
- [`matching-engine.md`](matching-engine.md) — how spools are identified inside the endpoint
- [`../reference/ha-entities.md`](../reference/ha-entities.md) — full DE/EN entity-name map
- [`../reference/error-codes.md`](../reference/error-codes.md) — HMS error codes + parseRunoutError semantics
