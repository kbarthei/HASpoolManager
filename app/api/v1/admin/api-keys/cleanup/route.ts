// docs-coverage: ignore — admin API-key cleanup, /admin UI only
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, getExpiredKeys, deactivateExpiredKeys } from "@/lib/auth";

/**
 * GET /api/v1/admin/api-keys/cleanup
 * List expired API keys
 */
export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!auth.authenticated) return auth.response;

  try {
    const expired = await getExpiredKeys();

    return NextResponse.json({ 
      count: expired.length,
      keys: expired 
    });
  } catch (error) {
    console.error("GET /api/v1/admin/api-keys/cleanup error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * POST /api/v1/admin/api-keys/cleanup
 * Deactivate all expired API keys
 */
export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!auth.authenticated) return auth.response;

  try {
    const count = await deactivateExpiredKeys();

    console.log(`[api-keys] Deactivated ${count} expired key(s) by ${auth.name}`);

    return NextResponse.json({ 
      deactivated: count,
      message: `Deactivated ${count} expired key${count === 1 ? '' : 's'}`
    });
  } catch (error) {
    console.error("POST /api/v1/admin/api-keys/cleanup error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// Made with Bob
