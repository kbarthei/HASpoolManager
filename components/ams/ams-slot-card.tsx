"use client";

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
  /** When true, card is dimmed (filter active + slot doesn't match). */
  dimmed?: boolean;
}

function slotLabel(slotType: string, trayIndex: number): string {
  if (slotType === "ams_ht") return "HT";
  if (slotType === "external") return "Ext";
  return `${trayIndex + 1}`;
}

export function AmsSlotCard({
  slot,
  onClickSpool,
  onClickLoad,
  onClickUnload,
  onClickArchive,
  dimmed,
}: AmsSlotCardProps) {
  const spool = slot.spool;
  const label = slotLabel(slot.slotType, slot.trayIndex);

  if (slot.isEmpty || !spool) {
    return (
      <button
        type="button"
        onClick={() => onClickLoad?.(slot.id)}
        className={cn(
          "flex items-center gap-3 p-3 rounded-xl bg-background border border-dashed border-border opacity-60 hover:opacity-100 hover:border-primary/60 transition-all text-left w-full",
          dimmed && "opacity-20 hover:opacity-40",
        )}
      >
        <div className="w-10 h-10 rounded-full border border-dashed border-border shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="text-2xs font-bold tracking-wide uppercase text-muted-foreground">
            Slot {label}
          </div>
          <div className="text-sm text-muted-foreground">— Empty —</div>
        </div>
        <span className="text-xs text-primary font-semibold shrink-0">+ Load</span>
      </button>
    );
  }

  const isDraft = spool.status === "draft";
  const rawHex = spool.filament.colorHex ?? "";
  const validHex = /^#?[0-9A-Fa-f]{6,8}$/.test(rawHex);
  const spoolColor = validHex
    ? rawHex.startsWith("#")
      ? rawHex
      : `#${rawHex.slice(0, 6)}`
    : "#e5e5ea";

  // Prefer bambuRemain (live from AMS RFID) over weight-ratio when available
  const pct =
    slot.bambuRemain >= 0 && slot.bambuRemain <= 100
      ? slot.bambuRemain
      : spool.initialWeight > 0
      ? Math.round((spool.remainingWeight / spool.initialWeight) * 100)
      : 0;
  const low = pct < 10;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onClickSpool?.(spool.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClickSpool?.(spool.id);
        }
      }}
      className={cn(
        "relative flex items-center gap-3 p-3 rounded-xl bg-background border cursor-pointer transition-all",
        "hover:bg-accent/40 focus:outline-none focus:ring-2 focus:ring-ring",
        isDraft
          ? "border-warning"
          : low
          ? "border-destructive"
          : "border-border",
        dimmed && "opacity-30 hover:opacity-60",
      )}
    >
      <div
        className="spool-dot w-10 h-10 rounded-full shrink-0"
        style={{ ["--spool-color" as string]: spoolColor }}
      />
      <div className="min-w-0 flex-1">
        <div className="text-2xs font-bold tracking-wide uppercase text-muted-foreground">
          Slot {label}
          {isDraft && (
            <span className="ml-1.5 px-1 py-px rounded text-2xs font-bold bg-warning/15 text-warning normal-case tracking-normal">
              Draft
            </span>
          )}
        </div>
        <div className="text-sm font-semibold truncate">{spool.filament.name}</div>
        <div className="text-2xs text-muted-foreground truncate">
          {spool.filament.vendor.name} · {spool.filament.material}
        </div>
        <div className="mt-1.5 h-[3px] rounded bg-muted overflow-hidden">
          <div
            className={cn("h-full rounded", low ? "bg-destructive" : "bg-success")}
            style={{ width: `${pct}%` }}
          />
        </div>
        <div
          className={cn(
            "text-sm font-bold tracking-tight mt-0.5 font-[family-name:var(--font-geist-mono)] tabular-nums",
            low && "text-destructive",
          )}
        >
          {pct}%
        </div>
      </div>

      <div className="absolute top-1.5 right-1.5 flex items-center gap-0.5">
        <button
          type="button"
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
          type="button"
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
