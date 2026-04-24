/**
 * Sync Worker — background process for event-driven printer sync.
 *
 * Runs alongside Next.js, started by run.sh. Connects to HA websocket,
 * subscribes to bambu_lab events, auto-discovers printers, and calls
 * the existing sync engine on every relevant event.
 *
 * Entry point: startSyncWorker()
 */

import { HAWebSocketClient } from "./ha-websocket";
import { getEntityState, getEntityStates } from "./ha-api";
import { discoverPrinters, buildFieldToEntityMap, buildEntityToFieldMap, type DiscoveredPrinter, type EntityMapping } from "./ha-discovery";
import { isHAEntityAvailable } from "./printer-sync-helpers";

// ── Types ────────────────────────────────────────────────────────────────────

interface SpoolSwapEvent {
  trayIndex: number;
  amsUnit: number; // 0=AMS, 1=AMS HT
  oldSpoolId: string | null;
  newSpoolId: string | null;
  progressAtSwap: number;
  detectedAt: string; // ISO timestamp
}

interface PrinterSyncState {
  printerId: string; // DB printer ID
  deviceId: string; // HA device ID
  mappings: EntityMapping[];
  fieldToEntity: Map<string, string>;
  entityToField: Map<string, string>;
  lastEventAt: number;
  isActive: boolean; // currently printing?
  pendingSwaps: SpoolSwapEvent[]; // swaps detected during current print
  runoutSlot: { amsUnit: number; trayIndex: number } | null; // currently waiting for swap
}

// ── Runout error code parsing ────────────────────────────────────────────────

/**
 * Parse a Bambu Lab print_error code to detect filament runout.
 * Error codes: 0x07XX8011 (AMS, XX=tray), 0x18XX8011 (AMS HT), 0x07FF8011 (external)
 */
function parseRunoutError(errorCode: number): { amsUnit: number; trayIndex: number } | null {
  if (errorCode === 0) return null;
  const hex = errorCode.toString(16).padStart(8, "0");
  if (!hex.endsWith("8011")) return null;
  const moduleId = parseInt(hex.slice(0, 2), 16);
  const slot = parseInt(hex.slice(2, 4), 16);
  if (moduleId === 0x07 && slot !== 0xff) return { amsUnit: 0, trayIndex: slot };
  if (moduleId === 0x18) return { amsUnit: 1, trayIndex: slot };
  return null;
}

// ── State ────────────────────────────────────────────────────────────────────

const printers = new Map<string, PrinterSyncState>(); // deviceId → state
let wsClient: HAWebSocketClient | null = null;
let watchdogTimer: ReturnType<typeof setInterval> | null = null;
let backupSchedulerTimer: ReturnType<typeof setInterval> | null = null;
let backupSmokeTimer: ReturnType<typeof setTimeout> | null = null;

// ── Energy tracking cache ───────────────────────────────────────────────────
let energySensorEntityId: string | null = null;

/** Load energy tracking settings from the internal API. */
async function loadEnergySettings(): Promise<void> {
  try {
    const apiKey = process.env.API_SECRET_KEY || "";
    const port = process.env.PORT || "3002";
    const basePath = process.env.HA_ADDON === "true" ? "/ingress" : "";
    const res = await fetch(`http://127.0.0.1:${port}${basePath}/api/v1/settings/energy`, {
      headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
    });
    if (res.ok) {
      const data = await res.json();
      energySensorEntityId = data.energy_sensor_entity_id || null;
      console.log(`[sync-worker] energy sensor: ${energySensorEntityId || "not configured"}`);
    }
  } catch {
    console.log("[sync-worker] energy settings not available (API not ready yet)");
  }
}

/** Read current kWh value from the energy sensor. Returns null if unavailable. */
async function readEnergySensorKwh(): Promise<number | null> {
  if (!energySensorEntityId) return null;
  try {
    const state = await getEntityState(energySensorEntityId);
    const value = parseFloat(state?.state ?? "");
    if (isNaN(value) || state?.state === "unavailable" || state?.state === "unknown") {
      return null;
    }
    return value;
  } catch {
    return null;
  }
}

// ── Sync payload builder ────────────────────────────────────────────────────

/**
 * Read all entity states for a printer and build a sync payload
 * compatible with the existing POST /api/v1/events/printer-sync handler.
 */
