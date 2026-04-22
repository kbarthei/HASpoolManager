"use client";

import { useState, type CSSProperties } from "react";
import { parseRackLocation } from "@/lib/rack-helpers";
import { RackSpoolCard, type RackCardSpool } from "./rack-spool-card";

export interface RackGridSpool extends RackCardSpool {
  location: string | null;
}

interface RackGridProps {
  /** The rack this grid represents. Used to filter spools by location. */
  rackId: string;
  spools: RackGridSpool[];
  rows: number;
  cols: number;
  selectedSpoolId?: string | null;
  onCellClick?: (row: number, col: number, spool: RackGridSpool | null) => void;
  /** Called when a card is dragged to another cell within this rack. */
  onMove?: (fromRow: number, fromCol: number, toRow: number, toCol: number) => void;
  /**
   * Predicate used when a filter chip is active. Cards whose spool returns
   * false (and empty cells) are dimmed. Undefined means no filter → no dim.
   */
  matchesFilter?: (spool: RackGridSpool) => boolean;
  /** When true, empty cells are dimmed too (a filter is active). */
  filterActive?: boolean;
}

/**
 * 3×10 rack grid — the hero of the Inventory page.
 *
 * Rows render R{rows} (top shelf) → R1 (bottom) to mirror the physical rack.
 * Desktop: fluid grid. Mobile: horizontal scroll keeping each card ~170px
 * wide so text stays readable.
 */
export function RackGrid({
  rackId,
  spools,
  rows,
  cols,
  selectedSpoolId,
  onCellClick,
  onMove,
  matchesFilter,
  filterActive,
}: RackGridProps) {
  // Build lookup: "row-col" → spool, scoped to this rack only
  const spoolMap = new Map<string, RackGridSpool>();
  for (const spool of spools) {
    const parsed = parseRackLocation(spool.location);
    if (parsed && parsed.rackId === rackId) {
      spoolMap.set(`${parsed.row}-${parsed.col}`, spool);
    }
  }

  const [dragSource, setDragSource] = useState<{ row: number; col: number } | null>(null);
  const [dragOver, setDragOver] = useState<{ row: number; col: number } | null>(null);

  const handleDragStart = (e: React.DragEvent, row: number, col: number) => {
    setDragSource({ row, col });
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", `${row}-${col}`);
  };
  const handleDragOver = (e: React.DragEvent, row: number, col: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOver({ row, col });
  };
  const handleDrop = (e: React.DragEvent, toRow: number, toCol: number) => {
    e.preventDefault();
    if (dragSource && onMove) {
      const { row: fromRow, col: fromCol } = dragSource;
      if (fromRow !== toRow || fromCol !== toCol) {
        onMove(fromRow, fromCol, toRow, toCol);
      }
    }
    setDragSource(null);
    setDragOver(null);
  };
  const handleDragEnd = () => {
    setDragSource(null);
    setDragOver(null);
  };

  const desktopStyle: CSSProperties = {
    gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
  };
  const mobileStyle: CSSProperties = {
    gridTemplateColumns: `repeat(${cols}, 140px)`,
    width: "max-content",
  };

  const innerProps = {
    spoolMap,
    rows,
    cols,
    selectedSpoolId,
    onCellClick,
    dragSource,
    dragOver,
    onMove,
    onDragStart: handleDragStart,
    onDragOver: handleDragOver,
    onDrop: handleDrop,
    onDragEnd: handleDragEnd,
    matchesFilter,
    filterActive,
  };

  return (
    <div>
      {/* Wide desktop (xl+, i.e. >= 1280px) — fluid grid fits to container */}
      <div className="hidden xl:block">
        <InnerGrid gridStyle={desktopStyle} {...innerProps} />
      </div>

      {/* Narrow viewports (< xl, i.e. < 1280px) — horizontal scroll keeps cards readable */}
      <div className="xl:hidden overflow-x-auto -mx-3 px-3 scrollbar-none">
        <InnerGrid gridStyle={mobileStyle} {...innerProps} />
      </div>

      <RackLegend rows={rows} cols={cols} />
    </div>
  );
}

// ── Inner grid (row/col headers + cells) ──────────────────────────────────

