import { getAllPrints } from "@/lib/queries";
import { Card } from "@/components/ui/card";
import { SpoolColorDot } from "@/components/spool/spool-color-dot";
import { CheckCircle2, XCircle } from "lucide-react";

// ── Helpers ────────────────────────────────────────────────────────────────

function formatDateTime(date: Date | null | string | undefined): string {
  if (!date) return "—";
  const d = date instanceof Date ? date : new Date(date);
  return d.toLocaleString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

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
    const key = d
      ? d.toLocaleDateString("de-DE", {
          day: "numeric",
          month: "long",
          year: "numeric",
        })
      : "Unknown";
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(item);
  }
  return map;
}

// ── Page ──────────────────────────────────────────────────────────────────

export default async function PrintHistoryPage() {
  const prints = await getAllPrints();

  const totalWeight = prints.reduce((sum, p) => {
    const w = p.usage.reduce((s, u) => s + u.weightUsed, 0);
    return sum + w;
  }, 0);

  const totalCost = prints.reduce((sum, p) => {
    const c = Number(p.totalCost ?? 0);
    return sum + c;
  }, 0);

  const grouped = groupByDate(prints);

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold">Print History</h1>
        <p className="text-xs text-muted-foreground mt-1">
          {prints.length} prints &middot;{" "}
          {totalWeight.toFixed(1)}g used &middot; &euro;{totalCost.toFixed(2)} total
        </p>
      </div>

      {/* Grouped list */}
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
                                  {name} &middot; {u.weightUsed.toFixed(1)}g
                                </span>
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

      {prints.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-12">No prints yet.</p>
      )}
    </div>
  );
}