async function buildSyncPayload(printer: PrinterSyncState): Promise<Record<string, unknown>> {
  const entityIds = Array.from(printer.fieldToEntity.values());
  const states = await getEntityStates(entityIds);

  const payload: Record<string, unknown> = {
    printer_id: printer.printerId,
  };

  for (const [field, entityId] of printer.fieldToEntity) {
    const state = states.get(entityId);
    // Skip entities HA reports as unavailable/unknown. Their `attributes` are
    // empty, so `state.attributes.empty ?? true` would default to `true` and
    // unbind real AMS→spool mappings on a transient HA disconnect. The route
    // handler treats absent fields as "no change".
    if (!isHAEntityAvailable(state)) continue;

    if (field === "active_slot") {
      // Active slot: state is the name, attributes have type/color/tag/filament_id
      payload.active_slot_type = state.attributes.type ?? "";
      payload.active_slot_color = state.attributes.color ?? "";
      payload.active_slot_tag = state.attributes.tag_uid ?? "";
      payload.active_slot_filament_id = state.attributes.filament_id ?? "";
    } else if (field.startsWith("slot_")) {
      // AMS tray: attributes have type/color/tag_uid/filament_id/remain/empty
      const prefix = field; // slot_1, slot_2, slot_ht, slot_ext
      payload[`${prefix}_type`] = state.attributes.type ?? "";
      payload[`${prefix}_color`] = state.attributes.color ?? "";
      payload[`${prefix}_tag`] = state.attributes.tag_uid ?? "";
      payload[`${prefix}_filament_id`] = state.attributes.filament_id ?? "";
      payload[`${prefix}_remain`] = state.attributes.remain ?? -1;
      payload[`${prefix}_empty`] = state.attributes.empty ?? true;
    } else if (field === "print_weight") {
      // print_weight: state is total weight, attributes have per-tray breakdown
      // e.g., { "AMS 1 Tray 1": 150.5, "AMS 1 Tray 4": 50.0 }
      payload[field] = state.state;
      const trayWeights: Record<string, number> = {};
      for (const [key, value] of Object.entries(state.attributes)) {
        if (key.startsWith("AMS") && typeof value === "number") {
          trayWeights[key] = value;
        }
      }
      if (Object.keys(trayWeights).length > 0) {
        payload.tray_weights = trayWeights;
      }
    } else {
      // Simple state fields
      payload[field] = state.state;
    }
  }

  return payload;
}

/**
 * Call the existing sync engine via internal HTTP to the Next.js server.
 * This avoids extracting the route handler into a shared module (large refactor).
 * The Next.js server runs on 127.0.0.1:3002 inside the addon container.
 */
async function callSyncEngine(payload: Record<string, unknown>): Promise<void> {
  try {
    const apiKey = process.env.API_SECRET_KEY || "";
    const port = process.env.PORT || "3002";
    const basePath = process.env.HA_ADDON === "true" ? "/ingress" : "";

    const res = await fetch(`http://127.0.0.1:${port}${basePath}/api/v1/events/printer-sync`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      console.error(`[sync-worker] sync returned ${res.status}: ${await res.text()}`);
    }
  } catch (error) {
    console.error("[sync-worker] sync error:", error);
  }
}

/**
 * Process HMS error attributes from binary_sensor.*_hms_errors.
 * HA exposes errors as numbered attributes:
 *   1-Code: "HMS_0700_2000_0002_0001"
 *   1-Error: "AMS1 Slot1 filament has run out."
 *   1-Severity: "common"
 *   1-Wiki: "https://wiki.bambulab.com/..."
 *   Count: 2
 */
