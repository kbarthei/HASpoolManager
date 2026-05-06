import { NextRequest, NextResponse } from "next/server";
import { requireAuth, generateApiKey, getExpiredKeys, deactivateExpiredKeys } from "@/lib/auth";
import { db } from "@/lib/db";
import { apiKeys } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

/**
 * GET /api/v1/admin/api-keys
 * List all API keys (without hashes)
 */
export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!auth.authenticated) return auth.response;

  try {
    const keys = await db
      .select({
        id: apiKeys.id,
        name: apiKeys.name,
        keyPrefix: apiKeys.keyPrefix,
        isActive: apiKeys.isActive,
        expiresAt: apiKeys.expiresAt,
        lastUsedAt: apiKeys.lastUsedAt,
        createdAt: apiKeys.createdAt,
      })
      .from(apiKeys)
      .orderBy(apiKeys.createdAt);

    // Check for expired keys
    const now = new Date();
    const keysWithStatus = keys.map(key => ({
      ...key,
      isExpired: key.expiresAt ? key.expiresAt < now : false,
      daysUntilExpiry: key.expiresAt 
        ? Math.ceil((key.expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
        : null,
    }));

    return NextResponse.json({ keys: keysWithStatus });
  } catch (error) {
    console.error("GET /api/v1/admin/api-keys error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * POST /api/v1/admin/api-keys
 * Create a new API key
 * 
 * Body: {
 *   name: string,
 *   expiresInDays?: number | null  // null = never expires, default = 90
 * }
 */
export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!auth.authenticated) return auth.response;

  try {
    const body = await request.json();
    
    if (!body.name || typeof body.name !== "string") {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }

    const expiresInDays = body.expiresInDays === null 
      ? null 
      : (typeof body.expiresInDays === "number" ? body.expiresInDays : 90);

    const keyData = await generateApiKey({
      name: body.name,
      expiresInDays,
    });

    const [newKey] = await db
      .insert(apiKeys)
      .values({
        name: body.name,
        keyHash: keyData.keyHash,
        keyPrefix: keyData.keyPrefix,
        expiresAt: keyData.expiresAt,
        isActive: true,
      })
      .returning({
        id: apiKeys.id,
        name: apiKeys.name,
        keyPrefix: apiKeys.keyPrefix,
        expiresAt: apiKeys.expiresAt,
        createdAt: apiKeys.createdAt,
      });

    console.log(`[api-keys] Created key "${body.name}" by ${auth.name}`);

    return NextResponse.json({
      key: newKey,
      rawKey: keyData.rawKey, // Show once - user must save it
      warning: "Save this key now - it will not be shown again",
    }, { status: 201 });
  } catch (error) {
    console.error("POST /api/v1/admin/api-keys error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * DELETE /api/v1/admin/api-keys?id=<key-id>
 * Deactivate an API key
 */
export async function DELETE(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!auth.authenticated) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const keyId = searchParams.get("id");

    if (!keyId) {
      return NextResponse.json({ error: "id parameter required" }, { status: 400 });
    }

    const result = await db
      .update(apiKeys)
      .set({ isActive: false })
      .where(eq(apiKeys.id, keyId));

    if (result.changes === 0) {
      return NextResponse.json({ error: "Key not found" }, { status: 404 });
    }

    console.log(`[api-keys] Deactivated key ${keyId} by ${auth.name}`);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/v1/admin/api-keys error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// Made with Bob
