"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SpoolColorDot } from "@/components/spool/spool-color-dot";
import { Badge } from "@/components/ui/badge";
import { linkSpoolToOrderItem, mergeSpools } from "@/lib/actions";
import { toast } from "sonner";
import { Link2, Merge, Loader2, Package, Printer } from "lucide-react";
import { useRouter } from "next/navigation";
import { formatDate } from "@/lib/date";

// ─── Types ──────────────────────────────────────────────────────────────────

interface OrderItemCandidate {
  id: string;
  unitPrice: number | null;
  quantity: number;
  order: {
    id: string;
    orderNumber: string | null;
    orderDate: string;
    shop: { name: string } | null;
  };
  currentSpoolId: string | null;
}

interface MergeCandidate {
  id: string;
  remainingWeight: number;
  initialWeight: number;
  purchasePrice: number | null;
  location: string | null;
  status: string;
  usageCount: number;
  orderLinked: boolean;
  tagCount: number;
}

interface SpoolManageSectionProps {
  spoolId: string;
  filamentName: string;
  colorHex: string;
  hasOrderLink: boolean;
  orderItemCandidates: OrderItemCandidate[];
  mergeCandidates: MergeCandidate[];
}

// ─── Component ──────────────────────────────────────────────────────────────

export function SpoolManageSection({
  spoolId,
  filamentName,
  colorHex,
  hasOrderLink,
  orderItemCandidates,
  mergeCandidates,
}: SpoolManageSectionProps) {
  const router = useRouter();
  const [linkOpen, setLinkOpen] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const showLinkButton = !hasOrderLink && orderItemCandidates.length > 0;
  const showMergeButton = mergeCandidates.length > 0;

  if (!showLinkButton && !showMergeButton) return null;

  async function handleLink(orderItemId: string) {
    setLoading(true);
    try {
      await linkSpoolToOrderItem(spoolId, orderItemId);
      toast.success("Spool linked to order");
      setLinkOpen(false);
      router.refresh();
    } catch (err) {
      console.error(err);
      toast.error("Failed to link spool");
    } finally {
      setLoading(false);
    }
  }

  async function handleMerge(sourceId: string) {
    setLoading(true);
    try {
      await mergeSpools(spoolId, sourceId);
      toast.success("Spools merged");
      setMergeOpen(false);
      router.refresh();
    } catch (err) {
      console.error(err);
      toast.error("Failed to merge spools");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Manage
        </h3>
        <div className="flex gap-2">
          {showLinkButton && (
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs gap-1.5"
              onClick={() => setLinkOpen(true)}
            >
              <Link2 className="h-3.5 w-3.5" />
              Link to Order
            </Button>
          )}
          {showMergeButton && (
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs gap-1.5"
              onClick={() => setMergeOpen(true)}
            >
              <Merge className="h-3.5 w-3.5" />
              Merge Duplicate
            </Button>
          )}
        </div>
      </div>

      {/* ── Link to Order Dialog ────────────────────────────────────── */}
      <Dialog open={linkOpen} onOpenChange={(v) => !v && setLinkOpen(false)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">Link to Order Item</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">
            Select an order item to link this spool to. The purchase price will be
            applied automatically.
          </p>
          <div className="space-y-2 max-h-[50vh] overflow-y-auto">
            {orderItemCandidates.map((item) => (
              <button
                key={item.id}
                disabled={loading}
                onClick={() => handleLink(item.id)}
                className="w-full flex items-center gap-3 rounded-lg border border-border p-3 hover:bg-muted/50 transition text-left disabled:opacity-50"
              >
                <Package className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">
                      {item.order.shop?.name ?? "Unknown shop"}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {formatDate(item.order.orderDate)}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {item.order.orderNumber && `#${item.order.orderNumber} · `}
                    {item.unitPrice != null
                      ? `${item.unitPrice.toFixed(2)}€`
                      : "no price"}
                    {item.currentSpoolId && (
                      <span className="text-amber-500 ml-1">(will unlink current spool)</span>
                    )}
                  </div>
                </div>
                {loading && <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />}
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Merge Spool Dialog ──────────────────────────────────────── */}
      <Dialog open={mergeOpen} onOpenChange={(v) => !v && setMergeOpen(false)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">Merge Duplicate Spool</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">
            Select a duplicate spool to absorb into this one. Its print history,
            tags, order links, and purchase price will be transferred. The
            duplicate will be deleted.
          </p>
          <div className="space-y-2 max-h-[50vh] overflow-y-auto">
            {mergeCandidates.map((candidate) => (
              <button
                key={candidate.id}
                disabled={loading}
                onClick={() => handleMerge(candidate.id)}
                className="w-full flex items-center gap-3 rounded-lg border border-border p-3 hover:bg-muted/50 transition text-left disabled:opacity-50"
              >
                <SpoolColorDot hex={colorHex} size="sm" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium">{filamentName}</span>
                    <Badge
                      variant="outline"
                      className="text-[10px] h-4 px-1.5"
                    >
                      {candidate.location ?? "unknown"}
                    </Badge>
                    <Badge
                      variant="outline"
                      className="text-[10px] h-4 px-1.5"
                    >
                      {candidate.status}
                    </Badge>
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5 flex gap-3">
                    <span>
                      {candidate.remainingWeight}g / {candidate.initialWeight}g
                    </span>
                    {candidate.purchasePrice != null && (
                      <span>{candidate.purchasePrice.toFixed(2)}€</span>
                    )}
                    {candidate.usageCount > 0 && (
                      <span className="flex items-center gap-0.5">
                        <Printer className="h-3 w-3" />
                        {candidate.usageCount} prints
                      </span>
                    )}
                    {candidate.orderLinked && (
                      <span className="flex items-center gap-0.5">
                        <Package className="h-3 w-3" />
                        order linked
                      </span>
                    )}
                  </div>
                </div>
                <span className="text-[10px] text-muted-foreground font-mono shrink-0">
                  {candidate.id.slice(0, 8)}
                </span>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
