import { NextRequest, NextResponse } from "next/server";
import { optionalAuth, requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { settings } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/settings/energy
 *
 * Returns energy tracking settings (sensor entity ID, price per kWh).
 */
export async function GET(request: NextRequest) {
  const auth = await optionalAuth(request);
  if (!auth.authenticated) return auth.response;

  const [entityRow, priceRow] = await Promise.all([
    db.query.settings.findFirst({ where: eq(settings.key, "energy_sensor_entity_id") }),
    db.query.settings.findFirst({ where: eq(settings.key, "electricity_price_per_kwh") }),
  ]);

  return NextResponse.json({
    energy_sensor_entity_id: entityRow?.value ?? null,
    electricity_price_per_kwh: priceRow?.value ? parseFloat(priceRow.value) : null,
  });
}

/**
 * PUT /api/v1/settings/energy
 *
 * Update energy tracking settings.
 */
export async function PUT(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!auth.authenticated) return auth.response;

  const body = await request.json();
  const { energy_sensor_entity_id, electricity_price_per_kwh } = body;

  const upsert = async (key: string, value: string | null) => {
    if (value === null || value === undefined || value === "") {
      await db.delete(settings).where(eq(settings.key, key));
    } else {
      const existing = await db.query.settings.findFirst({ where: eq(settings.key, key) });
      if (existing) {
        await db.update(settings).set({ value: String(value), updatedAt: new Date() }).where(eq(settings.key, key));
      } else {
        await db.insert(settings).values({ key, value: String(value) });
      }
    }
  };

  if (energy_sensor_entity_id !== undefined) {
    await upsert("energy_sensor_entity_id", energy_sensor_entity_id);
  }
  if (electricity_price_per_kwh !== undefined) {
    await upsert("electricity_price_per_kwh", electricity_price_per_kwh);
  }

  return NextResponse.json({ ok: true });
}
