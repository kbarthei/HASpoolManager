import Link from "next/link";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { SpoolColorDot } from "@/components/spool/spool-color-dot";
import type { getSupplyStatus } from "@/lib/queries";

type SupplyStatusEntry = Awaited<ReturnType<typeof getSupplyStatus>>[number];

const MAX_ITEMS = 5;

function urgencyIcon(urgency: "critical" | "warning" | "ok") {
  switch (urgency) {
    case "critical": return <span className="text-red-500 text-xs leading-none" aria-label="Critical">!!!</span>;
    case "warning": return <span className="text-amber-500 text-xs leading-none" aria-label="Warning">!!</span>;
    case "ok": return <span className="text-emerald-500 text-xs leading-none" aria-label="OK">OK</span>;
  }
}

function daysLabel(days: number): string {
  if (days === Infinity || days > 999) return "999+d";
  return `${Math.round(days)}d`;
}

function progressPercent(entry: SupplyStatusEntry): number {
  const maxDays = 60;
  if (entry.daysRemaining === Infinity || entry.daysRemaining > maxDays) return 100;
  return Math.max(0, Math.min(100, Math.round((entry.daysRemaining / maxDays) * 100)));
}

function progressColor(urgency: "critical" | "warning" | "ok"): string {
  switch (urgency) {
    case "critical": return "bg-red-500";
    case "warning": return "bg-amber-500";
    case "ok": return "bg-emerald-500";
  }
}

export function SupplyStatusWidget({ statuses }: { statuses: SupplyStatusEntry[] }) {
  const criticalCount = statuses.filter(s => s.urgency === "critical").length;
  const warningCount = statuses.filter(s => s.urgency === "warning").length;

  const sorted = [...statuses].sort((a, b) => a.daysRemaining - b.daysRemaining);
  const top = sorted.slice(0, MAX_ITEMS);

  return (
    <Card data-testid="supply-status-widget" className="rounded-xl shadow-sm dark:shadow-none">
      <CardHeader className="p-3 pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold">Supply Status</CardTitle>
          <Link
            href="/supply"
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            All &rarr;
          </Link>
        </div>
        {(criticalCount > 0 || warningCount > 0) && (
          <p className="text-xs text-muted-foreground mt-0.5">
            {criticalCount > 0 && (
              <span className="text-red-500 font-medium">{criticalCount} critical</span>
            )}
            {criticalCount > 0 && warningCount > 0 && (
              <span className="mx-1">&middot;</span>
            )}
            {warningCount > 0 && (
              <span className="text-amber-500 font-medium">{warningCount} warning</span>
            )}
          </p>
        )}
      </CardHeader>
      <CardContent className="p-3 pt-0">
        {top.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Run supply analysis to see status
          </p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {top.map(entry => {
              const pct = progressPercent(entry);
              const barColor = progressColor(entry.urgency);
              const label = entry.material
                ? `${entry.filamentName} ${entry.material}`
                : entry.filamentName;

              return (
                <div
                  key={entry.filamentId}
                  className="flex items-center gap-2"
                >
                  <SpoolColorDot hex={entry.colorHex} size="sm" />
                  <span className="text-sm flex-1 truncate" title={`${entry.vendor} ${label}`}>
                    {label}
                  </span>
                  <div className="w-20 h-1.5 rounded-full bg-muted overflow-hidden shrink-0">
                    <div
                      className={`h-full rounded-full ${barColor} transition-all`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="text-xs font-mono text-muted-foreground w-10 text-right shrink-0">
                    {daysLabel(entry.daysRemaining)}
                  </span>
                  <span className="w-5 text-center shrink-0">
                    {urgencyIcon(entry.urgency)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
