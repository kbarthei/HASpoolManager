"use client";

import { useState } from "react";
import { StorageGrid } from "@/components/storage/storage-grid";
import { SpoolDetailSheet } from "@/components/spool/spool-detail-sheet";
import { SpoolPicker } from "@/components/spool/spool-picker";
import { assignSpoolToRack, moveSpoolInRack } from "@/lib/actions";
import { toast } from "sonner";

interface StorageClientProps {
  spools: any[];
  rows: number;
  cols: number;
}

export function StorageClient({ spools, rows, cols }: StorageClientProps) {
  // Detail sheet state (occupied cell)
  const [detailSpoolId, setDetailSpoolId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  // Picker state (empty cell)
  const [pickerOpen, setPickerOpen] = useState(false);
  const [targetRow, setTargetRow] = useState<number>(1);
  const [targetCol, setTargetCol] = useState<number>(1);

  function handleCellClick(row: number, col: number, spool?: any | null) {
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
    const spoolMap = new Map<string, any>();
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
