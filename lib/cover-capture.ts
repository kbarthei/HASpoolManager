/**
 * Cover-image capture from HA's image proxy.
 *
 * Why this exists:
 * Bambu's HA integration emits `event_print_started` BEFORE it has uploaded
 * the new model preview to its `image.<printer>_titelbild` entity. A direct
 * fetch at print-start time gets a 500 from `/api/image_proxy/` because the
 * image backend has no payload yet. The cover usually shows up 30s–15min
 * later. This module is the single source of truth for "fetch the cover
 * from HA and save it to the print" — used by:
 *
 *   1. sync-worker `event_print_started` handler (best-effort first try)
 *   2. sync-worker `state_changed` handler for `cover_image` (the real path —
 *      fires when Bambu finally pushes the cover, no race)
 *   3. `captureCoverNowAction` Server Action (manual button in the UI)
 *   4. `POST /api/v1/admin/capture-cover` (HTTP wrapper)
 *
 * The function is intentionally pure-ish: it takes a `getCoverState` callback
 * and a `fetchImage` callback so tests can substitute mocks without a
 * Supervisor or HA core running.
 */

import { replaceCoverPhoto, savePhoto } from "./photo-manager";

export interface CoverCaptureResult {
  ok: boolean;
  error?: string;
  savedPath?: string;
  bytes?: number;
}

export interface CoverCaptureDeps {
  /** Resolve current state of the image entity. Returns null if unknown. */
  getCoverState: () => Promise<{ entityPicture: string | null } | null>;
  /** Fetch the image bytes from HA's image_proxy. Returns Buffer or error. */
  fetchImage: (entityPicture: string) => Promise<{ ok: true; buffer: Buffer } | { ok: false; status: number; statusText: string }>;
  /** Persist the cover photo to disk + DB. Returns saved relative path. */
  savePhoto?: (printId: string, buffer: Buffer, ext: string) => Promise<{ path: string }>;
  /**
   * What to do if a cover already exists.
   *  - "append" (default): just write a new file (the auto path's
   *    hasCoverPhoto guard means we never get here in practice).
   *  - "replace": delete any previous cover for this print before saving.
   *    Use from the manual button — the user clicked it on purpose, so they
   *    want a fresh image, not a duplicate.
   */
  onExisting?: "append" | "replace";
}

/** Image_proxy returns ~1KB JPEG placeholder when Bambu hasn't uploaded yet.
 *  A real cover is ≥5KB. Reject anything smaller as "not ready yet". */
const MIN_COVER_BYTES = 2048;

export async function captureCover(
  printId: string,
  deps: CoverCaptureDeps,
): Promise<CoverCaptureResult> {
  const state = await deps.getCoverState();
  if (!state) {
    return { ok: false, error: "Cover image entity not found in HA" };
  }
  if (!state.entityPicture) {
    return { ok: false, error: "Cover image entity has no entity_picture attribute (not ready yet)" };
  }

  const result = await deps.fetchImage(state.entityPicture);
  if (!result.ok) {
    return {
      ok: false,
      error: `HA image_proxy returned ${result.status} ${result.statusText} (Bambu likely hasn't pushed the cover yet)`,
    };
  }

  const bytes = result.buffer.byteLength;
  if (bytes < MIN_COVER_BYTES) {
    return {
      ok: false,
      bytes,
      error: `Cover image too small (${bytes}B < ${MIN_COVER_BYTES}B) — Bambu placeholder, not the real preview`,
    };
  }

  const saver = deps.savePhoto ?? (deps.onExisting === "replace" ? defaultReplaceCover : defaultSavePhoto);
  const saved = await saver(printId, result.buffer, "jpg");
  return { ok: true, savedPath: saved.path, bytes };
}

async function defaultSavePhoto(printId: string, buffer: Buffer, ext: string) {
  return savePhoto(printId, buffer, "cover", ext);
}

async function defaultReplaceCover(printId: string, buffer: Buffer, ext: string) {
  return replaceCoverPhoto(printId, buffer, ext);
}

/** Build a real `getCoverState` that reads HA via `getEntityStates`. */
export function makeGetCoverStateFromHA(
  coverEntityId: string,
  getEntityStates: (ids: string[]) => Promise<Map<string, { state: string; attributes: Record<string, unknown> }>>,
): CoverCaptureDeps["getCoverState"] {
  return async () => {
    const states = await getEntityStates([coverEntityId]);
    const s = states.get(coverEntityId);
    if (!s) return null;
    const ep = s.attributes?.entity_picture;
    return { entityPicture: typeof ep === "string" ? ep : null };
  };
}

/** Build a real `fetchImage` that hits the addon's Supervisor proxy.
 *  Both Bearer (Supervisor identity) AND the URL token (HA core auth) are
 *  required — only one yields 401. */
export function makeFetchImageViaSupervisor(supervisorToken: string): CoverCaptureDeps["fetchImage"] {
  return async (entityPicture) => {
    const res = await fetch(`http://supervisor/core${entityPicture}`, {
      headers: { Authorization: `Bearer ${supervisorToken}` },
    });
    if (!res.ok) {
      return { ok: false, status: res.status, statusText: res.statusText };
    }
    return { ok: true, buffer: Buffer.from(await res.arrayBuffer()) };
  };
}