async function processHmsErrors(
  printer: PrinterSyncState,
  attrs: Record<string, unknown>,
): Promise<void> {
  const count = Number(attrs.Count ?? attrs.count ?? 0);
  if (count <= 0) return;

  const events: Array<{
    code: string;
    message: string;
    severity: string;
    wiki_url: string;
  }> = [];

  for (let i = 1; i <= count; i++) {
    const code = String(attrs[`${i}-Code`] ?? "");
    const message = String(attrs[`${i}-Error`] ?? attrs[`${i}-Message`] ?? "");
    const severity = String(attrs[`${i}-Severity`] ?? "unknown");
    const wikiUrl = String(attrs[`${i}-Wiki`] ?? "");

    if (!code) continue;
    events.push({ code, message, severity, wiki_url: wikiUrl });
  }

  if (events.length === 0) return;

  console.log(`[sync-worker] HMS: ${events.length} error(s) — ${events.map(e => e.code).join(", ")}`);

  try {
    const apiKey = process.env.API_SECRET_KEY || "";
    const port = process.env.PORT || "3002";
    const basePath = process.env.HA_ADDON === "true" ? "/ingress" : "";

    await fetch(`http://127.0.0.1:${port}${basePath}/api/v1/events/hms`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify({
        printer_id: printer.printerId,
        events,
      }),
    });
  } catch (error) {
    console.error("[sync-worker] HMS event POST failed:", error);
  }
}

// ── Event handlers ──────────────────────────────────────────────────────────

