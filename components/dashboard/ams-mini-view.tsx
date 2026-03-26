import Link from "next/link";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { SpoolColorDot } from "@/components/spool/spool-color-dot";
import { SpoolProgressBar } from "@/components/spool/spool-progress-bar";
import type { getAmsSlots } from "@/lib/queries";

type AmsSlotData = Awaited<ReturnType<typeof getAmsSlots>>[number];

export function AmsMiniView({ slots }: { slots: AmsSlotData[] }) {
  const filledSlots = slots.filter(s => !s.isEmpty && s.spool);

  return (
    <Card className="rounded-xl shadow-sm dark:shadow-none">
      <CardHeader className="p-3 pb-2">
        <Link href="/ams" className="hover:underline underline-offset-2">
          <CardTitle className="text-sm font-semibold">AMS Status</CardTitle>
        </Link>
      </CardHeader>
      <CardContent className="p-3 pt-0">
        {filledSlots.length === 0 ? (
          <p className="text-xs text-muted-foreground">No spools loaded</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {filledSlots.map(slot => {
              const spool = slot.spool!;
              const filament = spool.filament;
              const hex = filament.colorHex ?? "888888";
              const percent = spool.initialWeight > 0
                ? Math.round((spool.remainingWeight / spool.initialWeight) * 100)
                : 0;
              const name = filament.colorName
                ? `${filament.vendor?.name ?? ""} ${filament.colorName}`
                : `${filament.vendor?.name ?? ""} ${filament.name}`;

              return (
                <div key={slot.id} className="flex items-center gap-2">
                  <SpoolColorDot hex={hex} size="sm" />
                  <span className="text-xs flex-1 truncate">{name.trim()}</span>
                  <SpoolProgressBar
                    remaining={spool.remainingWeight}
                    initial={spool.initialWeight}
                    className="w-8 shrink-0"
                  />
                  <span className="text-xs font-mono w-8 text-right shrink-0">
                    {percent}%
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
