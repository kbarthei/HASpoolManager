"use client";

import { useState, useCallback } from "react";
import { AddOrderDialog } from "@/components/orders/add-order-dialog";
import { ReceiveWizard } from "@/components/orders/receive-wizard";
import { SpoolColorDot } from "@/components/spool/spool-color-dot";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Plus, ShoppingCart } from "lucide-react";
import { useRouter } from "next/navigation";

// ─── Types ────────────────────────────────────────────────────────────────────

interface OrderItem {
  id: string;
  quantity: number;
  unitPrice: string | null;
  filament: {
    name: string;
    material: string;
    colorHex: string | null;
    vendor: { name: string };
  };
  spool: {
    id: string;
    location: string | null;
  } | null;
}

interface Order {
  id: string;
  orderNumber: string | null;
  orderDate: string;
  status: string;
  totalCost: string | null;
  currency: string | null;
  shop: { name: string } | null;
  items: OrderItem[];
}

interface RackInfo {
  rows: number;
  cols: number;
  occupiedPositions: string[];
}

interface OrdersClientProps {
  orders: Order[];
  rack: RackInfo;
}

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  if (status === "delivered") {
    return (
      <Badge className="text-[10px] h-5 px-1.5 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 font-medium">
        Delivered
      </Badge>
    );
  }
  return (
    <Badge className="text-[10px] h-5 px-1.5 bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30 font-medium">
      Ordered
    </Badge>
  );
}

// ─── Order card ───────────────────────────────────────────────────────────────

function OrderCard({
  order,
  onReceive,
}: {
  order: Order;
  onReceive: (order: Order) => void;
}) {
  const totalItems = order.items.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <div className="rounded-xl border border-border bg-card p-3 space-y-2.5">
      {/* Header row */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold truncate">
              {order.shop?.name ?? "Unknown Shop"}
            </span>
            {order.orderNumber && (
              <span className="text-xs text-muted-foreground font-mono">
                #{order.orderNumber}
              </span>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {new Date(order.orderDate).toLocaleDateString("de-DE", {
              day: "2-digit",
              month: "short",
              year: "numeric",
            })}
          </p>
        </div>
        <StatusBadge status={order.status} />
      </div>

      {/* Line items */}
      <div className="space-y-1">
        {order.items.map((item) => (
          <div key={item.id} className="flex items-center gap-2">
            <SpoolColorDot
              hex={item.filament.colorHex ?? "888888"}
              size="sm"
            />
            <span className="text-xs text-foreground flex-1 min-w-0 truncate">
              {item.quantity > 1 && (
                <span className="text-muted-foreground mr-1">
                  {item.quantity}×
                </span>
              )}
              {item.filament.vendor.name} {item.filament.name}
            </span>
          </div>
        ))}
      </div>

      {/* Footer row */}
      <div className="flex items-center justify-between gap-2 pt-0.5">
        <div className="text-xs text-muted-foreground">
          {totalItems} spool{totalItems !== 1 ? "s" : ""}
          {order.totalCost && (
            <span className="ml-2 font-medium text-foreground">
              {parseFloat(order.totalCost).toFixed(2)}{" "}
              {order.currency ?? "EUR"}
            </span>
          )}
        </div>

        {order.status === "ordered" && (
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs px-2.5 border-primary/40 text-primary hover:bg-primary/10"
            onClick={() => onReceive(order)}
          >
            Received
          </Button>
        )}
      </div>
    </div>
  );
}

// ─── Main client component ────────────────────────────────────────────────────

export function OrdersClient({ orders, rack }: OrdersClientProps) {
  const router = useRouter();
  const [addOpen, setAddOpen] = useState(false);
  const [receiveOrder, setReceiveOrder] = useState<Order | null>(null);
  const [receiveOpen, setReceiveOpen] = useState(false);

  const handleReceive = useCallback((order: Order) => {
    setReceiveOrder(order);
    setReceiveOpen(true);
  }, []);

  const handleReceiveClose = useCallback(() => {
    setReceiveOpen(false);
    setReceiveOrder(null);
    router.refresh();
  }, [router]);

  const handleOrderCreated = useCallback(() => {
    router.refresh();
  }, [router]);

  // Build the order shape ReceiveWizard expects:
  // items[].spools[] — each item has an array of spools
  const receiveWizardOrder = receiveOrder
    ? {
        id: receiveOrder.id,
        orderNumber: receiveOrder.orderNumber,
        items: receiveOrder.items.map((item) => ({
          id: item.id,
          quantity: item.quantity,
          filament: item.filament,
          spools: item.spool ? [item.spool] : [],
        })),
      }
    : null;

  return (
    <>
      {/* Header bar */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-lg font-semibold">Orders</h2>
          <p className="text-xs text-muted-foreground">
            {orders.length} order{orders.length !== 1 ? "s" : ""}
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => setAddOpen(true)}
          className="h-8 text-xs gap-1.5"
        >
          <Plus className="h-3.5 w-3.5" />
          Add Order
        </Button>
      </div>

      {/* Orders list */}
      {orders.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <ShoppingCart className="h-10 w-10 text-muted-foreground/40" />
          <div className="space-y-1">
            <p className="text-sm font-medium">No orders yet</p>
            <p className="text-xs text-muted-foreground">
              Add an order to track filament purchases
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setAddOpen(true)}
            className="mt-1 h-8 text-xs gap-1.5"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Order
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {orders.map((order) => (
            <OrderCard key={order.id} order={order} onReceive={handleReceive} />
          ))}
        </div>
      )}

      {/* Add Order dialog */}
      <AddOrderDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onOrderCreated={handleOrderCreated}
      />

      {/* Receive Wizard */}
      {receiveWizardOrder && (
        <ReceiveWizard
          open={receiveOpen}
          onClose={handleReceiveClose}
          order={receiveWizardOrder}
          rackRows={rack.rows}
          rackCols={rack.cols}
          occupiedPositions={rack.occupiedPositions}
        />
      )}
    </>
  );
}
