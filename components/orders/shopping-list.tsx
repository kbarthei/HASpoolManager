"use client";

import { useState, useTransition } from "react";
import { SpoolColorDot } from "@/components/spool/spool-color-dot";
import { SpoolMaterialBadge } from "@/components/spool/spool-material-badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { Plus, X, ExternalLink, ShoppingBag, ArrowRight } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  addToShoppingList,
  removeFromShoppingList,
  updateShoppingListQuantity,
  clearShoppingList,
} from "@/lib/actions";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ShoppingListItem {
  id: string;
  quantity: number;
  filament: {
    id: string;
    name: string;
    material: string;
    colorHex: string | null;
    vendor: { name: string };
  };
  priceHistory: {
    lastPrice: number | null;
    avgPrice: number | null;
    minPrice: number | null;
    maxPrice: number | null;
    count: number;
  };
  shopUrl: string | null;
  shopName: string | null;
  currentShopPrice: number | null;
}

interface ShoppingListProps {
  items: ShoppingListItem[];
  allFilaments: Array<{
    id: string;
    name: string;
    material: string;
    colorHex: string | null;
    vendor: { name: string };
  }>;
  onMarkAsOrdered?: () => void;
}

// ─── Price indicator ──────────────────────────────────────────────────────────

function PriceIndicator({
  shopPrice,
  avgPrice,
}: {
  shopPrice: number;
  avgPrice: number;
}) {
  if (shopPrice < avgPrice) {
    return (
      <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
        ↓ Below average
      </span>
    );
  }
  if (shopPrice > avgPrice * 1.1) {
    return (
      <span className="text-[10px] text-red-500 dark:text-red-400 font-medium">
        ↑ Above average
      </span>
    );
  }
  return (
    <span className="text-[10px] text-muted-foreground font-medium">
      → At average
    </span>
  );
}

// ─── Item card ────────────────────────────────────────────────────────────────

