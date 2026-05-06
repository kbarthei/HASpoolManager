/**
 * Sync Worker Health Monitoring
 *
 * Provides health status, metrics, and diagnostics for the sync worker.
 * Used by the /api/v1/health endpoint and admin dashboard.
 */

import { listBackups } from "./backup-manager";

export interface PrinterHealth {
  printerId: string;
  deviceId: string;
  name: string;
  isActive: boolean;
  lastEventAt: number;
  lastSyncAt: number;
  timeSinceLastEvent: number;
  timeSinceLastSync: number;
  entityCount: number;
  pendingSwaps: number;
  status: "healthy" | "warning" | "error";
  issues: string[];
}

export interface SyncWorkerHealth {
  status: "healthy" | "degraded" | "unhealthy";
  uptime: number;
  websocket: {
    connected: boolean;
    connectionUptime: number | null;
    reconnectCount: number;
    lastDisconnectAt: number | null;
  };
  printers: {
    total: number;
    active: number;
    healthy: number;
    warning: number;
    error: number;
    details: PrinterHealth[];
  };
  events: {
    stateChangedCount: number;
    bambuEventCount: number;
    lastEventAt: number | null;
  };
  watchdog: {
    running: boolean;
    lastRunAt: number | null;
  };
  backup: {
    schedulerRunning: boolean;
    lastBackupAt: number | null;
    backupCount: number;
  };
  issues: string[];
  timestamp: string;
}

// ── State tracking ──────────────────────────────────────────────────────────

let workerStartTime: number | null = null;
let wsConnectedAt: number | null = null;
let wsReconnectCount = 0;
let wsLastDisconnectAt: number | null = null;
let stateChangedEventCount = 0;
let bambuEventCount = 0;
let lastEventTimestamp: number | null = null;
let watchdogLastRunAt: number | null = null;
let watchdogRunning = false;
let backupSchedulerRunning = false;
let lastBackupTimestamp: number | null = null;

// Printer state cache (updated by sync worker)
const printerHealthCache = new Map<string, {
  printerId: string;
  deviceId: string;
  name: string;
  isActive: boolean;
  lastEventAt: number;
  lastSyncAt: number;
  entityCount: number;
  pendingSwaps: number;
}>();

// ── Public API ──────────────────────────────────────────────────────────────

export function initializeHealth(): void {
  workerStartTime = Date.now();
  console.log("[health] monitoring initialized");
}

export function recordWebSocketConnected(): void {
  wsConnectedAt = Date.now();
  wsReconnectCount++;
  console.log(`[health] websocket connected (reconnect #${wsReconnectCount})`);
}

export function recordWebSocketDisconnected(): void {
  wsLastDisconnectAt = Date.now();
  wsConnectedAt = null;
  console.log("[health] websocket disconnected");
}

export function recordStateChangedEvent(): void {
  stateChangedEventCount++;
  lastEventTimestamp = Date.now();
}

export function recordBambuEvent(): void {
  bambuEventCount++;
  lastEventTimestamp = Date.now();
}

export function recordWatchdogRun(): void {
  watchdogLastRunAt = Date.now();
}

export function setWatchdogRunning(running: boolean): void {
  watchdogRunning = running;
}

export function setBackupSchedulerRunning(running: boolean): void {
  backupSchedulerRunning = running;
}

export function recordBackup(): void {
  lastBackupTimestamp = Date.now();
}

export function updatePrinterHealth(
  printerId: string,
  deviceId: string,
  name: string,
  isActive: boolean,
  lastEventAt: number,
  lastSyncAt: number,
  entityCount: number,
  pendingSwaps: number,
): void {
  printerHealthCache.set(deviceId, {
    printerId,
    deviceId,
    name,
    isActive,
    lastEventAt,
    lastSyncAt,
    entityCount,
    pendingSwaps,
  });
}

export function removePrinter(deviceId: string): void {
  printerHealthCache.delete(deviceId);
}

export function resetEventCounters(): void {
  stateChangedEventCount = 0;
  bambuEventCount = 0;
}

/**
 * Get comprehensive health status for the sync worker.
 */
