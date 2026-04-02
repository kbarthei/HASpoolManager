import { getAllPrints, getPrinterStatus } from "@/lib/queries";
import { SpoolMaterialBadge } from "@/components/spool/spool-material-badge";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SpoolColorDot } from "@/components/spool/spool-color-dot";
import { UsageWeightAdjuster } from "@/components/prints/usage-weight-adjuster";
import { CheckCircle2, XCircle } from "lucide-react";
import { formatDateTime, formatDateLong, formatDateShort } from "@/lib/date";

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

// ── Page ──────────────────────────────────────────────────────────────────

export default async function PrintHistoryPage() {
  const [allPrints, printerStatus] = await Promise.all([
    getAllPrints(),
    getPrinterStatus(),
  ]);
  const runningPrints = allPrints.filter((p) => p.status === "running");
  const completedPrints = allPrints.filter((p) => p.status !== "running");

  const totalWeight = allPrints.reduce((sum, p) => {
    const w = p.usage.reduce((s, u) => s + u.weightUsed, 0);
    return sum + w;
  }, 0);

  const totalCost = allPrints.reduce((sum, p) => {
    const c = Number(p.totalCost ?? 0);
    return sum + c;
  }, 0);

  const grouped = groupByDate(completedPrints);

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold">Print History</h1>
        <p className="text-xs text-muted-foreground mt-1">
          {allPrints.length} prints &middot;{" "}
          {totalWeight.toFixed(1)}g used &middot; &euro;{totalCost.toFixed(2)} total
        </p>
      </div>

      {/* Currently Printing */}
      {runningPrints.length > 0 && (
        <div className="mb-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
            </span>
            Currently Printing
          </h3>
          <div className="space-y-2">
            {runningPrints.map((print) => (
              <Card key={print.id} className="p-3 rounded-xl border-l-[3px] border-l-primary">
                <div className="flex items-start justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate">
                      {print.name ?? print.gcodeFile ?? "Unnamed print"}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      Started{" "}
                      {formatDateShort(print.startedAt!)}
                      {print.printer && ` · ${print.printer.name}`}
                    </div>
                  </div>
                  <Badge className="text-[10px] h-5 px-1.5 bg-primary/15 text-primary border-primary/30 shrink-0 ml-2">
                    Printing
                  </Badge>
                </div>
                <div className="flex flex-wrap gap-3 mt-2 text-xs text-muted-foreground items-center">
                  {printerStatus.activeSpools && printerStatus.activeSpools.length > 0 ? (
                    printerStatus.activeSpools.map((spool, i) => (
                      <div key={i} className="flex items-center gap-1">
                        <SpoolColorDot hex={spool.colorHex} size="sm" />
                        <span>{spool.vendor} {spool.name}</span>
                        <SpoolMaterialBadge material={spool.material} />
                        {spool.colorName && (
                          <span className="text-muted-foreground">({spool.colorName})</span>
                        )}
                      </div>
                    ))
                  ) : printerStatus.activeSpool ? (
                    <div className="flex items-center gap-1">
                      <SpoolColorDot hex={printerStatus.activeSpool.colorHex} size="sm" />
                      <span>{printerStatus.activeSpool.vendor} {printerStatus.activeSpool.name}</span>
                      <SpoolMaterialBadge material={printerStatus.activeSpool.material} />
                      {printerStatus.activeSpool.colorName && (
                        <span className="text-muted-foreground">({printerStatus.activeSpool.colorName})</span>
                      )}
                    </div>
                  ) : null}
                  {print.printWeight != null && (
                    <span className="font-mono">{print.printWeight}g</span>
                  )}
                  {(printerStatus.progress ?? 0) > 0 && (
                    <span className="font-mono text-primary font-medium">{Math.round(printerStatus.progress ?? 0)}%</span>
                  )}
                  {(printerStatus.remainingTime ?? 0) > 0 && (
                    <span className="font-mono">{Math.round(printerStatus.remainingTime ?? 0)}min left</span>
                  )}
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Grouped history */}
      {Array.from(grouped.entries()).map(([dateLabel, dayPrints]) => (
        <section key={dateLabel}>
          {/* Sticky date header */}
          <div className="sticky top-0 z-10 bg-background py-1 mb-2">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              {dateLabel}
            </span>
          </div>

          <div className="space-y-2">
            {dayPrints.map((print) => {
              const finished = print.status === "finished";
              const failed = print.status === "failed" || print.status === "cancelled";
              const printWeight = print.usage.reduce((s, u) => s + u.weightUsed, 0);
              const printCost = Number(print.totalCost ?? 0);

              return (
                <Card key={print.id} className="px-4 py-3">
                  <div className="flex items-start gap-3">
                    {/* Status icon */}
                    <div className="mt-0.5 shrink-0">
                      {finished ? (
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                      ) : (
                        <XCircle className="h-4 w-4 text-red-500" />
                      )}
                    </div>

                    {/* Body */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline justify-between gap-2">
                        <span
                          className={`text-sm font-medium truncate ${
                            failed ? "text-muted-foreground" : ""
                          }`}
                        >
                          {print.name ?? print.gcodeFile ?? "Unnamed Print"}
                        </span>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="font-mono text-xs text-muted-foreground">
                            {printWeight.toFixed(1)}g
                          </span>
                          {printCost > 0 && (
                            <span className="font-mono text-xs text-muted-foreground">
                              &euro;{printCost.toFixed(2)}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Date + duration */}
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-muted-foreground">
                          {formatDateTime(print.startedAt)}
                        </span>
                        {print.durationSeconds != null && (
                          <>
                            <span className="text-xs text-muted-foreground">&middot;</span>
                            <span className="text-xs text-muted-foreground">
                              {formatDuration(print.durationSeconds)}
                            </span>
                          </>
                        )}
                      </div>

                      {/* Filament usage */}
                      {print.usage.length > 0 && (
                        <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1.5">
                          {print.usage.map((u) => {
                            const filament = u.spool?.filament;
                            const hex = filament?.colorHex ?? "888888";
                            const name = filament
                              ? `${filament.material} ${filament.colorName ?? ""}`.trim()
                              : "Unknown";
                            return (
                              <div key={u.id} className="flex items-center gap-1">
                                <SpoolColorDot hex={hex} size="sm" />
                                <span className="text-xs text-muted-foreground">
                                  {name} &middot;{" "}
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
                        <p className="text-xs text-muted-foreground mt-1 italic">
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
        <p className="text-sm text-muted-foreground text-center py-12">No prints yet.</p>
      )}
    </div>
  );
}
