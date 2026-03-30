"use client";

import { useState } from "react";
import { StorageCell } from "@/components/storage/storage-cell";

interface FilamentData {
  name: string;
  material: string;
  colorHex: string | null;
  vendor: { name: string };
}

interface SpoolData {
  id: string;
  remainingWeight: number;
  initialWeight: number;
  location: string | null;
  filament: FilamentData;
}

interface StorageGridProps {
  spools: SpoolData[];
  rows: number;
  cols: number;
  onCellClick: (row: number, col: number, spool?: SpoolData | null) => void;
  onMove?: (fromRow: number, fromCol: number, toRow: number, toCol: number) => void;
  onMoveToSurplus?: (spoolId: string) => void;
  onMoveToWorkbench?: (spoolId: string) => void;
  onRemoveFromRack?: (spoolId: string) => void;
  onArchive?: (spoolId: string) => void;
}

export function StorageGrid({ spools, rows, cols, onCellClick, onMove, onMoveToSurplus, onMoveToWorkbench, onRemoveFromRack, onArchive }: StorageGridProps) {
  const [dragSource, setDragSource] = useState<{ row: number; col: number } | null>(null);
  const [dragOver, setDragOver] = useState<{ row: number; col: number } | null>(null);

  // Build lookup map: "row-col" → spool
  const spoolMap = new Map<string, SpoolData>();
  for (const spool of spools) {
    const match = spool.location?.match(/^rack:(\d+)-(\d+)$/);
    if (match) {
      spoolMap.set(`${match[1]}-${match[2]}`, spool);
    }
  }

  // Column headers: S1..S{cols}
  const colHeaders = Array.from({ length: cols }, (_, i) => `S${i + 1}`);

  function handleDragStart(e: React.DragEvent, row: number, col: number) {
    setDragSource({ row, col });
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", `${row}-${col}`);
  }

  function handleDragOver(e: React.DragEvent, row: number, col: number) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOver({ row, col });
  }

  function handleDrop(e: React.DragEvent, toRow: number, toCol: number) {
    e.preventDefault();
    if (dragSource && onMove) {
      const { row: fromRow, col: fromCol } = dragSource;
      if (fromRow !== toRow || fromCol !== toCol) {
        onMove(fromRow, fromCol, toRow, toCol);
      }
    }
    setDragSource(null);
    setDragOver(null);
  }

  function handleDragEnd() {
    setDragSource(null);
    setDragOver(null);
  }

  return (
    <div className="w-full">
      <div
        className="grid gap-1.5"
        style={{
          gridTemplateColumns: `40px repeat(${cols}, 1fr)`,
        }}
      >
        {/* Header row: empty corner + column labels */}
        <div /> {/* empty corner */}
        {colHeaders.map((label) => (
          <div
            key={label}
            className="text-[9px] text-muted-foreground text-center pb-[2px]"
          >
            {label}
          </div>
        ))}

        {/* Data rows — rendered top-to-bottom as R(max)…R1 so R1 is the bottom shelf */}
        {Array.from({ length: rows }, (_, rowIdx) => {
          const row = rows - rowIdx; // R3, R2, R1 top-to-bottom
          return (
            <>
              {/* Row header */}
              <div
                key={`rh-${row}`}
                className="text-[9px] text-muted-foreground self-center text-right pr-1"
              >
                R{row}
              </div>
              {/* Cells */}
              {Array.from({ length: cols }, (_, colIdx) => {
                const col = colIdx + 1;
                const key = `${row}-${col}`;
                const spool = spoolMap.get(key) ?? null;
                const isThisDragging =
                  dragSource?.row === row && dragSource?.col === col;
                const isThisDragOver =
                  dragOver?.row === row && dragOver?.col === col;
                return (
                  <StorageCell
                    key={key}
                    spool={spool}
                    row={row}
                    col={col}
                    onClick={() => onCellClick(row, col, spool)}
                    onMoveToSurplus={onMoveToSurplus}
                    onMoveToWorkbench={onMoveToWorkbench}
                    onRemoveFromRack={onRemoveFromRack}
                    onArchive={onArchive}
                    isDragging={isThisDragging}
                    isDragOver={isThisDragOver && !isThisDragging}
                    onDragStart={spool ? (e) => handleDragStart(e, row, col) : undefined}
                    onDragOver={(e) => handleDragOver(e, row, col)}
                    onDrop={(e) => handleDrop(e, row, col)}
                    onDragEnd={handleDragEnd}
                  />
                );
              })}
            </>
          );
        })}
      </div>
    </div>
  );
}
