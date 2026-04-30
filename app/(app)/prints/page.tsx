export const dynamic = "force-dynamic";

import Link from "next/link";
import { getAllPrints, getPrinterStatus } from "@/lib/queries";
import { SpoolMaterialBadge } from "@/components/spool/spool-material-badge";
import { Card } from "@/components/ui/card";
import { SpoolColorDot } from "@/components/spool/spool-color-dot";
import { UsageWeightAdjuster } from "@/components/prints/usage-weight-adjuster";
import { CheckCircle2, XCircle, Zap } from "lucide-react";
import { formatDateTime, formatDateLong, formatDateShort } from "@/lib/date";
import { costTooltip } from "@/lib/format-cost";
import { CostTooltip } from "@/components/prints/cost-tooltip";
import { ClearStaleButton } from "@/components/prints/clear-stale-button";
import { ExportCsvButton } from "@/components/export-csv-button";
import { PrintPhotoGallery, type PhotoEntry } from "@/components/prints/print-photo-gallery";
import { computeCostEstimate } from "@/lib/print-cost-estimate";
import { formatRemainingMinutes } from "@/lib/format-duration";

function parsePhotos(photoUrls: string | null): PhotoEntry[] {
  if (!photoUrls) return [];
  try {
    const parsed = JSON.parse(photoUrls);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e): e is PhotoEntry =>
        e &&
        typeof e === "object" &&
        typeof e.path === "string" &&
        (e.kind === "cover" || e.kind === "snapshot" || e.kind === "user"),
    );
  } catch {
    return [];
  }
}
import { cn } from "@/lib/utils";
import {
  getPrintStuck,
  getPrintNoWeight,
  getPrintNoUsage,
} from "@/lib/diagnostics";

type PrintIssue = "stuck" | "no-weight" | "no-usage";

async function getPrintIdsForIssue(issue: PrintIssue): Promise<Set<string>> {
  if (issue === "stuck") {
    const { rows } = await getPrintStuck();
    return new Set(rows.map((r) => r.printId));
  }
  if (issue === "no-weight") {
    const { rows } = await getPrintNoWeight();
    return new Set(rows.map((r) => r.printId));
  }
  const { rows } = await getPrintNoUsage();
  return new Set(rows.map((r) => r.printId));
}

function printIssueLabel(issue: PrintIssue): string {
  if (issue === "stuck") return "Stuck running for 24h+";
  if (issue === "no-weight") return "Finished without weight (last 30d)";
  return "Finished without usage rows (last 30d)";
}

// ── Helpers ────────────────────────────────────────────────────────────────

