import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq, and, ne } from "drizzle-orm";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { SpoolHero } from "@/components/spool/spool-hero";
import { SpoolRemainingCardEditable } from "@/components/spool/spool-remaining-card-editable";
import { SpoolStatsRow } from "@/components/spool/spool-stats-row";
import {
  DetailSection,
  KvRow,
  UsageHistoryRow,
} from "@/components/spool/spool-detail-sections";
import { ArchiveButton } from "@/components/spool/archive-button";
import { AddToShoppingListButton } from "@/components/spool/add-to-shopping-list-button";
import { SpoolManageSection } from "@/components/spool/spool-manage-section";
import { MaterialProfileCard } from "@/components/spool/material-profile-card";

function describeLocation(location: string | null): {
  label: string;
  state: string | null;
} {
  if (!location) return { label: "Unknown", state: null };
  if (location === "workbench") return { label: "Workbench", state: null };
  if (location === "surplus") return { label: "Surplus", state: null };
  if (location === "ams") return { label: "AMS", state: "loaded" };
  if (location === "ams-ht") return { label: "AMS HT", state: "loaded" };
  if (location === "external") return { label: "External spool", state: null };
  if (location === "ordered") return { label: "Ordered", state: null };
  const m = location.match(/^rack:(\d+)-(\d+)$/);
  if (m) return { label: `Rack · R${m[1]}·${m[2]}`, state: null };
  return { label: location, state: null };
}

function formatDate(d: string | Date | null | undefined): string {
  if (!d) return "—";
  const dt = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(dt.getTime())) return "—";
  return dt.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function relativeDate(d: string | Date | null | undefined): string {
  if (!d) return "—";
  const dt = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(dt.getTime())) return "—";
  const diff = Date.now() - dt.getTime();
  if (diff < 0) return formatDate(dt);
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days < 1) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return formatDate(dt);
}

