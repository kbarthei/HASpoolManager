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
import { getEntityStates } from "./ha-api";
import { discoverPrinters, buildFieldToEntityMap, buildEntityToFieldMap, type DiscoveredPrinter, type EntityMapping } from "./ha-discovery";

// ── Types ────────────────────────────────────────────────────────────────────

interface PrinterSyncState {
  printerId: string; // DB printer ID
  deviceId: string; // HA device ID
  mappings: EntityMapping[];
  fieldToEntity: Map<string, string>;
  entityToField: Map<string, string>;
  lastEventAt: number;
  isActive: boolean; // currently printing?
}

// ── State ────────────────────────────────────────────────────────────────────

const printers = new Map<string, PrinterSyncState>(); // deviceId → state
let wsClient: HAWebSocketClient | null = null;
let watchdogTimer: ReturnType<typeof setInterval> | null = null;

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
    if (!state) continue;

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

  console.log(`[sync-worker] bambu_lab_event: ${eventType} device=${deviceId}`);

  // Auto-discover if unknown printer
  let printer: PrinterSyncState | undefined = printers.get(deviceId);
  if (!printer) {
    const discovered = await discoverAndRegister(deviceId);
    if (!discovered) return;
    printer = discovered;
  }

  printer.lastEventAt = Date.now();

  // Build payload and sync
  const payload = await buildSyncPayload(printer);
  await callSyncEngine(payload);

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
      printer.lastEventAt = Date.now();
      printer.isActive = ["running", "prepare", "pause", "slicing", "init"].includes(newState.toLowerCase());

      // Only trigger full sync on IMPORTANT state changes, not every progress tick.
      // Sync triggers: gcode_state, print_error, active_slot, tray changes
      // Skip: progress %, layer count, remaining time (handled by watchdog poll)
      const syncTriggers = ["gcode_state", "print_state", "print_error", "active_slot", "online"];
      const isTrayChange = field.startsWith("slot_");
      if (!syncTriggers.includes(field) && !isTrayChange) return;

      console.log(`[sync-worker] sync trigger: ${field}=${newState}`);

      if (isTrayChange && printer.isActive) {
        console.log(`[sync-worker] tray change during print: ${field}`);
      }

      const payload = await buildSyncPayload(printer);
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
      const parentPrinter = discovered.find((p) => p.amsDeviceIds.includes(deviceId));
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
            amsCount: discovered.amsDeviceIds.length,
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

  const state: PrinterSyncState = {
    printerId,
    deviceId: discovered.deviceId,
    mappings: discovered.mappings,
    fieldToEntity: buildFieldToEntityMap(discovered.mappings),
    entityToField: buildEntityToFieldMap(discovered.mappings),
    lastEventAt: Date.now(),
    isActive: false,
  };

  printers.set(discovered.deviceId, state);

  const missing = discovered.mappings.filter((m) => m.status === "missing");
  console.log(
    `[sync-worker] registered printer "${discovered.name}" (${discovered.model}) — ` +
    `${discovered.mappings.length} sync entities mapped` +
    (missing.length > 0 ? `, ${missing.length} MISSING: ${missing.map((m) => m.field).join(", ")}` : "") +
    ` (${discovered.unmappedEntities.length} other entities ignored)`,
  );

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

        // Start watchdog
        startWatchdog();
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
  wsClient?.destroy();
  wsClient = null;
  printers.clear();
  console.log("[sync-worker] stopped");
}
