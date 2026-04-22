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

// Map by entity_id suffix pattern — more stable than original_name which
// is localized (German "Druckstatus" instead of English "Print Status").
// The entity_id is derived from the integration's English key + device prefix.
// e.g., sensor.h2s_druckstatus → suffix "druckstatus" — but even this is
// localized. Instead, we match by the integration's internal translation key
// which appears in the entity_id after the device prefix.
//
// Approach: match original_name (may be localized) against both English AND
// German variants, plus common entity_id suffix patterns.

const ENTITY_NAME_MAP: Record<string, string> = {
  // English original_names (non-localized HA installs)
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
  // Drying status (per AMS unit)
  "Drying": "ams_drying",
  "Remaining Drying Time": "ams_drying_remaining",
  // Cover image (3D model preview from slicer)
  "Cover Image": "cover_image",
  "Titelbild": "cover_image",
  // Camera
  "Camera": "camera",
  "Kamera": "camera",
  // German original_names (localized HA installs)
  "Trocknen": "ams_drying",
  "Verbleibende Trocknungszeit": "ams_drying_remaining",
  "Druckstatus": "gcode_state",
  "Aktueller Arbeitsschritt": "print_state",
  "Name der Aufgabe": "print_name",
  "Druckfehler": "print_error",
  "Druckfortschritt": "print_progress",
  "Gewicht des Drucks": "print_weight",
  "Gesamtzahl der Schichten": "print_layers_total",
  "Aktuelle Schicht": "print_layers_current",
  "Verbleibende Zeit": "print_remaining_time",
  "Aktiver Slot": "active_slot",
  "Externe Spule": "slot_ext",
  // HMS errors (binary_sensor)
  "HMS Errors": "hms_errors",
  "HMS-Fehler": "hms_errors",
};

// Tray entities: original_name is "Tray N" (English) or "Slot N" (German)
const TRAY_NAMES_EN = ["Tray 1", "Tray 2", "Tray 3", "Tray 4"] as const;
const TRAY_NAMES_DE = ["Slot 1", "Slot 2", "Slot 3", "Slot 4"] as const;

// ── Types ────────────────────────────────────────────────────────────────────

export interface EntityMapping {
  entityId: string;
  field: string;
  originalName: string;
  source: "auto" | "manual";
  status: "ok" | "missing" | "unknown";
}

export interface DiscoveredAmsDevice {
  id: string;
  model: string; // lower-cased; "ams", "ams ht", "ams lite", etc.
  name: string;
}

export interface DiscoveredPrinter {
  deviceId: string;
  name: string;
  model: string | null;
  serial: string | null;
  /** @deprecated kept for back-compat — prefer amsDevices which carries model info */
  amsDeviceIds: string[];
  amsDevices: DiscoveredAmsDevice[];
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
    // Find related AMS devices. They share the printer's device name as prefix:
    // e.g., printer "H2S_0938DC5A2501105", AMS "H2S_0938DC5A2501105_AMS_1",
    // AMS HT "H2S_0938DC5A2501105_AMS_128", External "H2S_0938DC5A2501105_ExternalSpool"
    const printerName = printer.name || "";
    const relatedDevices = bambuDevices.filter((d) => {
      if (d.id === printer.id) return false;
      return d.name?.startsWith(printerName) ?? false;
    });

    const amsDeviceIds = relatedDevices.map((d) => d.id);
    // Rich AMS device info (excludes External Spool — not an AMS unit)
    const amsDevices: DiscoveredAmsDevice[] = relatedDevices
      .filter((d) => {
        const m = (d.model || "").toLowerCase();
        return m.startsWith("ams") && m !== "external spool";
      })
      .map((d) => ({
        id: d.id,
        model: (d.model || "").toLowerCase(),
        name: d.name || "",
      }));
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

      // Check direct map (non-tray entities) — supports multiple languages
      if (ENTITY_NAME_MAP[origName]) {
        mappings.push({
          entityId: entity.entity_id,
          field: ENTITY_NAME_MAP[origName],
          originalName: origName,
          source: "auto",
          status: "ok",
        });
        mappedEntityIds.add(entity.entity_id);
        continue;
      }

      // Check tray entities — need to disambiguate AMS vs AMS HT
      // Support both English ("Tray 1") and German ("Slot 1")
      let trayIndex = TRAY_NAMES_EN.indexOf(origName as typeof TRAY_NAMES_EN[number]);
      if (trayIndex < 0) trayIndex = TRAY_NAMES_DE.indexOf(origName as typeof TRAY_NAMES_DE[number]);
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
      amsDevices,
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