function ShoppingListItemCard({
  item,
  onRemove,
}: {
  item: ShoppingListItem;
  onRemove: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [localQty, setLocalQty] = useState(item.quantity);

  const handleQtyChange = (raw: string) => {
    const n = parseInt(raw, 10);
    if (!isNaN(n) && n > 0) {
      setLocalQty(n);
      startTransition(async () => {
        await updateShoppingListQuantity(item.id, n);
      });
    }
  };

  const { priceHistory, currentShopPrice } = item;
  const hasPriceHistory = priceHistory.count > 0;

  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-card p-3 space-y-2",
        isPending && "opacity-70"
      )}
    >
      {/* Top row: color dot + name + qty */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <SpoolColorDot
            hex={item.filament.colorHex ?? "888888"}
            size="md"
          />
          <div className="min-w-0">
            <span className="text-xs font-medium text-muted-foreground">
              {item.filament.vendor.name}
            </span>
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-sm font-semibold truncate">
                {item.filament.name}
              </span>
              <SpoolMaterialBadge material={item.filament.material} />
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <span className="text-[10px] text-muted-foreground">Qty:</span>
          <input
            type="number"
            min="1"
            value={localQty}
            onChange={(e) => handleQtyChange(e.target.value)}
            className="h-6 w-12 text-xs font-mono text-center rounded border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary px-1"
          />
        </div>
      </div>

      {/* Price row */}
      <div className="flex items-center gap-3 flex-wrap">
        {hasPriceHistory ? (
          <>
            {priceHistory.lastPrice != null && (
              <span className="text-xs font-mono text-muted-foreground">
                Last:{" "}
                <span className="text-foreground">
                  {priceHistory.lastPrice.toFixed(2)}€
                </span>
              </span>
            )}
            {priceHistory.avgPrice != null && (
              <span className="text-xs font-mono text-muted-foreground">
                Avg:{" "}
                <span className="text-foreground">
                  {priceHistory.avgPrice.toFixed(2)}€
                </span>
              </span>
            )}
            {currentShopPrice != null && (
              <span className="text-xs font-mono text-muted-foreground">
                Shop:{" "}
                <span className="text-foreground">
                  {currentShopPrice.toFixed(2)}€
                </span>
              </span>
            )}
          </>
        ) : (
          <span className="text-xs text-muted-foreground italic">
            No purchase history
          </span>
        )}
      </div>

      {/* Price indicator */}
      {currentShopPrice != null && priceHistory.avgPrice != null && (
        <PriceIndicator
          shopPrice={currentShopPrice}
          avgPrice={priceHistory.avgPrice}
        />
      )}

      {/* Actions */}
      <div className="flex items-center justify-between pt-0.5">
        <div>
          {item.shopUrl && (
            <Button
              variant="outline"
              size="sm"
              className="h-6 text-[11px] gap-1 px-2"
              onClick={() => window.open(item.shopUrl!, "_blank", "noopener")}
            >
              Open Shop <ExternalLink className="h-3 w-3" />
            </Button>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 text-[11px] gap-1 px-2 text-muted-foreground hover:text-destructive"
          onClick={onRemove}
        >
          <X className="h-3 w-3" /> Remove
        </Button>
      </div>
    </div>
  );
}

// ─── Add Filament Dialog ──────────────────────────────────────────────────────

function AddFilamentDialog({
  open,
  onClose,
  filaments,
  existingIds,
}: {
  open: boolean;
  onClose: () => void;
  filaments: ShoppingListProps["allFilaments"];
  existingIds: Set<string>;
}) {
  const [isPending, startTransition] = useTransition();
  const available = filaments.filter((f) => !existingIds.has(f.id));

  const handleSelect = (filamentId: string) => {
    startTransition(async () => {
      await addToShoppingList(filamentId, 1);
      onClose();
    });
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm p-0 gap-0">
        <DialogHeader className="px-4 pt-4 pb-2">
          <DialogTitle className="text-sm font-semibold">
            Add Filament to Shopping List
          </DialogTitle>
        </DialogHeader>
        <Command className="border-t border-border">
          <CommandInput placeholder="Search filaments…" className="text-sm" />
          <CommandList className="max-h-64">
            <CommandEmpty className="py-6 text-center text-xs text-muted-foreground">
              No filaments found
            </CommandEmpty>
            {available.map((f) => (
              <CommandItem
                key={f.id}
                value={`${f.vendor.name} ${f.name} ${f.material}`}
                onSelect={() => !isPending && handleSelect(f.id)}
                className="flex items-center gap-2 px-4 py-2 cursor-pointer"
              >
                <SpoolColorDot hex={f.colorHex ?? "888888"} size="sm" />
                <div className="flex-1 min-w-0">
                  <span className="text-xs font-medium truncate block">
                    {f.name}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    {f.vendor.name}
                  </span>
                </div>
                <SpoolMaterialBadge material={f.material} />
              </CommandItem>
            ))}
            {available.length === 0 && (
              <p className="px-4 py-3 text-xs text-muted-foreground text-center">
                All filaments are already in your shopping list
              </p>
            )}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function ShoppingList({
  items,
  allFilaments,
  onMarkAsOrdered,
}: ShoppingListProps) {
  const router = useRouter();
  const [addOpen, setAddOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const existingIds = new Set(items.map((i) => i.filament.id));

  const handleRemove = (itemId: string) => {
    startTransition(async () => {
      await removeFromShoppingList(itemId);
      router.refresh();
    });
  };

  const handleClearAll = () => {
    startTransition(async () => {
      await clearShoppingList();
      router.refresh();
    });
  };

  const handleAddClose = () => {
    setAddOpen(false);
    router.refresh();
  };

  // Estimated total: sum of lastPrice * qty for items with price history
  const estimatedTotal = items.reduce((sum, item) => {
    const price = item.priceHistory.lastPrice ?? item.currentShopPrice;
    return sum + (price ?? 0) * item.quantity;
  }, 0);

  const hasTotal = items.some(
    (i) => i.priceHistory.lastPrice != null || i.currentShopPrice != null
  );

  return (
    <>
      {/* Section header */}
      <div className="flex items-center gap-2 mb-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Shopping List
        </h3>
        {items.length > 0 && (
          <span className="text-[10px] bg-primary/15 text-primary px-1.5 py-0.5 rounded-full font-medium">
            {items.length}
          </span>
        )}
      </div>

      {/* Card container */}
      <div className="rounded-xl border border-border bg-muted/30 p-3 mb-4 space-y-3">
        {/* Toolbar */}
        <div className="flex items-center justify-between gap-2">
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs gap-1.5"
            onClick={() => setAddOpen(true)}
            disabled={isPending}
          >
            <Plus className="h-3.5 w-3.5" /> Add Filament
          </Button>
          {items.length > 0 && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs text-muted-foreground hover:text-destructive"
              onClick={handleClearAll}
              disabled={isPending}
            >
              Clear All
            </Button>
          )}
        </div>

        {/* Items or empty state */}
        {items.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-6 text-center">
            <ShoppingBag className="h-7 w-7 text-muted-foreground/40" />
            <p className="text-xs text-muted-foreground">
              Your shopping list is empty. Add filaments to plan your next order.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {items.map((item) => (
              <ShoppingListItemCard
                key={item.id}
                item={item}
                onRemove={() => handleRemove(item.id)}
              />
            ))}
          </div>
        )}

        {/* Footer: total + mark as ordered */}
        {items.length > 0 && (
          <div className="flex items-center justify-between pt-1 border-t border-border">
            <span className="text-xs text-muted-foreground">
              {hasTotal && (
                <>
                  Estimated total:{" "}
                  <span className="font-mono font-medium text-foreground">
                    {estimatedTotal.toFixed(2)}€
                  </span>
                </>
              )}
            </span>
            <Button
              size="sm"
              className="h-7 text-xs gap-1.5"
              onClick={onMarkAsOrdered}
              disabled={isPending}
            >
              Mark as Ordered <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
      </div>

      {/* Add Filament dialog */}
      <AddFilamentDialog
        open={addOpen}
        onClose={handleAddClose}
        filaments={allFilaments}
        existingIds={existingIds}
      />
    </>
  );
}