export function getHealth(): SyncWorkerHealth {
  const now = Date.now();
  const issues: string[] = [];

  // WebSocket health
  const wsConnected = wsConnectedAt !== null;
  const wsConnectionUptime = wsConnected && wsConnectedAt ? now - wsConnectedAt : null;
  
  if (!wsConnected) {
    issues.push("WebSocket disconnected from Home Assistant");
  } else if (wsConnectionUptime && wsConnectionUptime < 60000) {
    issues.push("WebSocket recently reconnected (may indicate instability)");
  }

  // Printer health
  const printerDetails: PrinterHealth[] = [];
  let healthyCount = 0;
  let warningCount = 0;
  let errorCount = 0;
  let activeCount = 0;

  for (const printer of printerHealthCache.values()) {
    const timeSinceLastEvent = now - printer.lastEventAt;
    const timeSinceLastSync = now - printer.lastSyncAt;
    const printerIssues: string[] = [];
    
    // Determine printer status
    let status: "healthy" | "warning" | "error" = "healthy";
    
    // No events in 10 minutes (printer might be offline)
    if (timeSinceLastEvent > 10 * 60 * 1000) {
      status = "warning";
      printerIssues.push(`No events for ${Math.round(timeSinceLastEvent / 60000)} minutes`);
    }
    
    // No sync in 15 minutes while active (stuck sync)
    if (printer.isActive && timeSinceLastSync > 15 * 60 * 1000) {
      status = "error";
      printerIssues.push(`Active print but no sync for ${Math.round(timeSinceLastSync / 60000)} minutes`);
    }
    
    // No sync in 30 minutes while idle (watchdog not running?)
    if (!printer.isActive && timeSinceLastSync > 30 * 60 * 1000) {
      status = "warning";
      printerIssues.push(`No sync for ${Math.round(timeSinceLastSync / 60000)} minutes`);
    }
    
    // No entities mapped (discovery failed)
    if (printer.entityCount === 0) {
      status = "error";
      printerIssues.push("No entities mapped (discovery failed)");
    }

    if (printer.isActive) activeCount++;
    if (status === "healthy") healthyCount++;
    else if (status === "warning") warningCount++;
    else errorCount++;

    printerDetails.push({
      printerId: printer.printerId,
      deviceId: printer.deviceId,
      name: printer.name,
      isActive: printer.isActive,
      lastEventAt: printer.lastEventAt,
      lastSyncAt: printer.lastSyncAt,
      timeSinceLastEvent,
      timeSinceLastSync,
      entityCount: printer.entityCount,
      pendingSwaps: printer.pendingSwaps,
      status,
      issues: printerIssues,
    });
  }

  // Watchdog health
  if (watchdogRunning && watchdogLastRunAt && now - watchdogLastRunAt > 5 * 60 * 1000) {
    issues.push("Watchdog hasn't run in 5+ minutes");
  }
  if (!watchdogRunning && printerHealthCache.size > 0) {
    issues.push("Watchdog not running");
  }

  // Event health
  if (lastEventTimestamp && now - lastEventTimestamp > 30 * 60 * 1000 && printerHealthCache.size > 0) {
    issues.push("No events received in 30+ minutes");
  }

  // Backup health
  if (backupSchedulerRunning && lastBackupTimestamp && now - lastBackupTimestamp > 48 * 60 * 60 * 1000) {
    issues.push("No backup in 48+ hours");
  }

  // Overall status
  let overallStatus: "healthy" | "degraded" | "unhealthy";
  if (errorCount > 0 || !wsConnected) {
    overallStatus = "unhealthy";
  } else if (warningCount > 0 || issues.length > 0) {
    overallStatus = "degraded";
  } else {
    overallStatus = "healthy";
  }

  let backupCount = 0;
  try {
    backupCount = listBackups().length;
  } catch {
    // Backup manager not available (e.g. /config not mounted in dev)
  }

  return {
    status: overallStatus,
    uptime: workerStartTime ? now - workerStartTime : 0,
    websocket: {
      connected: wsConnected,
      connectionUptime: wsConnectionUptime,
      reconnectCount: wsReconnectCount,
      lastDisconnectAt: wsLastDisconnectAt,
    },
    printers: {
      total: printerHealthCache.size,
      active: activeCount,
      healthy: healthyCount,
      warning: warningCount,
      error: errorCount,
      details: printerDetails,
    },
    events: {
      stateChangedCount: stateChangedEventCount,
      bambuEventCount,
      lastEventAt: lastEventTimestamp,
    },
    watchdog: {
      running: watchdogRunning,
      lastRunAt: watchdogLastRunAt,
    },
    backup: {
      schedulerRunning: backupSchedulerRunning,
      lastBackupAt: lastBackupTimestamp,
      backupCount,
    },
    issues,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Get a simple health check result (for load balancers, monitoring tools).
 */
export function getSimpleHealth(): { status: "ok" | "degraded" | "error"; message?: string } {
  const health = getHealth();
  
  if (health.status === "unhealthy") {
    return {
      status: "error",
      message: health.issues.join("; "),
    };
  }
  
  if (health.status === "degraded") {
    return {
      status: "degraded",
      message: health.issues.join("; "),
    };
  }
  
  return { status: "ok" };
}

// Made with Bob
