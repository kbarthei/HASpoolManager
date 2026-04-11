/**
 * Home Assistant Supervisor API client.
 *
 * When running as an HA addon with `homeassistant_api: true`, the
 * SUPERVISOR_TOKEN env var is injected automatically. All requests
 * go through the supervisor proxy at http://supervisor/core/api/.
 */

const HA_API_BASE = "http://supervisor/core/api";

function getToken(): string {
  const token = process.env.SUPERVISOR_TOKEN;
  if (!token) throw new Error("SUPERVISOR_TOKEN not available — is homeassistant_api enabled?");
  return token;
}

async function haFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${HA_API_BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${getToken()}`,
      "Content-Type": "application/json",
    },
  });
  if (!res.ok) {
    throw new Error(`HA API ${path} returned ${res.status}: ${await res.text()}`);
  }
  return res.json() as Promise<T>;
}

// ── Types ────────────────────────────────────────────────────────────────────

export interface HAEntityState {
  entity_id: string;
  state: string;
  attributes: Record<string, unknown>;
  last_changed: string;
  last_updated: string;
}

export interface HAEntityRegistryEntry {
  entity_id: string;
  original_name: string | null;
  name: string | null;
  platform: string;
  device_id: string | null;
  disabled_by: string | null;
}

export interface HADeviceRegistryEntry {
  id: string;
  name: string | null;
  model: string | null;
  manufacturer: string | null;
  serial_number: string | null;
  identifiers: Array<[string, string]>;
}

// ── API Methods ──────────────────────────────────────────────────────────────

/** Read current state + attributes of a single entity */
export async function getEntityState(entityId: string): Promise<HAEntityState> {
  return haFetch<HAEntityState>(`/states/${entityId}`);
}

/** Read states of all entities (large response — use sparingly) */
export async function getAllStates(): Promise<HAEntityState[]> {
  return haFetch<HAEntityState[]>("/states");
}

/** List all entities from the entity registry */
export async function listEntityRegistry(): Promise<HAEntityRegistryEntry[]> {
  // The entity registry endpoint requires a websocket call in newer HA versions.
  // As REST fallback, we use the /api/states endpoint and reconstruct what we need.
  // For full registry access, use the websocket client (ha-websocket.ts).
  throw new Error("Entity registry requires websocket — use haWebsocket.listEntityRegistry()");
}

/** List all devices from the device registry */
export async function listDeviceRegistry(): Promise<HADeviceRegistryEntry[]> {
  throw new Error("Device registry requires websocket — use haWebsocket.listDeviceRegistry()");
}

/**
 * Read states for multiple entities in parallel.
 * More efficient than getAllStates() when you know which entities you need.
 */
export async function getEntityStates(entityIds: string[]): Promise<Map<string, HAEntityState>> {
  const results = await Promise.all(
    entityIds.map(async (id) => {
      try {
        const state = await getEntityState(id);
        return [id, state] as const;
      } catch {
        return [id, null] as const;
      }
    }),
  );
  const map = new Map<string, HAEntityState>();
  for (const [id, state] of results) {
    if (state) map.set(id, state);
  }
  return map;
}

/**
 * Check if the HA API is reachable (addon has homeassistant_api access).
 */
export async function checkConnection(): Promise<{ ok: boolean; error?: string }> {
  try {
    const config = await haFetch<{ version: string }>("/config");
    return { ok: true };
  } catch (error) {
    return { ok: false, error: String(error) };
  }
}