async function handleBambuEvent(event: Record<string, unknown>) {
  // bambu_lab_event structure: { event_type, data: { device_id, type }, ... }
  const eventData = (event.data ?? event) as Record<string, unknown>;
  const deviceId = (eventData.device_id ?? event.device_id) as string;
  const eventType = (eventData.type ?? event.type ?? event.event_type) as string;

  if (!deviceId) {
    console.log(`[sync-worker] bambu_lab_event without device_id:`, JSON.stringify(event).slice(0, 200));
    return;
  }

  console.log(`[sync-worker] bambu_lab_event: ${eventType} device=${deviceId} data=${JSON.stringify(eventData).slice(0, 200)}`);

  // Auto-discover if unknown printer
  let printer: PrinterSyncState | undefined = printers.get(deviceId);
  if (!printer) {
    const discovered = await discoverAndRegister(deviceId);
    if (!discovered) return;
    printer = discovered;
  }

  printer.lastEventAt = Date.now();

  // ── Swap detection via bambu_lab_event ────────────────────────────
  if (eventType === "event_print_error" && printer.isActive) {
    // Filament runout detected — snapshot progress for weight splitting
    const progressEntity = printer.fieldToEntity.get("print_progress");
    let progress = 0;
    if (progressEntity) {
      try {
        const pStates = await getEntityStates([progressEntity]);
        progress = parseFloat(pStates.get(progressEntity)?.state ?? "0") || 0;
      } catch { /* ignore */ }
    }
    // We don't have the exact tray index from the event, but we know print_error fired.
    // Record a swap event — trayIndex will be resolved when tray sensor changes.
    console.log(`[sync-worker] RUNOUT (event_print_error): progress=${progress}%`);
    printer.runoutSlot = { amsUnit: -1, trayIndex: -1 }; // unknown slot, resolved on tray change
    printer.pendingSwaps.push({
      trayIndex: -1,
      amsUnit: -1,
      oldSpoolId: null,
      newSpoolId: null,
      progressAtSwap: progress,
      detectedAt: new Date().toISOString(),
    });
  } else if (eventType === "event_print_error_cleared" && printer.runoutSlot) {
    console.log(`[sync-worker] RUNOUT cleared (event_print_error_cleared)`);
    printer.runoutSlot = null;
  }

  // Build payload and sync
  const payload = await buildSyncPayload(printer);
  if (printer.pendingSwaps.length > 0) {
    payload.spool_swaps = printer.pendingSwaps;
  }

  // Energy tracking: read kWh sensor at print start and end
  if (eventType === "event_print_started") {
    const kwh = await readEnergySensorKwh();
    if (kwh !== null) {
      payload.energy_start_kwh = kwh;
      console.log(`[sync-worker] energy at start: ${kwh} kWh`);
    }
  } else if (["event_print_finished", "event_print_canceled", "event_print_failed"].includes(eventType)) {
    const kwh = await readEnergySensorKwh();
    if (kwh !== null) {
      payload.energy_end_kwh = kwh;
      console.log(`[sync-worker] energy at end: ${kwh} kWh`);
    }
  }

  await callSyncEngine(payload);

  // Capture cover image at print start
  if (eventType === "event_print_started" && printer) {
    console.log("[capture] cover: starting for event_print_started");
    const coverEntity = printer.fieldToEntity.get("cover_image");
    if (!coverEntity) {
      console.error("[capture] cover: no cover_image entity mapped for this printer");
    } else {
      try {
        console.log(`[capture] cover: reading state of ${coverEntity}`);
        const states = await getEntityStates([coverEntity]);
        const coverState = states.get(coverEntity);
        const entityPicture = coverState?.attributes?.entity_picture as string | undefined;
        if (!entityPicture) {
          console.error(`[capture] cover: entity ${coverEntity} has no entity_picture attribute (state=${coverState?.state}, attrs=${JSON.stringify(Object.keys(coverState?.attributes ?? {}))})`);
        } else {
          const imgUrl = entityPicture.split("?")[0];
          console.log(`[capture] cover: fetching http://supervisor/core${imgUrl}`);
          const imgRes = await fetch(`http://supervisor/core${imgUrl}`, {
            headers: { Authorization: `Bearer ${process.env.SUPERVISOR_TOKEN}` },
          });
          if (!imgRes.ok) {
            console.error(`[capture] cover: supervisor fetch failed: ${imgRes.status} ${imgRes.statusText}`);
          } else {
            const buffer = Buffer.from(await imgRes.arrayBuffer());
            // Resolve the running print for this printer so we save into the right
            // folder. Use dbPrinterId from the sync-worker state.
            const { db } = await import("./db");
            const { prints } = await import("./db/schema");
            const { and, eq } = await import("drizzle-orm");
            const runningPrint = await db.query.prints.findFirst({
              where: and(eq(prints.printerId, printer.printerId), eq(prints.status, "running")),
              columns: { id: true },
            });
            if (!runningPrint) {
              console.error("[capture] cover: no running print found for printer; skipping save");
            } else {
              const { savePhoto } = await import("./photo-manager");
              const saved = await savePhoto(runningPrint.id, buffer, "cover", "jpg");
              console.log(`[capture] cover: saved ${saved.path} (${Math.round(buffer.byteLength / 1024)}KB) for print ${runningPrint.id}`);
            }
          }
        }
      } catch (err) {
        console.error("[capture] cover: failure:", (err as Error).message, (err as Error).stack);
      }
    }
  }

  // Capture camera snapshot at print end.
  // HA's camera.snapshot service writes on HA's filesystem, but /config/ is
  // shared with the addon container, so we point the service at a path inside
  // /config/haspoolmanager/photos/<printId>/ and the addon can read/serve it
  // without copying.
  if (["event_print_finished", "event_print_canceled", "event_print_failed"].includes(eventType) && printer) {
    console.log(`[capture] snapshot: starting for ${eventType}`);
    try {
      const { callHAService } = await import("./ha-api");
      const { db } = await import("./db");
      const { prints } = await import("./db/schema");
      const { eq } = await import("drizzle-orm");

      const targetCamera = printer.fieldToEntity.get("camera")
        || Array.from(printer.entityToField.keys()).find((eid) => eid.startsWith("camera."))
        || "";
      if (!targetCamera) {
        console.error("[capture] snapshot: no camera entity mapped for this printer");
      } else {
        const latestPrint = await db.query.prints.findFirst({
          where: eq(prints.printerId, printer.printerId),
          orderBy: (p, { desc }) => [desc(p.startedAt)],
          columns: { id: true },
        });
        if (!latestPrint) {
          console.error("[capture] snapshot: no print found for printer; skipping save");
        } else {
          const { existsSync, mkdirSync, readFileSync } = await import("fs");
          const photoRoot = process.env.PHOTO_DIR ?? "/config/haspoolmanager/photos";
          const dir = `${photoRoot}/${latestPrint.id}`;
          if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
          const filename = `snapshot-${new Date().toISOString().replace(/[:.]/g, "-")}.jpg`;
          const fullPath = `${dir}/${filename}`;
          console.log(`[capture] snapshot: camera.snapshot ${targetCamera} → ${fullPath}`);
          const success = await callHAService("camera", "snapshot", {
            entity_id: targetCamera,
            filename: fullPath,
          });
          if (!success) {
            console.error(`[capture] snapshot: camera.snapshot service call failed (entity=${targetCamera})`);
          } else {
            // Verify and register in photo_urls. HA writes async; give it a beat.
            await new Promise((r) => setTimeout(r, 500));
            if (!existsSync(fullPath)) {
              console.error(`[capture] snapshot: camera.snapshot reported ok but file does not exist at ${fullPath} (HA likely wrote to its own FS, not the shared /config volume)`);
            } else {
              const size = readFileSync(fullPath).byteLength;
              const { getPhotos } = await import("./photo-manager");
              const current = await getPhotos(latestPrint.id);
              const entry = {
                path: `${latestPrint.id}/${filename}`,
                kind: "snapshot" as const,
                captured_at: new Date().toISOString(),
              };
              const next = [...current, entry];
              await db.update(prints)
                .set({ photoUrls: JSON.stringify(next), updatedAt: new Date() })
                .where(eq(prints.id, latestPrint.id));
              console.log(`[capture] snapshot: saved ${entry.path} (${Math.round(size / 1024)}KB) for print ${latestPrint.id}`);
            }
          }
        }
      }
    } catch (err) {
      console.error("[capture] snapshot: failure:", (err as Error).message, (err as Error).stack);
    }
  }

  // Track active state
  const gcode = payload.gcode_state as string;
  printer.isActive = ["RUNNING", "PREPARE", "PAUSE", "SLICING", "INIT"].includes(
    (gcode || "").toUpperCase(),
  );
}

