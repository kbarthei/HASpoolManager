"use client";

import { SpoolColorDot } from "@/components/spool/spool-color-dot";
import { SpoolProgressBar } from "@/components/spool/spool-progress-bar";
import { SpoolMaterialBadge } from "@/components/spool/spool-material-badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Archive, X } from "lucide-react";

interface SlotSpool {
  id: string;
  remainingWeight: number;
  initialWeight: number;
  status: string;
  filament: {
    name: string;
    material: string;
    colorHex: string | null;
    vendor: { name: string };
  };
}

interface AmsSlotCardProps {
  slot: {
    id: string;
    slotType: string;
    amsIndex: number;
    trayIndex: number;
    isEmpty: boolean;
    bambuRemain: number;
    spool?: SlotSpool | null;
  };
  onClickSpool?: (spoolId: string) => void;
  onClickLoad?: (slotId: string) => void;
  onClickUnload?: (slotId: string) => void;
  onClickArchive?: (spoolId: string) => void;
}

export function AmsSlotCard({ slot, onClickSpool, onClickLoad, onClickUnload, onClickArchive }: AmsSlotCardProps) {
  const spool = slot.spool;
  const isDraft = spool?.status === "draft";
  const colorHex = spool?.filament.colorHex ?? null;
  const accentColor = colorHex ? `#${colorHex.replace("#", "")}` : undefined;

  const percent =
    spool && spool.initialWeight > 0
      ? Math.round((spool.remainingWeight / spool.initialWeight) * 100)
      : 0;

  if (slot.isEmpty || !spool) {
    return (
      <div
        className={cn(
          "rounded-lg p-2.5 bg-card border border-dashed border-border",
          "flex items-center gap-2"
        )}
      >
        <div className="h-6 w-6 rounded-full shrink-0 bg-muted" />
        <div className="flex-1 min-w-0">
          <div className="text-xs text-muted-foreground">Empty</div>
          <div className="text-xs text-muted-foreground">Slot {slot.trayIndex + 1}</div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="text-xs text-primary h-auto py-1 px-2 shrink-0"
          onClick={() => onClickLoad?.(slot.id)}
        >
          + Load
        </Button>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "rounded-lg p-2.5 bg-card border relative cursor-pointer",
        "flex items-center gap-2",
        "hover:bg-accent/50 transition-colors",
        isDraft
          ? "border-amber-400 dark:border-amber-500"
          : "border-border"
      )}
      style={isDraft ? { borderLeftWidth: "3px", borderLeftColor: "#f59e0b" } : { borderLeftWidth: "3px", borderLeftColor: accentColor ?? "#6b7280" }}
      onClick={() => onClickSpool?.(spool.id)}
    >
      <SpoolColorDot
        hex={colorHex ?? "888888"}
        className="h-6 w-6 shrink-0"
      />

      <div className="flex-1 min-w-0 space-y-0.5">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-medium truncate">{spool.filament.name}</span>
          <SpoolMaterialBadge material={spool.filament.material} />
          {isDraft && (
            <span className="inline-flex items-center px-1 py-0.5 rounded text-[10px] font-medium bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30">
              Draft
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground truncate">
            {spool.filament.vendor.name}
          </span>
          <span className="text-xs text-muted-foreground">·</span>
          <span className="text-xs text-muted-foreground">Slot {slot.trayIndex + 1}</span>
          <span className="text-xs text-muted-foreground">·</span>
          <span className="text-xs font-mono text-muted-foreground">{spool.remainingWeight}g</span>
        </div>
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
        <SpoolProgressBar
          remaining={spool.remainingWeight}
          initial={spool.initialWeight}
          className="w-10"
        />
        <span className="text-xs font-mono w-8 text-right">{percent}%</span>
      </div>

      <div className="absolute top-1 right-1 flex items-center gap-0.5">
        <button
          className="h-5 w-5 rounded-full flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-muted transition-colors"
          onClick={(e) => {
            e.stopPropagation();
            onClickArchive?.(spool.id);
          }}
          aria-label="Archive spool"
        >
          <Archive className="h-3 w-3" />
        </button>
        <button
          className="h-5 w-5 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          onClick={(e) => {
            e.stopPropagation();
            onClickUnload?.(slot.id);
          }}
          aria-label="Unload spool"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}
