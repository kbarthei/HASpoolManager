import { NextRequest, NextResponse } from "next/server";
import { optionalAuth } from "@/lib/auth";
import { checkConnection } from "@/lib/ha-api";

/**
 * GET /api/v1/admin/printer-mappings
 *
 * Returns the current entity mapping state for all discovered printers.
 * Runs discovery against the HA entity + device registry on each call.
 * Only available when running as HA addon with SUPERVISOR_TOKEN.
 */
export async function GET(request: NextRequest) {
  const auth = await optionalAuth(request);
  if (!auth.authenticated) return auth.response;

  // Check if we're running as addon with HA API access
  const token = process.env.SUPERVISOR_TOKEN;
  if (!token) {
    return NextResponse.json({
      available: false,
      reason: "Not running as HA addon (no SUPERVISOR_TOKEN)",
      printers: [],
    });
  }

  try {
    // Check HA connectivity
    const conn = await checkConnection();
    if (!conn.ok) {
      return NextResponse.json({
        available: false,
        reason: `HA API not reachable: ${conn.error}`,
        printers: [],
      });
    }

    // Run discovery via websocket
    const { HAWebSocketClient } = await import("@/lib/ha-websocket");
    const { discoverPrinters } = await import("@/lib/ha-discovery");
    const { db } = await import("@/lib/db");
    const { printers } = await import("@/lib/db/schema");
    const { eq } = await import("drizzle-orm");

    const ws = new HAWebSocketClient();
    await ws.connect();

    const [entities, devices] = await Promise.all([
      ws.listEntityRegistry(),
      ws.listDeviceRegistry(),
    ]);

    ws.destroy();

    const discovered = discoverPrinters(entities, devices);

    // Match discovered printers to DB records
    const dbPrinters = await db.query.printers.findMany();

    const result = discovered.map((p) => {
      const dbMatch = dbPrinters.find(
        (db) =>
          db.model?.includes(p.model || "") ||
          db.name?.includes(p.model || "") ||
          p.name.includes(db.name),
      );

      return {
        deviceId: p.deviceId,
        name: p.name,
        model: p.model,
        serial: p.serial,
        dbPrinterId: dbMatch?.id ?? null,
        dbPrinterName: dbMatch?.name ?? null,
        mappings: p.mappings.map((m) => ({
          field: m.field,
          entityId: m.entityId,
          originalName: m.originalName,
          source: m.source,
          status: m.status,
        })),
        unmappedCount: p.unmappedEntities.length,
        allEntities: [...p.mappings.map(m => ({ entityId: m.entityId, originalName: m.originalName })), ...p.unmappedEntities],
      };
    });

    return NextResponse.json({
      available: true,
      printers: result,
    });
  } catch (error) {
    console.error("GET /api/v1/admin/printer-mappings error:", error);
    return NextResponse.json(
      {
        available: false,
        reason: `Discovery error: ${(error as Error).message}`,
        printers: [],
      },
      { status: 500 },
    );
  }
}

/**
 * POST /api/v1/admin/printer-mappings
 *
 * Save a manual entity mapping override.
 * Body: { deviceId, field, entityId }
 */
export async function POST(request: NextRequest) {
  const auth = await optionalAuth(request);
  if (!auth.authenticated) return auth.response;

  try {
    const body = await request.json();
    const { deviceId, field, entityId } = body;

    if (!deviceId || !field || !entityId) {
      return NextResponse.json({ error: "deviceId, field, and entityId required" }, { status: 400 });
    }

    const { db } = await import("@/lib/db");
    const { settings } = await import("@/lib/db/schema");
    const { eq } = await import("drizzle-orm");

    // Load existing overrides
    const existing = await db.query.settings.findFirst({
      where: eq(settings.key, "entity_mapping_overrides"),
    });

    let overrides: Record<string, Record<string, string>> = {};
    if (existing?.value) {
      try { overrides = JSON.parse(existing.value); } catch { /* ignore */ }
    }

    // Set override: overrides[deviceId][field] = entityId
    if (!overrides[deviceId]) overrides[deviceId] = {};
    overrides[deviceId][field] = entityId;

    // Save
    const json = JSON.stringify(overrides);
    if (existing) {
      await db.update(settings).set({ value: json, updatedAt: new Date() }).where(eq(settings.key, "entity_mapping_overrides"));
    } else {
      await db.insert(settings).values({ key: "entity_mapping_overrides", value: json });
    }

    return NextResponse.json({ ok: true, overrides: overrides[deviceId] });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
