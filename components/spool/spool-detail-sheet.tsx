"use client";

import { useQuery } from "@tanstack/react-query";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { SpoolColorDot } from "@/components/spool/spool-color-dot";
import { SpoolMaterialBadge } from "@/components/spool/spool-material-badge";
import { SpoolProgressBar } from "@/components/spool/spool-progress-bar";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ExternalLink, Package } from "lucide-react";
import { WeightAdjuster } from "@/components/spool/weight-adjuster";
import { ArchiveButton } from "@/components/spool/archive-button";

interface SpoolDetailSheetProps {
  spoolId: string | null;
  open: boolean;
  onClose: () => void;
}

export function SpoolDetailSheet({ spoolId, open, onClose }: SpoolDetailSheetProps) {
  const { data: spool, isLoading } = useQuery({
    queryKey: ["spool", spoolId],
    queryFn: async () => {
      const res = await fetch(`/api/v1/spools/${spoolId}`);
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!spoolId && open,
  });

  // Note: The spools API requires auth. For the sheet to work without auth,
  // we need to either make the API public for GET or use a server action.
  // For now, this fetches via the API with no auth header — it will need
  // the API_SECRET_KEY. A better approach would be a server action, but
  // sheets are client components and can't directly call server actions for data.
  // We'll handle this in Task 10 polish.

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Spool Details</SheetTitle>
        </SheetHeader>

        {isLoading && <div className="text-sm text-muted-foreground p-4">Loading...</div>}

        {spool && (
          <div className="space-y-4 p-4">
            <div className="flex items-center gap-3">
              <SpoolColorDot hex={spool.filament?.colorHex || "888888"} size="lg" />
              <div>
                <div className="font-semibold">{spool.filament?.name}</div>
                <div className="text-sm text-muted-foreground">{spool.filament?.vendor?.name}</div>
                <SpoolMaterialBadge material={spool.filament?.material || "?"} />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between text-sm items-center">
                <span className="text-muted-foreground">Remaining</span>
                <div className="flex items-center gap-1">
                  <WeightAdjuster
                    spoolId={spool.id}
                    currentWeight={spool.remainingWeight}
                    initialWeight={spool.initialWeight}
                  />
                  <span className="text-xs text-muted-foreground">/ {spool.initialWeight}g</span>
                </div>
              </div>
              <SpoolProgressBar remaining={spool.remainingWeight} initial={spool.initialWeight} />
            </div>

            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Location</span>
              <span>{spool.location}</span>
            </div>

            {/* Stats row: Used + Cost/g + Price */}
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-muted/30 rounded-lg px-2 py-1.5 text-center">
                <div className="text-sm font-semibold font-mono">
                  {Math.max(0, spool.initialWeight - spool.remainingWeight)}g
                </div>
                <div className="text-[10px] text-muted-foreground">Used</div>
              </div>
              <div className="bg-muted/30 rounded-lg px-2 py-1.5 text-center">
                <div className="text-sm font-semibold font-mono">
                  {spool.purchasePrice && spool.initialWeight > 0
                    ? `${(parseFloat(spool.purchasePrice) / spool.initialWeight).toFixed(3)}€`
                    : "—"}
                </div>
                <div className="text-[10px] text-muted-foreground">Cost/g</div>
              </div>
              <div className="bg-muted/30 rounded-lg px-2 py-1.5 text-center">
                <div className="text-sm font-semibold font-mono">
                  {spool.purchasePrice ? `${parseFloat(spool.purchasePrice).toFixed(2)}€` : "—"}
                </div>
                <div className="text-[10px] text-muted-foreground">Price</div>
              </div>
            </div>

            {/* RFID Tag */}
            {spool.tagMappings?.[0] && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">RFID Tag</span>
                <span className="font-mono text-xs">{spool.tagMappings[0].tagUid}</span>
              </div>
            )}

            {/* Order provenance */}
            {spool.orderItems?.[0]?.order && (() => {
              const oi = spool.orderItems[0];
              const order = oi.order;
              const shop = order.shop?.name ?? "Unknown Shop";
              const orderNum = order.orderNumber ? `#${order.orderNumber}` : null;
              const date = new Date(order.orderDate).toLocaleDateString("de-DE", {
                day: "2-digit",
                month: "2-digit",
                year: "numeric",
              });
              return (
                <div className="rounded-lg bg-muted/40 px-3 py-2 space-y-1">
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                    <Package className="h-3 w-3" />
                    Order
                  </div>
                  <Link
                    href="/orders"
                    onClick={onClose}
                    className="flex items-center justify-between hover:text-primary transition-colors"
                  >
                    <div className="text-xs">
                      <span className="font-medium">{shop}</span>
                      {orderNum && (
                        <span className="text-muted-foreground font-mono ml-1.5">{orderNum}</span>
                      )}
                      <span className="text-muted-foreground ml-1.5">· {date}</span>
                    </div>
                    <ExternalLink className="h-3 w-3 text-muted-foreground shrink-0" />
                  </Link>
                  {oi.unitPrice && (
                    <div className="text-[11px] text-muted-foreground">
                      {parseFloat(oi.unitPrice).toFixed(2)}€ per spool
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Usage History */}
            {spool.printUsage && spool.printUsage.length > 0 && (
              <div className="rounded-lg bg-muted/40 px-3 py-2 space-y-1.5">
                <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                  Usage History
                </div>
                <div className="space-y-1">
                  {spool.printUsage.slice(0, 5).map((u: { id: string; weightUsed: number; cost: string | null; print?: { name: string | null; startedAt: string | null } }) => (
                    <div key={u.id} className="flex items-center justify-between text-xs">
                      <span className="truncate flex-1 text-muted-foreground">
                        {u.print?.name ?? "Unknown print"}
                      </span>
                      <span className="font-mono shrink-0 ml-2">{u.weightUsed?.toFixed(1)}g</span>
                      {u.cost && <span className="font-mono shrink-0 ml-2">{parseFloat(u.cost).toFixed(2)}€</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {spool.printUsage && spool.printUsage.length === 0 && (
              <div className="rounded-lg bg-muted/40 px-3 py-2">
                <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Usage History</div>
                <div className="text-xs text-muted-foreground mt-1">No usage recorded yet.</div>
              </div>
            )}

            <Link href={`/spools/${spool.id}`} onClick={onClose}>
              <Button variant="outline" size="sm" className="w-full mt-2">
                <ExternalLink className="h-3 w-3 mr-1" /> View Full Details
              </Button>
            </Link>

            <div className="mt-2">
              <ArchiveButton
                spoolId={spool.id}
                spoolName={`${spool.filament?.vendor?.name} ${spool.filament?.name}`}
              />
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
