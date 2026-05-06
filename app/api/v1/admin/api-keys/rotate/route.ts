import { NextRequest, NextResponse } from "next/server";
import { requireAuth, rotateApiKey } from "@/lib/auth";

/**
 * POST /api/v1/admin/api-keys/rotate
 * Rotate an API key: deactivate old, create new with same name
 * 
 * Body: {
 *   keyId: string,
 *   expiresInDays?: number | null  // null = never expires, default = 90
 * }
 */
export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!auth.authenticated) return auth.response;

  try {
    const body = await request.json();
    
    if (!body.keyId || typeof body.keyId !== "string") {
      return NextResponse.json({ error: "keyId is required" }, { status: 400 });
    }

    const expiresInDays = body.expiresInDays === null 
      ? null 
      : (typeof body.expiresInDays === "number" ? body.expiresInDays : 90);

    const result = await rotateApiKey(body.keyId, expiresInDays);

    if (!result) {
      return NextResponse.json({ error: "Key not found" }, { status: 404 });
    }

    console.log(`[api-keys] Rotated key ${body.keyId} by ${auth.name}`);

    return NextResponse.json({
      oldKeyId: body.keyId,
      newKeyId: result.newKeyId,
      keyPrefix: result.keyPrefix,
      expiresAt: result.expiresAt,
      rawKey: result.rawKey, // Show once - user must save it
      warning: "Save this key now - it will not be shown again. The old key has been deactivated.",
    });
  } catch (error) {
    console.error("POST /api/v1/admin/api-keys/rotate error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// Made with Bob