export default async function SpoolDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const spool = await db.query.spools.findFirst({
    where: eq(schema.spools.id, id),
    with: {
      filament: { with: { vendor: true } },
      tagMappings: true,
      printUsage: {
        with: { print: true },
        orderBy: (pu, { desc }) => [desc(pu.createdAt)],
      },
    },
  });

  if (!spool) notFound();

  const orderItem = await db.query.orderItems.findFirst({
    where: eq(schema.orderItems.spoolId, id),
    with: {
      order: { with: { shop: true, vendor: true } },
    },
  });

  const orderItemCandidates = !orderItem
    ? await db.query.orderItems
        .findMany({
          where: eq(schema.orderItems.filamentId, spool.filamentId),
          with: { order: { with: { shop: true } } },
        })
        .then((items) =>
          items.map((oi) => ({
            id: oi.id,
            unitPrice: oi.unitPrice,
            quantity: oi.quantity,
            order: {
              id: oi.order.id,
              orderNumber: oi.order.orderNumber,
              orderDate: oi.order.orderDate,
              shop: oi.order.shop,
            },
            currentSpoolId: oi.spoolId,
          })),
        )
    : [];

  const mergeCandidatesRaw = await db.query.spools.findMany({
    where: and(eq(schema.spools.filamentId, spool.filamentId), ne(schema.spools.id, id)),
    with: { printUsage: true, tagMappings: true, orderItems: true },
  });
  const mergeCandidates = mergeCandidatesRaw.map((s) => ({
    id: s.id,
    remainingWeight: s.remainingWeight,
    initialWeight: s.initialWeight,
    purchasePrice: s.purchasePrice,
    location: s.location,
    status: s.status,
    usageCount: s.printUsage.length,
    orderLinked: s.orderItems.length > 0,
    tagCount: s.tagMappings.length,
  }));

  const materialProfile = await db.query.materialProfiles.findFirst({
    where: eq(schema.materialProfiles.material, spool.filament.material),
  });

  // ── Derived values ───────────────────────────────────────────────────────
  const { label: locationLabel, state: locationState } = describeLocation(
    spool.location,
  );
  const usedG = Math.max(0, spool.initialWeight - spool.remainingWeight);
  const purchasePrice = spool.purchasePrice ?? null;
  const costPerG =
    purchasePrice && spool.initialWeight > 0
      ? purchasePrice / spool.initialWeight
      : null;
  const usedCost = costPerG != null ? usedG * costPerG : null;
  const rfidTag = spool.tagMappings[0]?.tagUid ?? null;
  const pct =
    spool.initialWeight > 0
      ? (spool.remainingWeight / spool.initialWeight) * 100
      : 0;

  const filamentDisplayName = `${spool.filament.vendor.name} ${spool.filament.name}`.trim();

  return (
    <div data-testid="page-spool-detail" className="max-w-2xl mx-auto space-y-5">
      {/* Back link */}
      <Link
        href="/inventory"
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <ChevronLeft className="w-3.5 h-3.5" />
        Inventory
      </Link>

      {/* Hero — shared with Spool Inspector */}
      <SpoolHero
        colorHex={spool.filament.colorHex}
        filamentName={spool.filament.name}
        vendorName={spool.filament.vendor.name}
        material={spool.filament.material}
        diameterMm={spool.filament.diameter}
        initialWeightG={spool.initialWeight}
        remainingPct={pct}
        locationLabel={locationLabel}
        locationState={locationState}
        idSource={rfidTag ? "RFID" : null}
      />

      {/* Remaining — editable slider */}
      <SpoolRemainingCardEditable
        spoolId={spool.id}
        remainingG={spool.remainingWeight}
        initialG={spool.initialWeight}
      />

      {/* 3-up stats */}
      {purchasePrice != null && (
        <SpoolStatsRow
          used={{
            label: "Used",
            value: `${usedG.toFixed(0)}g`,
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
            sub: spool.purchaseDate ? formatDate(spool.purchaseDate) : null,
          }}
        />
      )}

      {/* Identification */}
      <DetailSection title="Identification">
        <KvRow
          label="Type"
          value={`${spool.filament.material} · ${spool.filament.vendor.name}`}
        />
        <KvRow
          label="Diameter"
          value={`${spool.filament.diameter.toFixed(2)} mm`}
        />
        {spool.filament.colorHex && (
          <KvRow
            label="Color"
            value={
              spool.filament.colorName
                ? `#${spool.filament.colorHex} · ${spool.filament.colorName}`
                : `#${spool.filament.colorHex}`
            }
            mono
            isLast={!rfidTag}
          />
        )}
        {rfidTag && <KvRow label="RFID tag" value={rfidTag} mono isLast />}
      </DetailSection>

      {/* Order — only if the spool is linked to one */}
      {orderItem?.order && (
        <DetailSection title="Order">
          <KvRow
            label="Supplier"
            value={orderItem.order.shop?.name || orderItem.order.vendor?.name || "Unknown"}
            chevron={!!orderItem.order.sourceUrl}
            href={orderItem.order.sourceUrl ?? undefined}
          />
          {orderItem.order.orderNumber && (
            <KvRow label="Order #" value={orderItem.order.orderNumber} mono />
          )}
          {orderItem.order.orderDate && (
            <KvRow label="Ordered" value={formatDate(orderItem.order.orderDate)} />
          )}
          {orderItem.unitPrice != null && (
            <KvRow
              label="Paid"
              value={`€${Number(orderItem.unitPrice).toFixed(2)}`}
              mono
              isLast
            />
          )}
        </DetailSection>
      )}

      {/* Manage (link-to-order / merge duplicate) */}
      <SpoolManageSection
        spoolId={spool.id}
        filamentName={spool.filament.name}
        colorHex={spool.filament.colorHex || "888888"}
        hasOrderLink={!!orderItem}
        orderItemCandidates={orderItemCandidates}
        mergeCandidates={mergeCandidates}
      />

      {/* Material Profile */}
      <MaterialProfileCard profile={materialProfile ?? null} />

      {/* Usage history */}
      <DetailSection title="Usage history">
        {spool.printUsage.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            No prints recorded yet.
          </p>
        ) : (
          spool.printUsage.slice(0, 20).map((u, i, arr) => (
            <UsageHistoryRow
              key={u.id}
              printName={u.print?.name ?? "Unknown print"}
              grams={u.weightUsed ?? 0}
              cost={u.cost != null ? Number(u.cost) : null}
              dateLabel={
                u.print?.startedAt
                  ? relativeDate(u.print.startedAt)
                  : u.createdAt
                  ? relativeDate(u.createdAt)
                  : "—"
              }
              isLast={i === arr.length - 1}
            />
          ))
        )}
      </DetailSection>

      {/* Action bar */}
      <div className="flex items-center gap-2 pt-2">
        <AddToShoppingListButton
          filamentId={spool.filament.id}
          filamentName={filamentDisplayName}
        />
        <div className="ml-auto">
          <ArchiveButton spoolId={spool.id} spoolName={filamentDisplayName} />
        </div>
      </div>
    </div>
  );
}
