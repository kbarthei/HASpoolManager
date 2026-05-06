import { NextRequest, NextResponse } from "next/server";
import packageJson from "../../../../package.json";
import { getHealth, getSimpleHealth } from "@/lib/sync-worker-health";

export const dynamic = "force-dynamic";

/**
 * Health check endpoint.
 *
 * Query params:
 * - detailed=true: Return full health metrics (for admin dashboard)
 * - detailed=false (default): Return simple status (for load balancers)
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const detailed = searchParams.get("detailed") === "true";

  if (detailed) {
    // Full health metrics for admin dashboard. Always 200; the body
    // describes degraded / unhealthy states.
    const health = getHealth();
    const simple = getSimpleHealth();
    return NextResponse.json({
      ...health,
      status: simple.status === "error" ? "unhealthy" : simple.status,
      version: packageJson.version,
      timestamp: new Date().toISOString(),
      ...(simple.message ? { message: simple.message } : {}),
    });
  }

  // Simple liveness probe for load balancers / monitoring tools. The web
  // server itself responding is the contract here — sync-worker state
  // belongs behind ?detailed=true. Always 200 unless the process can't
  // even reach this handler.
  return NextResponse.json({
    status: "ok",
    version: packageJson.version,
    timestamp: new Date().toISOString(),
  });
}
