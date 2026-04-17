import { getBudgetStatus } from "@/lib/budget";
import { Card } from "@/components/ui/card";
import { Wallet } from "lucide-react";
import { cn } from "@/lib/utils";

function formatEur(n: number): string {
  return n.toLocaleString("de-DE", { style: "currency", currency: "EUR" });
}

function formatMonth(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  return d.toLocaleDateString("de-DE", { day: "2-digit", month: "short" });
}

export async function BudgetCard() {
  const status = await getBudgetStatus();

  if (status.budget == null) {
    return (
      <Card className="p-3" data-testid="budget-card">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Wallet className="w-3.5 h-3.5" />
          <span>No monthly filament budget set — configure in Admin.</span>
        </div>
      </Card>
    );
  }

  const percent = status.percentUsed ?? 0;
  const barTone =
    percent < 80 ? "bg-emerald-500"
    : percent < 100 ? "bg-amber-500"
    : "bg-red-500";

  return (
    <Card className="p-3 space-y-2" data-testid="budget-card">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs font-semibold">
          <Wallet className="w-3.5 h-3.5 text-primary" />
          Budget
        </div>
        <div className="text-[10px] text-muted-foreground">
          {formatMonth(status.periodStart)} – {formatMonth(
            new Date(new Date(status.periodEnd + "T00:00:00Z").getTime() - 86400000)
              .toISOString()
              .slice(0, 10)
          )}
        </div>
      </div>
      <div className="flex items-baseline gap-1">
        <span className="text-sm font-mono font-semibold">{formatEur(status.spent)}</span>
        <span className="text-xs text-muted-foreground">/ {formatEur(status.budget)}</span>
        <span className="ml-auto text-[10px] font-mono text-muted-foreground">
          {percent}%
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
        <div
          className={cn("h-full transition-all", barTone)}
          style={{ width: `${Math.min(100, percent)}%` }}
        />
      </div>
    </Card>
  );
}
