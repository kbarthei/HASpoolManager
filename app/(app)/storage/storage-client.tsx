"use client";

import { useState } from "react";
import { StorageGrid } from "@/components/storage/storage-grid";
import { SpoolDetailSheet } from "@/components/spool/spool-detail-sheet";
import { SpoolPicker } from "@/components/spool/spool-picker";
import { assignSpoolToRack } from "@/lib/actions";

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

  return (
    <>
      <StorageGrid
        spools={spools}
        rows={rows}
        cols={cols}
        onCellClick={handleCellClick}
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
