import { describe, it, expect, vi } from "vitest";
import { captureCover, makeGetCoverStateFromHA } from "@/lib/cover-capture";
import { hasCoverPhoto } from "@/lib/photo-manager";

const realJpeg = Buffer.alloc(8192, 0xff); // 8KB above MIN_COVER_BYTES
const tinyPlaceholder = Buffer.alloc(512, 0xff); // below MIN_COVER_BYTES

const mockSavePhoto = vi.fn(async (printId: string, _buffer: Buffer, ext: string) => ({
  path: `${printId}/cover-test.${ext}`,
}));

describe("captureCover", () => {
  it("returns ok and saves when state has entity_picture and HA returns image bytes", async () => {
    mockSavePhoto.mockClear();
    const result = await captureCover("p1", {
      getCoverState: async () => ({ entityPicture: "/api/image_proxy/image.x?token=abc" }),
      fetchImage: async () => ({ ok: true as const, buffer: realJpeg }),
      savePhoto: mockSavePhoto,
    });
    expect(result.ok).toBe(true);
    expect(result.savedPath).toBe("p1/cover-test.jpg");
    expect(result.bytes).toBe(realJpeg.byteLength);
    expect(mockSavePhoto).toHaveBeenCalledWith("p1", realJpeg, "jpg");
  });

  it("fails cleanly when entity is missing — does not save", async () => {
    mockSavePhoto.mockClear();
    const result = await captureCover("p2", {
      getCoverState: async () => null,
      fetchImage: async () => ({ ok: true as const, buffer: realJpeg }),
      savePhoto: mockSavePhoto,
    });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/not found/);
    expect(mockSavePhoto).not.toHaveBeenCalled();
  });

  it("fails cleanly when entity_picture attribute is missing (state not ready)", async () => {
    mockSavePhoto.mockClear();
    const result = await captureCover("p3", {
      getCoverState: async () => ({ entityPicture: null }),
      fetchImage: async () => ({ ok: true as const, buffer: realJpeg }),
      savePhoto: mockSavePhoto,
    });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/entity_picture/);
    expect(mockSavePhoto).not.toHaveBeenCalled();
  });

  it("fails when image_proxy returns 500 (Bambu hasn't pushed cover yet) — race condition path", async () => {
    mockSavePhoto.mockClear();
    const result = await captureCover("p4", {
      getCoverState: async () => ({ entityPicture: "/api/image_proxy/image.x?token=abc" }),
      fetchImage: async () => ({ ok: false as const, status: 500, statusText: "Internal Server Error" }),
      savePhoto: mockSavePhoto,
    });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/500/);
    expect(result.error).toMatch(/Bambu/);
    expect(mockSavePhoto).not.toHaveBeenCalled();
  });

  it("rejects tiny placeholder images (< MIN_COVER_BYTES) so we don't save garbage", async () => {
    mockSavePhoto.mockClear();
    const result = await captureCover("p5", {
      getCoverState: async () => ({ entityPicture: "/api/image_proxy/image.x?token=abc" }),
      fetchImage: async () => ({ ok: true as const, buffer: tinyPlaceholder }),
      savePhoto: mockSavePhoto,
    });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/too small/);
    expect(result.bytes).toBe(tinyPlaceholder.byteLength);
    expect(mockSavePhoto).not.toHaveBeenCalled();
  });
});

describe("hasCoverPhoto (idempotency guard)", () => {
  it("returns false for null/empty/invalid JSON", () => {
    expect(hasCoverPhoto(null)).toBe(false);
    expect(hasCoverPhoto("")).toBe(false);
    expect(hasCoverPhoto("not json")).toBe(false);
    expect(hasCoverPhoto("{}")).toBe(false);
  });

  it("returns true when at least one entry has kind=cover", () => {
    expect(
      hasCoverPhoto(
        JSON.stringify([
          { path: "p1/cover-x.jpg", kind: "cover", captured_at: null },
          { path: "p1/snap.jpg", kind: "snapshot", captured_at: null },
        ]),
      ),
    ).toBe(true);
  });

  it("returns false when only snapshot/user entries exist", () => {
    expect(
      hasCoverPhoto(
        JSON.stringify([
          { path: "p1/snap.jpg", kind: "snapshot", captured_at: null },
          { path: "p1/user.jpg", kind: "user", captured_at: null },
        ]),
      ),
    ).toBe(false);
  });
});

describe("makeGetCoverStateFromHA", () => {
  it("extracts entity_picture from HA state map", async () => {
    const getCoverState = makeGetCoverStateFromHA(
      "image.h2s_titelbild",
      async () =>
        new Map([
          [
            "image.h2s_titelbild",
            { state: "2026-04-26T20:00:00Z", attributes: { entity_picture: "/api/image_proxy/image.h2s_titelbild?token=xyz" } },
          ],
        ]),
    );
    const state = await getCoverState();
    expect(state).toEqual({ entityPicture: "/api/image_proxy/image.h2s_titelbild?token=xyz" });
  });

  it("returns null when entity is not in HA states (not yet discovered)", async () => {
    const getCoverState = makeGetCoverStateFromHA(
      "image.h2s_titelbild",
      async () => new Map(),
    );
    expect(await getCoverState()).toBeNull();
  });

  it("returns entityPicture: null when state exists but attribute is missing", async () => {
    const getCoverState = makeGetCoverStateFromHA(
      "image.h2s_titelbild",
      async () =>
        new Map([
          ["image.h2s_titelbild", { state: "unknown", attributes: {} }],
        ]),
    );
    expect(await getCoverState()).toEqual({ entityPicture: null });
  });
});
