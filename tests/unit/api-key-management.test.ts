import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { generateApiKey, verifyApiKey, isKeyExpired, rotateApiKey } from "@/lib/auth";
import { setupTestDb } from "../harness/sqlite-db";
import { db } from "@/lib/db";
import { apiKeys } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

describe("API Key Management", () => {
  beforeAll(async () => {
    await setupTestDb();
  });

  beforeEach(async () => {
    // Clean up api_keys table before each test
    await db.delete(apiKeys).execute();
  });

  describe("generateApiKey", () => {
    it("generates a key with default 90-day expiration", async () => {
      const result = await generateApiKey({
        name: "Test Key",
      });

      expect(result.rawKey).toMatch(/^hspm_[a-f0-9]{64}$/);
      expect(result.keyPrefix).toMatch(/^hspm_[a-f0-9]{7}$/); // First 12 chars total (hspm_ + 7)
      expect(result.keyHash).toBeDefined();
      expect(result.expiresAt).toBeInstanceOf(Date);

      // Should expire in ~90 days
      const daysUntilExpiry = Math.ceil(
        (result.expiresAt!.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
      );
      expect(daysUntilExpiry).toBeGreaterThanOrEqual(89);
      expect(daysUntilExpiry).toBeLessThanOrEqual(91);
    });

    it("generates a key with custom expiration", async () => {
      const result = await generateApiKey({
        name: "Test Key",
        expiresInDays: 30,
      });

      const daysUntilExpiry = Math.ceil(
        (result.expiresAt!.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
      );
      expect(daysUntilExpiry).toBeGreaterThanOrEqual(29);
      expect(daysUntilExpiry).toBeLessThanOrEqual(31);
    });

    it("generates a never-expiring key", async () => {
      const result = await generateApiKey({
        name: "Test Key",
        expiresInDays: null,
      });

      expect(result.expiresAt).toBeNull();
    });

    it("generates unique keys", async () => {
      const key1 = await generateApiKey({ name: "Key 1" });
      const key2 = await generateApiKey({ name: "Key 2" });

      expect(key1.rawKey).not.toBe(key2.rawKey);
      expect(key1.keyHash).not.toBe(key2.keyHash);
      expect(key1.keyPrefix).not.toBe(key2.keyPrefix);
    });
  });

  describe("verifyApiKey", () => {
    it("accepts valid non-expired key", async () => {
      const keyData = await generateApiKey({
        name: "Test Key",
        expiresInDays: 90,
      });

      await db.insert(apiKeys).values({
        name: "Test Key",
        keyHash: keyData.keyHash,
        keyPrefix: keyData.keyPrefix,
        expiresAt: keyData.expiresAt,
        isActive: true,
      });

      const result = await verifyApiKey(keyData.rawKey);

      expect(result.valid).toBe(true);
      expect(result.name).toBe("Test Key");
      expect(result.keyId).toBeDefined();
    });

    it("rejects key with wrong format", async () => {
      const result = await verifyApiKey("wrong_format_key");

      expect(result.valid).toBe(false);
      expect(result.reason).toBe("Invalid key format");
    });

    it("rejects inactive key", async () => {
      const keyData = await generateApiKey({
        name: "Test Key",
        expiresInDays: 90,
      });

      await db.insert(apiKeys).values({
        name: "Test Key",
        keyHash: keyData.keyHash,
        keyPrefix: keyData.keyPrefix,
        expiresAt: keyData.expiresAt,
        isActive: false, // Inactive
      });

      const result = await verifyApiKey(keyData.rawKey);

      expect(result.valid).toBe(false);
      expect(result.reason).toBe("Invalid or expired key");
    });

    it("rejects expired key", async () => {
      const keyData = await generateApiKey({
        name: "Test Key",
        expiresInDays: 90,
      });

      // Set expiration to yesterday
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      await db.insert(apiKeys).values({
        name: "Test Key",
        keyHash: keyData.keyHash,
        keyPrefix: keyData.keyPrefix,
        expiresAt: yesterday,
        isActive: true,
      });

      const result = await verifyApiKey(keyData.rawKey);

      expect(result.valid).toBe(false);
      expect(result.reason).toBe("Invalid or expired key");
    });

    it("accepts never-expiring key", async () => {
      const keyData = await generateApiKey({
        name: "Test Key",
        expiresInDays: null,
      });

      await db.insert(apiKeys).values({
        name: "Test Key",
        keyHash: keyData.keyHash,
        keyPrefix: keyData.keyPrefix,
        expiresAt: null, // Never expires
        isActive: true,
      });

      const result = await verifyApiKey(keyData.rawKey);

      expect(result.valid).toBe(true);
      expect(result.name).toBe("Test Key");
    });

    it("rejects wrong key", async () => {
      const keyData = await generateApiKey({
        name: "Test Key",
        expiresInDays: 90,
      });

      await db.insert(apiKeys).values({
        name: "Test Key",
        keyHash: keyData.keyHash,
        keyPrefix: keyData.keyPrefix,
        expiresAt: keyData.expiresAt,
        isActive: true,
      });

      const wrongKey = await generateApiKey({ name: "Wrong" });
      const result = await verifyApiKey(wrongKey.rawKey);

      expect(result.valid).toBe(false);
    });

    it("updates lastUsedAt on successful verification", async () => {
      const keyData = await generateApiKey({
        name: "Test Key",
        expiresInDays: 90,
      });

      const [inserted] = await db.insert(apiKeys).values({
        name: "Test Key",
        keyHash: keyData.keyHash,
        keyPrefix: keyData.keyPrefix,
        expiresAt: keyData.expiresAt,
        isActive: true,
      }).returning();

      // Verify key
      await verifyApiKey(keyData.rawKey);

      // Wait a bit for async update
      await new Promise(resolve => setTimeout(resolve, 100));

      // Check lastUsedAt was updated
      const updated = await db.query.apiKeys.findFirst({
        where: eq(apiKeys.id, inserted.id),
      });

      expect(updated?.lastUsedAt).toBeDefined();
      expect(updated?.lastUsedAt).toBeInstanceOf(Date);
    });
  });

  describe("isKeyExpired", () => {
    it("returns false for non-expired key", async () => {
      const keyData = await generateApiKey({
        name: "Test Key",
        expiresInDays: 90,
      });

      const [inserted] = await db.insert(apiKeys).values({
        name: "Test Key",
        keyHash: keyData.keyHash,
        keyPrefix: keyData.keyPrefix,
        expiresAt: keyData.expiresAt,
        isActive: true,
      }).returning();

      const expired = await isKeyExpired(inserted.id);
      expect(expired).toBe(false);
    });

    it("returns true for expired key", async () => {
      const keyData = await generateApiKey({
        name: "Test Key",
        expiresInDays: 90,
      });

      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      const [inserted] = await db.insert(apiKeys).values({
        name: "Test Key",
        keyHash: keyData.keyHash,
        keyPrefix: keyData.keyPrefix,
        expiresAt: yesterday,
        isActive: true,
      }).returning();

      const expired = await isKeyExpired(inserted.id);
      expect(expired).toBe(true);
    });

    it("returns false for never-expiring key", async () => {
      const keyData = await generateApiKey({
        name: "Test Key",
        expiresInDays: null,
      });

      const [inserted] = await db.insert(apiKeys).values({
        name: "Test Key",
        keyHash: keyData.keyHash,
        keyPrefix: keyData.keyPrefix,
        expiresAt: null,
        isActive: true,
      }).returning();

      const expired = await isKeyExpired(inserted.id);
      expect(expired).toBe(false);
    });

    it("returns false for non-existent key", async () => {
      const expired = await isKeyExpired("non-existent-id");
      expect(expired).toBe(false);
    });
  });

  describe("rotateApiKey", () => {
    it("creates new key and deactivates old one", async () => {
      const oldKeyData = await generateApiKey({
        name: "Test Key",
        expiresInDays: 90,
      });

      const [oldKey] = await db.insert(apiKeys).values({
        name: "Test Key",
        keyHash: oldKeyData.keyHash,
        keyPrefix: oldKeyData.keyPrefix,
        expiresAt: oldKeyData.expiresAt,
        isActive: true,
      }).returning();

      const result = await rotateApiKey(oldKey.id, 90);

      expect(result).toBeDefined();
      expect(result!.rawKey).toMatch(/^hspm_[a-f0-9]{64}$/);
      expect(result!.newKeyId).not.toBe(oldKey.id);
      expect(result!.keyPrefix).not.toBe(oldKeyData.keyPrefix);

      // Old key should be inactive
      const oldKeyAfter = await db.query.apiKeys.findFirst({
        where: eq(apiKeys.id, oldKey.id),
      });
      expect(oldKeyAfter?.isActive).toBe(false);

      // New key should be active
      const newKey = await db.query.apiKeys.findFirst({
        where: eq(apiKeys.id, result!.newKeyId),
      });
      expect(newKey?.isActive).toBe(true);
      expect(newKey?.name).toBe("Test Key");
    });

    it("preserves key name", async () => {
      const oldKeyData = await generateApiKey({
        name: "Original Name",
        expiresInDays: 90,
      });

      const [oldKey] = await db.insert(apiKeys).values({
        name: "Original Name",
        keyHash: oldKeyData.keyHash,
        keyPrefix: oldKeyData.keyPrefix,
        expiresAt: oldKeyData.expiresAt,
        isActive: true,
      }).returning();

      const result = await rotateApiKey(oldKey.id, 90);

      const newKey = await db.query.apiKeys.findFirst({
        where: eq(apiKeys.id, result!.newKeyId),
      });

      expect(newKey?.name).toBe("Original Name");
    });

    it("returns null for non-existent key", async () => {
      const result = await rotateApiKey("non-existent-id", 90);
      expect(result).toBeNull();
    });

    it("supports never-expiring rotation", async () => {
      const oldKeyData = await generateApiKey({
        name: "Test Key",
        expiresInDays: 90,
      });

      const [oldKey] = await db.insert(apiKeys).values({
        name: "Test Key",
        keyHash: oldKeyData.keyHash,
        keyPrefix: oldKeyData.keyPrefix,
        expiresAt: oldKeyData.expiresAt,
        isActive: true,
      }).returning();

      const result = await rotateApiKey(oldKey.id, null);

      expect(result!.expiresAt).toBeNull();

      const newKey = await db.query.apiKeys.findFirst({
        where: eq(apiKeys.id, result!.newKeyId),
      });
      expect(newKey?.expiresAt).toBeNull();
    });
  });

  describe("Expiration Edge Cases", () => {
    it("key expiring in 1 second is still valid", async () => {
      const keyData = await generateApiKey({
        name: "Test Key",
        expiresInDays: 90,
      });

      const soonExpires = new Date(Date.now() + 1000); // 1 second from now

      await db.insert(apiKeys).values({
        name: "Test Key",
        keyHash: keyData.keyHash,
        keyPrefix: keyData.keyPrefix,
        expiresAt: soonExpires,
        isActive: true,
      });

      const result = await verifyApiKey(keyData.rawKey);
      expect(result.valid).toBe(true);
    });

    it("key expired 1 second ago is invalid", async () => {
      const keyData = await generateApiKey({
        name: "Test Key",
        expiresInDays: 90,
      });

      const justExpired = new Date(Date.now() - 1000); // 1 second ago

      await db.insert(apiKeys).values({
        name: "Test Key",
        keyHash: keyData.keyHash,
        keyPrefix: keyData.keyPrefix,
        expiresAt: justExpired,
        isActive: true,
      });

      const result = await verifyApiKey(keyData.rawKey);
      expect(result.valid).toBe(false);
    });
  });
});

// Made with Bob
