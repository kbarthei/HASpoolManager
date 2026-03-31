"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AmsSection } from "@/components/ams/ams-section";
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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  archiveSpool,
  loadSpoolToSlot,
  unloadSlotSpool,
  assignSpoolToRack,
  moveSpoolInRack,
  moveSpoolTo,
} from "@/lib/actions";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────────────────────────

interface SlotSpool {
  id: string;
  remainingWeight: number;
  initialWeight: number;
  status: string;
  filament: {
    name: string;
    material: string;
    colorHex: string | null;
    vendor: { name: string };
  };
}

interface SlotData {
  id: string;
  slotType: string;
  amsIndex: number;
  trayIndex: number;
  isEmpty: boolean;
  bambuRemain: number;
  spool?: SlotSpool | null;
}

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

interface InventoryClientProps {
  initialSlots: SlotData[];
  printerId: string | null;
  printerName: string | null;
  spools: SpoolData[];
  surplusSpools: SpoolData[];
  workbenchSpools: SpoolData[];
  rows: number;
  cols: number;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function spoolLabel(spool: SpoolData) {
  return `${spool.filament.vendor.name} ${spool.filament.name}`;
}

function sectionLabel(type: string, count: number): string {
  if (type === "ams") return `AMS · ${count} Slot${count !== 1 ? "s" : ""}`;
  if (type === "ams_ht") return `AMS HT · ${count} Slot${count !== 1 ? "s" : ""}`;
  return "External";
}

const SECTION_ORDER = ["ams", "ams_ht", "external"];

// ── Component ──────────────────────────────────────────────────────────────────

export function InventoryClient({
  initialSlots,
  printerId,
  printerName,
  spools,
  surplusSpools,
  workbenchSpools,
  rows,
  cols,
}: InventoryClientProps) {
  // ── AMS state ──────────────────────────────────────────────────────────────
  const [selectedSpoolId, setSelectedSpoolId] = useState<string | null>(null);
  const [amsSheetOpen, setAmsSheetOpen] = useState(false);
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
  const [amsPickerOpen, setAmsPickerOpen] = useState(false);

  // ── Storage state ──────────────────────────────────────────────────────────
  const [detailSpoolId, setDetailSpoolId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [storagePickerOpen, setStoragePickerOpen] = useState(false);
  const [targetRow, setTargetRow] = useState<number>(1);
  const [targetCol, setTargetCol] = useState<number>(1);
  const [moveToRackSpoolId, setMoveToRackSpoolId] = useState<string | null>(null);
  const [moveToRackOpen, setMoveToRackOpen] = useState(false);

  // ── AMS live data ──────────────────────────────────────────────────────────
  const { data: slots } = useQuery({
    queryKey: ["ams-slots", printerId],
    queryFn: async () => {
      if (!printerId) return initialSlots;
      const res = await fetch(`/api/v1/printers/${printerId}`);
      if (!res.ok) return initialSlots;
      const printer = await res.json();
      return printer.amsSlots || [];
    },
    initialData: initialSlots,
    refetchInterval: 30000,
    enabled: !!printerId,
  });

  const typedSlots = slots as SlotData[];
  const groupedSlots = typedSlots.reduce<Record<string, SlotData[]>>((acc, slot) => {
    const key = slot.slotType ?? "ams";
    if (!acc[key]) acc[key] = [];
    acc[key].push(slot);
    return acc;
  }, {});

  // ── AMS handlers ───────────────────────────────────────────────────────────
  function handleClickSpool(spoolId: string) {
    setSelectedSpoolId(spoolId);
    setAmsSheetOpen(true);
  }

  function handleClickLoad(slotId: string) {
    setSelectedSlotId(slotId);
    setAmsPickerOpen(true);
  }

  async function handleClickUnload(slotId: string) {
    try {
      await unloadSlotSpool(slotId);
    } catch (err) {
      console.error("Failed to unload slot:", err);
    }
  }

  async function handleClickArchive(spoolId: string) {
    try {
      await archiveSpool(spoolId);
      const spool = typedSlots.find((s) => s.spool?.id === spoolId)?.spool;
      toast.success(
        spool
          ? `Archived ${spool.filament.vendor.name} ${spool.filament.name}`
          : "Spool archived"
      );
    } catch {
      toast.error("Failed to archive spool");
    }
  }

  async function handleAmsPickerSelect(spoolId: string) {
    if (!selectedSlotId) return;
    try {
      await loadSpoolToSlot(selectedSlotId, spoolId);
    } catch (err) {
      console.error("Failed to load spool:", err);
    } finally {
      setSelectedSlotId(null);
    }
  }

  // ── Storage handlers ───────────────────────────────────────────────────────
  function openDetail(spoolId: string) {
    setDetailSpoolId(spoolId);
    setDetailOpen(true);
  }

  function handleMoveToRack(spoolId: string) {
    setMoveToRackSpoolId(spoolId);
    setMoveToRackOpen(true);
  }

  async function handleRackSlotSelected(row: number, col: number) {
    if (!moveToRackSpoolId) return;
    try {
      await assignSpoolToRack(moveToRackSpoolId, row, col);
      const spool = [...surplusSpools, ...workbenchSpools].find(
        (s) => s.id === moveToRackSpoolId
      );
      toast.success(
        spool ? `Moved ${spoolLabel(spool)} to R${row}S${col}` : `Moved to R${row}S${col}`
      );
    } catch {
      toast.error("Failed to move spool to rack");
    } finally {
      setMoveToRackSpoolId(null);
      setMoveToRackOpen(false);
    }
  }

  function handleCellClick(row: number, col: number, spool?: SpoolData | null) {
    if (spool) {
      openDetail(spool.id);
    } else {
      setTargetRow(row);
      setTargetCol(col);
      setStoragePickerOpen(true);
    }
  }

  async function handleStoragePickerSelect(spoolId: string) {
    await assignSpoolToRack(spoolId, targetRow, targetCol);
  }

  async function handleMove(fromRow: number, fromCol: number, toRow: number, toCol: number) {
    const spoolMap = new Map<string, SpoolData>();
    for (const spool of spools) {
      const match = spool.location?.match(/^rack:(\d+)-(\d+)$/);
      if (match) spoolMap.set(`${match[1]}-${match[2]}`, spool);
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
        swapSpool ? fromCol : undefined
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

  async function handleArchiveStorage(spoolId: string) {
    try {
      await archiveSpool(spoolId);
      const spool = [...spools, ...surplusSpools, ...workbenchSpools].find(
        (s) => s.id === spoolId
      );
      toast.success(spool ? `Archived ${spoolLabel(spool)}` : "Spool archived");
    } catch {
      toast.error("Failed to archive spool");
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <>
      {/* PRINTER SECTION */}
      {typedSlots.length > 0 && (
        <section data-testid="printer-section" className="space-y-2">
          <div className="text-xs uppercase tracking-wide text-muted-foreground font-medium">
            Printer · {printerName ?? "H2S"}
          </div>
          <div className="space-y-5">
            {SECTION_ORDER.filter((type) => groupedSlots[type]?.length > 0).map((type) => (
              <AmsSection
                key={type}
                label={sectionLabel(type, groupedSlots[type].length)}
                slots={groupedSlots[type]}
                onClickSpool={handleClickSpool}
                onClickLoad={handleClickLoad}
                onClickUnload={handleClickUnload}
                onClickArchive={handleClickArchive}
              />
            ))}
          </div>
        </section>
      )}

      {/* SPOOL RACK SECTION */}
      <section data-testid="rack-section" className="space-y-2">
        <div className="flex items-baseline gap-2">
          <span className="text-xs uppercase tracking-wide text-muted-foreground font-medium">
            Spool Rack · {rows} × {cols}
          </span>
          <span className="text-xs text-muted-foreground">{spools.length} spools stored</span>
        </div>
        <StorageGrid
          spools={spools}
          rows={rows}
          cols={cols}
          onCellClick={handleCellClick}
          onMove={handleMove}
          onMoveToSurplus={handleMoveToSurplus}
          onMoveToWorkbench={handleMoveToWorkbench}
          onRemoveFromRack={handleRemoveFromRack}
          onArchive={handleArchiveStorage}
        />
      </section>

      {/* SURPLUS SECTION */}
      <section data-testid="surplus-section" className="space-y-2">
        <p className="text-xs uppercase tracking-wide text-muted-foreground font-medium">
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
                  <DropdownMenuItem onClick={() => handleMoveToRack(spool.id)}>
                    Move to Rack
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => handleArchiveStorage(spool.id)}
                    className="text-destructive focus:text-destructive"
                  >
                    Archive
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ))}
          </div>
        )}
      </section>

