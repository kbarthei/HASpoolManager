"use client";

import { SpoolColorDot } from "@/components/spool/spool-color-dot";
import { getStockLevelBg } from "@/lib/theme";
import { cn } from "@/lib/utils";

interface StorageCellProps {
  spool?: {
    id: string;
    remainingWeight: number;
    initialWeight: number;
    filament: {
      name: string;
      material: string;
      colorHex: string | null;
      vendor: { name: string };
    };
  } | null;
  row: number;
  col: number;
  onClick: () => void;
}

export function StorageCell({ spool, row, col, onClick }: StorageCellProps) {
  if (spool) {
    const percent =
      spool.initialWeight > 0
        ? Math.round((spool.remainingWeight / spool.initialWeight) * 100)
        : 0;
    const stockDotClass = getStockLevelBg(percent);

    return (
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "relative aspect-square min-w-[48px] w-full",
          "flex flex-col items-center justify-center gap-[2px]",
          "bg-card border border-border rounded-lg",
          "cursor-pointer hover:bg-accent/50 transition-colors"
        )}
        aria-label={`${spool.filament.name} at R${row}S${col}`}
      >
        {/* Stock level dot — top right */}
        <span
          className={cn(
            "absolute top-1 right-1 w-[6px] h-[6px] rounded-full",
            stockDotClass
          )}
        />
        <SpoolColorDot
          hex={spool.filament.colorHex ?? "888888"}
          size="sm"
        />
        <span className="text-[7px] leading-tight text-muted-foreground text-center line-clamp-2 px-[2px] w-full">
          {spool.filament.material}
        </span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "aspect-square min-w-[48px] w-full",
        "flex items-center justify-center",
        "border border-dashed border-border rounded-lg",
        "cursor-pointer hover:border-primary/50 transition-colors"
      )}
      aria-label={`Empty slot R${row}S${col}`}
    >
      <span className="text-muted-foreground/50 text-lg leading-none select-none">+</span>
    </button>
  );
}