let stateChangedCount = 0;
let lastStatsLog = Date.now();

async function handleStateChanged(event: Record<string, unknown>) {
  stateChangedCount++;
  // Log stats every 60s
  if (Date.now() - lastStatsLog > 60000) {
    console.log(`[sync-worker] state_changed: ${stateChangedCount} events received in last 60s`);
    stateChangedCount = 0;
    lastStatsLog = Date.now();
  }

  const data = event.data as { entity_id: string; new_state?: { state: string; attributes: Record<string, unknown> } } | undefined;
  if (!data?.entity_id) return;

  // Find which printer this entity belongs to
  for (const printer of printers.values()) {
    if (printer.entityToField.has(data.entity_id)) {
      const field = printer.entityToField.get(data.entity_id)!;
      const newState = data.new_state?.state ?? "?";
      const attrs = data.new_state?.attributes ?? {};
      printer.lastEventAt = Date.now();

      // Track active state from gcode_state
      if (field === "gcode_state") {
        const wasActive = printer.isActive;
        printer.isActive = ["running", "prepare", "pause", "slicing", "init"].includes(newState.toLowerCase());
        if (wasActive && !printer.isActive) {
          // Print ended — clear swap tracking
          printer.pendingSwaps = [];
          printer.runoutSlot = null;
        }
      } else {
        printer.isActive = printer.isActive; // preserve current state
      }

      // ── Spool swap detection ──────────────────────────────────────
      if (field === "print_error" && printer.isActive) {
        const errorStr = newState === "on" ? "1" : newState === "off" ? "0" : newState;
        const errorCode = parseInt(errorStr, 10) || 0;
        const runout = parseRunoutError(errorCode);
        if (runout) {
          printer.runoutSlot = runout;
          // Read current progress
          const progressEntity = printer.fieldToEntity.get("print_progress");
          let progress = 0;
          if (progressEntity) {
            try {
              const pStates = await getEntityStates([progressEntity]);
              progress = parseFloat(pStates.get(progressEntity)?.state ?? "0") || 0;
            } catch { /* ignore */ }
          }
          console.log(`[sync-worker] RUNOUT: tray=${runout.trayIndex} ams=${runout.amsUnit} progress=${progress}%`);
          printer.pendingSwaps.push({
            trayIndex: runout.trayIndex,
            amsUnit: runout.amsUnit,
            oldSpoolId: null,
            newSpoolId: null,
            progressAtSwap: progress,
            detectedAt: new Date().toISOString(),
          });
        } else if (errorCode === 0 && printer.runoutSlot) {
          console.log(`[sync-worker] RUNOUT cleared — swap complete`);
          printer.runoutSlot = null;
        }
      }

      // Tray refilled during swap
      if (field.startsWith("slot_") && printer.runoutSlot && printer.isActive) {
        if (attrs.empty === false || attrs.empty === "False") {
          console.log(`[sync-worker] tray refilled: ${field} tag=${attrs.tag_uid ?? "?"}`);
        }
      }

      // ── HMS error tracking ──────────────────────────────────────────
      if (field === "hms_errors" && newState === "on") {
        await processHmsErrors(printer, attrs);
        // Don't trigger a full sync for HMS — it's tracked separately
        return;
      }

      // Only trigger full sync on important state changes
      const syncTriggers = ["gcode_state", "print_state", "print_error", "active_slot", "online"];
      const isTrayChange = field.startsWith("slot_");
      if (!syncTriggers.includes(field) && !isTrayChange) return;

      console.log(`[sync-worker] sync trigger: ${field}=${newState}`);

      const payload = await buildSyncPayload(printer);
      if (printer.pendingSwaps.length > 0) {
        payload.spool_swaps = printer.pendingSwaps;
      }
      await callSyncEngine(payload);
      return;
    }
  }
}

