/**
 * Auto-discovery: maps Bambu Lab HA devices to sync field names.
 *
 * Given a device_id from a bambu_lab_event, queries the HA entity + device
 * registries and builds a mapping from entity_id → sync field name using
 * the stable `original_name` (always English, regardless of HA language).
 */

import type { HAEntityRegistryEntry, HADeviceRegistryEntry } from "./ha-websocket";

// ── Default entity map ──────────────────────────────────────────────────────
// Maps original_name (English) → sync field name.
// This is the built-in default. Users can override via Admin UI.

const PRINTER_ENTITY_MAP: Record<string, string> = {
  "Print Status": "gcode_state",
  "Current Stage": "print_state",
  "Task Name": "print_name",
  "Print Error": "print_error",
  "Print Progress": "print_progress",
  "Print Weight": "print_weight",
  "Total Layer Count": "print_layers_total",
  "Current Layer": "print_layers_current",
  "Remaining Time": "print_remaining_time",
  "Active Tray": "active_slot",
  "Online": "online",
  "External Spool": "slot_ext",
};

// Tray entities share the name "Tray N" across AMS and AMS HT.
// Disambiguation happens via parent device type.
const TRAY_NAMES = ["Tray 1", "Tray 2", "Tray 3", "Tray 4"] as const;

// ── Types ────────────────────────────────────────────────────────────────────

export interface EntityMapping {
  entityId: string;
  field: string;
  originalName: string;
  source: "auto" | "manual";
  status: "ok" | "missing" | "unknown";
}

export interface DiscoveredPrinter {
  deviceId: string;
  name: string;
  model: string | null;
  serial: string | null;
  amsDeviceIds: string[];
  mappings: EntityMapping[];
  unmappedEntities: Array<{ entityId: string; originalName: string }>;
}

// ── Discovery ────────────────────────────────────────────────────────────────

/**
 * Discover all Bambu Lab printers and their entity mappings from the HA registries.
 */
export function discoverPrinters(
  entities: HAEntityRegistryEntry[],
  devices: HADeviceRegistryEntry[],
): DiscoveredPrinter[] {
  // Find all bambu_lab entities
  const bambuEntities = entities.filter(
    (e) => e.platform === "bambu_lab" && !e.disabled_by,
  );
  if (bambuEntities.length === 0) return [];

  // Find all bambu_lab devices
  const bambuDevices = devices.filter((d) =>
    d.identifiers?.some(([domain]) => domain === "bambu_lab"),
  );

  // Group devices by manufacturer — printers vs AMS units
  // Printer devices have model like "H2S", "X1C", "P1S", etc.
  // AMS devices have model like "AMS", "AMS Lite", "AMS HT"
  const printerDevices = bambuDevices.filter(
    (d) => d.model && !d.model.toLowerCase().startsWith("ams") && d.model.toLowerCase() !== "external spool",
  );

  const results: DiscoveredPrinter[] = [];

  for (const printer of printerDevices) {
    // Find related AMS devices (share same bambu_lab identifier prefix)
    const printerSerial = printer.identifiers?.find(([d]) => d === "bambu_lab")?.[1];
    const relatedDevices = bambuDevices.filter((d) => {
      if (d.id === printer.id) return false;
      const serial = d.identifiers?.find(([domain]) => domain === "bambu_lab")?.[1];
      // Related devices share a serial prefix or are explicitly linked
      return serial && printerSerial && serial.startsWith(printerSerial.split("_")[0]);
    });

    const amsDeviceIds = relatedDevices.map((d) => d.id);
    const allDeviceIds = [printer.id, ...amsDeviceIds];

    // Get all entities for this printer + its AMS units
    const printerEntities = bambuEntities.filter(
      (e) => e.device_id && allDeviceIds.includes(e.device_id),
    );

    const mappings: EntityMapping[] = [];
    const mappedEntityIds = new Set<string>();

    // Map printer entities by original_name
    for (const entity of printerEntities) {
      const origName = entity.original_name || "";

      // Check direct map (non-tray entities)
      if (PRINTER_ENTITY_MAP[origName]) {
        mappings.push({
          entityId: entity.entity_id,
          field: PRINTER_ENTITY_MAP[origName],
          originalName: origName,
          source: "auto",
          status: "ok",
        });
        mappedEntityIds.add(entity.entity_id);
        continue;
      }

      // Check tray entities — need to disambiguate AMS vs AMS HT
      const trayIndex = TRAY_NAMES.indexOf(origName as typeof TRAY_NAMES[number]);
      if (trayIndex >= 0) {
        const parentDevice = bambuDevices.find((d) => d.id === entity.device_id);
        const parentModel = (parentDevice?.model || "").toLowerCase();

        let field: string;
        if (parentModel.includes("ams ht") || parentModel.includes("ams-ht")) {
          field = "slot_ht";
        } else if (parentModel.includes("ams")) {
          field = `slot_${trayIndex + 1}`;
        } else {
          field = `slot_${trayIndex + 1}`;
        }

        mappings.push({
          entityId: entity.entity_id,
          field,
          originalName: origName,
          source: "auto",
          status: "ok",
        });
        mappedEntityIds.add(entity.entity_id);
      }
    }

    // Collect unmapped entities (for Admin UI "unknown" display)
    const unmappedEntities = printerEntities
      .filter((e) => !mappedEntityIds.has(e.entity_id))
      .map((e) => ({ entityId: e.entity_id, originalName: e.original_name || "" }));

    results.push({
      deviceId: printer.id,
      name: printer.name || printer.model || "Unknown Printer",
      model: printer.model,
      serial: printer.serial_number,
      amsDeviceIds,
      mappings,
      unmappedEntities,
    });
  }

  return results;
}

/**
 * Build a sync payload field name → entity_id lookup from mappings.
 */
export function buildFieldToEntityMap(mappings: EntityMapping[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const m of mappings) {
    if (m.status === "ok") {
      map.set(m.field, m.entityId);
    }
  }
  return map;
}

/**
 * Build entity_id → field name lookup (for filtering state_changed events).
 */
export function buildEntityToFieldMap(mappings: EntityMapping[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const m of mappings) {
    if (m.status === "ok") {
      map.set(m.entityId, m.field);
    }
  }
  return map;
}
