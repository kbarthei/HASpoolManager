"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SpoolColorDot } from "@/components/spool/spool-color-dot";
import { cn } from "@/lib/utils";
import { AlertTriangle, X, TrendingUp } from "lucide-react";
import { AddToListButton } from "@/components/supply/add-to-list-button";
import { toast } from "sonner";

interface Alert {
  id: string;
  alertType: string;
  severity: string;
  title: string;
  message: string | null;
  data: string | null;
  filamentId: string;
  filament: {
    id: string;
    name: string;
    material: string;
    colorHex: string | null;
    vendor: { name: string } | null;
  };
}

export function SupplyAlertsSection({ alerts }: { alerts: Alert[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const criticalCount = alerts.filter((a) => a.severity === "critical").length;
  const warningCount = alerts.filter((a) => a.severity === "warning").length;

  async function dismissAlert(alertId: string) {
    startTransition(async () => {
      try {
        await fetch(`/api/v1/supply/alerts/${alertId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "dismissed" }),
        });
        router.refresh();
      } catch {
        toast.error("Failed to dismiss alert");
      }
    });
  }

  return (
    <Card className="p-4 space-y-3 border-l-[3px] border-l-amber-500">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-500" />
          <h2 className="text-sm font-semibold">Supply Alerts</h2>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {criticalCount > 0 && (
            <Badge className="text-[10px] h-4 bg-red-500/15 text-red-600 border-red-500/30">
              {criticalCount} critical
            </Badge>
          )}
          {warningCount > 0 && (
            <Badge className="text-[10px] h-4 bg-amber-500/15 text-amber-600 border-amber-500/30">
              {warningCount} warning
            </Badge>
          )}
        </div>
      </div>

      <div className="space-y-2">
        {alerts.map((alert) => {
          const parsed = alert.data ? JSON.parse(alert.data) : {};
          const vendor = alert.filament.vendor?.name ?? "";
          const isTrend = alert.alertType === "trend_warning";

          return (
            <div
              key={alert.id}
              className={cn(
                "flex items-start gap-3 p-2 rounded-md",
                alert.severity === "critical" ? "bg-red-500/5" : "bg-amber-500/5"
              )}
            >
              <SpoolColorDot hex={alert.filament.colorHex ?? "888888"} size="sm" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-medium truncate">
                    {vendor} {alert.filament.material}
                  </span>
                  <Badge className="text-[9px] h-4 px-1 bg-muted text-muted-foreground">
                    {alert.filament.name}
                  </Badge>
                  {isTrend && <TrendingUp className="w-3 h-3 text-amber-500" />}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {alert.title}
                  {parsed.avgGramsPerDay > 0 && (
                    <> · {parsed.avgGramsPerDay}g/day</>
                  )}
                  {parsed.recommendedQty > 0 && (
                    <> · order {parsed.recommendedQty}x</>
                  )}
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <AddToListButton
                  filamentId={alert.filamentId}
                  filamentName={`${vendor} ${alert.filament.name}`}
                  qty={parsed.recommendedQty || 1}
                />
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0"
                  onClick={() => dismissAlert(alert.id)}
                  disabled={isPending}
                  title="Dismiss"
                >
                  <X className="w-3 h-3" />
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
