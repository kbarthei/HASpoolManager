import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { CheckCircle2, AlertTriangle, XCircle } from "lucide-react";

interface ReliabilityEntry {
  vendor: string;
  material: string;
  prints: number;
  errors: number;
}

export function FilamentReliability({ data }: { data: ReliabilityEntry[] }) {
  return (
    <Card className="p-4 space-y-3 max-w-4xl mx-auto">
      <div>
        <h2 className="text-sm font-semibold">Filament Reliability</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          HMS error rate by vendor and material type
        </p>
      </div>
      <div className="space-y-1">
        {data.map((entry) => {
          const rate = entry.prints > 0
            ? Math.round(((entry.prints - entry.errors) / entry.prints) * 100)
            : 100;
          const hasErrors = entry.errors > 0;

          return (
            <div
              key={`${entry.vendor}-${entry.material}`}
              className="flex items-center justify-between py-1.5 px-2 rounded-md hover:bg-muted/50"
            >
              <div className="flex items-center gap-2 min-w-0">
                {rate >= 90 ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                ) : rate >= 50 ? (
                  <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                ) : (
                  <XCircle className="w-4 h-4 text-red-500 shrink-0" />
                )}
                <span className="text-sm font-medium truncate">
                  {entry.vendor} {entry.material}
                </span>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className="text-xs text-muted-foreground font-mono">
                  {entry.prints} prints
                </span>
                {hasErrors ? (
                  <Badge
                    className={cn(
                      "text-[10px] h-5 px-1.5",
                      rate >= 50
                        ? "bg-amber-500/15 text-amber-600 border-amber-500/30"
                        : "bg-red-500/15 text-red-600 border-red-500/30"
                    )}
                  >
                    {entry.errors} error{entry.errors !== 1 ? "s" : ""}
                  </Badge>
                ) : null}
                <span
                  className={cn(
                    "text-xs font-mono font-semibold w-10 text-right",
                    rate >= 90 ? "text-emerald-500" : rate >= 50 ? "text-amber-500" : "text-red-500"
                  )}
                >
                  {rate}%
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
