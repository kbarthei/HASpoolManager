import { NextRequest, NextResponse } from "next/server";
import { compare, hash } from "bcryptjs";
import { randomBytes } from "crypto";
import { db } from "@/lib/db";
import { apiKeys } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

const API_KEY_PREFIX = "hspm_";
const BCRYPT_COST = 12;

export async function generateApiKey(): Promise<{
  rawKey: string;
  keyHash: string;
  keyPrefix: string;
}> {
  const raw = randomBytes(32).toString("hex");
  const rawKey = `${API_KEY_PREFIX}${raw}`;
  const keyHash = await hash(rawKey, BCRYPT_COST);
  const keyPrefix = rawKey.slice(0, 12);
  return { rawKey, keyHash, keyPrefix };
}

export async function verifyApiKey(
  token: string
): Promise<{ valid: boolean; keyId?: string; name?: string }> {
  if (!token.startsWith(API_KEY_PREFIX)) {
    return { valid: false };
  }

  const keys = await db
    .select()
    .from(apiKeys)
    .where(eq(apiKeys.isActive, true));

  for (const key of keys) {
    const matches = await compare(token, key.keyHash);
    if (matches) {
      // Update last used timestamp (fire and forget)
      db.update(apiKeys)
        .set({ lastUsedAt: new Date() })
        .where(eq(apiKeys.id, key.id))
        .execute()
        .catch(() => {});

      return { valid: true, keyId: key.id, name: key.name };
    }
  }

  return { valid: false };
}

export type AuthResult =
  | { authenticated: true; keyId: string; name: string }
  | { authenticated: false; response: NextResponse };

export async function requireAuth(request: NextRequest): Promise<AuthResult> {
  // Also allow simple password auth via env var (for web UI)
  const envSecret = process.env.API_SECRET_KEY;

  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return {
      authenticated: false,
      response: NextResponse.json(
        { error: "Missing Authorization header" },
        { status: 401 }
      ),
    };
  }

  const token = authHeader.slice(7);

  // Check env-based secret first (fast path for HA integration)
  if (envSecret && token === envSecret) {
    return { authenticated: true, keyId: "env", name: "env-secret" };
  }

  // Check database API keys
  const result = await verifyApiKey(token);
  if (result.valid) {
    return {
      authenticated: true,
      keyId: result.keyId!,
      name: result.name!,
    };
  }

  return {
    authenticated: false,
    response: NextResponse.json({ error: "Invalid API key" }, { status: 401 }),
  };
}