// ── Auto-discovery ──────────────────────────────────────────────────────────

async function discoverAndRegister(deviceId: string): Promise<PrinterSyncState | null> {
  if (!wsClient?.isConnected) return null;

  try {
    console.log(`[sync-worker] discovering printer for device ${deviceId}...`);
    const [entities, devices] = await Promise.all([
      wsClient.listEntityRegistry(),
      wsClient.listDeviceRegistry(),
    ]);

    const discovered = discoverPrinters(entities, devices);
    const printer = discovered.find((p) => p.deviceId === deviceId);

    if (!printer) {
      // Check if this is an AMS device — find the parent printer
      const parentPrinter = discovered.find((p) => p.amsDevices.some((d) => d.id === deviceId));
      if (parentPrinter) {
        return registerPrinter(parentPrinter);
      }
      console.log(`[sync-worker] device ${deviceId} is not a Bambu Lab printer`);
      return null;
    }

    return registerPrinter(printer);
  } catch (error) {
    console.error("[sync-worker] discovery error:", error);
    return null;
  }
}

async function registerPrinter(discovered: DiscoveredPrinter): Promise<PrinterSyncState> {
  // Check if we already have this printer
  const existing = printers.get(discovered.deviceId);
  if (existing) return existing;

  // Find or create printer in the DB
  // Match by model name (e.g., "H2S") — the DB has "H2S" from the original setup
  let printerId: string;
  try {
    const port = process.env.PORT || "3002";
    const basePath = process.env.HA_ADDON === "true" ? "/ingress" : "";
    const apiKey = process.env.API_SECRET_KEY || "";

    // Try to find existing printer by querying the API
    const res = await fetch(`http://127.0.0.1:${port}${basePath}/api/v1/printers`, {
      headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
    });
    if (res.ok) {
      const dbPrinters = await res.json() as Array<{ id: string; name: string; model: string }>;
      // Match by model or name
      const match = dbPrinters.find((p) =>
        p.model?.includes(discovered.model || "") ||
        p.name?.includes(discovered.model || "") ||
        discovered.name.includes(p.name),
      );
      if (match) {
        printerId = match.id;
        console.log(`[sync-worker] matched to existing DB printer "${match.name}" (${match.id.slice(0, 8)})`);
      } else {
        // Create new printer via API
        const createRes = await fetch(`http://127.0.0.1:${port}${basePath}/api/v1/printers`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
          },
          body: JSON.stringify({
            name: discovered.name,
            model: discovered.model || "Unknown",
            serial: discovered.serial || "",
          }),
        });
        if (createRes.ok) {
          const created = await createRes.json() as { id: string };
          printerId = created.id;
          console.log(`[sync-worker] created new DB printer "${discovered.name}" (${printerId.slice(0, 8)})`);
        } else {
          printerId = discovered.deviceId; // fallback
          console.error(`[sync-worker] failed to create printer: ${createRes.status}`);
        }
      }
    } else {
      printerId = discovered.deviceId; // fallback
    }
  } catch {
    printerId = discovered.deviceId; // fallback
  }

  // Upsert printer_ams_units from the discovered AMS devices.
  // Best-effort: failure here doesn't block sync-worker startup.
  try {
    const port = process.env.NEXT_PORT || "3000";
    const basePath = process.env.HA_ADDON === "true" ? "/ingress" : "";
    const apiKey = process.env.API_SECRET_KEY || "";
    if (discovered.amsDevices.length > 0 && apiKey) {
      const res = await fetch(
        `http://127.0.0.1:${port}${basePath}/api/v1/printers/${printerId}/ams-units/discover`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({ devices: discovered.amsDevices }),
        },
      );
      if (res.ok) {
        const body = (await res.json()) as { created: number; refreshed: number };
        if (body.created > 0 || body.refreshed > 0) {
          console.log(
            `[sync-worker] ams-units: created=${body.created} refreshed=${body.refreshed} for printer ${printerId.slice(0, 8)}`,
          );
        }
      } else {
        console.error(`[sync-worker] ams-units discover failed: ${res.status}`);
      }
    }
  } catch (error) {
    console.error("[sync-worker] ams-units discover error:", error);
  }

  const state: PrinterSyncState = {
    printerId,
    deviceId: discovered.deviceId,
    mappings: discovered.mappings,
    fieldToEntity: buildFieldToEntityMap(discovered.mappings),
    entityToField: buildEntityToFieldMap(discovered.mappings),
    lastEventAt: Date.now(),
    isActive: false,
    pendingSwaps: [],
    runoutSlot: null,
  };

  printers.set(discovered.deviceId, state);

  const missing = discovered.mappings.filter((m) => m.status === "missing");
  console.log(
    `[sync-worker] registered printer "${discovered.name}" (${discovered.model}) — ` +
    `${discovered.mappings.length} sync entities mapped` +
    (missing.length > 0 ? `, ${missing.length} MISSING: ${missing.map((m) => m.field).join(", ")}` : "") +
    ` (${discovered.unmappedEntities.length} other entities ignored)`,
  );

  // Read initial state + do an initial sync. Runs on every addon restart /
  // reconnect, regardless of whether the printer is idle or active:
  //   - Active: catches a print already in progress.
  //   - Idle: refreshes AMS slot bindings from HA (HA may have reloaded the
  //     Bambu integration, added/removed AMS devices, or changed tray state
  //     while the addon was down). Without this, stale DB state persists
  //     until the watchdog fires 5 min later, or until the next print event.
  const gcodeEntity = state.fieldToEntity.get("gcode_state");
  if (gcodeEntity) {
    try {
      const states = await getEntityStates([gcodeEntity]);
      const gcodeState = states.get(gcodeEntity)?.state?.toLowerCase() || "";
      state.isActive = ["running", "prepare", "pause", "slicing", "init"].includes(gcodeState);
    } catch { /* ignore */ }
  }
  try {
    const label = state.isActive ? "ACTIVE" : "IDLE";
    console.log(`[sync-worker] ${label} — doing initial sync for "${discovered.name}"`);
    const payload = await buildSyncPayload(state);
    await callSyncEngine(payload);
  } catch (err) {
    console.error(`[sync-worker] initial sync failed:`, (err as Error).message);
  }

  return state;
}

