export const dynamic = "force-dynamic";

import { getSyncLog, getSystemStats, getPrinterStatus } from "@/lib/queries";
import { db } from "@/lib/db";
import { prints } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ClearStaleButton } from "./clear-stale-button";

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

function formatAbsTime(date: Date | string | null | undefined): string {
  if (!date) return "—";
  const d = date instanceof Date ? date : new Date(date);
  return d.toLocaleString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function TransitionBadge({ transition }: { transition: string | null | undefined }) {
  if (!transition || transition === "none") {
    return <span className="text-xs text-muted-foreground font-mono">—</span>;
  }
  const colorMap: Record<string, string> = {
    started: "bg-green-500/15 text-green-600 border-green-500/30",
    finished: "bg-teal-500/15 text-teal-600 border-teal-500/30",
    failed: "bg-red-500/15 text-red-600 border-red-500/30",
  };
  const cls = colorMap[transition] ?? "bg-muted text-muted-foreground border-border";
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border ${cls}`}>
      {transition}
    </span>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────

export default async function AdminPage() {
  const [stats, syncLogs, printerStatus] = await Promise.all([
    getSystemStats(),
    getSyncLog(50),
    getPrinterStatus(),
  ]);

  const [runningCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(prints)
    .where(eq(prints.status, "running"));

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

      {/* ── Sync Log ─────────────────────────────────────────────────────── */}
      <Card className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Sync Log</h2>
          <span className="text-xs text-muted-foreground">{syncLogs.length} recent entries</span>
        </div>

        {syncLogs.length === 0 ? (
          <p className="text-xs text-muted-foreground py-4 text-center">No syncs recorded yet.</p>
        ) : (
          <div className="overflow-x-auto -mx-4 px-4">
            <table className="w-full text-xs min-w-[560px]">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left font-medium text-muted-foreground pb-2 pr-3 font-mono">Time</th>
                  <th className="text-left font-medium text-muted-foreground pb-2 pr-3 font-mono">Raw</th>
                  <th className="text-left font-medium text-muted-foreground pb-2 pr-3 font-mono">Normalized</th>
                  <th className="text-left font-medium text-muted-foreground pb-2 pr-3">Transition</th>
                  <th className="text-left font-medium text-muted-foreground pb-2 pr-3">Print Name</th>
                  <th className="text-center font-medium text-muted-foreground pb-2 pr-3">Err</th>
                  <th className="text-right font-medium text-muted-foreground pb-2">Slots</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {syncLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-muted/30 transition-colors">
                    <td className="py-1.5 pr-3 font-mono text-muted-foreground whitespace-nowrap" title={formatAbsTime(log.createdAt)}>
                      {relativeTime(log.createdAt)}
                    </td>
                    <td className="py-1.5 pr-3 font-mono text-muted-foreground">
                      {log.rawState ?? "—"}
                    </td>
                    <td className="py-1.5 pr-3 font-mono text-foreground">
                      {log.normalizedState ?? "—"}
                    </td>
                    <td className="py-1.5 pr-3">
                      <TransitionBadge transition={log.printTransition} />
                    </td>
                    <td className="py-1.5 pr-3 max-w-[160px]">
                      <span className="truncate block text-muted-foreground" title={log.printName ?? undefined}>
                        {log.printName || "—"}
                      </span>
                    </td>
                    <td className="py-1.5 pr-3 text-center">
                      {log.printError ? (
                        <span className="text-red-500 font-medium">✕</span>
                      ) : (
                        <span className="text-muted-foreground/40">—</span>
                      )}
                    </td>
                    <td className="py-1.5 text-right font-mono text-muted-foreground">
                      {log.slotsUpdated ?? 0}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
