export const dynamic = "force-dynamic";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getAllDiagnostics } from "@/lib/diagnostics";
import { IssueCard } from "./issue-card";
import { OrphanPhotosCard } from "./orphan-photos-card";
import { formatDateTime } from "@/lib/date";

const RULE_TITLES: Record<string, string> = {
  sqlite_integrity: "SQLite integrity",
  foreign_key_violation: "Foreign key violations",
  spool_weight_negative: "Negative spool weight",
  spool_weight_overflow: "Spool weight over initial",
  spool_empty_status_mismatch: "Empty spools not marked empty",
  print_usage_orphan_spool: "Orphan print_usage rows",
  shop_unused: "Unused shops",
  shop_duplicate: "Duplicate shops",
  filament_unused: "Unused filaments",
};

const RULE_DESCRIPTIONS: Record<string, string> = {
  sqlite_integrity: "SQLite quick_check reported a problem with the database file.",
  foreign_key_violation: "A row references a parent record that no longer exists.",
  spool_weight_negative: "remaining_weight dropped below zero and was auto-clamped.",
  spool_weight_overflow: "remaining_weight exceeded initial_weight and was auto-clamped.",
  spool_empty_status_mismatch: "Zero-weight spool still marked active — auto-archived.",
  print_usage_orphan_spool: "print_usage row referenced a deleted spool — auto-removed.",
  shop_unused: "Configured shop with no listings and no orders yet.",
  shop_duplicate: "Multiple shops share the same canonical name.",
  filament_unused: "Filament with no spools, no orders, and no prints.",
};

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
    d.syncErrors.count +
    d.orphanPhotos.count;

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

      {/* ── Storage ──────────────────────────────────────────────────────── */}
      <section className="space-y-2">
        <h2 className="text-2xs font-bold uppercase tracking-wider text-muted-foreground">
          Storage
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          <OrphanPhotosCard initial={d.orphanPhotos} />
        </div>
      </section>

      {/* ── Health Check ────────────────────────────────────────────────── */}
      <section className="space-y-2">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-2xs font-bold uppercase tracking-wider text-muted-foreground">
            Health Check
          </h2>
          {d.healthCheck.latestRunAt && (
            <span className="text-2xs text-muted-foreground">
              Last run {formatDateTime(d.healthCheck.latestRunAt)}
              {" · "}
              {d.healthCheck.counts.autoFixed} auto-fixed
              {" · "}
              {d.healthCheck.counts.flagged} flagged
              {" · "}
              {d.healthCheck.counts.info} info
            </span>
          )}
        </div>
        {d.healthCheck.latestRunAt === null ? (
          <p className="text-xs text-muted-foreground italic py-2">
            No health check has run yet — restart the addon to trigger one.
          </p>
        ) : d.healthCheck.rules.length === 0 ? (
          <p className="text-xs text-muted-foreground italic py-2">
            Latest health check reported no findings.
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {d.healthCheck.rules.map((rule) => (
              <IssueCard
                key={rule.ruleId}
                title={RULE_TITLES[rule.ruleId] ?? rule.ruleId}
                description={RULE_DESCRIPTIONS[rule.ruleId] ?? `Findings from rule "${rule.ruleId}".`}
                count={rule.count}
                severity={rule.severity}
                tone={rule.action === "auto_fixed" ? "resolved" : "pending"}
                preview={rule.rows.map((r) => ({
                  label:
                    r.label ||
                    (r.entityType && r.entityId
                      ? `${r.entityType} · ${r.entityId.slice(0, 8)}`
                      : "—"),
                }))}
                testId={`issue-hc-${rule.ruleId}`}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
