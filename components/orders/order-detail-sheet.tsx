"use client";

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { SpoolColorDot } from "@/components/spool/spool-color-dot";
import { SpoolMaterialBadge } from "@/components/spool/spool-material-badge";
import { ExternalLink } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface OrderDetailSheetProps {
  order: {
    id: string;
    orderNumber: string | null;
    orderDate: string;
    status: string;
    totalCost: string | null;
    currency: string | null;
    sourceUrl?: string | null;
    shop: { name: string } | null;
    items: Array<{
      id: string;
      quantity: number;
      unitPrice: string | null;
      filament: {
        name: string;
        material: string;
        colorHex: string | null;
        vendor: { name: string };
      };
    }>;
  } | null;
  open: boolean;
  onClose: () => void;
}

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const isDelivered = status !== "ordered";
  return (
    <Badge
      className={
        isDelivered
          ? "text-[10px] h-5 px-1.5 bg-green-500/15 text-green-600 border-green-500/30"
          : "text-[10px] h-5 px-1.5 bg-amber-500/15 text-amber-600 border-amber-500/30"
      }
    >
      {isDelivered ? "Delivered" : "Ordered"}
    </Badge>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export function OrderDetailSheet({ order, open, onClose }: OrderDetailSheetProps) {
  if (!order) return null;

  const formattedDate = new Date(order.orderDate).toLocaleDateString("en-US", {
    weekday: "short",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  const currency = order.currency ?? "€";
  const currencySymbol = currency === "EUR" ? "€" : currency;

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="right" className="flex flex-col gap-0 p-0 overflow-y-auto sm:max-w-sm">
        {/* Header */}
        <SheetHeader className="px-4 pt-4 pb-3 border-b border-border">
          <div className="flex items-start justify-between pr-8">
            <div className="space-y-0.5">
              <SheetTitle className="text-base font-semibold leading-tight">
                {order.shop?.name ?? "Unknown Shop"}
              </SheetTitle>
              {order.orderNumber && (
                <SheetDescription className="text-xs font-mono text-muted-foreground">
                  #{order.orderNumber}
                </SheetDescription>
              )}
            </div>
            <StatusBadge status={order.status} />
          </div>
          <p className="text-xs text-muted-foreground mt-1">{formattedDate}</p>
        </SheetHeader>

        {/* Line items */}
        <div className="flex-1 px-4 py-3 space-y-1">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">
            Items
          </p>
          {order.items.map((item) => (
            <div
              key={item.id}
              className="flex items-center gap-2.5 rounded-lg bg-muted/40 px-2.5 py-2"
            >
              {/* Color dot */}
              <SpoolColorDot
                hex={item.filament.colorHex ?? "888888"}
                size="md"
                className="shrink-0"
              />

              {/* Name + vendor */}
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium leading-tight truncate">
                  {item.filament.name}
                </p>
                <p className="text-[11px] text-muted-foreground truncate">
                  {item.filament.vendor.name}
                </p>
              </div>

              {/* Material */}
              <SpoolMaterialBadge
                material={item.filament.material}
                className="shrink-0"
              />

              {/* Qty × price */}
              <div className="shrink-0 text-right">
                <p className="text-xs font-mono text-foreground">
                  {item.quantity > 1 && (
                    <span className="text-muted-foreground">{item.quantity}× </span>
                  )}
                  {item.unitPrice
                    ? `${parseFloat(item.unitPrice).toFixed(2)}${currencySymbol}`
                    : "—"}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* Footer: total + optional shop link */}
        <div className="px-4 pb-4 pt-3 border-t border-border space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Total</span>
            <span className="text-sm font-semibold font-mono">
              {order.totalCost
                ? `${parseFloat(order.totalCost).toFixed(2)}${currencySymbol}`
                : "—"}
            </span>
          </div>

          {order.sourceUrl && (
            <a
              href={order.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs text-primary hover:underline"
            >
              <ExternalLink className="h-3 w-3 shrink-0" />
              View order at {order.shop?.name ?? "shop"}
            </a>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
