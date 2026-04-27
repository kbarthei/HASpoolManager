"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AmsSection } from "@/components/ams/ams-section";
import { RackGrid, type RackGridSpool } from "@/components/inventory/rack-grid";
import { parseRackLocation } from "@/lib/rack-helpers";
import { SpoolInspectorContainer } from "@/components/spool/spool-inspector-container";
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

interface ActiveRack {
  id: string;
  name: string;
  rows: number;
  cols: number;
  sortOrder: number;
}

interface AmsUnit {
  id: string;
  printerId: string;
  amsIndex: number;
  slotType: string;
  displayName: string;
  enabled: boolean;
}

interface InventoryClientProps {
  initialSlots: SlotData[];
  printerId: string | null;
  printerName: string | null;
  spools: SpoolData[];
  surplusSpools: SpoolData[];
  workbenchSpools: SpoolData[];
  activeRacks: ActiveRack[];
  amsUnits: AmsUnit[];
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

/** Rack slot coordinate in the new redesign format (R3·5). */
function rackCoord(row: number, col: number): string {
  return `R${row}·${col}`;
}

/**
 * Return the live AMS bambuRemain (0–100) for a spool id, or null.
 * Only returns a value when the spool is currently loaded in an AMS slot AND
 * the slot has a valid remain reading (0–100). The inspector's Remaining card
 * uses this to surface drift between tracked-weight and printer RFID.
 */
function liveRfidPctForSpool(
  slots: SlotData[],
  spoolId: string | null,
): number | null {
  if (!spoolId) return null;
  const slot = slots.find((s) => s.spool?.id === spoolId);
  if (!slot) return null;
  if (typeof slot.bambuRemain !== "number") return null;
  if (slot.bambuRemain < 0 || slot.bambuRemain > 100) return null;
  return slot.bambuRemain;
}

/** Filter predicate — "all" | material name | "low". */
function matchesFilter(spool: SpoolData, filter: string): boolean {
  if (filter === "all") return true;
  if (filter === "low") {
    if (spool.initialWeight <= 0) return false;
    return spool.remainingWeight / spool.initialWeight < 0.1;
  }
  return spool.filament.material === filter;
}

/**
 * Filter predicate for an AMS slot. Empty slots never match (they have no
 * material / weight to test); filled slots delegate to the spool predicate.
 */
function slotMatchesFilter(slot: SlotData, filter: string): boolean {
  if (filter === "all") return true;
  if (!slot.spool || slot.isEmpty) return false;
  if (filter === "low") {
    const s = slot.spool;
    if (s.initialWeight <= 0) return false;
    return s.remainingWeight / s.initialWeight < 0.1;
  }
  return slot.spool.filament.material === filter;
}

// ── Component ──────────────────────────────────────────────────────────────────

export function InventoryClient({
  initialSlots,
  printerId,
  printerName,
  spools,
  surplusSpools,
  workbenchSpools,
  activeRacks,
  amsUnits,
}: InventoryClientProps) {
  // If no active rack exists (edge case — migration should have made one),
  // fall back to an implicit default to avoid rendering errors.
  const safeActiveRacks: ActiveRack[] = activeRacks.length > 0
    ? activeRacks
    : [];
  // Track which rack the user is currently interacting with for actions
  // that don't include a rackId in their event (cell click, drag-drop source).
  const primaryRackId = safeActiveRacks[0]?.id ?? "";
  // ── Filter state ───────────────────────────────────────────────────────────
  const [filter, setFilter] = useState<string>("all");

  // ── AMS state ──────────────────────────────────────────────────────────────
  const [selectedSpoolId, setSelectedSpoolId] = useState<string | null>(null);
  const [amsSheetOpen, setAmsSheetOpen] = useState(false);
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
  const [amsPickerOpen, setAmsPickerOpen] = useState(false);

  // ── Storage state ──────────────────────────────────────────────────────────
  const [detailSpoolId, setDetailSpoolId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [storagePickerOpen, setStoragePickerOpen] = useState(false);
  const [targetRackId, setTargetRackId] = useState<string>(primaryRackId);
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

  async function handleRackSlotSelected(row: number, col: number, rackId?: string) {
    if (!moveToRackSpoolId) return;
    const resolvedRackId = rackId ?? targetRackId ?? primaryRackId;
    try {
      await assignSpoolToRack(moveToRackSpoolId, row, col, resolvedRackId);
      const spool = [...surplusSpools, ...workbenchSpools].find(
        (s) => s.id === moveToRackSpoolId
      );
      toast.success(
        spool ? `Moved ${spoolLabel(spool)} to ${rackCoord(row, col)}` : `Moved to ${rackCoord(row, col)}`
      );
    } catch {
      toast.error("Failed to move spool to rack");
    } finally {
      setMoveToRackSpoolId(null);
      setMoveToRackOpen(false);
    }
  }

  function handleCellClick(rackId: string, row: number, col: number, spool?: SpoolData | null) {
    if (spool) {
      openDetail(spool.id);
    } else {
      setTargetRackId(rackId);
      setTargetRow(row);
      setTargetCol(col);
      setStoragePickerOpen(true);
    }
  }

  async function handleStoragePickerSelect(spoolId: string) {
    await assignSpoolToRack(spoolId, targetRow, targetCol, targetRackId);
  }

  async function handleMove(rackId: string, fromRow: number, fromCol: number, toRow: number, toCol: number) {
    // Lookup by full "rack:<id>:R-C" coordinate — scoped to this rack
    const spoolMap = new Map<string, SpoolData>();
    for (const spool of spools) {
      const parsed = parseRackLocation(spool.location);
      if (parsed && parsed.rackId === rackId) {
        spoolMap.set(`${parsed.row}-${parsed.col}`, spool);
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
        rackId,
      );
      toast.success(
        swapSpool
          ? `Swapped ${movingSpool.filament.name} with ${swapSpool.filament.name}`
          : `Moved ${movingSpool.filament.name} to ${rackCoord(toRow, toCol)}`
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

  // ── Derived: filter chip data + rack spool subset passed to grid ───────────
  const materialCounts = new Map<string, number>();
  for (const s of [...spools, ...workbenchSpools, ...surplusSpools]) {
    const mat = s.filament.material;
    materialCounts.set(mat, (materialCounts.get(mat) ?? 0) + 1);
  }
  const materialChips = Array.from(materialCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => ({ name, count }));
  const totalStored =
    spools.length + workbenchSpools.length + surplusSpools.length;
  const lowStockCount = [...spools, ...workbenchSpools, ...surplusSpools].filter(
    (s) => s.initialWeight > 0 && s.remainingWeight / s.initialWeight < 0.1,
  ).length;

  // Pass to rack grid — grid renders only spools with a rack:R-C location.
  // Filter does NOT change which cells are shown; it highlights matching cards
  // via selection-ish dimming. For now we apply the filter to Workbench + Surplus
  // only (the rack is physical and doesn't get reshuffled). Filter = "all" when
  // nothing selected.
  const rackSpoolsForGrid: RackGridSpool[] = spools.map((s) => ({
    id: s.id,
    remainingWeight: s.remainingWeight,
    initialWeight: s.initialWeight,
    location: s.location,
    filament: s.filament,
  }));
  const filteredWorkbench = workbenchSpools.filter((s) => matchesFilter(s, filter));
  const filteredSurplus = surplusSpools.filter((s) => matchesFilter(s, filter));

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <>
      {/* FILTER CHIP ROW */}
      <div
        data-testid="filter-chips"
        className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 scrollbar-none"
      >
        <FilterChip
          label="All"
          count={totalStored}
          active={filter === "all"}
          onClick={() => setFilter("all")}
        />
        {materialChips.map((m) => (
          <FilterChip
            key={m.name}
            label={m.name}
            count={m.count}
            active={filter === m.name}
            onClick={() => setFilter(m.name)}
          />
        ))}
        {lowStockCount > 0 && (
          <FilterChip
            label="Low stock"
            count={lowStockCount}
            variant="warn"
            active={filter === "low"}
            onClick={() => setFilter("low")}
          />
        )}
      </div>

      {/* PRINTER SECTION — one AMS section per enabled unit */}
      {typedSlots.length > 0 && (
        <section data-testid="printer-section" className="space-y-2">
          <div className="text-2xs uppercase tracking-wider text-muted-foreground font-semibold">
            In the Printer · {printerName ?? "H2S"}
          </div>
          <div className="space-y-4">
            {/* Enabled AMS units (slot_type='ams'), ordered by amsIndex */}
            {amsUnits
              .filter((u) => u.enabled && u.slotType === "ams")
              .sort((a, b) => a.amsIndex - b.amsIndex)
              .map((unit) => {
                const unitSlots = typedSlots.filter(
                  (s) => s.slotType === "ams" && s.amsIndex === unit.amsIndex,
                );
                if (unitSlots.length === 0) return null;
                return (
                  <AmsSection
                    key={unit.id}
                    label={`${unit.displayName} · ${unitSlots.length} Slot${unitSlots.length !== 1 ? "s" : ""}`}
                    slots={unitSlots}
                    onClickSpool={handleClickSpool}
                    onClickLoad={handleClickLoad}
                    onClickUnload={handleClickUnload}
                    onClickArchive={handleClickArchive}
                    filterActive={filter !== "all"}
                    matchesFilter={(slot) => slotMatchesFilter(slot, filter)}
                  />
                );
              })}
            {/* AMS HT + External share a row (HT first, External second) */}
            {((groupedSlots.ams_ht && groupedSlots.ams_ht.length > 0) ||
              (groupedSlots.external && groupedSlots.external.length > 0)) && (
              <AmsSection
                label="AMS HT · External Spool"
                slots={[
                  ...(groupedSlots.ams_ht ?? []),
                  ...(groupedSlots.external ?? []),
                ]}
                onClickSpool={handleClickSpool}
                onClickLoad={handleClickLoad}
                onClickUnload={handleClickUnload}
                onClickArchive={handleClickArchive}
                filterActive={filter !== "all"}
                matchesFilter={(slot) => slotMatchesFilter(slot, filter)}
              />
            )}
          </div>
        </section>
      )}

      {/* SPOOL RACK SECTION — one grid per active rack */}
      {safeActiveRacks.map((rack) => {
        const spoolsInRack = spools.filter((s) => {
          const parsed = parseRackLocation(s.location);
          return parsed && parsed.rackId === rack.id;
        });
        return (
          <section
            key={rack.id}
            data-testid={`rack-section-${rack.id}`}
            className="space-y-2"
          >
            <div className="flex items-baseline gap-2">
              <span className="text-2xs uppercase tracking-wider text-muted-foreground font-semibold">
                {rack.name} · {rack.rows} × {rack.cols}
              </span>
              <span className="text-2xs text-muted-foreground">
                {spoolsInRack.length} spools stored · {rack.rows * rack.cols - spoolsInRack.length} empty
              </span>
            </div>
            <div className="rounded-xl bg-card border border-border p-3">
              <RackGrid
                rackId={rack.id}
                spools={rackSpoolsForGrid}
                rows={rack.rows}
                cols={rack.cols}
                onCellClick={(row, col, s) => handleCellClick(rack.id, row, col, s as SpoolData | null)}
                onMove={(fr, fc, tr, tc) => handleMove(rack.id, fr, fc, tr, tc)}
                filterActive={filter !== "all"}
                matchesFilter={(s) => matchesFilter(s as unknown as SpoolData, filter)}
              />
            </div>
          </section>
        );
      })}

      {/* WORKBENCH SECTION */}
      <section data-testid="workbench-section" className="space-y-2">
        <p className="text-2xs uppercase tracking-wider text-muted-foreground font-semibold">
          Workbench · {filteredWorkbench.length} spool{filteredWorkbench.length !== 1 ? "s" : ""}
          {filter !== "all" && workbenchSpools.length !== filteredWorkbench.length && (
            <span className="ml-1 text-muted-foreground/60 normal-case font-normal">
              ({workbenchSpools.length} total)
            </span>
          )}
        </p>
        {filteredWorkbench.length === 0 ? (
          <p className="text-2xs text-muted-foreground">
            {workbenchSpools.length === 0 ? "No spools on workbench" : "No matching spools"}
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {filteredWorkbench.map((spool) => (
              <DropdownMenu key={spool.id}>
                <DropdownMenuTrigger className="flex items-center gap-2.5 rounded-lg border border-border bg-card px-3 py-2 text-left hover:bg-muted/50 transition-colors w-full">
                  <SpoolColorDot hex={spool.filament.colorHex ?? "888888"} size="sm" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">{spoolLabel(spool)}</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <SpoolMaterialBadge material={spool.filament.material} />
                      <span className="text-2xs text-muted-foreground">
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

      {/* SURPLUS SECTION */}
      <section data-testid="surplus-section" className="space-y-2">
        <p className="text-2xs uppercase tracking-wider text-muted-foreground font-semibold">
          Surplus · {filteredSurplus.length} spool{filteredSurplus.length !== 1 ? "s" : ""}
          {filter !== "all" && surplusSpools.length !== filteredSurplus.length && (
            <span className="ml-1 text-muted-foreground/60 normal-case font-normal">
              ({surplusSpools.length} total)
            </span>
          )}
        </p>
        {filteredSurplus.length === 0 ? (
          <p className="text-2xs text-muted-foreground">
            {surplusSpools.length === 0 ? "No surplus spools" : "No matching spools"}
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {filteredSurplus.map((spool) => (
              <DropdownMenu key={spool.id}>
                <DropdownMenuTrigger className="flex items-center gap-2.5 rounded-lg border border-border bg-card px-3 py-2 text-left hover:bg-muted/50 transition-colors w-full">
                  <SpoolColorDot hex={spool.filament.colorHex ?? "888888"} size="sm" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">{spoolLabel(spool)}</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <SpoolMaterialBadge material={spool.filament.material} />
                      <span className="text-2xs text-muted-foreground">
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

      {/* AMS inspector + picker */}
      <SpoolInspectorContainer
        spoolId={selectedSpoolId}
        open={amsSheetOpen}
        onClose={() => {
          setAmsSheetOpen(false);
          setSelectedSpoolId(null);
        }}
        onMove={handleMoveToRack}
        liveRfidPct={liveRfidPctForSpool(typedSlots, selectedSpoolId)}
      />
      <SpoolPicker
        open={amsPickerOpen}
        mode="ams"
        onSelect={handleAmsPickerSelect}
        onClose={() => {
          setAmsPickerOpen(false);
          setSelectedSlotId(null);
        }}
      />

      {/* Storage inspector + picker */}
      <SpoolInspectorContainer
        spoolId={detailSpoolId}
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        onMove={handleMoveToRack}
        liveRfidPct={liveRfidPctForSpool(typedSlots, detailSpoolId)}
      />
      <SpoolPicker
        open={storagePickerOpen}
        mode="storage"
        onSelect={handleStoragePickerSelect}
        onClose={() => setStoragePickerOpen(false)}
      />

      {/* Move-to-rack dialog */}
      <Dialog open={moveToRackOpen} onOpenChange={(v) => !v && setMoveToRackOpen(false)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Pick a Rack Slot</DialogTitle>
          </DialogHeader>
          {safeActiveRacks.length > 1 && (
            <div className="flex flex-wrap gap-2 pb-2">
              {safeActiveRacks.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setTargetRackId(r.id)}
                  className={cn(
                    "px-3 py-1 rounded-md text-xs border transition",
                    targetRackId === r.id
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:border-muted-foreground"
                  )}
                >
                  {r.name}
                </button>
              ))}
            </div>
          )}
          {(() => {
            const activeRack = safeActiveRacks.find((r) => r.id === targetRackId) ?? safeActiveRacks[0];
            if (!activeRack) {
              return <p className="text-xs text-muted-foreground">No active rack. Create one in Admin first.</p>;
            }
            const pickRows = activeRack.rows;
            const pickCols = activeRack.cols;
            const pickRackId = activeRack.id;
            return (
              <div className="overflow-x-auto">
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: `32px repeat(${pickCols}, 1fr)`,
                    gap: "4px",
                  }}
                >
                  {/* Column headers */}
                  <div />
                  {Array.from({ length: pickCols }, (_, c) => (
                    <div key={c} className="text-center text-[9px] text-muted-foreground">
                      S{c + 1}
                    </div>
                  ))}

                  {/* Rows — R(max) at top, R1 at bottom */}
                  {Array.from({ length: pickRows }, (_, r) => {
                    const row = pickRows - r;
                    return [
                      <div
                        key={`label-${row}`}
                        className="flex items-center justify-center text-[9px] text-muted-foreground"
                      >
                        R{row}
                      </div>,
                      ...Array.from({ length: pickCols }, (_, c) => {
                        const col = c + 1;
                        const pos = `${row}-${col}`;
                        const occupied = spools.some(
                          (s) => s.location === `rack:${pickRackId}:${pos}`,
                        );
                        return (
                          <button
                            key={pos}
                            disabled={occupied}
                            onClick={() => handleRackSlotSelected(row, col, pickRackId)}
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
            );
          })()}
        </DialogContent>
      </Dialog>
    </>
  );
}

// ── Filter chip ────────────────────────────────────────────────────────────

interface FilterChipProps {
  label: string;
  count: number;
  active?: boolean;
  variant?: "warn";
  onClick: () => void;
}

function FilterChip({ label, count, active, variant, onClick }: FilterChipProps) {
  const warn = variant === "warn";
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border flex items-center gap-1.5 transition-colors",
        active && "bg-foreground text-background border-foreground",
        !active && !warn && "bg-card text-ink-2 border-border hover:bg-muted",
        !active && warn && "bg-destructive/10 text-destructive border-destructive/30 hover:bg-destructive/15",
      )}
    >
      {label}
      <span
        className={cn(
          "text-2xs",
          active && "opacity-60",
          !active && warn && "text-destructive",
          !active && !warn && "text-muted-foreground",
        )}
      >
        {count}
      </span>
    </button>
  );
}
