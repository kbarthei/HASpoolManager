export const dynamic = "force-dynamic";

import { getSupplyStatus } from "@/lib/queries";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SpoolColorDot } from "@/components/spool/spool-color-dot";
import { SpoolMaterialBadge } from "@/components/spool/spool-material-badge";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { TrendingUp, TrendingDown, Minus, ArrowRight } from "lucide-react";

function daysLabel(days: number): string {
  if (days === Infinity || days > 999) return "999+";
  return String(Math.round(days));
}

function trendIcon(trend: "rising" | "falling" | "stable") {
  switch (trend) {
    case "rising": return <TrendingUp className="w-3 h-3 text-amber-500" />;
    case "falling": return <TrendingDown className="w-3 h-3 text-emerald-500" />;
    case "stable": return <Minus className="w-3 h-3 text-muted-foreground" />;
  }
}

function urgencyBg(urgency: "critical" | "warning" | "ok"): string {
  switch (urgency) {
    case "critical": return "border-l-red-500 bg-red-500/5";
    case "warning": return "border-l-amber-500 bg-amber-500/5";
    case "ok": return "";
  }
}

function progressColor(urgency: "critical" | "warning" | "ok"): string {
  switch (urgency) {
    case "critical": return "bg-red-500";
    case "warning": return "bg-amber-500";
    case "ok": return "bg-emerald-500";
  }
}

export default async function SupplyPage() {
  const statuses = await getSupplyStatus();

  const sorted = [...statuses].sort((a, b) => a.daysRemaining - b.daysRemaining);
  const criticalCount = sorted.filter(s => s.urgency === "critical").length;
  const warningCount = sorted.filter(s => s.urgency === "warning").length;
  const okCount = sorted.filter(s => s.urgency === "ok").length;

  return (
    <div data-testid="page-supply" className="max-w-3xl mx-auto px-4 py-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Supply Status</h1>
          <p className="text-xs text-muted-foreground mt-1">
            {sorted.length} filaments tracked
            {criticalCount > 0 && <> · <span className="text-red-500 font-medium">{criticalCount} critical</span></>}
            {warningCount > 0 && <> · <span className="text-amber-500 font-medium">{warningCount} warning</span></>}
            {okCount > 0 && <> · {okCount} ok</>}
          </p>
        </div>
        <Link
          href="/orders"
          className="text-xs text-primary hover:underline flex items-center gap-1"
        >
          Orders <ArrowRight className="w-3 h-3" />
        </Link>
      </div>

      {/* Full list */}
      {sorted.length === 0 ? (
        <Card className="p-8 text-center">
          <p className="text-sm text-muted-foreground">No filaments with active spools.</p>
          <p className="text-xs text-muted-foreground mt-1">Supply analysis runs automatically after each print.</p>
        </Card>
      ) : (
        <div className="space-y-1">
          {sorted.map((entry) => {
            const pct = entry.daysRemaining === Infinity || entry.daysRemaining > 60
              ? 100
              : Math.max(0, Math.min(100, Math.round((entry.daysRemaining / 60) * 100)));

            return (
              <Card
                key={entry.filamentId}
                className={cn(
                  "px-4 py-3 border-l-[3px]",
                  urgencyBg(entry.urgency),
                  entry.urgency === "ok" && "border-l-transparent"
                )}
              >
                <div className="flex items-center gap-3">
                  {/* Color + Name */}
                  <SpoolColorDot hex={entry.colorHex} size="sm" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium truncate">
                        {entry.vendor} {entry.filamentName}
                      </span>
                      <SpoolMaterialBadge material={entry.material} />
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                      <span className="font-mono">{entry.currentStock.spoolCount} spool{entry.currentStock.spoolCount !== 1 ? "s" : ""}</span>
                      <span className="font-mono">{entry.currentStock.totalGrams}g</span>
                      {entry.consumption.avgGramsPerDay > 0 && (
                        <span className="flex items-center gap-1">
                          {entry.consumption.avgGramsPerDay}g/day
                          {trendIcon(entry.consumption.trend)}
                        </span>
                      )}
                      <Badge className={cn(
                        "text-[9px] h-4 px-1",
                        entry.category === "core" ? "bg-primary/15 text-primary border-primary/30" :
                        entry.category === "regular" ? "bg-blue-500/15 text-blue-600 border-blue-500/30" :
                        entry.category === "project" ? "bg-purple-500/15 text-purple-600 border-purple-500/30" :
                        "bg-muted text-muted-foreground"
                      )}>
                        {entry.category}
                      </Badge>
                    </div>
                  </div>

                  {/* Progress bar + days */}
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="w-24 h-2 rounded-full bg-muted overflow-hidden">
                      <div
                        className={cn("h-full rounded-full transition-all", progressColor(entry.urgency))}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className={cn(
                      "text-sm font-mono font-semibold w-12 text-right",
                      entry.urgency === "critical" ? "text-red-500" :
                      entry.urgency === "warning" ? "text-amber-500" :
                      "text-emerald-500"
                    )}>
                      {daysLabel(entry.daysRemaining)}d
                    </span>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
