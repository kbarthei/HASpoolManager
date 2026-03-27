"use client";

import { useState } from "react";
import { StorageGrid } from "@/components/storage/storage-grid";
import { SpoolDetailSheet } from "@/components/spool/spool-detail-sheet";
import { SpoolPicker } from "@/components/spool/spool-picker";
import { SpoolColorDot } from "@/components/spool/spool-color-dot";
import { SpoolMaterialBadge } from "@/components/spool/spool-material-badge";
import { assignSpoolToRack, moveSpoolInRack } from "@/lib/actions";
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
  rows: number;
  cols: number;
}

export function StorageClient({ spools, surplusSpools, rows, cols }: StorageClientProps) {
  // Detail sheet state (occupied cell)
  const [detailSpoolId, setDetailSpoolId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  // Picker state (empty cell)
  const [pickerOpen, setPickerOpen] = useState(false);
  const [targetRow, setTargetRow] = useState<number>(1);
  const [targetCol, setTargetCol] = useState<number>(1);

  function handleCellClick(row: number, col: number, spool?: SpoolData | null) {
    if (spool) {
      setDetailSpoolId(spool.id);
      setDetailOpen(true);
    } else {
      setTargetRow(row);
      setTargetCol(col);
      setPickerOpen(true);
    }
  }

  async function handlePickerSelect(spoolId: string) {
    await assignSpoolToRack(spoolId, targetRow, targetCol);
  }

  async function handleMove(fromRow: number, fromCol: number, toRow: number, toCol: number) {
    // Build lookup from current spools list
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

  return (
    <>
      <StorageGrid
        spools={spools}
        rows={rows}
        cols={cols}
        onCellClick={handleCellClick}
        onMove={handleMove}
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
              <button
                key={spool.id}
                type="button"
                onClick={() => {
                  setDetailSpoolId(spool.id);
                  setDetailOpen(true);
                }}
                className="flex items-center gap-2.5 rounded-lg border border-border bg-card px-3 py-2 text-left hover:bg-muted/50 transition-colors"
              >
                <SpoolColorDot
                  hex={spool.filament.colorHex ?? "888888"}
                  size="sm"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate">
                    {spool.filament.vendor.name} {spool.filament.name}
                  </p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <SpoolMaterialBadge material={spool.filament.material} />
                    <span className="text-[10px] text-muted-foreground">
                      {spool.remainingWeight}g
                    </span>
                  </div>
                </div>
              </button>
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
