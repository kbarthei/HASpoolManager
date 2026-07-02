import { describe, it, expect, beforeEach } from "vitest";
import path from "path";
import os from "os";

// Point HEALTH_FILE at a nonexistent path so loadHealthSnapshot() is a no-op
// and getHealth() reads the in-memory cache we drive directly. Must be set
// before importing the module (it reads the env at call time, so this is safe
// as long as the file never exists).
process.env.HEALTH_FILE = path.join(os.tmpdir(), "haspool-health-test-does-not-exist.json");

import {
  updatePrinterHealth,
  recordPrinterSync,
  removePrinter,
  getHealth,
} from "@/lib/sync-worker-health";

const DEVICE = "test-device-1";

describe("sync-worker-health", () => {
  beforeEach(() => {
    removePrinter(DEVICE);
  });

  it("a freshly-registered printer (lastSyncAt=0, no events) is NOT warning", () => {
    // Regression: lastSyncAt=0 used to compute `now - 0` = ~56 years and
    // trip the stale-sync warning on every restart before the first sync.
    updatePrinterHealth(DEVICE, DEVICE, "H2S", false, 0, 0, 21, 0);
    const h = getHealth();
    const printer = h.printers.details.find((p) => p.deviceId === DEVICE);
    expect(printer).toBeDefined();
    expect(printer!.status).toBe("healthy");
    expect(printer!.issues ?? []).toEqual([]);
    // timeSinceLastSync must be reported as 0 ("never"), not epoch-millis.
    expect(printer!.timeSinceLastSync).toBe(0);
  });

  it("recordPrinterSync propagates lastSyncAt into the health snapshot", () => {
    // Bug: updatePrinterHealth copied lastSyncAt=0 at registration and nothing
    // updated it afterward, so /health reported lastSyncAt: 0 forever.
    updatePrinterHealth(DEVICE, DEVICE, "H2S", false, 0, 0, 21, 0);
    const now = Date.now();
    recordPrinterSync(DEVICE, now, now);
    const h = getHealth();
    const printer = h.printers.details.find((p) => p.deviceId === DEVICE);
    expect(printer!.lastSyncAt).toBe(now);
    expect(printer!.status).toBe("healthy");
  });

  it("an idle printer that synced 45 min ago IS warning (stale watchdog)", () => {
    const fortyFiveMinAgo = Date.now() - 45 * 60 * 1000;
    updatePrinterHealth(DEVICE, DEVICE, "H2S", false, Date.now(), 0, 21, 0);
    recordPrinterSync(DEVICE, fortyFiveMinAgo, Date.now());
    const h = getHealth();
    const printer = h.printers.details.find((p) => p.deviceId === DEVICE);
    expect(printer!.status).toBe("warning");
    expect(printer!.issues!.some((i) => i.includes("No sync"))).toBe(true);
  });

  it("an ACTIVE printer with no sync for 20 min IS error (stuck sync)", () => {
    const twentyMinAgo = Date.now() - 20 * 60 * 1000;
    updatePrinterHealth(DEVICE, DEVICE, "H2S", true, Date.now(), 0, 21, 0);
    recordPrinterSync(DEVICE, twentyMinAgo, Date.now());
    const h = getHealth();
    const printer = h.printers.details.find((p) => p.deviceId === DEVICE);
    expect(printer!.status).toBe("error");
  });

  it("zero mapped entities → error (discovery failed)", () => {
    updatePrinterHealth(DEVICE, DEVICE, "H2S", false, Date.now(), 0, 0, 0);
    recordPrinterSync(DEVICE, Date.now(), Date.now());
    const h = getHealth();
    const printer = h.printers.details.find((p) => p.deviceId === DEVICE);
    expect(printer!.status).toBe("error");
    expect(printer!.issues!.some((i) => i.includes("No entities mapped"))).toBe(true);
  });

  it("recordPrinterSync on an unknown device is a no-op (no throw)", () => {
    expect(() => recordPrinterSync("nonexistent", Date.now())).not.toThrow();
  });
});
