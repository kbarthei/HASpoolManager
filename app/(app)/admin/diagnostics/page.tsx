export const dynamic = "force-dynamic";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getAllDiagnostics } from "@/lib/diagnostics";
import { IssueCard } from "./issue-card";

export default async function DiagnosticsPage() {
  const d = await getAllDiagnostics();

  const totalIssues =
    d.spoolDrift.count +
    d.spoolStale.count +
    d.spoolZeroActive.count +
    d.printStuck.count +
    d.printNoWeight.count +
    d.printNoUsage.count +
    d.orderStuck.count +
    d.syncErrors.count;

  return (
    <div
      data-testid="page-diagnostics"
      className="max-w-2xl md:max-w-5xl mx-auto space-y-5"
    >
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="space-y-2">
        <Link
          href="/admin"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="w-3 h-3" /> Back to Admin
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Diagnostics</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {totalIssues === 0
              ? "No issues detected across spools, prints, orders, or sync."
              : `${totalIssues} issue${totalIssues === 1 ? "" : "s"} detected across spools, prints, orders, and sync.`}
          </p>
        </div>
      </div>

      {/* ── Spools ──────────────────────────────────────────────────────── */}
      <section className="space-y-2">
        <h2 className="text-2xs font-bold uppercase tracking-wider text-muted-foreground">
          Spools
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          <IssueCard
            title="RFID drift"
            description="Spools in an AMS slot where the DB-tracked percentage differs from the RFID reading by more than 10pp."
            count={d.spoolDrift.count}
            severity="warning"
            reviewHref="/spools?issue=drift"
            preview={d.spoolDrift.rows.map((r) => ({
              label: `${r.filamentName} · ${r.slotLabel}`,
              meta: `${r.dbPercent}% vs ${r.rfidPercent}%`,
            }))}
            testId="issue-spool-drift"
          />
          <IssueCard
            title="Stale spools"
            description="Active spools with remaining weight but no usage in over 90 days."
            count={d.spoolStale.count}
            severity="info"
            reviewHref="/spools?issue=stale"
            preview={d.spoolStale.rows.map((r) => ({
              label: r.filamentName,
              meta: `${r.daysSinceUse}d`,
            }))}
            testId="issue-spool-stale"
          />
          <IssueCard
            title="Zero-weight active"
            description="Spools marked active but remainingWeight ≤ 0 — should be archived or marked empty."
            count={d.spoolZeroActive.count}
            severity="warning"
            reviewHref="/spools?issue=zero-active"
            preview={d.spoolZeroActive.rows.map((r) => ({
              label: r.filamentName,
              meta: r.location ?? "—",
            }))}
            testId="issue-spool-zero-active"
          />
        </div>
      </section>

      {/* ── Prints ──────────────────────────────────────────────────────── */}
      <section className="space-y-2">
        <h2 className="text-2xs font-bold uppercase tracking-wider text-muted-foreground">
          Prints
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          <IssueCard
            title="Stuck running"
            description="Prints still marked 'running' with no update for over 24 hours. Blocks new print tracking."
            count={d.printStuck.count}
            severity="critical"
            reviewHref="/prints?issue=stuck"
            preview={d.printStuck.rows.map((r) => ({
              label: r.printName ?? "Unnamed print",
              meta: `${r.hoursSinceUpdate}h`,
            }))}
            testId="issue-print-stuck"
          />
          <IssueCard
            title="Finished without weight"
            description="Finished prints (last 30d) with no printWeight — missing slicer metadata or failed before extrusion."
            count={d.printNoWeight.count}
            severity="info"
            reviewHref="/prints?issue=no-weight"
            preview={d.printNoWeight.rows.map((r) => ({
              label: r.printName ?? "Unnamed print",
            }))}
            testId="issue-print-no-weight"
          />
          <IssueCard
            title="Finished without usage"
            description="Finished prints (last 30d) with no print_usage rows — spool wasn't identified, weight wasn't deducted."
            count={d.printNoUsage.count}
            severity="warning"
            reviewHref="/prints?issue=no-usage"
            preview={d.printNoUsage.rows.map((r) => ({
              label: r.printName ?? "Unnamed print",
              meta: r.printWeight ? `${r.printWeight}g` : "—",
            }))}
            testId="issue-print-no-usage"
          />
        </div>
      </section>

      {/* ── Orders ──────────────────────────────────────────────────────── */}
      <section className="space-y-2">
        <h2 className="text-2xs font-bold uppercase tracking-wider text-muted-foreground">
          Orders
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          <IssueCard
            title="Stuck ordered"
            description="Orders still in 'ordered' status more than 30 days after orderDate — delivery likely forgotten."
            count={d.orderStuck.count}
            severity="warning"
            reviewHref="/orders?issue=stuck"
            preview={d.orderStuck.rows.map((r) => ({
              label: `${r.vendorName ?? "?"} · ${r.orderNumber ?? "no #"}`,
              meta: `${r.daysSinceOrder}d`,
            }))}
            testId="issue-order-stuck"
          />
        </div>
      </section>

      {/* ── Sync ─────────────────────────────────────────────────────────── */}
      <section className="space-y-2">
        <h2 className="text-2xs font-bold uppercase tracking-wider text-muted-foreground">
          Sync
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          <IssueCard
            title="Recent sync errors"
            description="Sync log entries in the last 24h with print errors or offline/unknown printer state."
            count={d.syncErrors.count}
            severity="info"
            reviewHref="/admin#sync-log"
            reviewLabel="Open sync log"
            preview={d.syncErrors.rows.slice(0, 3).map((r) => ({
              label: r.printName ?? r.normalizedState ?? "—",
              meta: r.printError ? "error" : (r.normalizedState ?? ""),
            }))}
            testId="issue-sync-errors"
          />
        </div>
      </section>
    </div>
  );
}
