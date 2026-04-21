"use client";

import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useMemo } from "react";
import { SpoolInspector } from "./spool-inspector";
import { SpoolHero } from "./spool-hero";
import { SpoolRemainingCard } from "./spool-remaining-card";
import { SpoolStatsRow } from "./spool-stats-row";
import {
  DetailSection,
  KvRow,
  UsageHistoryRow,
} from "./spool-detail-sections";
import {
  adjustSpoolWeight,
  archiveSpool,
  addToShoppingList,
} from "@/lib/actions";

interface SpoolApiResponse {
  id: string;
  remainingWeight: number;
  initialWeight: number;
  purchasePrice: string | number | null;
  purchaseDate: string | null;
  location: string | null;
  status: string;
  filament: {
    id: string;
    name: string;
    material: string;
    colorHex: string | null;
    colorName: string | null;
    diameter: number;
    vendor: { name: string } | null;
  } | null;
  tagMappings: Array<{ tagUid: string; source: string | null }>;
  printUsage: Array<{
    id: string;
    weightUsed: number;
    cost: string | number | null;
    print: { name: string | null; startedAt: string | null } | null;
  }>;
  orderItems: Array<{
    unitPrice: string | number | null;
    order: {
      orderNumber: string | null;
      orderDate: string | null;
      shop: { name: string; website: string | null } | null;
    } | null;
  }>;
}

interface SpoolInspectorContainerProps {
  spoolId: string | null;
  open: boolean;
  onClose: () => void;
  /** Parent handles the "Move to…" picker; inspector just calls this with the spool id. */
  onMove?: (spoolId: string) => void;
  /** Called after archive succeeds — parent can refresh lists, dismiss, etc. */
  onArchived?: (spoolId: string) => void;
  /** Called after a weight adjust commits — parent can refresh aggregates. */
  onAdjusted?: () => void;
  /**
   * Live RFID remaining percentage (0–100) if the spool is currently loaded
   * in an AMS slot. When the tracked weight in the DB has drifted from this,
   * the Remaining card shows a warning + a one-click "Sync from RFID" action.
   */
  liveRfidPct?: number | null;
}

