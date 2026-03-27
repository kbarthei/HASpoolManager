"use client";

import { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { SpoolColorDot } from "@/components/spool/spool-color-dot";
import { createOrderFromParsed } from "@/lib/actions";
import { toast } from "sonner";
import { Loader2, Plus, X, Check, AlertCircle } from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

interface ParsedItem {
  name: string;
  vendor: string;
  material: string;
  colorName: string | null;
  colorHex: string | null;
  weight: number;
  quantity: number;
  price: number | null;
  currency: string;
  url: string | null;
  matchedFilamentId: string | null;
  matchedFilamentName: string | null;
  matchConfidence: string;
}

interface ParsedOrder {
  shop: string | null;
  orderNumber: string | null;
  orderDate: string | null;
  items: ParsedItem[];
}

// Editable version of line item — all fields are strings for form control
interface EditableItem {
  name: string;
  vendor: string;
  material: string;
  colorName: string;
  colorHex: string;
  weight: string;
  quantity: string;
  price: string;
  currency: string;
  url: string | null;
  matchedFilamentId: string | null;
  matchedFilamentName: string | null;
  matchConfidence: string;
}

export interface AddOrderDialogProps {
  open: boolean;
  onClose: () => void;
  onOrderCreated?: () => void;
}

const MATERIALS = ["PLA", "PETG", "ABS", "ABS-GF", "TPU", "ASA", "PC", "PA"] as const;

function blankItem(): EditableItem {
  return {
    name: "",
    vendor: "",
    material: "PLA",
    colorName: "",
    colorHex: "888888",
    weight: "1000",
    quantity: "1",
    price: "",
    currency: "EUR",
    url: null,
    matchedFilamentId: null,
    matchedFilamentName: null,
    matchConfidence: "new",
  };
}

function toEditableItem(item: ParsedItem): EditableItem {
  return {
    name: item.name ?? "",
    vendor: item.vendor ?? "",
    material: item.material ?? "PLA",
    colorName: item.colorName ?? "",
    colorHex: item.colorHex ?? "888888",
    weight: String(item.weight ?? 1000),
    quantity: String(item.quantity ?? 1),
    price: item.price != null ? String(item.price) : "",
    currency: item.currency ?? "EUR",
    url: item.url ?? null,
    matchedFilamentId: item.matchedFilamentId ?? null,
    matchedFilamentName: item.matchedFilamentName ?? null,
    matchConfidence: item.matchConfidence ?? "new",
  };
}

// ─── Step indicator ───────────────────────────────────────────────────────────

function StepDots({ step }: { step: 1 | 2 | 3 }) {
  return (
    <div className="flex items-center gap-1.5">
      {([1, 2, 3] as const).map((s) => (
        <div
          key={s}
          className={`h-1.5 rounded-full transition-all ${
            s === step
              ? "w-4 bg-primary"
              : s < step
              ? "w-1.5 bg-primary/50"
              : "w-1.5 bg-muted-foreground/30"
          }`}
        />
      ))}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function AddOrderDialog({ open, onClose, onOrderCreated }: AddOrderDialogProps) {
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Step 1 state
  const [pasteText, setPasteText] = useState("");
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);

  // Step 2 state
  const [shop, setShop] = useState("");
  const [orderNumber, setOrderNumber] = useState("");
  const [orderDate, setOrderDate] = useState("");
  const [items, setItems] = useState<EditableItem[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // Step 3 state
  const [createdOrderNumber, setCreatedOrderNumber] = useState("");
  const [createdSpoolCount, setCreatedSpoolCount] = useState(0);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset state when dialog opens/closes
  useEffect(() => {
    if (!open) {
      // Small delay so the close animation finishes
      const t = setTimeout(() => {
        setStep(1);
        setPasteText("");
        setParseError(null);
        setShop("");
        setOrderNumber("");
        setOrderDate("");
        setItems([]);
      }, 300);
      return () => clearTimeout(t);
    }
  }, [open]);

  // Auto-close after success
  useEffect(() => {
    if (step === 3) {
      closeTimerRef.current = setTimeout(() => {
        onClose();
        onOrderCreated?.();
      }, 3000);
    }
    return () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    };
  }, [step, onClose, onOrderCreated]);

  // ── Step 1: Parse ────────────────────────────────────────────────────────

  async function handleParse() {
    if (!pasteText.trim()) return;
    setParsing(true);
    setParseError(null);
    try {
      const res = await fetch("/api/v1/orders/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: pasteText }),
      });
      const body = await res.json();
      if (!res.ok) {
        setParseError(body.error ?? "Parsing failed");
        return;
      }
      const parsed: ParsedOrder = body.parsed;
      setShop(parsed.shop ?? "");
      setOrderNumber(parsed.orderNumber ?? "");
      setOrderDate(parsed.orderDate ?? new Date().toISOString().slice(0, 10));
      setItems((parsed.items ?? []).map(toEditableItem));
      setStep(2);
    } catch {
      setParseError("Network error — please try again");
    } finally {
      setParsing(false);
    }
  }

  // ── Step 2: Edit items ────────────────────────────────────────────────────

  function updateItem(index: number, field: keyof EditableItem, value: string | null) {
    setItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, [field]: value } : item))
    );
  }

  function addItem() {
    setItems((prev) => [...prev, blankItem()]);
  }

  function removeItem(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleCreateOrder() {
    if (items.length === 0) {
      toast.error("Add at least one item");
      return;
    }
    setSubmitting(true);
    try {
      await createOrderFromParsed({
        shop: shop || null,
        orderNumber: orderNumber || null,
        orderDate: orderDate || null,
        items: items.map((item) => ({
          name: item.name || "Unknown",
          vendor: item.vendor || "Unknown",
          material: item.material || "PLA",
          colorName: item.colorName || null,
          colorHex: item.colorHex || null,
          weight: Number(item.weight) || 1000,
          quantity: Number(item.quantity) || 1,
          price: item.price !== "" && item.price != null ? Number(item.price) : null,
          currency: item.currency || "EUR",
          url: item.url || null,
          matchedFilamentId: item.matchedFilamentId || null,
        })),
      });
      const totalSpools = items.reduce((sum, i) => sum + (Number(i.quantity) || 1), 0);
      setCreatedOrderNumber(orderNumber || "—");
      setCreatedSpoolCount(totalSpools);
      setStep(3);
    } catch (err) {
      console.error(err);
      toast.error("Failed to create order");
    } finally {
      setSubmitting(false);
    }
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="text-base font-semibold">
              {step === 1 && "Add Order"}
              {step === 2 && "Review Order"}
              {step === 3 && "Order Created"}
            </DialogTitle>
            <StepDots step={step} />
          </div>
        </DialogHeader>

        {/* ── Step 1: Paste ──────────────────────────────────────────────── */}
        {step === 1 && (
          <div className="space-y-4 pt-1">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">
                Paste order confirmation email, product URL, or filament name
              </Label>
              <textarea
                className="w-full min-h-[200px] rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-y font-mono"
                placeholder="Paste order confirmation email, product URL, or filament name..."
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleParse();
                }}
              />
            </div>

            {parseError && (
              <div className="flex items-center gap-2 rounded-lg bg-destructive/10 border border-destructive/20 px-3 py-2 text-xs text-destructive">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                {parseError}
              </div>
            )}

            <div className="flex justify-end">
              <Button
                onClick={handleParse}
                disabled={!pasteText.trim() || parsing}
                className="bg-primary hover:bg-primary/90 text-primary-foreground min-w-[100px]"
              >
                {parsing ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                    Parsing…
                  </>
                ) : (
                  "Parse"
                )}
              </Button>
            </div>
          </div>
        )}

        {/* ── Step 2: Review ─────────────────────────────────────────────── */}
        {step === 2 && (
          <div className="space-y-4 pt-1">
            {/* Order meta */}
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Shop</Label>
                <Input
                  value={shop}
                  onChange={(e) => setShop(e.target.value)}
                  placeholder="e.g. Bambu Lab Store"
                  className="h-8 text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Order #</Label>
                <Input
                  value={orderNumber}
                  onChange={(e) => setOrderNumber(e.target.value)}
                  placeholder="e.g. ORD-12345"
                  className="h-8 text-sm font-mono"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Date</Label>
                <Input
                  type="date"
                  value={orderDate}
                  onChange={(e) => setOrderDate(e.target.value)}
                  className="h-8 text-sm font-mono"
                />
              </div>
            </div>

            {/* Items table */}
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">
                Line Items ({items.length})
              </Label>
              <div className="rounded-xl border border-border overflow-hidden">
                {items.length === 0 ? (
                  <div className="px-4 py-6 text-center text-xs text-muted-foreground">
                    No items — click &quot;+ Add Item&quot; to add manually
                  </div>
                ) : (
                  <div className="divide-y divide-border">
                    {items.map((item, idx) => (
                      <ItemRow
                        key={idx}
                        item={item}
                        index={idx}
                        onUpdate={updateItem}
                        onRemove={removeItem}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Add item */}
            <Button
              variant="outline"
              size="sm"
              onClick={addItem}
              className="h-7 text-xs gap-1"
            >
              <Plus className="h-3 w-3" />
              Add Item
            </Button>

            {/* Actions */}
            <div className="flex items-center justify-between pt-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setStep(1)}
                className="text-xs h-8"
              >
                Back
              </Button>
              <Button
                onClick={handleCreateOrder}
                disabled={submitting || items.length === 0}
                className="bg-primary hover:bg-primary/90 text-primary-foreground min-w-[120px]"
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                    Creating…
                  </>
                ) : (
                  "Create Order"
                )}
              </Button>
            </div>
          </div>
        )}

        {/* ── Step 3: Done ───────────────────────────────────────────────── */}
        {step === 3 && (
          <div className="flex flex-col items-center gap-4 py-8 text-center">
            <div className="h-12 w-12 rounded-full bg-emerald-500/15 flex items-center justify-center">
              <Check className="h-6 w-6 text-emerald-500" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium">
                Order{createdOrderNumber !== "—" ? ` #${createdOrderNumber}` : ""} created
              </p>
              <p className="text-xs text-muted-foreground">
                {createdSpoolCount} spool{createdSpoolCount !== 1 ? "s" : ""} added to inventory
              </p>
            </div>
            <p className="text-[10px] text-muted-foreground">Closing automatically…</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
                onClose();
                onOrderCreated?.();
              }}
              className="h-7 text-xs"
            >
              Close
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── ItemRow sub-component ────────────────────────────────────────────────────

function ItemRow({
  item,
  index,
  onUpdate,
  onRemove,
}: {
  item: EditableItem;
  index: number;
  onUpdate: (index: number, field: keyof EditableItem, value: string | null) => void;
  onRemove: (index: number) => void;
}) {
  const hex = item.colorHex || "888888";

  return (
    <div className="px-3 py-2.5 space-y-2">
      {/* Row 1: color dot + name + vendor + match badge */}
      <div className="flex items-center gap-2">
        <SpoolColorDot hex={hex} size="sm" />
        <Input
          value={item.name}
          onChange={(e) => onUpdate(index, "name", e.target.value)}
          placeholder="Filament name"
          className="h-7 text-xs flex-1 min-w-0"
        />
        <Input
          value={item.vendor}
          onChange={(e) => onUpdate(index, "vendor", e.target.value)}
          placeholder="Vendor"
          className="h-7 text-xs w-28 shrink-0"
        />
        {/* Match status */}
        {item.matchedFilamentId ? (
          <span
            title={`Matched: ${item.matchedFilamentName}`}
            className="shrink-0 flex items-center gap-1 text-[10px] text-emerald-500 font-medium"
          >
            <Check className="h-3 w-3" />
            matched
          </span>
        ) : (
          <Badge
            variant="outline"
            className="shrink-0 text-[10px] h-5 px-1.5 border-amber-500/40 text-amber-500"
          >
            new
          </Badge>
        )}
        <button
          onClick={() => onRemove(index)}
          className="shrink-0 p-0.5 rounded text-muted-foreground hover:text-destructive transition-colors"
          aria-label="Remove item"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Row 2: material + color name + color hex + weight + qty + price */}
      <div className="flex items-center gap-1.5 flex-wrap pl-6">
        {/* Material */}
        <Select
          value={item.material}
          onValueChange={(v) => onUpdate(index, "material", v)}
        >
          <SelectTrigger className="h-6 text-[11px] w-24 px-2">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MATERIALS.map((m) => (
              <SelectItem key={m} value={m} className="text-xs">
                {m}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Color name */}
        <Input
          value={item.colorName}
          onChange={(e) => onUpdate(index, "colorName", e.target.value)}
          placeholder="Color"
          className="h-6 text-[11px] w-24 px-2"
        />

        {/* Color hex */}
        <div className="flex items-center gap-1">
          <input
            type="color"
            value={`#${hex.replace("#", "")}`}
            onChange={(e) => onUpdate(index, "colorHex", e.target.value.replace("#", ""))}
            className="h-6 w-6 rounded cursor-pointer border border-input bg-transparent p-0.5"
            title="Pick color"
          />
          <Input
            value={item.colorHex}
            onChange={(e) => onUpdate(index, "colorHex", e.target.value.replace("#", ""))}
            placeholder="hex"
            className="h-6 text-[11px] w-16 px-2 font-mono"
            maxLength={6}
          />
        </div>

        {/* Weight */}
        <div className="flex items-center gap-0.5">
          <Input
            type="number"
            value={item.weight}
            onChange={(e) => onUpdate(index, "weight", e.target.value)}
            className="h-6 text-[11px] w-16 px-2 font-mono"
            min={0}
          />
          <span className="text-[10px] text-muted-foreground">g</span>
        </div>

        {/* Qty */}
        <div className="flex items-center gap-0.5">
          <span className="text-[10px] text-muted-foreground">×</span>
          <Input
            type="number"
            value={item.quantity}
            onChange={(e) => onUpdate(index, "quantity", e.target.value)}
            className="h-6 text-[11px] w-12 px-2 font-mono"
            min={1}
          />
        </div>

        {/* Price */}
        <div className="flex items-center gap-0.5">
          <Input
            type="number"
            value={item.price}
            onChange={(e) => onUpdate(index, "price", e.target.value)}
            placeholder="0.00"
            className="h-6 text-[11px] w-16 px-2 font-mono"
            min={0}
            step={0.01}
          />
          <span className="text-[10px] text-muted-foreground">{item.currency}</span>
        </div>
      </div>
    </div>
  );
}