// ── Watchdog ─────────────────────────────────────────────────────────────────

function startWatchdog() {
  if (watchdogTimer) return;

  const ACTIVE_TIMEOUT = 2 * 60 * 1000; // 2 min
  const IDLE_INTERVAL = 5 * 60 * 1000; // 5 min

  watchdogTimer = setInterval(async () => {
    for (const printer of printers.values()) {
      const elapsed = Date.now() - printer.lastEventAt;

      if (printer.isActive && elapsed > ACTIVE_TIMEOUT) {
        console.log(`[sync-worker] watchdog: active print, no event for ${Math.round(elapsed / 1000)}s — polling`);
        const payload = await buildSyncPayload(printer);
        await callSyncEngine(payload);
      } else if (!printer.isActive && elapsed > IDLE_INTERVAL) {
        // Heartbeat poll when idle
        const payload = await buildSyncPayload(printer);
        await callSyncEngine(payload);
        printer.lastEventAt = Date.now(); // reset to avoid spamming
      }
    }
  }, 30_000); // check every 30s
}

// ── Backup scheduler ─────────────────────────────────────────────────────────

const BACKUP_TIMEZONE = "Europe/Berlin";
const BACKUP_HOUR = 3;

function getLocalDateKey(date: Date = new Date()): string {
  return date.toLocaleDateString("en-CA", { timeZone: BACKUP_TIMEZONE });
}

function getLocalHour(date: Date = new Date()): number {
  const hourStr = date.toLocaleTimeString("en-GB", { timeZone: BACKUP_TIMEZONE, hour: "2-digit", hour12: false });
  return parseInt(hourStr.split(":")[0] ?? "0", 10);
}

