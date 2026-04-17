import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { formatDate } from "@/lib/date";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { SpoolColorDot } from "@/components/spool/spool-color-dot";
import { SpoolMaterialBadge } from "@/components/spool/spool-material-badge";
import { SpoolProgressBar } from "@/components/spool/spool-progress-bar";
import { ExternalLink } from "lucide-react";
import { WeightAdjuster } from "@/components/spool/weight-adjuster";
import { ArchiveButton } from "@/components/spool/archive-button";
import { AddToShoppingListButton } from "@/components/spool/add-to-shopping-list-button";
import { SpoolManageSection } from "@/components/spool/spool-manage-section";
import { MaterialProfileCard } from "@/components/spool/material-profile-card";
import { and, ne, sql } from "drizzle-orm";

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

  // Find order for this spool
  const orderItem = await db.query.orderItems.findFirst({
    where: eq(schema.orderItems.spoolId, id),
    with: {
      order: {
        with: { shop: true, vendor: true },
      },
    },
  });

  // ── Candidates for "Link to Order" ──
  // Order items for the same filament that are either unlinked or linked to a different spool
  const orderItemCandidates = !orderItem
    ? await db.query.orderItems.findMany({
        where: eq(schema.orderItems.filamentId, spool.filamentId),
        with: {
          order: { with: { shop: true } },
        },
      }).then((items) => items.map((oi) => ({
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
      })))
    : [];

  // ── Candidates for "Merge Spool" ──
  // Other spools of the same filament (exclude self)
  const mergeCandidatesRaw = await db.query.spools.findMany({
    where: and(
      eq(schema.spools.filamentId, spool.filamentId),
      ne(schema.spools.id, id),
    ),
    with: {
      printUsage: true,
      tagMappings: true,
      orderItems: true,
    },
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

  const usedWeight = spool.initialWeight - spool.remainingWeight;
  const costPerGram = spool.purchasePrice
    ? spool.purchasePrice / spool.initialWeight
    : 0;

  const hex = spool.filament.colorHex || "888888";

  return (
    <div data-testid="page-spool-detail" className="space-y-3 max-w-2xl">
      {/* Hero with color accent */}
      <div
        className="rounded-xl p-4 relative overflow-hidden"
        style={{
          background: `linear-gradient(135deg, #${hex}15 0%, transparent 60%)`,
        }}
      >
        <div
          className="absolute top-0 left-0 right-0 h-1 rounded-t-xl"
          style={{ backgroundColor: `#${hex}` }}
        />
        <div className="flex items-start gap-4 pt-1">
          <SpoolColorDot hex={hex} size="lg" />
          <div>
            <h1 className="text-xl font-bold">{spool.filament.name}</h1>
            <p className="text-sm text-muted-foreground">{spool.filament.vendor.name}</p>
            <div className="flex items-center gap-2 mt-1">
              <SpoolMaterialBadge material={spool.filament.material} />
              <span className="text-xs text-muted-foreground font-mono">
                #{hex}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-2">
        <Card className="p-3 rounded-xl">
          <div className="text-xs text-muted-foreground">Remaining</div>
          <WeightAdjuster
            spoolId={spool.id}
            currentWeight={spool.remainingWeight}
            initialWeight={spool.initialWeight}
          />
          <SpoolProgressBar
            remaining={spool.remainingWeight}
            initial={spool.initialWeight}
            className="mt-1"
          />
        </Card>
        <Card className="p-3 rounded-xl">
          <div className="text-xs text-muted-foreground">Used</div>
          <div className="text-lg font-bold font-mono">{usedWeight}g</div>
        </Card>
        <Card className="p-3 rounded-xl">
          <div className="text-xs text-muted-foreground">Cost/g</div>
          <div className="text-lg font-bold font-mono">{costPerGram.toFixed(3)}€</div>
        </Card>
      </div>

      {/* Location + Tag */}
      <Card className="p-3 rounded-xl">
        <div className="flex justify-between items-center">
          <div>
            <div className="text-xs text-muted-foreground">Location</div>
            <div className="text-sm font-medium">{spool.location}</div>
          </div>
          {spool.tagMappings.length > 0 && (
            <div className="text-right">
              <div className="text-xs text-muted-foreground">RFID Tag</div>
              <div className="text-xs font-mono">{spool.tagMappings[0].tagUid}</div>
            </div>
          )}
        </div>
      </Card>

      {/* Purchase Info */}
      {orderItem?.order && (
        <Link href="/orders">
        <Card className="p-3 rounded-xl hover:bg-accent/50 transition-colors cursor-pointer">
          <div className="flex justify-between items-start">
            <div>
              <div className="text-xs text-muted-foreground">Purchased from</div>
              <div className="text-sm font-medium">
                {orderItem.order.shop?.name || orderItem.order.vendor?.name || "Unknown"}
              </div>
              {orderItem.order.orderDate && (
                <div className="text-xs text-muted-foreground mt-0.5">
                  {formatDate(orderItem.order.orderDate)}
                  {orderItem.order.orderNumber && ` · #${orderItem.order.orderNumber}`}
                </div>
              )}
            </div>
            {orderItem.order.sourceUrl && (
              <a
                href={orderItem.order.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-primary hover:underline flex items-center gap-1"
              >
                <ExternalLink className="h-3 w-3" />
                Shop
              </a>
            )}
          </div>
        </Card>
        </Link>
      )}

      {/* Manage: Link to Order / Merge Duplicate */}
      <SpoolManageSection
        spoolId={spool.id}
        filamentName={spool.filament.name}
        colorHex={spool.filament.colorHex || "888888"}
        hasOrderLink={!!orderItem}
        orderItemCandidates={orderItemCandidates}
        mergeCandidates={mergeCandidates}
      />

      {/* Shopping list + Archive actions */}
      <div className="flex flex-col gap-2">
        <AddToShoppingListButton
          filamentId={spool.filament.id}
          filamentName={`${spool.filament.vendor.name} ${spool.filament.name}`}
        />
        <div className="flex justify-end">
          <ArchiveButton spoolId={spool.id} spoolName={`${spool.filament.vendor.name} ${spool.filament.name}`} />
        </div>
      </div>

      {/* Material Profile */}
      <MaterialProfileCard profile={materialProfile ?? null} />

      {/* Usage History */}
      <Card className="p-3 rounded-xl">
        <h3 className="text-sm font-medium mb-2">Usage History</h3>
        {spool.printUsage.length === 0 ? (
          <p className="text-xs text-muted-foreground">No usage recorded yet.</p>
        ) : (
          <div className="space-y-1">
            {spool.printUsage.map((usage) => (
              <div
                key={usage.id}
                className="flex items-center justify-between text-xs py-1 border-b border-border last:border-0"
              >
                <div>
                  <span className="font-medium">{usage.print?.name || "Unknown print"}</span>
                  <span className="text-muted-foreground ml-2">
                    {usage.createdAt ? formatDate(usage.createdAt) : ""}
                  </span>
                </div>
                <div className="font-mono">
                  {usage.weightUsed}g ·{" "}
                  {usage.cost != null ? `${usage.cost.toFixed(2)}€` : "-"}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
