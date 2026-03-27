"use client";

import { useState } from "react";
import { StorageGrid } from "@/components/storage/storage-grid";
import { SpoolDetailSheet } from "@/components/spool/spool-detail-sheet";
import { SpoolPicker } from "@/components/spool/spool-picker";
import { SpoolColorDot } from "@/components/spool/spool-color-dot";
import { SpoolMaterialBadge } from "@/components/spool/spool-material-badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { assignSpoolToRack, moveSpoolInRack, moveSpoolTo } from "@/lib/actions";
import { toast } from "sonner";

interface SpoolData {
  id: string;
  location: string | null;
  remainingWeight: number;
  initialWeight: number;
  filament: {
    name: string;
    material: string;
    colorHex: string | null;
    vendor: { name: string };
  };
}

interface StorageClientProps {
  spools: SpoolData[];
  surplusSpools: SpoolData[];
  workbenchSpools: SpoolData[];
  rows: number;
  cols: number;
}

function spoolLabel(spool: SpoolData) {
  return `${spool.filament.vendor.name} ${spool.filament.name}`;
}

export function StorageClient({ spools, surplusSpools, workbenchSpools, rows, cols }: StorageClientProps) {
  // Detail sheet state (occupied cell)
  const [detailSpoolId, setDetailSpoolId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  // Picker state (empty cell)
  const [pickerOpen, setPickerOpen] = useState(false);
  const [targetRow, setTargetRow] = useState<number>(1);
  const [targetCol, setTargetCol] = useState<number>(1);

  function openDetail(spoolId: string) {
    setDetailSpoolId(spoolId);
    setDetailOpen(true);
  }

  function handleCellClick(row: number, col: number, spool?: SpoolData | null) {
    if (!spool) {
      setTargetRow(row);
      setTargetCol(col);
      setPickerOpen(true);
    }
    // Occupied cells open via the DropdownMenu "View Details" item
  }

  async function handlePickerSelect(spoolId: string) {
    await assignSpoolToRack(spoolId, targetRow, targetCol);
  }

  async function handleMove(fromRow: number, fromCol: number, toRow: number, toCol: number) {
    const spoolMap = new Map<string, SpoolData>();
    for (const spool of spools) {
      const match = spool.location?.match(/^rack:(\d+)-(\d+)$/);
      if (match) {
        spoolMap.set(`${match[1]}-${match[2]}`, spool);
      }
    }

    const movingSpool = spoolMap.get(`${fromRow}-${fromCol}`);
    if (!movingSpool) return;

    const swapSpool = spoolMap.get(`${toRow}-${toCol}`);

    try {
      await moveSpoolInRack(
        movingSpool.id,
        toRow,
        toCol,
        swapSpool?.id,
        swapSpool ? fromRow : undefined,
        swapSpool ? fromCol : undefined,
      );
      toast.success(
        swapSpool
          ? `Swapped ${movingSpool.filament.name} with ${swapSpool.filament.name}`
          : `Moved ${movingSpool.filament.name} to R${toRow}S${toCol}`
      );
    } catch {
      toast.error("Failed to move spool");
    }
  }

  async function handleMoveToSurplus(spoolId: string) {
    const spool = [...spools, ...workbenchSpools].find((s) => s.id === spoolId);
    try {
      await moveSpoolTo(spoolId, "surplus");
      toast.success(spool ? `Moved ${spoolLabel(spool)} to surplus` : "Moved to surplus");
    } catch {
      toast.error("Failed to move spool");
    }
  }

  async function handleMoveToWorkbench(spoolId: string) {
    const spool = [...spools, ...surplusSpools].find((s) => s.id === spoolId);
    try {
      await moveSpoolTo(spoolId, "workbench");
      toast.success(spool ? `Moved ${spoolLabel(spool)} to workbench` : "Moved to workbench");
    } catch {
      toast.error("Failed to move spool");
    }
  }

  async function handleRemoveFromRack(spoolId: string) {
    const spool = spools.find((s) => s.id === spoolId);
    try {
      await moveSpoolTo(spoolId, "surplus");
      toast.success(spool ? `Removed ${spoolLabel(spool)} from rack` : "Removed from rack");
    } catch {
      toast.error("Failed to remove spool");
    }
  }

  return (
    <>
      <StorageGrid
        spools={spools}
        rows={rows}
        cols={cols}
        onCellClick={handleCellClick}
        onMove={handleMove}
        onMoveToSurplus={handleMoveToSurplus}
        onMoveToWorkbench={handleMoveToWorkbench}
        onRemoveFromRack={handleRemoveFromRack}
      />

      {/* Surplus section */}
      <div className="space-y-2 pt-2">
        <p className="text-sm font-semibold">
          Surplus · {surplusSpools.length} spool{surplusSpools.length !== 1 ? "s" : ""}
        </p>
        {surplusSpools.length === 0 ? (
          <p className="text-xs text-muted-foreground">No surplus spools</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {surplusSpools.map((spool) => (
              <DropdownMenu key={spool.id}>
                <DropdownMenuTrigger className="flex items-center gap-2.5 rounded-lg border border-border bg-card px-3 py-2 text-left hover:bg-muted/50 transition-colors w-full">
                  <SpoolColorDot hex={spool.filament.colorHex ?? "888888"} size="sm" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">{spoolLabel(spool)}</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <SpoolMaterialBadge material={spool.filament.material} />
                      <span className="text-[10px] text-muted-foreground">
                        {spool.remainingWeight}g
                      </span>
                    </div>
                  </div>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-44">
                  <DropdownMenuItem onClick={() => openDetail(spool.id)}>
                    View Details
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => handleMoveToWorkbench(spool.id)}>
                    Move to Workbench
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ))}
          </div>
        )}
      </div>

      {/* Workbench section */}
      <div className="space-y-2 pt-2">
        <p className="text-sm font-semibold">
          Workbench · {workbenchSpools.length} spool{workbenchSpools.length !== 1 ? "s" : ""}
        </p>
        {workbenchSpools.length === 0 ? (
          <p className="text-xs text-muted-foreground">No spools on workbench</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {workbenchSpools.map((spool) => (
              <DropdownMenu key={spool.id}>
                <DropdownMenuTrigger className="flex items-center gap-2.5 rounded-lg border border-border bg-card px-3 py-2 text-left hover:bg-muted/50 transition-colors w-full">
                  <SpoolColorDot hex={spool.filament.colorHex ?? "888888"} size="sm" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">{spoolLabel(spool)}</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <SpoolMaterialBadge material={spool.filament.material} />
                      <span className="text-[10px] text-muted-foreground">
                        {spool.remainingWeight}g
                      </span>
                    </div>
                  </div>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-44">
                  <DropdownMenuItem onClick={() => openDetail(spool.id)}>
                    View Details
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => handleMoveToSurplus(spool.id)}>
                    Move to Surplus
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ))}
          </div>
        )}
      </div>

      <SpoolDetailSheet
        spoolId={detailSpoolId}
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
      />

      <SpoolPicker
        open={pickerOpen}
        onSelect={handlePickerSelect}
        onClose={() => setPickerOpen(false)}
      />
    </>
  );
}