function InnerGrid({
  spoolMap,
  rows,
  cols,
  gridStyle,
  selectedSpoolId,
  onCellClick,
  dragSource,
  dragOver,
  onMove,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  matchesFilter,
  filterActive,
}: {
  spoolMap: Map<string, RackGridSpool>;
  rows: number;
  cols: number;
  gridStyle: CSSProperties;
  selectedSpoolId?: string | null;
  onCellClick?: (row: number, col: number, spool: RackGridSpool | null) => void;
  dragSource: { row: number; col: number } | null;
  dragOver: { row: number; col: number } | null;
  onMove?: (fromRow: number, fromCol: number, toRow: number, toCol: number) => void;
  onDragStart: (e: React.DragEvent, row: number, col: number) => void;
  onDragOver: (e: React.DragEvent, row: number, col: number) => void;
  onDrop: (e: React.DragEvent, row: number, col: number) => void;
  onDragEnd: (e: React.DragEvent) => void;
  matchesFilter?: (spool: RackGridSpool) => boolean;
  filterActive?: boolean;
}) {
  return (
    <div>
      {/* Rows — top shelf (R{rows}) first. Column numbers S1..S{cols} are
          omitted from the header row (low information value); the legend
          tagline below the rack explains the coordinate system. */}
      {Array.from({ length: rows }, (_, rowIdx) => {
        const row = rows - rowIdx;
        return (
          <div
            key={row}
            className="grid gap-1 mb-1 last:mb-0"
            style={gridStyle}
          >
            {Array.from({ length: cols }, (_, colIdx) => {
              const col = colIdx + 1;
              const spool = spoolMap.get(`${row}-${col}`) ?? null;
              const isSelected = !!spool && selectedSpoolId === spool.id;
              const coord = `R${row}·${col}`;
              const isThisDragging =
                dragSource?.row === row && dragSource?.col === col;
              const isThisDragOver =
                dragOver?.row === row && dragOver?.col === col;
              // Dim when a filter is active and this card doesn't match
              // (empty cells are always dimmed during filter).
              const dimmed = filterActive
                ? spool
                  ? matchesFilter
                    ? !matchesFilter(spool)
                    : false
                  : true
                : false;
              return (
                <RackSpoolCard
                  key={col}
                  spool={spool}
                  selected={isSelected}
                  onClick={() => onCellClick?.(row, col, spool)}
                  emptyLabel="empty rack slot"
                  coord={coord}
                  dimmed={dimmed}
                  isDragging={isThisDragging}
                  isDragOver={isThisDragOver && !isThisDragging}
                  onDragStart={spool && onMove ? (e) => onDragStart(e, row, col) : undefined}
                  onDragOver={onMove ? (e) => onDragOver(e, row, col) : undefined}
                  onDrop={onMove ? (e) => onDrop(e, row, col) : undefined}
                  onDragEnd={onMove ? onDragEnd : undefined}
                />
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

// ── Legend ─────────────────────────────────────────────────────────────────

function RackLegend({ rows, cols }: { rows: number; cols: number }) {
  return (
    <div className="mt-4 pt-3 border-t border-border flex flex-wrap items-center gap-x-5 gap-y-1.5 text-2xs text-muted-foreground">
      <LegendItem>
        <span
          className="w-[7px] h-[7px] rounded-full"
          style={{
            backgroundColor: "var(--success)",
            boxShadow: "0 0 0 2px rgba(52,199,89,0.22)",
          }}
        />
        In good shape
      </LegendItem>
      <LegendItem>
        <span className="w-4 h-3 rounded border border-dashed border-border" />
        Empty slot
      </LegendItem>
      <LegendItem>
        <span
          className="w-4 h-3 rounded border-[1.5px] border-primary"
          style={{ boxShadow: "0 0 0 2px rgba(48,176,199,0.18)" }}
        />
        Selected
      </LegendItem>
      <span className="ml-auto text-right leading-snug">
        R1–R{rows} = shelves (bottom to top) · S1–S{cols} = columns · click any
        card to open inspector
      </span>
    </div>
  );
}

function LegendItem({ children }: { children: React.ReactNode }) {
  return <span className="flex items-center gap-1">{children}</span>;
}
