export const dynamic = "force-dynamic";

import { getSyncLog, getSystemStats, getPrinterStatus, getRackConfig } from "@/lib/queries";
import { db } from "@/lib/db";
import { prints, spools } from "@/lib/db/schema";
import { eq, sql, ne } from "drizzle-orm";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ClearStaleButton } from "./clear-stale-button";
import { SyncLogTable } from "./sync-log-table";
import { RackSettings } from "./rack-settings";
import { ImportOrdersCard } from "./import-orders-card";

// ── Helpers ────────────────────────────────────────────────────────────────

function relativeTime(date: Date | string | null | undefined): string {
  if (!date) return "—";
  const d = date instanceof Date ? date : new Date(date);
  const diffMs = Date.now() - d.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
}

// ── Page ──────────────────────────────────────────────────────────────────

export default async function AdminPage() {
  const [stats, syncLogs, printerStatus, rackConfig] = await Promise.all([
    getSystemStats(),
    getSyncLog(50),
    getPrinterStatus(),
    getRackConfig(),
  ]);

  const [runningCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(prints)
    .where(eq(prints.status, "running"));

  // Fetch active spools with filament + vendor for the import dialog
  const allSpools = await db.query.spools.findMany({
    where: ne(spools.status, "archived"),
    with: { filament: { with: { vendor: true } } },
  });

  const lastSync = syncLogs[0];

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold">Admin</h1>
        <p className="text-xs text-muted-foreground mt-1">System overview and diagnostics</p>
      </div>

      {/* ── System Overview ──────────────────────────────────────────────── */}
      <Card className="p-4 space-y-4">
        <h2 className="text-sm font-semibold">System Overview</h2>

        {/* DB counts */}
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
          {[
            { label: "Spools", value: stats.spools },
            { label: "Filaments", value: stats.filaments },
            { label: "Prints", value: stats.prints },
            { label: "Vendors", value: stats.vendors },
            { label: "Orders", value: stats.orders },
          ].map(({ label, value }) => (
            <div key={label} className="flex flex-col items-center bg-muted/40 rounded-lg py-2 px-3">
              <span className="text-lg font-semibold tabular-nums">{value}</span>
              <span className="text-[10px] text-muted-foreground mt-0.5">{label}</span>
            </div>
          ))}
        </div>

        {/* Printer + last sync */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <div className="flex items-center justify-between bg-muted/30 rounded-lg px-3 py-2">
            <span className="text-xs text-muted-foreground">Printer</span>
            <div className="flex items-center gap-2">
              <span className="font-medium text-xs">{printerStatus.name}</span>
              <Badge
                className={`text-[10px] h-4 px-1.5 ${
                  printerStatus.status === "printing"
                    ? "bg-primary/15 text-primary border-primary/30"
                    : "bg-muted text-muted-foreground border-border"
                }`}
              >
                {printerStatus.status}
              </Badge>
            </div>
          </div>

          <div className="flex items-center justify-between bg-muted/30 rounded-lg px-3 py-2">
            <span className="text-xs text-muted-foreground">Last sync</span>
            <div className="text-right">
              {lastSync ? (
                <>
                  <span className="font-mono text-xs">{relativeTime(lastSync.createdAt)}</span>
                  <span className="text-[10px] text-muted-foreground ml-1.5 font-mono">
                    {lastSync.normalizedState ?? "—"}
                  </span>
                </>
              ) : (
                <span className="text-xs text-muted-foreground">No syncs yet</span>
              )}
            </div>
          </div>
        </div>
      </Card>

      {/* ── Manual Actions ───────────────────────────────────────────────── */}
      <Card className="p-4 space-y-3">
        <h2 className="text-sm font-semibold">Manual Actions</h2>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-medium">Clear Stale Running Prints</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {runningCount.count > 0
                ? `${runningCount.count} print${runningCount.count === 1 ? "" : "s"} currently marked as running`
                : "No running prints"}
            </p>
          </div>
          <ClearStaleButton runningCount={runningCount.count} />
        </div>
      </Card>

      {/* ── Import Historical Orders ──────────────────────────────────── */}
      <ImportOrdersCard allSpools={JSON.parse(JSON.stringify(allSpools))} />

      {/* ── Rack Configuration ──────────────────────────────────────────── */}
      <Card className="p-4 space-y-3">
        <div>
          <h2 className="text-sm font-semibold">Rack Configuration</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Currently {rackConfig.rows} rows × {rackConfig.columns} columns · R1 is the bottom-left shelf
          </p>
        </div>
        <RackSettings initialRows={rackConfig.rows} initialColumns={rackConfig.columns} />
      </Card>

      {/* ── Sync Log ─────────────────────────────────────────────────────── */}
      <Card className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Sync Log</h2>
          <span className="text-xs text-muted-foreground">{syncLogs.length} recent entries</span>
        </div>

        <SyncLogTable logs={syncLogs} />
      </Card>
    </div>
  );
}