      {/* WORKBENCH SECTION */}
      <section data-testid="workbench-section" className="space-y-2">
        <p className="text-xs uppercase tracking-wide text-muted-foreground font-medium">
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
                  <DropdownMenuItem onClick={() => handleMoveToRack(spool.id)}>
                    Move to Rack
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => handleArchiveStorage(spool.id)}
                    className="text-destructive focus:text-destructive"
                  >
                    Archive
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ))}
          </div>
        )}
      </section>

      {/* AMS detail sheet + picker */}
      <SpoolDetailSheet
        spoolId={selectedSpoolId}
        open={amsSheetOpen}
        onClose={() => {
          setAmsSheetOpen(false);
          setSelectedSpoolId(null);
        }}
      />
      <SpoolPicker
        open={amsPickerOpen}
        onSelect={handleAmsPickerSelect}
        onClose={() => {
          setAmsPickerOpen(false);
          setSelectedSlotId(null);
        }}
      />

      {/* Storage detail sheet + picker */}
      <SpoolDetailSheet
        spoolId={detailSpoolId}
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
      />
      <SpoolPicker
        open={storagePickerOpen}
        onSelect={handleStoragePickerSelect}
        onClose={() => setStoragePickerOpen(false)}
      />

      {/* Move-to-rack dialog */}
      <Dialog open={moveToRackOpen} onOpenChange={(v) => !v && setMoveToRackOpen(false)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Pick a Rack Slot</DialogTitle>
          </DialogHeader>
          <div className="overflow-x-auto">
            <div
              style={{
                display: "grid",
                gridTemplateColumns: `32px repeat(${cols}, 1fr)`,
                gap: "4px",
              }}
            >
              {/* Column headers */}
              <div />
              {Array.from({ length: cols }, (_, c) => (
                <div key={c} className="text-center text-[9px] text-muted-foreground">
                  S{c + 1}
                </div>
              ))}

              {/* Rows — R(max) at top, R1 at bottom */}
              {Array.from({ length: rows }, (_, r) => {
                const row = rows - r;
                return [
                  <div
                    key={`label-${row}`}
                    className="flex items-center justify-center text-[9px] text-muted-foreground"
                  >
                    R{row}
                  </div>,
                  ...Array.from({ length: cols }, (_, c) => {
                    const col = c + 1;
                    const pos = `${row}-${col}`;
                    const occupied = spools.some((s) => s.location === `rack:${pos}`);
                    return (
                      <button
                        key={pos}
                        disabled={occupied}
                        onClick={() => handleRackSlotSelected(row, col)}
                        className={cn(
                          "aspect-square min-h-[40px] rounded-md border transition",
                          occupied
                            ? "bg-muted border-border cursor-not-allowed opacity-50"
                            : "border-dashed border-primary/50 hover:bg-primary/10 hover:border-primary cursor-pointer"
                        )}
                      >
                        {occupied ? (
                          <span className="text-[8px] text-muted-foreground">●</span>
                        ) : (
                          <span className="text-primary text-sm">+</span>
                        )}
                      </button>
                    );
                  }),
                ];
              })}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
