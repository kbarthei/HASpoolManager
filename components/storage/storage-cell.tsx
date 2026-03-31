"use client";

import { SpoolColorDot } from "@/components/spool/spool-color-dot";
import { getStockLevelBg } from "@/lib/theme";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

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
  onMoveToSurplus?: (spoolId: string) => void;
  onMoveToWorkbench?: (spoolId: string) => void;
  onRemoveFromRack?: (spoolId: string) => void;
  onArchive?: (spoolId: string) => void;
  isDragging?: boolean;
  isDragOver?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDrop?: (e: React.DragEvent) => void;
  onDragEnd?: (e: React.DragEvent) => void;
}

export function StorageCell({
  spool,
  row,
  col,
  onClick,
  onMoveToSurplus,
  onMoveToWorkbench,
  onRemoveFromRack,
  onArchive,
  isDragging,
  isDragOver,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: StorageCellProps) {
  if (spool) {
    const percent =
      spool.initialWeight > 0
        ? Math.round((spool.remainingWeight / spool.initialWeight) * 100)
        : 0;
    const stockDotClass = getStockLevelBg(percent);

    return (
      <DropdownMenu>
        <DropdownMenuTrigger
          draggable
          onDragStart={onDragStart}
          onDragOver={onDragOver}
          onDrop={onDrop}
          onDragEnd={onDragEnd}
          className={cn(
            "relative min-h-[48px] sm:min-h-[56px] w-full",
            "flex items-center gap-1.5 py-1.5 px-1.5",
            "bg-card border border-border rounded-lg",
            "cursor-grab hover:bg-accent/50 transition-colors select-none",
            isDragging && "opacity-50",
            isDragOver && "ring-2 ring-primary"
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
            size="md"
            className="shrink-0"
          />
          <div className="flex-1 min-w-0 space-y-0">
            <span className="text-[10px] sm:text-[11px] leading-tight text-foreground block truncate">
              {spool.filament.name}
            </span>
            <span className="text-[9px] sm:text-[10px] leading-tight text-muted-foreground block truncate">
              {spool.filament.vendor.name}
            </span>
            <span className="text-[9px] sm:text-[10px] leading-tight text-muted-foreground block truncate">
              {spool.filament.material} · {spool.remainingWeight}g
            </span>
          </div>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="center" side="bottom" className="w-44">
          <DropdownMenuItem onClick={onClick}>
            View Details
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => onMoveToSurplus?.(spool.id)}>
            Move to Surplus
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onMoveToWorkbench?.(spool.id)}>
            Move to Workbench
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => onRemoveFromRack?.(spool.id)}
            className="text-destructive focus:text-destructive"
          >
            Remove from Rack
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => onArchive?.(spool.id)} className="text-destructive focus:text-destructive">
            Archive
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      onDragOver={onDragOver}
      onDrop={onDrop}
      className={cn(
        "min-h-[56px] sm:min-h-[72px] w-full",
        "flex items-center justify-center",
        "border border-dashed border-border rounded-lg",
        "cursor-pointer hover:border-primary/50 transition-colors",
        isDragOver && "ring-2 ring-primary border-primary/50"
      )}
      aria-label={`Empty slot R${row}S${col}`}
    >
      <span className="text-muted-foreground/50 text-lg leading-none select-none">+</span>
    </button>
  );
}