async function maybeRunScheduledBackup(): Promise<void> {
  try {
    const { listBackups, runBackup, cleanupOldBackups } = await import("./backup-manager");
    const todayKey = getLocalDateKey();
    const backups = listBackups();
    const hasTodayBackup = backups.some((b) => getLocalDateKey(b.createdAt) === todayKey);
    if (hasTodayBackup) return;
    const hour = getLocalHour();
    if (hour !== BACKUP_HOUR) return;
    console.log("[backup] starting scheduled daily backup");
    const result = await runBackup();
    const cleanup = cleanupOldBackups();
    console.log(`[backup] ${result.filename} (${Math.round(result.size / 1024)}KB, ${result.durationMs}ms); deleted ${cleanup.deleted.length} old backup(s)`);
  } catch (error) {
    console.error("[backup] scheduled backup failed:", (error as Error).message);
  }
}

async function runSmokeBackup(): Promise<void> {
  try {
    const { listBackups, runBackup } = await import("./backup-manager");
    const backups = listBackups();
    if (backups.length > 0) {
      console.log(`[backup] smoke-test skipped — ${backups.length} existing backup(s) found`);
      return;
    }
    console.log("[backup] running startup smoke-test backup (first run)");
    const result = await runBackup();
    console.log(`[backup] smoke-test ok: ${result.filename} (${Math.round(result.size / 1024)}KB, ${result.durationMs}ms)`);
  } catch (error) {
    console.error("[backup] smoke-test failed:", (error as Error).message);
  }
}

function startBackupScheduler(): void {
  backupSchedulerTimer = setInterval(maybeRunScheduledBackup, 60 * 60 * 1000);
  backupSmokeTimer = setTimeout(runSmokeBackup, 60_000);
  console.log(`[backup] scheduler started — daily at ${String(BACKUP_HOUR).padStart(2, "0")}:00 ${BACKUP_TIMEZONE}`);
}

// ── Main ─────────────────────────────────────────────────────────────────────

export async function startSyncWorker(): Promise<void> {
  console.log("[sync-worker] starting...");

  wsClient = new HAWebSocketClient({
    onConnected: async () => {
      console.log("[sync-worker] subscribing to events...");
      try {
        // Subscribe to bambu_lab custom events (print lifecycle)
        await wsClient!.subscribeEvents("bambu_lab_event", handleBambuEvent);
        console.log("[sync-worker] subscribed to bambu_lab_event");

        // Subscribe to all state_changed (filter client-side by entity_id)
        await wsClient!.subscribeEvents("state_changed", handleStateChanged);
        console.log("[sync-worker] subscribed to state_changed");

        // Initial discovery — find all connected printers
        const [entities, devices] = await Promise.all([
          wsClient!.listEntityRegistry(),
          wsClient!.listDeviceRegistry(),
        ]);
        const discovered = discoverPrinters(entities, devices);
        for (const p of discovered) {
          await registerPrinter(p);
        }
        console.log(`[sync-worker] discovered ${discovered.length} printer(s)`);

        // Load energy tracking settings
        await loadEnergySettings();

        // Start watchdog
        startWatchdog();

        // Start backup scheduler
        startBackupScheduler();
      } catch (error) {
        console.error("[sync-worker] subscription error:", error);
      }
    },
    onDisconnected: () => {
      console.log("[sync-worker] lost HA connection — will reconnect");
    },
  });

  try {
    await wsClient.connect();
  } catch (error) {
    console.error("[sync-worker] initial connection failed:", error);
    // Will auto-reconnect via the client's built-in backoff
  }
}

/** Stop the sync worker (for graceful shutdown). */
export function stopSyncWorker(): void {
  if (watchdogTimer) {
    clearInterval(watchdogTimer);
    watchdogTimer = null;
  }
  if (backupSchedulerTimer) {
    clearInterval(backupSchedulerTimer);
    backupSchedulerTimer = null;
  }
  if (backupSmokeTimer) {
    clearTimeout(backupSmokeTimer);
    backupSmokeTimer = null;
  }
  wsClient?.destroy();
  wsClient = null;
  printers.clear();
  console.log("[sync-worker] stopped");
}
