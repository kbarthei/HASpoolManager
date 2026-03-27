"use client";

import { useState, useCallback } from "react";
import { AddOrderDialog } from "@/components/orders/add-order-dialog";
import { OrderDetailSheet } from "@/components/orders/order-detail-sheet";
import { ReceiveWizard } from "@/components/orders/receive-wizard";
import { SpoolColorDot } from "@/components/spool/spool-color-dot";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Plus, ShoppingCart, Check, ChevronRight } from "lucide-react";
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
  spools?: Array<{
    id: string;
    location: string | null;
  }>;
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

// ─── Pending Order Card ────────────────────────────────────────────────────────

function PendingOrderCard({
  order,
  now,
  onReceive,
  onCardClick,
}: {
  order: Order;
  now: number;
  onReceive: (o: Order) => void;
  onCardClick: (o: Order) => void;
}) {
  const totalItems = order.items.reduce((sum, i) => sum + i.quantity, 0);
  const daysAgo = Math.floor(
    (now - new Date(order.orderDate).getTime()) / 86400000
  );

  return (
    <div
      className="rounded-xl border-l-[3px] border-l-primary border border-border bg-card p-3 space-y-2 cursor-pointer hover:bg-muted/30 transition"
      onClick={() => onCardClick(order)}
    >
      <div className="flex items-start justify-between">
        <div>
          <span className="text-sm font-semibold">
            {order.shop?.name ?? "Unknown"}
          </span>
          <span className="text-xs text-muted-foreground ml-2">
            {new Date(order.orderDate).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
            })}
            {daysAgo > 0 && ` · ${daysAgo}d ago`}
          </span>
        </div>
        {order.orderNumber && (
          <span className="text-[10px] font-mono text-muted-foreground">
            #{order.orderNumber}
          </span>
        )}
      </div>

      {/* Line items with color dots */}
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {order.items.map((item) => (
          <span key={item.id} className="flex items-center gap-1 text-xs">
            <SpoolColorDot
              hex={item.filament.colorHex ?? "888888"}
              size="sm"
            />
            {item.quantity > 1 && (
              <span className="text-muted-foreground">{item.quantity}×</span>
            )}
            {item.filament.name}
          </span>
        ))}
      </div>

      {/* Footer: total + receive button */}
      <div className="flex items-center justify-between pt-1">
        <span className="text-xs text-muted-foreground">
          {totalItems} spool{totalItems !== 1 ? "s" : ""}
          {order.totalCost && (
            <span className="font-medium text-foreground ml-1">
              {parseFloat(order.totalCost).toFixed(2)}€
            </span>
          )}
        </span>
        <Button
          size="sm"
          className="h-7 text-xs gap-1"
          onClick={(e) => { e.stopPropagation(); onReceive(order); }}
        >
          <Check className="h-3 w-3" /> Mark Received
        </Button>
      </div>
    </div>
  );
}

// ─── Delivered Order Card ─────────────────────────────────────────────────────

function DeliveredOrderCard({ order, onCardClick }: { order: Order; onCardClick: (o: Order) => void }) {
  const itemSummary = order.items
    .map(
      (i) => `${i.quantity > 1 ? i.quantity + "× " : ""}${i.filament.name}`
    )
    .join(", ");

  return (
    <div className="flex items-center gap-3 rounded-lg bg-card px-3 py-2 hover:bg-muted/50 transition cursor-pointer" onClick={() => onCardClick(order)}>
      <div className="flex -space-x-1">
        {order.items.slice(0, 3).map((item) => (
          <SpoolColorDot
            key={item.id}
            hex={item.filament.colorHex ?? "888888"}
            size="sm"
            className="ring-1 ring-background"
          />
        ))}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 text-xs">
          <span className="font-medium">{order.shop?.name ?? "Unknown"}</span>
          <span className="text-muted-foreground">
            {new Date(order.orderDate).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
            })}
          </span>
        </div>
        <p className="text-[11px] text-muted-foreground truncate">
          {itemSummary}
        </p>
      </div>
      <span className="text-xs font-mono shrink-0">
        {order.totalCost
          ? `${parseFloat(order.totalCost).toFixed(2)}€`
          : "—"}
      </span>
      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
    </div>
  );
}

// ─── Month Header ─────────────────────────────────────────────────────────────

function MonthHeader({
  label,
  count,
  total,
}: {
  label: string;
  count: number;
  total: number;
}) {
  return (
    <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm py-1.5 flex items-center justify-between border-b border-border">
      <span className="text-xs font-semibold text-foreground">{label}</span>
      <span className="text-[10px] text-muted-foreground">
        {count} order{count !== 1 ? "s" : ""} · {total.toFixed(2)}€
      </span>
    </div>
  );
}

// ─── Main client component ────────────────────────────────────────────────────

