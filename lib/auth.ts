import { NextRequest, NextResponse } from "next/server";
import { compare, hash } from "bcryptjs";
import { randomBytes } from "crypto";
import { db } from "@/lib/db";
import { apiKeys } from "@/lib/db/schema";
import { eq, and, or, isNull, gt, lt, sql } from "drizzle-orm";

const API_KEY_PREFIX = "hspm_";
const BCRYPT_COST = 12;

// Default expiration: 90 days from creation
const DEFAULT_EXPIRATION_DAYS = 90;

export interface ApiKeyOptions {
  name: string;
  expiresInDays?: number | null; // null = never expires
  permissions?: string[];
}

/**
 * Generate a new API key with optional expiration.
 * Returns the raw key (show once to user) and metadata for storage.
 */
export async function generateApiKey(options: ApiKeyOptions): Promise<{
  rawKey: string;
  keyHash: string;
  keyPrefix: string;
  expiresAt: Date | null;
}> {
  const raw = randomBytes(32).toString("hex");
  const rawKey = `${API_KEY_PREFIX}${raw}`;
  const keyHash = await hash(rawKey, BCRYPT_COST);
  const keyPrefix = rawKey.slice(0, 12);
  
  // Calculate expiration date
  let expiresAt: Date | null = null;
  if (options.expiresInDays !== null) {
    const days = options.expiresInDays ?? DEFAULT_EXPIRATION_DAYS;
    expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + days);
  }
  
  return { rawKey, keyHash, keyPrefix, expiresAt };
}

/**
 * Verify an API key token.
 * Checks: prefix format, active status, expiration, hash match.
 */
export async function verifyApiKey(
  token: string
): Promise<{
  valid: boolean;
  keyId?: string;
  name?: string;
  reason?: string; // Why validation failed
}> {
  if (!token.startsWith(API_KEY_PREFIX)) {
    return { valid: false, reason: "Invalid key format" };
  }

  // Only fetch active keys that haven't expired
  const now = new Date();
  const keys = await db
    .select()
    .from(apiKeys)
    .where(
      and(
        eq(apiKeys.isActive, true),
        or(
          isNull(apiKeys.expiresAt),
          gt(apiKeys.expiresAt, now)
        )
      )
    );

  for (const key of keys) {
    const matches = await compare(token, key.keyHash);
    if (matches) {
      // Double-check expiration (defense in depth)
      if (key.expiresAt && key.expiresAt < now) {
        return { valid: false, reason: "Key expired" };
      }

      // Update last used timestamp (fire and forget)
      db.update(apiKeys)
        .set({ lastUsedAt: new Date() })
        .where(eq(apiKeys.id, key.id))
        .execute()
        .catch(() => {});

      return { valid: true, keyId: key.id, name: key.name };
    }
  }

  return { valid: false, reason: "Invalid or expired key" };
}

/**
 * Check if an API key is expired.
 * Used for cleanup and reporting.
 */
export async function isKeyExpired(keyId: string): Promise<boolean> {
  const key = await db.query.apiKeys.findFirst({
    where: eq(apiKeys.id, keyId),
  });

  if (!key || !key.expiresAt) return false;
  return key.expiresAt < new Date();
}

/**
 * Get all expired API keys.
 * Used for cleanup operations.
 */
export async function getExpiredKeys(): Promise<Array<{
  id: string;
  name: string;
  keyPrefix: string;
  expiresAt: Date;
  lastUsedAt: Date | null;
}>> {
  const now = new Date();
  const expired = await db
    .select({
      id: apiKeys.id,
      name: apiKeys.name,
      keyPrefix: apiKeys.keyPrefix,
      expiresAt: apiKeys.expiresAt,
      lastUsedAt: apiKeys.lastUsedAt,
    })
    .from(apiKeys)
    .where(
      and(
        eq(apiKeys.isActive, true),
        lt(apiKeys.expiresAt, now)
      )
    );

  return expired.filter((k): k is typeof expired[number] & { expiresAt: Date } =>
    k.expiresAt !== null
  );
}

/**
 * Deactivate expired API keys.
 * Returns count of keys deactivated.
 */
export async function deactivateExpiredKeys(): Promise<number> {
  const now = new Date();
  const result = await db
    .update(apiKeys)
    .set({ isActive: false })
    .where(
      and(
        eq(apiKeys.isActive, true),
        lt(apiKeys.expiresAt, now)
      )
    );

  return result.changes;
}

/**
 * Rotate an API key: deactivate old, create new with same name/permissions.
 * Returns the new raw key (show once to user).
 */
export async function rotateApiKey(
  oldKeyId: string,
  expiresInDays?: number | null
): Promise<{
  rawKey: string;
  newKeyId: string;
  keyPrefix: string;
  expiresAt: Date | null;
} | null> {
  const oldKey = await db.query.apiKeys.findFirst({
    where: eq(apiKeys.id, oldKeyId),
  });

  if (!oldKey) return null;

  // Generate new key with same name
  const newKeyData = await generateApiKey({
    name: oldKey.name,
    expiresInDays,
    permissions: oldKey.permissions as string[] | undefined,
  });

  // Insert new key
  const [newKey] = await db
    .insert(apiKeys)
    .values({
      name: oldKey.name,
      keyHash: newKeyData.keyHash,
      keyPrefix: newKeyData.keyPrefix,
      permissions: oldKey.permissions,
      expiresAt: newKeyData.expiresAt,
      isActive: true,
    })
    .returning({ id: apiKeys.id });

  // Deactivate old key
  await db
    .update(apiKeys)
    .set({ isActive: false })
    .where(eq(apiKeys.id, oldKeyId));

  return {
    rawKey: newKeyData.rawKey,
    newKeyId: newKey.id,
    keyPrefix: newKeyData.keyPrefix,
    expiresAt: newKeyData.expiresAt,
  };
}

export type AuthResult =
  | { authenticated: true; keyId: string; name: string }
  | { authenticated: false; response: NextResponse };

/**
 * Allow unauthenticated GET requests from the web UI.
 * Still authenticates if a Bearer token is provided.
 */
export async function optionalAuth(request: NextRequest): Promise<AuthResult> {
  const authHeader = request.headers.get("authorization");
  if (!authHeader) {
    return { authenticated: true, keyId: "web-ui", name: "web-ui" };
  }
  return requireAuth(request);
}

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
