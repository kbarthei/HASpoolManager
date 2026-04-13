import { NextRequest, NextResponse } from "next/server";
import { optionalAuth } from "@/lib/auth";

/**
 * GET /api/v1/admin/ams-drying
 *
 * Returns live AMS drying status from HA entities.
 * Only available when running as HA addon with SUPERVISOR_TOKEN.
 */
export async function GET(request: NextRequest) {
  const auth = await optionalAuth(request);
  if (!auth.authenticated) return auth.response;

  const token = process.env.SUPERVISOR_TOKEN;
  if (!token) {
    return NextResponse.json({ available: false, units: [] });
  }

  try {
    const { getEntityStates } = await import("@/lib/ha-api");

    // Find all drying-related entities by checking known patterns
    // binary_sensor.*_trocknen / *_drying → is drying active
    // sensor.*_verbleibende_trocknungszeit / *_remaining_drying_time → hours remaining
    const { HAWebSocketClient } = await import("@/lib/ha-websocket");
    const { discoverPrinters } = await import("@/lib/ha-discovery");

    const ws = new HAWebSocketClient();
    await ws.connect();
    const [entities] = await Promise.all([ws.listEntityRegistry()]);
    ws.destroy();

    // Find drying entities
    const dryingEntities = entities.filter(
      (e) =>
        e.platform === "bambu_lab" &&
        !e.disabled_by &&
        (e.original_name === "Trocknen" ||
          e.original_name === "Drying" ||
          e.original_name === "Verbleibende Trocknungszeit" ||
          e.original_name === "Remaining Drying Time"),
    );

    if (dryingEntities.length === 0) {
      return NextResponse.json({ available: true, units: [] });
    }

    const entityIds = dryingEntities.map((e) => e.entity_id);
    const states = await getEntityStates(entityIds);

    // Group by device (AMS unit)
    const unitMap = new Map<string, { name: string; isDrying: boolean; remainingHours: number }>();

    for (const entity of dryingEntities) {
      const deviceId = entity.device_id || "unknown";
      if (!unitMap.has(deviceId)) {
        // Extract AMS name from entity_id (e.g., h2s_ams_1 or h2s_ams_ht_1)
        const match = entity.entity_id.match(/(ams(?:_ht)?_\d+)/);
        unitMap.set(deviceId, {
          name: match ? match[1].replace(/_/g, " ").toUpperCase() : "AMS",
          isDrying: false,
          remainingHours: 0,
        });
      }

      const unit = unitMap.get(deviceId)!;
      const state = states.get(entity.entity_id);
      if (!state) continue;

      if (entity.original_name === "Trocknen" || entity.original_name === "Drying") {
        unit.isDrying = state.state === "on";
      }
      if (
        entity.original_name === "Verbleibende Trocknungszeit" ||
        entity.original_name === "Remaining Drying Time"
      ) {
        unit.remainingHours = parseFloat(state.state) || 0;
      }
    }

    return NextResponse.json({
      available: true,
      units: Array.from(unitMap.values()),
    });
  } catch {
    return NextResponse.json({
      available: false,
      units: [],
    });
  }
}
