/**
 * Entry point for the sync worker background process.
 * Started by run.sh alongside Next.js.
 *
 * Usage: node --import tsx scripts/start-sync-worker.ts
 * (or compiled: node dist/sync-worker.js)
 */

import { startSyncWorker, stopSyncWorker } from "../lib/sync-worker";

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("[sync-worker] SIGTERM received, shutting down...");
  stopSyncWorker();
  process.exit(0);
});

process.on("SIGINT", () => {
  console.log("[sync-worker] SIGINT received, shutting down...");
  stopSyncWorker();
  process.exit(0);
});

// Start
startSyncWorker().catch((err) => {
  console.error("[sync-worker] fatal:", err);
  process.exit(1);
});
