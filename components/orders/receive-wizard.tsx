"use client";

import { useState, useCallback, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { SpoolColorDot } from "@/components/spool/spool-color-dot";
import { SpoolMaterialBadge } from "@/components/spool/spool-material-badge";
import { receiveOrder } from "@/lib/actions";
import { cn } from "@/lib/utils";
import { Check } from "lucide-react";

interface ReceiveWizardProps {
  open: boolean;
  onClose: () => void;
  order: {
    id: string;
    orderNumber: string | null;
    items: Array<{
      id: string;
      quantity: number;
      filament: {
        name: string;
        material: string;
        colorHex: string | null;
        vendor: { name: string };
      };
      spools: Array<{
        id: string;
        location: string | null;
      }>;
    }>;
  };
  rackRows: number;
  rackCols: number;
  occupiedPositions: string[]; // ["1-3", "2-5", ...] already occupied rack positions
}

interface Placement {
  spoolId: string;
  location: string;
}

// Flatten all spools across all items into an ordered list
interface SpoolEntry {
  spoolId: string;
  spoolIndex: number; // 1-based within its item
  totalForItem: number;
  filament: {
    name: string;
    material: string;
    colorHex: string | null;
    vendor: { name: string };
  };
}

function buildSpoolList(
  items: ReceiveWizardProps["order"]["items"]
): SpoolEntry[] {
  const result: SpoolEntry[] = [];
  for (const item of items) {
    for (let i = 0; i < item.spools.length; i++) {
      result.push({
        spoolId: item.spools[i].id,
        spoolIndex: i + 1,
        totalForItem: item.spools.length,
        filament: item.filament,
      });
    }
  }
  return result;
}

// Mini rack grid — compact, ~40px cells
function MiniRackGrid({
  rows,
  cols,
  occupiedPositions,
  placedPositions,
  onSelectCell,
}: {
  rows: number;
  cols: number;
  occupiedPositions: Set<string>;
  placedPositions: Set<string>; // positions placed in this wizard session
  onSelectCell: (pos: string) => void;
}) {
  const colHeaders = Array.from({ length: cols }, (_, i) => `S${i + 1}`);

  return (
    <div className="w-full overflow-x-auto">
      <div
        className="grid gap-1 min-w-fit"
        style={{
          gridTemplateColumns: `28px repeat(${cols}, 40px)`,
        }}
      >
        {/* Header row */}
        <div />
        {colHeaders.map((label) => (
          <div
            key={label}
            className="text-[9px] text-muted-foreground text-center pb-0.5"
          >
            {label}
          </div>
        ))}

        {/* Data rows */}
        {Array.from({ length: rows }, (_, rowIdx) => {
          const row = rowIdx + 1;
          return (
            <>
              {/* Row label */}
              <div
                key={`rh-${row}`}
                className="text-[9px] text-muted-foreground self-center text-right pr-1"
              >
                R{row}
              </div>

              {/* Cells */}
              {Array.from({ length: cols }, (_, colIdx) => {
                const col = colIdx + 1;
                const pos = `${row}-${col}`;
                const isOccupied = occupiedPositions.has(pos);
                const isPlaced = placedPositions.has(pos);

                if (isOccupied && !isPlaced) {
                  return (
                    <div
                      key={pos}
                      className="h-10 w-10 rounded-md bg-muted/60 border border-border/40"
                      aria-label={`Occupied slot R${row}S${col}`}
                    />
                  );
                }

                if (isPlaced) {
                  return (
                    <div
                      key={pos}
                      className="h-10 w-10 rounded-md bg-primary/20 border border-primary flex items-center justify-center"
                      aria-label={`Placed at R${row}S${col}`}
                    >
                      <Check className="h-4 w-4 text-primary" />
                    </div>
                  );
                }

                return (
                  <button
                    key={pos}
                    type="button"
                    onClick={() => onSelectCell(pos)}
                    className={cn(
                      "h-10 w-10 rounded-md border border-dashed border-primary/50",
                      "hover:ring-2 hover:ring-primary hover:border-primary",
                      "transition-all cursor-pointer"
                    )}
                    aria-label={`Select slot R${row}S${col}`}
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

export function ReceiveWizard({
  open,
  onClose,
  order,
  rackRows,
  rackCols,
  occupiedPositions,
}: ReceiveWizardProps) {
  const spoolList = useMemo(() => buildSpoolList(order.items), [order.items]);
  const total = spoolList.length;

  const [currentIndex, setCurrentIndex] = useState(0);
  const [placements, setPlacements] = useState<Placement[]>([]);
  const [placedPositions, setPlacedPositions] = useState<Set<string>>(
    new Set()
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDone, setIsDone] = useState(false);

  const occupiedSet = useMemo(
    () => new Set(occupiedPositions),
    [occupiedPositions]
  );

  const currentSpool = spoolList[currentIndex];

  const handleSelectCell = useCallback(
    (pos: string) => {
      if (!currentSpool) return;
      const [row, col] = pos.split("-");
      const location = `rack:${row}-${col}`;

      setPlacements((prev) => [
        ...prev,
        { spoolId: currentSpool.spoolId, location },
      ]);
      setPlacedPositions((prev) => new Set([...prev, pos]));

      if (currentIndex + 1 >= total) {
        setIsDone(true);
      } else {
        setCurrentIndex((i) => i + 1);
      }
    },
    [currentSpool, currentIndex, total]
  );

  const handleSurplus = useCallback(() => {
    if (!currentSpool) return;

    setPlacements((prev) => [
      ...prev,
      { spoolId: currentSpool.spoolId, location: "surplus" },
    ]);

    if (currentIndex + 1 >= total) {
      setIsDone(true);
    } else {
      setCurrentIndex((i) => i + 1);
    }
  }, [currentSpool, currentIndex, total]);

  const handleDone = useCallback(async () => {
    setIsSubmitting(true);
    try {
      await receiveOrder(order.id, placements);
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  }, [order.id, placements, onClose]);

  // Reset state when dialog opens
  const handleOpenChange = useCallback(
    (isOpen: boolean) => {
      if (!isOpen) {
        setCurrentIndex(0);
        setPlacements([]);
        setPlacedPositions(new Set());
        setIsDone(false);
        onClose();
      }
    },
    [onClose]
  );

  const progressPercent = isDone ? 100 : (currentIndex / total) * 100;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg w-full max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base">
            Receive Order{order.orderNumber ? ` #${order.orderNumber}` : ""}
          </DialogTitle>
        </DialogHeader>

        {/* Progress bar */}
        <div className="space-y-1.5">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>
              {isDone
                ? `All ${total} spools placed`
                : `Spool ${currentIndex + 1} of ${total}`}
            </span>
            <span>{Math.round(progressPercent)}%</span>
          </div>
          <Progress value={progressPercent} className="h-1.5" />
        </div>

        {isDone ? (
          /* Done state */
          <div className="flex flex-col items-center gap-4 py-6">
            <div className="h-14 w-14 rounded-full bg-primary/15 flex items-center justify-center">
              <Check className="h-7 w-7 text-primary" />
            </div>
            <p className="text-sm font-medium text-center">
              All {total} spool{total !== 1 ? "s" : ""} placed!
            </p>
            <p className="text-xs text-muted-foreground text-center">
              Order will be marked as delivered.
            </p>
            <Button
              onClick={handleDone}
              disabled={isSubmitting}
              className="w-full mt-2"
            >
              {isSubmitting ? "Saving..." : "Done"}
            </Button>
          </div>
        ) : (
          /* Placement state */
          currentSpool && (
            <div className="space-y-4">
              {/* Current spool info */}
              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/40 border border-border/60">
                <SpoolColorDot
                  hex={currentSpool.filament.colorHex ?? "888888"}
                  size="lg"
                  className="shrink-0"
                />
                <div className="flex flex-col gap-1 min-w-0">
                  <p className="text-sm font-semibold leading-tight truncate">
                    {currentSpool.filament.vendor.name}{" "}
                    {currentSpool.filament.name}
                  </p>
                  <div className="flex items-center gap-1.5">
                    <SpoolMaterialBadge
                      material={currentSpool.filament.material}
                    />
                    <span className="text-xs text-muted-foreground">
                      Spool {currentSpool.spoolIndex} of{" "}
                      {currentSpool.totalForItem}
                    </span>
                  </div>
                </div>
              </div>

              {/* Instruction */}
              <p className="text-xs text-muted-foreground text-center">
                Select a rack slot or store in surplus
              </p>

              {/* Mini rack grid */}
              <div className="flex justify-center">
                <MiniRackGrid
                  rows={rackRows}
                  cols={rackCols}
                  occupiedPositions={occupiedSet}
                  placedPositions={placedPositions}
                  onSelectCell={handleSelectCell}
                />
              </div>

              {/* Surplus button */}
              <Button
                variant="outline"
                className="w-full"
                onClick={handleSurplus}
              >
                Store in Surplus
              </Button>
            </div>
          )
        )}
      </DialogContent>
    </Dialog>
  );
}
