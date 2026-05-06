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
    // Full health metrics for admin dashboard
    const health = getHealth();
    return NextResponse.json({
      version: packageJson.version,
      ...health,
    });
  }

  // Simple health check for load balancers / monitoring tools
  const simple = getSimpleHealth();
  const statusCode = simple.status === "error" ? 503 : simple.status === "degraded" ? 200 : 200;
  
  return NextResponse.json(
    {
      status: simple.status,
      version: packageJson.version,
      timestamp: new Date().toISOString(),
      ...(simple.message ? { message: simple.message } : {}),
    },
    { status: statusCode }
  );
}
