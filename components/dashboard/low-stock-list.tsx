import Link from "next/link";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { SpoolColorDot } from "@/components/spool/spool-color-dot";
import { getStockLevelColor } from "@/lib/theme";
import type { getLowStockSpools } from "@/lib/queries";

type SpoolWithFilament = Awaited<ReturnType<typeof getLowStockSpools>>[number];

export function LowStockList({ spools }: { spools: SpoolWithFilament[] }) {
  return (
    <Card className="rounded-xl shadow-sm dark:shadow-none">
      <CardHeader className="p-3 pb-2">
        <CardTitle className="text-sm font-semibold">Low Stock</CardTitle>
      </CardHeader>
      <CardContent className="p-3 pt-0">
        {spools.length === 0 ? (
          <p className="text-xs text-muted-foreground">All stocked</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {spools.map(spool => {
              const filament = spool.filament;
              const hex = filament.colorHex ?? "888888";
              const percent = spool.initialWeight > 0
                ? Math.round((spool.remainingWeight / spool.initialWeight) * 100)
                : 0;
              const colorClass = getStockLevelColor(percent);
              const name = filament.colorName
                ? `${filament.vendor?.name ?? ""} ${filament.colorName}`
                : `${filament.vendor?.name ?? ""} ${filament.name}`;

              return (
                <Link
                  key={spool.id}
                  href={`/spools/${spool.id}`}
                  className="flex items-center gap-2 rounded px-1 -mx-1 hover:bg-accent/50 transition cursor-pointer"
                >
                  <SpoolColorDot hex={hex} size="sm" />
                  <span className="text-xs flex-1 truncate">{name.trim()}</span>
                  <span className={`text-xs font-mono shrink-0 ${colorClass}`}>
                    {spool.remainingWeight}g
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
