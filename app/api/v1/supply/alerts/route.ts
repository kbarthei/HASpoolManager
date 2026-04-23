import { NextRequest, NextResponse } from "next/server";
import { optionalAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { supplyAlerts } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await optionalAuth(request);
  if (!auth.authenticated) return auth.response;

  const alerts = await db.query.supplyAlerts.findMany({
    where: eq(supplyAlerts.status, "active"),
    orderBy: [desc(supplyAlerts.createdAt)],
    with: {
      filament: { with: { vendor: true } },
    },
  });

  return NextResponse.json(alerts);
}
