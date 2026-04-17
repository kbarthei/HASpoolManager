"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { updateShopConfig } from "@/lib/actions";

interface Props {
  shopId: string;
  name: string;
  orderCount: number;
  initialFreeShippingThreshold: number | null;
  initialShippingCost: number | null;
  initialBulkDiscountRules: string | null;
  avgDeliveryDays: number | null;
}

function parseRules(raw: string | null): Array<{ minQty: number; discountPercent: number }> {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function ShopConfigRow({
  shopId,
  name,
  orderCount,
  initialFreeShippingThreshold,
  initialShippingCost,
  initialBulkDiscountRules,
  avgDeliveryDays,
}: Props) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const [freeThreshold, setFreeThreshold] = useState(
    initialFreeShippingThreshold != null ? String(initialFreeShippingThreshold) : ""
  );
  const [shipping, setShipping] = useState(
    initialShippingCost != null ? String(initialShippingCost) : ""
  );
  const [rules, setRules] = useState(parseRules(initialBulkDiscountRules));

  function addRule() {
    setRules([...rules, { minQty: 5, discountPercent: 5 }]);
  }
  function updateRule(idx: number, patch: Partial<{ minQty: number; discountPercent: number }>) {
    setRules(rules.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }
  function removeRule(idx: number) {
    setRules(rules.filter((_, i) => i !== idx));
  }

  function handleSave() {
    startTransition(async () => {
      try {
        const threshold = freeThreshold ? parseFloat(freeThreshold) : null;
        const shippingCost = shipping ? parseFloat(shipping) : null;
        const cleanedRules = rules
          .filter((r) => r.minQty > 0 && r.discountPercent > 0)
          .sort((a, b) => a.minQty - b.minQty);
        await updateShopConfig({
          shopId,
          freeShippingThreshold: threshold,
          shippingCost,
          bulkDiscountRules: cleanedRules.length > 0 ? JSON.stringify(cleanedRules) : null,
        });
        toast.success(`${name}: config saved`);
      } catch {
        toast.error("Failed to save shop config");
      }
    });
  }

  const hasConfig = initialFreeShippingThreshold != null || initialShippingCost != null || initialBulkDiscountRules != null;

  return (
    <div className="border border-border rounded overflow-hidden" data-testid={`shop-config-${shopId}`}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 p-2 text-xs hover:bg-muted/50 transition-colors"
        aria-expanded={open}
      >
        {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        <span className="font-semibold flex-1 text-left">{name}</span>
        <span className="text-muted-foreground">{orderCount} orders</span>
        {avgDeliveryDays != null && (
          <span className="text-muted-foreground">· ~{avgDeliveryDays.toFixed(1)}d delivery</span>
        )}
        <span
          className={cn(
            "w-1.5 h-1.5 rounded-full",
            hasConfig ? "bg-emerald-500" : "bg-muted-foreground/30"
          )}
          aria-label={hasConfig ? "configured" : "not configured"}
        />
      </button>
      {open && (
        <div className="p-3 space-y-3 border-t border-border bg-muted/30">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor={`free-${shopId}`} className="text-[11px]">
                Free shipping threshold (EUR)
              </Label>
              <Input
                id={`free-${shopId}`}
                type="number"
                step="0.01"
                min="0"
                placeholder="50"
                value={freeThreshold}
                onChange={(e) => setFreeThreshold(e.target.value)}
                className="h-7 text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`ship-${shopId}`} className="text-[11px]">
                Flat shipping cost (EUR)
              </Label>
              <Input
                id={`ship-${shopId}`}
                type="number"
                step="0.01"
                min="0"
                placeholder="4.99"
                value={shipping}
                onChange={(e) => setShipping(e.target.value)}
                className="h-7 text-xs"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-[11px]">Bulk discounts</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addRule}
                className="h-6 text-[10px]"
              >
                + Add tier
              </Button>
            </div>
            {rules.length === 0 && (
              <p className="text-[10px] text-muted-foreground">No bulk discount tiers configured.</p>
            )}
            {rules.map((r, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <span className="text-[11px] text-muted-foreground">From</span>
                <Input
                  type="number"
                  min="1"
                  value={r.minQty}
                  onChange={(e) => updateRule(idx, { minQty: parseInt(e.target.value, 10) || 0 })}
                  className="h-6 w-16 text-xs"
                />
                <span className="text-[11px] text-muted-foreground">units →</span>
                <Input
                  type="number"
                  min="0"
                  max="100"
                  step="0.5"
                  value={r.discountPercent}
                  onChange={(e) => updateRule(idx, { discountPercent: parseFloat(e.target.value) || 0 })}
                  className="h-6 w-16 text-xs"
                />
                <span className="text-[11px] text-muted-foreground">% off</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => removeRule(idx)}
                  className="h-6 px-2 text-[10px] text-destructive"
                >
                  Remove
                </Button>
              </div>
            ))}
          </div>

          <Button
            type="button"
            size="sm"
            onClick={handleSave}
            disabled={isPending}
            className="h-7 text-xs"
          >
            {isPending ? "Saving..." : "Save"}
          </Button>
        </div>
      )}
    </div>
  );
}