export function SpoolInspectorContainer({
  spoolId,
  open,
  onClose,
  onMove,
  onArchived,
  onAdjusted,
  liveRfidPct,
}: SpoolInspectorContainerProps) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data: spool, isLoading } = useQuery({
    queryKey: ["spool", spoolId],
    queryFn: async (): Promise<SpoolApiResponse | null> => {
      if (!spoolId) return null;
      const res = await fetch(`/api/v1/spools/${spoolId}`);
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!spoolId && open,
    staleTime: 5_000,
  });

  const derived = useMemo(() => {
    if (!spool) {
      return {
        locationLabel: "Unknown",
        locationState: null as string | null,
        idSource: null as "RFID" | "ΔE" | "manual" | null,
        rfidTag: null as string | null,
      };
    }
    const loc = spool.location;
    let label = loc ?? "Unknown";
    let state: string | null = null;
    if (loc === "workbench") label = "Workbench";
    else if (loc === "surplus") label = "Surplus";
    else if (loc === "ams") {
      label = "AMS";
      state = "loaded";
    } else if (loc === "ams-ht") {
      label = "AMS HT";
      state = "loaded";
    } else if (loc === "external") label = "External spool";
    else if (loc === "ordered") label = "Ordered";
    else if (loc) {
      const m = loc.match(/^rack:(\d+)-(\d+)$/);
      if (m) label = `Rack · R${m[1]}·${m[2]}`;
    }

    const tag = spool.tagMappings?.[0]?.tagUid ?? null;
    const idSource: "RFID" | "ΔE" | "manual" | null = tag ? "RFID" : null;
    return { locationLabel: label, locationState: state, idSource, rfidTag: tag };
  }, [spool]);

  async function handleAdjust(newG: number) {
    if (!spoolId) return;
    try {
      await adjustSpoolWeight(spoolId, newG);
      toast.success(`Weight updated to ${newG}g`);
      queryClient.invalidateQueries({ queryKey: ["spool", spoolId] });
      queryClient.invalidateQueries({ queryKey: ["ams-slots"] });
      onAdjusted?.();
    } catch {
      toast.error("Failed to update weight");
    }
  }

  async function handleArchive() {
    if (!spoolId || !spool) return;
    try {
      await archiveSpool(spoolId);
      const name = `${spool.filament?.vendor?.name ?? ""} ${spool.filament?.name ?? ""}`.trim();
      toast.success(name ? `Archived ${name}` : "Archived spool");
      onArchived?.(spoolId);
      onClose();
    } catch {
      toast.error("Failed to archive spool");
    }
  }

  async function handleAddToShoppingList() {
    if (!spool?.filament?.id) return;
    const name = `${spool.filament.vendor?.name ?? ""} ${spool.filament.name}`.trim();
    try {
      await addToShoppingList(spool.filament.id);
      toast.success(`Added ${name} to shopping list`);
    } catch {
      toast.error("Failed to add to shopping list");
    }
  }

  function handleEdit() {
    if (!spoolId) return;
    router.push(`/spools/${spoolId}`);
    onClose();
  }

  function handleMove() {
    if (!spoolId) return;
    onClose();
    onMove?.(spoolId);
  }

  const headerSubtitle = spool
    ? `${derived.locationLabel}${derived.locationState ? ` · ${derived.locationState}` : ""} · ${spool.filament?.vendor?.name ?? ""} ${spool.filament?.name ?? ""}`
        .trim()
        .replace(/\s+·\s*$/, "")
    : undefined;

  const purchasePrice =
    spool?.purchasePrice != null ? Number(spool.purchasePrice) : null;
  const usedG = spool
    ? Math.max(0, spool.initialWeight - spool.remainingWeight)
    : 0;
  const costPerG =
    purchasePrice && spool && spool.initialWeight > 0
      ? purchasePrice / spool.initialWeight
      : null;
  const usedCost = costPerG != null ? usedG * costPerG : null;

  return (
    <SpoolInspector
      open={open}
      onClose={onClose}
      headerSubtitle={headerSubtitle}
      onEdit={spool ? handleEdit : undefined}
      onMove={onMove && spool ? handleMove : undefined}
      onArchive={spool ? handleArchive : undefined}
      onAddToShoppingList={spool?.filament?.id ? handleAddToShoppingList : undefined}
    >
      {isLoading && !spool && (
        <div className="h-full min-h-[200px] flex items-center justify-center text-sm text-muted-foreground">
          Loading…
        </div>
      )}
      {!isLoading && !spool && open && (
        <div className="h-full min-h-[200px] flex items-center justify-center text-sm text-muted-foreground">
          Spool not found.
        </div>
      )}
      {spool && (
        <div className="space-y-6">
          <SpoolHero
            colorHex={spool.filament?.colorHex ?? null}
            filamentName={spool.filament?.name ?? "Unknown filament"}
            vendorName={spool.filament?.vendor?.name ?? ""}
            material={spool.filament?.material ?? "?"}
            diameterMm={spool.filament?.diameter ?? 1.75}
            initialWeightG={spool.initialWeight}
            remainingPct={
              spool.initialWeight > 0
                ? (spool.remainingWeight / spool.initialWeight) * 100
                : 0
            }
            locationLabel={derived.locationLabel}
            locationState={derived.locationState}
            idSource={derived.idSource}
          />

          <SpoolRemainingCard
            remainingG={spool.remainingWeight}
            initialG={spool.initialWeight}
            onAdjust={handleAdjust}
            liveRfidPct={liveRfidPct ?? null}
          />

          {purchasePrice != null && (
            <SpoolStatsRow
              used={{
                label: "Used",
                value: `${usedG}g`,
                sub: usedCost != null ? `€${usedCost.toFixed(2)}` : null,
              }}
              costPerG={{
                label: "Cost / g",
                value: costPerG != null ? `€${costPerG.toFixed(3)}` : "—",
                sub: "base",
              }}
              paid={{
                label: "Paid",
                value: `€${purchasePrice.toFixed(2)}`,
                sub: spool.purchaseDate
                  ? formatDate(spool.purchaseDate)
                  : null,
              }}
            />
          )}

          <DetailSection title="Identification">
            <KvRow
              label="Type"
              value={`${spool.filament?.material ?? "?"} · ${spool.filament?.vendor?.name ?? "—"}`}
            />
            <KvRow
              label="Diameter"
              value={`${(spool.filament?.diameter ?? 1.75).toFixed(2)} mm`}
            />
            {spool.filament?.colorHex && (
              <KvRow
                label="Color"
                value={
                  spool.filament.colorName
                    ? `#${spool.filament.colorHex} · ${spool.filament.colorName}`
                    : `#${spool.filament.colorHex}`
                }
                mono
                isLast={!derived.rfidTag}
              />
            )}
            {derived.rfidTag && (
              <KvRow label="RFID tag" value={derived.rfidTag} mono isLast />
            )}
          </DetailSection>

          {spool.orderItems?.[0]?.order &&
            (() => {
              const oi = spool.orderItems[0];
              const order = oi.order!;
              const unitPrice =
                oi.unitPrice != null ? Number(oi.unitPrice) : null;
              return (
                <DetailSection title="Order">
                  {order.shop && (
                    <KvRow
                      label="Supplier"
                      value={order.shop.name}
                      chevron={!!order.shop.website}
                      href={order.shop.website ?? undefined}
                    />
                  )}
                  {order.orderNumber && (
                    <KvRow label="Order #" value={order.orderNumber} mono />
                  )}
                  {order.orderDate && (
                    <KvRow
                      label="Ordered"
                      value={formatDate(order.orderDate)}
                    />
                  )}
                  {unitPrice != null && (
                    <KvRow
                      label="Paid"
                      value={`€${unitPrice.toFixed(2)}`}
                      mono
                      isLast
                    />
                  )}
                </DetailSection>
              );
            })()}

          <DetailSection title="Usage history">
            {spool.printUsage && spool.printUsage.length > 0 ? (
              spool.printUsage
                .slice()
                .sort((a, b) => {
                  const da = a.print?.startedAt ?? "";
                  const db = b.print?.startedAt ?? "";
                  return db.localeCompare(da);
                })
                .slice(0, 10)
                .map((u, i, arr) => (
                  <UsageHistoryRow
                    key={u.id}
                    printName={u.print?.name ?? "Unknown print"}
                    grams={u.weightUsed ?? 0}
                    cost={u.cost != null ? Number(u.cost) : null}
                    dateLabel={
                      u.print?.startedAt ? relativeDate(u.print.startedAt) : "—"
                    }
                    isLast={i === arr.length - 1}
                  />
                ))
            ) : (
              <div className="text-sm text-muted-foreground py-4 text-center">
                No prints recorded yet.
              </div>
            )}
          </DetailSection>
        </div>
      )}
    </SpoolInspector>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function relativeDate(isoString: string): string {
  const d = new Date(isoString);
  const diff = Date.now() - d.getTime();
  if (diff < 0) return formatDate(isoString);
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days < 1) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return formatDate(isoString);
}

function formatDate(isoString: string): string {
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return isoString;
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