export function OrdersClient({ orders, rack }: OrdersClientProps) {
  const router = useRouter();
  const [addOpen, setAddOpen] = useState(false);
  const [receiveOrder, setReceiveOrder] = useState<Order | null>(null);
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedShop, setSelectedShop] = useState<string>("all");

  // Stable timestamp initialised once at mount via lazy useState initialiser
  const [now] = useState<number>(() => Date.now());

  const handleCardClick = useCallback((order: Order) => {
    setSelectedOrder(order);
    setDetailOpen(true);
  }, []);

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
          spools: item.spools?.length ? item.spools : item.spool ? [item.spool] : [],
        })),
      }
    : null;

  // ─── Split orders ────────────────────────────────────────────────────────────

  const pendingOrders = orders.filter((o) => o.status === "ordered");
  const deliveredOrders = orders.filter((o) => o.status !== "ordered");

  // Unique shops for filter chips
  const shops = [
    ...new Set(
      deliveredOrders.map((o) => o.shop?.name).filter(Boolean) as string[]
    ),
  ].sort();

  // Apply filters
  let filteredDelivered = deliveredOrders;
  if (search) {
    const q = search.toLowerCase();
    filteredDelivered = filteredDelivered.filter(
      (o) =>
        o.items.some(
          (i) =>
            i.filament.name.toLowerCase().includes(q) ||
            i.filament.vendor.name.toLowerCase().includes(q)
        ) ||
        o.shop?.name.toLowerCase().includes(q) ||
        o.orderNumber?.toLowerCase().includes(q)
    );
  }
  if (selectedShop !== "all") {
    filteredDelivered = filteredDelivered.filter(
      (o) => o.shop?.name === selectedShop
    );
  }

  // Group filtered delivered orders by month
  const groupedByMonth = filteredDelivered.reduce(
    (groups, order) => {
      const date = new Date(order.orderDate);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      const label = date.toLocaleDateString("en-US", {
        month: "long",
        year: "numeric",
      });
      if (!groups[key]) groups[key] = { label, orders: [], totalCost: 0 };
      groups[key].orders.push(order);
      groups[key].totalCost += order.totalCost
        ? parseFloat(order.totalCost)
        : 0;
      return groups;
    },
    {} as Record<string, { label: string; orders: Order[]; totalCost: number }>
  );

  // Sort months descending (newest first)
  const sortedMonths = Object.entries(groupedByMonth).sort(([a], [b]) =>
    b.localeCompare(a)
  );

  const showFilters = deliveredOrders.length > 5;

  return (
    <>
      {/* Page header */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold">Orders</h2>
        <Button
          size="sm"
          onClick={() => setAddOpen(true)}
          className="h-8 text-xs gap-1.5"
        >
          <Plus className="h-3.5 w-3.5" /> Add Order
        </Button>
      </div>

      {/* Empty state */}
      {orders.length === 0 && (
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
            <Plus className="h-3.5 w-3.5" /> Add Order
          </Button>
        </div>
      )}

      {/* Pending section */}
      {pendingOrders.length > 0 && (
        <div className="mb-4">
          <div className="flex items-center gap-2 mb-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Awaiting Delivery
            </h3>
            <Badge className="text-[10px] h-4 px-1.5 bg-amber-500/15 text-amber-600 border-amber-500/30">
              {pendingOrders.length}
            </Badge>
          </div>
          <div className="space-y-2">
            {pendingOrders.map((o) => (
              <PendingOrderCard key={o.id} order={o} now={now} onReceive={handleReceive} onCardClick={handleCardClick} />
            ))}
          </div>
        </div>
      )}

      {/* Past Orders section */}
      {deliveredOrders.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
            Past Orders
          </h3>

          {/* Progressive filters */}
          {showFilters && (
            <div className="space-y-2 mb-3">
              <Input
                type="search"
                placeholder="Search orders..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-8 text-xs"
              />
              {shops.length > 1 && (
                <div className="flex gap-1.5 overflow-x-auto pb-1">
                  <button
                    className={cn(
                      "text-[11px] px-2.5 py-1 rounded-full border whitespace-nowrap transition",
                      selectedShop === "all"
                        ? "bg-primary text-primary-foreground border-primary"
                        : "border-border text-muted-foreground hover:text-foreground"
                    )}
                    onClick={() => setSelectedShop("all")}
                  >
                    All
                  </button>
                  {shops.map((shop) => (
                    <button
                      key={shop}
                      className={cn(
                        "text-[11px] px-2.5 py-1 rounded-full border whitespace-nowrap transition",
                        selectedShop === shop
                          ? "bg-primary text-primary-foreground border-primary"
                          : "border-border text-muted-foreground hover:text-foreground"
                      )}
                      onClick={() => setSelectedShop(shop)}
                    >
                      {shop}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Month groups */}
          {sortedMonths.length > 0 ? (
            sortedMonths.map(([key, { label, orders: monthOrders, totalCost }]) => (
              <div key={key} className="mb-3">
                <MonthHeader
                  label={label}
                  count={monthOrders.length}
                  total={totalCost}
                />
                <div className="space-y-1 mt-1">
                  {monthOrders.map((o) => (
                    <DeliveredOrderCard key={o.id} order={o} onCardClick={handleCardClick} />
                  ))}
                </div>
              </div>
            ))
          ) : (
            <p className="text-xs text-muted-foreground py-4 text-center">
              No orders match your filters
            </p>
          )}
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

      {/* Order Detail Sheet */}
      <OrderDetailSheet
        order={selectedOrder}
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
      />
    </>
  );
}
