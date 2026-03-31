import Link from "next/link";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { SpoolColorDot } from "@/components/spool/spool-color-dot";
import { SpoolProgressBar } from "@/components/spool/spool-progress-bar";
import { SpoolMaterialBadge } from "@/components/spool/spool-material-badge";
import type { getAmsSlots } from "@/lib/queries";

type AmsSlotData = Awaited<ReturnType<typeof getAmsSlots>>[number];

const SLOT_GROUPS = [
  { type: "ams", label: "AMS" },
  { type: "ams_ht", label: "AMS HT" },
  { type: "external", label: "External" },
] as const;

function SlotRow({ slot }: { slot: AmsSlotData }) {
  const spool = slot.spool;

  if (slot.isEmpty || !spool) {
    return (
      <div className="flex items-center gap-2 px-1 py-0.5">
        <div className="h-4 w-4 rounded-full bg-muted shrink-0" />
        <span className="text-sm text-muted-foreground flex-1">Empty</span>
      </div>
    );
  }

  const isDraft = spool.status === "draft";
  const filament = spool.filament;
  const hex = filament.colorHex ?? "888888";
  const percent =
    spool.initialWeight > 0
      ? Math.round((spool.remainingWeight / spool.initialWeight) * 100)
      : 0;

  return (
    <Link
      href={isDraft ? `/spools?status=draft` : `/spools/${spool.id}`}
      className="flex items-center gap-2 rounded-md px-1 -mx-1 py-0.5 hover:bg-accent/50 transition"
    >
      <SpoolColorDot hex={hex} size="sm" />
      <span className="text-sm font-medium truncate">{filament.name}</span>
      {isDraft ? (
        <span className="inline-flex items-center px-1 py-0.5 rounded text-[10px] font-medium bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 shrink-0">
          Draft
        </span>
      ) : (
        <SpoolMaterialBadge material={filament.material} className="shrink-0" />
      )}
      <div className="flex-1" />
      {!isDraft && (
        <>
          <SpoolProgressBar
            remaining={spool.remainingWeight}
            initial={spool.initialWeight}
            className="w-8 shrink-0"
          />
          <span className="text-sm font-mono w-8 text-right shrink-0">{percent}%</span>
        </>
      )}
    </Link>
  );
}

export function AmsMiniView({ slots }: { slots: AmsSlotData[] }) {
  return (
    <Card data-testid="ams-mini-view" className="rounded-xl shadow-sm dark:shadow-none">
      <CardHeader className="p-3 pb-2">
        <Link href="/inventory" className="hover:underline underline-offset-2">
          <CardTitle className="text-sm font-semibold">AMS Slots</CardTitle>
        </Link>
      </CardHeader>
      <CardContent className="p-3 pt-0 space-y-2">
        {SLOT_GROUPS.map(({ type, label }) => {
          const groupSlots = slots
            .filter((s) => s.slotType === type)
            .sort((a, b) => a.trayIndex - b.trayIndex);
          if (groupSlots.length === 0) return null;

          return (
            <div key={type}>
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium mb-0.5">
                {label}
              </div>
              <div className="flex flex-col gap-0.5">
                {groupSlots.map((slot) => (
                  <SlotRow key={slot.id} slot={slot} />
                ))}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
