/**
 * Home Assistant WebSocket client for addon-internal event subscriptions.
 *
 * Connects to ws://supervisor/core/websocket with SUPERVISOR_TOKEN.
 * Supports subscribing to events, triggers, and registry lookups.
 * Auto-reconnects with exponential backoff.
 */

import WebSocket from "ws";

const HA_WS_URL = "ws://supervisor/core/websocket";

// ── Types ────────────────────────────────────────────────────────────────────

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
  name_by_user: string | null;
  model: string | null;
  manufacturer: string | null;
  serial_number: string | null;
  identifiers: Array<[string, string]>;
}

export interface HAStateChangedEvent {
  entity_id: string;
  old_state: {
    state: string;
    attributes: Record<string, unknown>;
  } | null;
  new_state: {
    state: string;
    attributes: Record<string, unknown>;
    last_changed: string;
    last_updated: string;
  } | null;
}

export type EventHandler = (data: Record<string, unknown>) => void;

// ── Client ───────────────────────────────────────────────────────────────────

export class HAWebSocketClient {
  private ws: WebSocket | null = null;
  private msgId = 0;
  private pendingResults = new Map<number, { resolve: (data: unknown) => void; reject: (err: Error) => void }>();
  private eventSubscriptions = new Map<number, EventHandler>();
  private connected = false;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private onConnected?: () => void;
  private onDisconnected?: () => void;
  private destroyed = false;

  constructor(opts?: { onConnected?: () => void; onDisconnected?: () => void }) {
    this.onConnected = opts?.onConnected;
    this.onDisconnected = opts?.onDisconnected;
  }

  // ── Connection ───────────────────────────────────────────────────────────

  async connect(): Promise<void> {
    if (this.destroyed) return;

    const token = process.env.SUPERVISOR_TOKEN;
    if (!token) throw new Error("SUPERVISOR_TOKEN not available");

    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(HA_WS_URL);

      this.ws.on("open", () => {
        console.log("[ha-ws] connected");
      });

      this.ws.on("message", (raw: Buffer) => {
        const msg = JSON.parse(raw.toString());

        if (msg.type === "auth_required") {
          this.ws!.send(JSON.stringify({ type: "auth", access_token: token }));
        } else if (msg.type === "auth_ok") {
          this.connected = true;
          this.reconnectAttempts = 0;
          console.log(`[ha-ws] authenticated (HA ${msg.ha_version})`);
          this.onConnected?.();
          resolve();
        } else if (msg.type === "auth_invalid") {
          reject(new Error(`HA auth failed: ${msg.message}`));
        } else if (msg.type === "result") {
          const pending = this.pendingResults.get(msg.id);
          if (pending) {
            this.pendingResults.delete(msg.id);
            if (msg.success) {
              pending.resolve(msg.result);
            } else {
              pending.reject(new Error(msg.error?.message || "Unknown error"));
            }
          }
        } else if (msg.type === "event") {
          const handler = this.eventSubscriptions.get(msg.id);
          if (handler) {
            handler(msg.event);
          }
        }
      });

      this.ws.on("close", () => {
        this.connected = false;
        console.log("[ha-ws] disconnected");
        this.onDisconnected?.();
        this.scheduleReconnect();
      });

      this.ws.on("error", (err: Error) => {
        console.error("[ha-ws] error:", err.message);
        if (!this.connected) reject(err);
      });
    });
  }

  private scheduleReconnect() {
    if (this.destroyed) return;
    if (this.reconnectTimer) return;

    this.reconnectAttempts++;
    const delay = this.reconnectAttempts <= 3 ? 5000
      : this.reconnectAttempts <= 6 ? 30000
      : 300000; // 5s → 30s → 5min

    console.log(`[ha-ws] reconnecting in ${delay / 1000}s (attempt ${this.reconnectAttempts})`);
    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      try {
        await this.connect();
        // Re-subscribe after reconnect — caller should handle via onConnected callback
      } catch (err) {
        console.error("[ha-ws] reconnect failed:", (err as Error).message);
        this.scheduleReconnect();
      }
    }, delay);
  }

  // ── Commands ─────────────────────────────────────────────────────────────

  private send<T>(msg: Record<string, unknown>): Promise<T> {
    if (!this.ws || !this.connected) {
      return Promise.reject(new Error("Not connected"));
    }
    const id = ++this.msgId;
    return new Promise((resolve, reject) => {
      this.pendingResults.set(id, {
        resolve: resolve as (data: unknown) => void,
        reject,
      });
      this.ws!.send(JSON.stringify({ id, ...msg }));
    });
  }

  /** Subscribe to HA events. Returns subscription ID for unsubscribe. */
  async subscribeEvents(eventType: string, handler: EventHandler): Promise<number> {
    const id = ++this.msgId;
    this.eventSubscriptions.set(id, handler);
    return new Promise((resolve, reject) => {
      this.pendingResults.set(id, {
        resolve: () => resolve(id),
        reject,
      });
      this.ws!.send(JSON.stringify({
        id,
        type: "subscribe_events",
        event_type: eventType,
      }));
    });
  }

  /** Subscribe to state changes for specific entities (server-side filtered). */
  async subscribeTrigger(
    entityId: string,
    handler: EventHandler,
    opts?: { from?: string; to?: string },
  ): Promise<number> {
    const id = ++this.msgId;
    this.eventSubscriptions.set(id, handler);

    const trigger: Record<string, unknown> = {
      platform: "state",
      entity_id: entityId,
    };
    if (opts?.from) trigger.from = opts.from;
    if (opts?.to) trigger.to = opts.to;

    return new Promise((resolve, reject) => {
      this.pendingResults.set(id, {
        resolve: () => resolve(id),
        reject,
      });
      this.ws!.send(JSON.stringify({
        id,
        type: "subscribe_trigger",
        trigger,
      }));
    });
  }

  // ── Registry Lookups ────────────────────────────────────────────────────

  /** List all entities from the entity registry. */
  async listEntityRegistry(): Promise<HAEntityRegistryEntry[]> {
    return this.send<HAEntityRegistryEntry[]>({
      type: "config/entity_registry/list",
    });
  }

  /** List all devices from the device registry. */
  async listDeviceRegistry(): Promise<HADeviceRegistryEntry[]> {
    return this.send<HADeviceRegistryEntry[]>({
      type: "config/device_registry/list",
    });
  }

  /** Read current state of an entity. */
  async getState(entityId: string): Promise<{ state: string; attributes: Record<string, unknown> }> {
    return this.send({
      type: "get_states",
    }).then((states) => {
      const all = states as Array<{ entity_id: string; state: string; attributes: Record<string, unknown> }>;
      const found = all.find((s) => s.entity_id === entityId);
      if (!found) throw new Error(`Entity ${entityId} not found`);
      return found;
    });
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────

  get isConnected(): boolean {
    return this.connected;
  }

  destroy() {
    this.destroyed = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.pendingResults.clear();
    this.eventSubscriptions.clear();
  }
}
