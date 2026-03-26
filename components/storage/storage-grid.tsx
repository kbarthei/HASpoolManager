"use client";

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
}

export function StorageGrid({ spools, rows, cols, onCellClick }: StorageGridProps) {
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

  return (
    <div className="overflow-x-auto">
      <div
        className="grid gap-1"
        style={{
          gridTemplateColumns: `32px repeat(${cols}, minmax(48px, 1fr))`,
          minWidth: `${32 + cols * 52}px`,
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

        {/* Data rows */}
        {Array.from({ length: rows }, (_, rowIdx) => {
          const row = rowIdx + 1;
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
                return (
                  <StorageCell
                    key={key}
                    spool={spool}
                    row={row}
                    col={col}
                    onClick={() => onCellClick(row, col, spool)}
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
