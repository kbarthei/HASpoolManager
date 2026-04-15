import Link from "next/link";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { costTooltip } from "@/lib/format-cost";
import { CostTooltip } from "@/components/prints/cost-tooltip";
import type { getRecentPrints } from "@/lib/queries";

type PrintData = Awaited<ReturnType<typeof getRecentPrints>>[number];

function timeAgo(date: Date | string | null): string {
  if (!date) return "";
  const d = typeof date === "string" ? new Date(date) : date;
  const diffMs = Date.now() - d.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h ago`;
  const diffD = Math.floor(diffH / 24);
  return `${diffD}d ago`;
}

export function RecentPrints({ prints }: { prints: PrintData[] }) {
  return (
    <Card data-testid="recent-prints" className="rounded-xl shadow-sm dark:shadow-none">
      <CardHeader className="p-3 pb-2">
        <CardTitle className="text-sm font-semibold">Recent Prints</CardTitle>
      </CardHeader>
      <CardContent className="p-3 pt-0">
        {prints.length === 0 ? (
          <p className="text-xs text-muted-foreground">No prints yet</p>
        ) : (
          <div className="flex flex-col gap-1">
            {prints.map(print => {
              const isFailed = print.status === "failed" || print.status === "cancelled";
              const isFinished = print.status === "finished";

              const totalWeight = print.usage.reduce(
                (sum, u) => sum + (u.weightUsed ?? 0),
                0
              );
              const totalCost = print.totalCost ? parseFloat(String(print.totalCost)) : 0;

              return (
                <Link
                  key={print.id}
                  href="/prints"
                  className={cn(
                    "flex items-center gap-2 hover:bg-accent/50 rounded-md px-1 -mx-1 py-0.5 transition",
                    isFailed && "text-muted-foreground"
                  )}
                >
                  {/* Status icon */}
                  <span
                    className={cn(
                      "text-xs font-bold shrink-0 w-3",
                      isFinished && "text-emerald-500",
                      isFailed && "text-red-500",
                      !isFinished && !isFailed && "text-amber-500"
                    )}
                  >
                    {isFinished ? "✓" : isFailed ? "✗" : "●"}
                  </span>

                  {/* Print name */}
                  <span
                    className={cn(
                      "text-sm flex-1 truncate",
                      isFailed && "line-through"
                    )}
                  >
                    {print.name ?? print.gcodeFile ?? "Unnamed print"}
                  </span>

                  {/* Weight + cost */}
                  <span className="text-sm font-mono shrink-0 text-muted-foreground">
                    {Math.round(totalWeight)}g
                  </span>
                  {totalCost > 0 && (
                    <CostTooltip text={costTooltip(print)}>
                      <span
                        className={cn(
                          "text-sm font-mono shrink-0 text-muted-foreground",
                          costTooltip(print) && "cursor-help underline decoration-dotted"
                        )}
                      >
                        {totalCost.toFixed(2)}€
                      </span>
                    </CostTooltip>
                  )}

                  {/* Time ago */}
                  <span className="text-xs font-mono shrink-0 text-muted-foreground/70">
                    {timeAgo(print.startedAt)}
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