function formatDuration(seconds: number | null | undefined): string {
  if (!seconds) return "—";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m.toString().padStart(2, "0")}m`;
}

function groupByDate<T extends { startedAt: Date | null | string | undefined }>(
  items: T[]
): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const d = item.startedAt ? new Date(item.startedAt) : null;
    const key = d ? formatDateLong(d) : "Unknown";
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(item);
  }
  return map;
}

// ── Stat cell (inline — matches the Spool Inspector 3-up row) ─────────────

function StatCell({
  label,
  value,
  sub,
  tooltip,
}: {
  label: string;
  value: string;
  sub?: string | null;
  tooltip?: string;
}) {
  const body = (
    <div className="bg-muted rounded-lg p-3 text-center">
      <div className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div
        className="font-bold tracking-tight leading-tight mt-1"
        style={{ fontSize: "17px" }}
      >
        {value}
      </div>
      {sub && (
        <div className="text-2xs text-muted-foreground mt-0.5 truncate">
          {sub}
        </div>
      )}
    </div>
  );
  return tooltip ? <CostTooltip text={tooltip}>{body}</CostTooltip> : body;
}

// ── Page ──────────────────────────────────────────────────────────────────

export default async function PrintHistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | undefined }>;
}) {
  const params = await searchParams;
  const validIssues: PrintIssue[] = ["stuck", "no-weight", "no-usage"];
  const activeIssue = validIssues.includes(params.issue as PrintIssue)
    ? (params.issue as PrintIssue)
    : null;

  const [allPrintsRaw, printerStatus] = await Promise.all([
    getAllPrints(),
    getPrinterStatus(),
  ]);

  const allPrints = activeIssue
    ? await getPrintIdsForIssue(activeIssue).then((ids) =>
        allPrintsRaw.filter((p) => ids.has(p.id)),
      )
    : allPrintsRaw;

  const runningPrints = allPrints.filter((p) => p.status === "running");
  const completedPrints = allPrints.filter((p) => p.status !== "running");

  const runningEstimates = new Map(
    await Promise.all(
      runningPrints.map(async (p) => [p.id, await computeCostEstimate(p.id)] as const),
    ),
  );

  const totalWeight = allPrints.reduce((sum, p) => {
    const w = p.usage.reduce((s, u) => s + u.weightUsed, 0);
    return sum + w;
  }, 0);

  const totalCost = allPrints.reduce((sum, p) => sum + Number(p.totalCost ?? 0), 0);
  const totalFilamentCost = allPrints.reduce((sum, p) => sum + Number(p.filamentCost ?? 0), 0);
  const totalEnergyCost = allPrints.reduce((sum, p) => sum + Number(p.energyCost ?? 0), 0);
  const totalKwh = allPrints.reduce((sum, p) => sum + Number(p.energyKwh ?? 0), 0);

  const headerCostTooltip =
    totalEnergyCost > 0
      ? `Filament €${totalFilamentCost.toFixed(2)} · Electricity €${totalEnergyCost.toFixed(2)} (${totalKwh.toFixed(2)} kWh)`
      : undefined;

  const grouped = groupByDate(completedPrints);

  return (
    <div data-testid="page-prints" className="max-w-2xl mx-auto space-y-4">
      {/* Diagnostics issue banner */}
      {activeIssue && (
        <div
          data-testid="issue-banner"
          className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/30"
        >
          <div className="text-xs">
            <span className="font-semibold text-amber-600">Filtered:</span>{" "}
            <span className="text-foreground">{printIssueLabel(activeIssue)}</span>
            <span className="text-muted-foreground"> · {allPrints.length} print{allPrints.length === 1 ? "" : "s"}</span>
          </div>
          <Link
            href="/prints"
            className="text-xs text-amber-600 hover:underline"
          >
            Clear
          </Link>
        </div>
      )}

      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Print History</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {allPrints.length} prints · {totalWeight.toFixed(0)} g filament used
            {totalCost > 0 && ` · €${totalCost.toFixed(2)} spent`}
          </p>
        </div>
        <ExportCsvButton href="/api/v1/export/prints" />
      </div>

      {/* 3-up summary */}
      {allPrints.length > 0 && (
        <div className="grid grid-cols-3 gap-2.5">
          <StatCell label="Prints" value={String(allPrints.length)} />
          <StatCell label="Used" value={`${totalWeight.toFixed(0)} g`} />
          <StatCell
            label="Spent"
            value={`€${totalCost.toFixed(2)}`}
            sub={headerCostTooltip ? "filament + energy" : null}
            tooltip={headerCostTooltip}
          />
        </div>
      )}

      {/* Currently Printing */}
      {runningPrints.length > 0 && (
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-2xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
              </span>
              Currently Printing
            </h2>
            <ClearStaleButton runningCount={runningPrints.length} />
          </div>
          <p className="text-2xs text-muted-foreground">
            Stuck at &ldquo;running&rdquo;? Clear stale to mark failed and unblock future tracking (auto after 24h).
          </p>
          <div className="space-y-2">
            {runningPrints.map((print) => (
              <Card
                key={print.id}
                className="p-4 rounded-xl border-l-[3px] border-l-primary"
              >
                <div className="flex items-start gap-4">
                  <div className="shrink-0">
                    <PrintPhotoGallery
                      printId={print.id}
                      initialPhotos={parsePhotos(print.photoUrls)}
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold truncate">
                          {print.name ?? print.gcodeFile ?? "Unnamed print"}
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          Started {formatDateShort(print.startedAt!)}
                          {print.printer && ` · ${print.printer.name}`}
                        </div>
                      </div>
                      <span className="inline-flex items-center h-5 px-2 rounded-full text-2xs font-bold uppercase tracking-wide bg-primary/15 text-primary border border-primary/30 shrink-0">
                        Printing
                      </span>
                    </div>
                <div className="flex flex-wrap gap-3 mt-3 text-xs text-muted-foreground items-center">
                  {printerStatus.activeSpools && printerStatus.activeSpools.length > 0 ? (
                    printerStatus.activeSpools.map((spool, i) => (
                      <div key={i} className="flex items-center gap-1.5">
                        <SpoolColorDot hex={spool.colorHex} size="sm" />
                        <span className="text-foreground">{spool.vendor} {spool.name}</span>
                        <SpoolMaterialBadge material={spool.material} />
                        {spool.colorName && (
                          <span>({spool.colorName})</span>
                        )}
                      </div>
                    ))
                  ) : printerStatus.activeSpool ? (
                    <div className="flex items-center gap-1.5">
                      <SpoolColorDot hex={printerStatus.activeSpool.colorHex} size="sm" />
                      <span className="text-foreground">
                        {printerStatus.activeSpool.vendor} {printerStatus.activeSpool.name}
                      </span>
                      <SpoolMaterialBadge material={printerStatus.activeSpool.material} />
                      {printerStatus.activeSpool.colorName && (
                        <span>({printerStatus.activeSpool.colorName})</span>
                      )}
                    </div>
                  ) : null}
                  {print.printWeight != null && (
                    <span className="font-[family-name:var(--font-geist-mono)] tabular-nums">
                      {print.printWeight}g
                    </span>
                  )}
                  {(printerStatus.progress ?? 0) > 0 && (
                    <span className="font-[family-name:var(--font-geist-mono)] tabular-nums text-primary font-semibold">
                      {Math.round(printerStatus.progress ?? 0)}%
                    </span>
                  )}
                  {(printerStatus.remainingTime ?? 0) > 0 && (
                    <span className="font-[family-name:var(--font-geist-mono)] tabular-nums">
                      {formatRemainingMinutes(printerStatus.remainingTime)} left
                    </span>
                  )}
                  {(() => {
                    const est = runningEstimates.get(print.id);
                    if (!est || est.estimated_cost_eur == null) return null;
                    return (
                      <span
                        className="font-[family-name:var(--font-geist-mono)] tabular-nums text-primary"
                        title={`${est.estimated_weight_used_g.toFixed(1)} g of ${est.total_weight_g ?? "?"} g at ${est.progress_percent}% · Ø ${(est.spools.reduce((s, x) => s + (x.cost_per_gram ?? 0), 0) / Math.max(1, est.spools.filter((x) => x.cost_per_gram != null).length)).toFixed(4)} ${est.currency}/g`}
                        data-testid="print-cost-estimate"
                      >
                        ≈ {est.currency === "EUR" ? "€" : est.currency} {est.estimated_cost_eur.toFixed(2)}
                      </span>
                    );
                  })()}
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </section>
      )}

      {/* Grouped history */}
      {Array.from(grouped.entries()).map(([dateLabel, dayPrints]) => (
        <section key={dateLabel} className="space-y-2">
          {/* Sticky date header */}
          <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm py-1">
            <span className="text-2xs font-bold uppercase tracking-wider text-muted-foreground">
              {dateLabel}
            </span>
          </div>

          <div className="space-y-2">
            {dayPrints.map((print) => {
              const finished = print.status === "finished";
              const failed = print.status === "failed" || print.status === "cancelled";
              const printWeight = print.usage.reduce((s, u) => s + u.weightUsed, 0);
              const printCost = Number(print.totalCost ?? 0);
              const printCostTip = costTooltip(print);

              return (
                <Card
                  key={print.id}
                  className="px-4 py-3 rounded-xl"
                >
                  <div className="flex items-start gap-3">
                    {/* Status icon */}
                    <div className="mt-0.5 shrink-0">
                      {finished ? (
                        <CheckCircle2 className="h-4 w-4 text-success" />
                      ) : (
                        <XCircle className="h-4 w-4 text-destructive" />
                      )}
                    </div>

                    {/* Photo Gallery (cover + snapshot + user uploads) */}
                    <div className="shrink-0">
                      <PrintPhotoGallery
                        printId={print.id}
                        initialPhotos={parsePhotos(print.photoUrls)}
                      />
                    </div>

                    {/* Body */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline justify-between gap-2">
                        <span
                          className={cn(
                            "text-sm font-semibold truncate",
                            failed && "text-muted-foreground",
                          )}
                        >
                          {print.name ?? print.gcodeFile ?? "Unnamed print"}
                        </span>
                        <div className="flex items-center gap-2 shrink-0 font-[family-name:var(--font-geist-mono)] tabular-nums text-xs text-muted-foreground">
                          <span>{printWeight.toFixed(1)}g</span>
                          {printCost > 0 && print.energyCost ? (
                            <CostTooltip text={printCostTip}>
                              <span className="flex items-center gap-1 cursor-help underline decoration-dotted">
                                €{Number(print.filamentCost ?? 0).toFixed(2)}
                                <span className="text-muted-foreground/40">+</span>
                                <Zap className="w-3 h-3 text-warning" />
                                €{Number(print.energyCost).toFixed(2)}
                                <span className="text-muted-foreground/40">=</span>
                                <span className="font-semibold text-foreground">€{printCost.toFixed(2)}</span>
                              </span>
                            </CostTooltip>
                          ) : printCost > 0 ? (
                            <span>€{printCost.toFixed(2)}</span>
                          ) : null}
                        </div>
                      </div>

                      {/* Date + duration */}
                      <div className="flex items-center gap-1.5 mt-0.5 text-2xs text-muted-foreground">
                        <span>{formatDateTime(print.startedAt)}</span>
                        {print.durationSeconds != null && (
                          <>
                            <span className="opacity-50">·</span>
                            <span>{formatDuration(print.durationSeconds)}</span>
                          </>
                        )}
                      </div>

                      {/* Filament usage */}
                      {print.usage.length > 0 && (
                        <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">
                          {print.usage.map((u) => {
                            const filament = u.spool?.filament;
                            const hex = filament?.colorHex ?? "888888";
                            const name = filament
                              ? `${filament.material} ${filament.colorName ?? ""}`.trim()
                              : "Unknown";
                            return (
                              <div key={u.id} className="flex items-center gap-1.5">
                                <SpoolColorDot hex={hex} size="sm" />
                                <span className="text-2xs text-muted-foreground">
                                  {name} ·
                                </span>
                                <UsageWeightAdjuster
                                  printId={print.id}
                                  usageId={u.id}
                                  weightUsed={u.weightUsed}
                                />
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* Notes for failed */}
                      {failed && print.notes && (
                        <p className="text-2xs text-muted-foreground mt-1.5 italic">
                          {print.notes}
                        </p>
                      )}
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        </section>
      ))}

      {allPrints.length === 0 && (
        <div className="py-16 text-center">
          <p className="text-sm text-muted-foreground">No prints yet.</p>
        </div>
      )}
    </div>
  );
}
