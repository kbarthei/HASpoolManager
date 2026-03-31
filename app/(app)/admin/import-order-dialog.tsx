"use client";

import { useState, useEffect, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { SpoolColorDot } from "@/components/spool/spool-color-dot";
import { importHistoricalOrder } from "@/lib/actions";
import { toast } from "sonner";
import { Loader2, Check, AlertCircle, X } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface FilamentData {
  id: string;
  name: string;
  material: string;
  colorName: string | null;
  colorHex: string | null;
  vendor: { name: string };
}

interface SpoolData {
  id: string;
  location: string | null;
  remainingWeight: number;
  initialWeight: number;
  purchasePrice: string | null;
  filament: FilamentData;
}

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

interface ScoredMatch {
  spool: SpoolData;
  score: number;
}

// Editable line item (string fields for form control)
interface EditableItem {
  name: string;
  vendor: string;
  material: string;
  colorName: string;
  quantity: string;
  price: string;
  currency: string;
  // matched filament id used for spool lookup
  matchedFilamentId: string | null;
  // spool selections: spoolId → checked boolean
  selectedSpoolIds: Set<string>;
  // overridden spool per selection (spoolId override map — for "swap" use case)
  skip: boolean;
}

export interface ImportOrderDialogProps {
  open: boolean;
  onClose: () => void;
  allSpools: SpoolData[];
}

// ─── Matching logic ───────────────────────────────────────────────────────────

function matchLineItemToSpools(
  item: { name: string; material: string; colorName: string; vendor: string; matchedFilamentId: string | null },
  allSpools: SpoolData[]
): ScoredMatch[] {
  const scored: ScoredMatch[] = allSpools
    .filter((s) => s.filament != null)
    .map((spool) => {
      const f = spool.filament;
      let score = 0;

      // Filament ID exact match (from parse endpoint)
      if (item.matchedFilamentId && f.id === item.matchedFilamentId) {
        score += 100;
      }

      // Vendor name match
      if (
        f.vendor.name.toLowerCase() === item.vendor.toLowerCase()
      ) {
        score += 20;
      }

      // Material exact match
      if (f.material.toLowerCase() === item.material.toLowerCase()) {
        score += 30;
      }

      // Filament name includes
      const fNameLower = f.name.toLowerCase();
      const itemNameLower = item.name.toLowerCase();
      if (fNameLower === itemNameLower) {
        score += 25;
      } else if (fNameLower.includes(itemNameLower) || itemNameLower.includes(fNameLower)) {
        score += 10;
      }

      // Color name similarity
      if (item.colorName && f.colorName) {
        const cItem = item.colorName.toLowerCase();
        const cFil = f.colorName.toLowerCase();
        if (cItem === cFil) {
          score += 20;
        } else if (cItem.includes(cFil) || cFil.includes(cItem)) {
          score += 8;
        }
      }

      return { spool, score };
    })
    .filter((m) => m.score > 0)
    .sort((a, b) => b.score - a.score);

  return scored;
}

function toEditableItem(item: ParsedItem, allSpools: SpoolData[], qty: number): EditableItem {
  const matches = matchLineItemToSpools(
    {
      name: item.name ?? "",
      vendor: item.vendor ?? "",
      material: item.material ?? "PLA",
      colorName: item.colorName ?? "",
      matchedFilamentId: item.matchedFilamentId ?? null,
    },
    allSpools
  );

  // Pre-select top N spools matching quantity
  const preSelected = new Set<string>(
    matches.slice(0, qty).map((m) => m.spool.id)
  );

  return {
    name: item.name ?? "",
    vendor: item.vendor ?? "",
    material: item.material ?? "PLA",
    colorName: item.colorName ?? "",
    quantity: String(item.quantity ?? 1),
    price: item.price != null ? String(item.price) : "",
    currency: item.currency ?? "EUR",
    matchedFilamentId: item.matchedFilamentId ?? null,
    selectedSpoolIds: preSelected,
    skip: false,
  };
}

// ─── Step dots ────────────────────────────────────────────────────────────────

function StepDots({ step, total }: { step: number; total: number }) {
  return (
    <div className="flex items-center gap-1.5">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className={`h-1.5 rounded-full transition-all ${
            i + 1 === step
              ? "w-4 bg-primary"
              : i + 1 < step
              ? "w-1.5 bg-primary/50"
              : "w-1.5 bg-muted-foreground/30"
          }`}
        />
      ))}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function ImportOrderDialog({ open, onClose, allSpools }: ImportOrderDialogProps) {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);

  // Step 1 state
  const [pasteText, setPasteText] = useState("");
  const [orderDate, setOrderDate] = useState(
    () => new Date().toISOString().slice(0, 10)
  );
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);

  // Step 2 state (review parsed data)
  const [shop, setShop] = useState("");
  const [orderNumber, setOrderNumber] = useState("");
  const [reviewDate, setReviewDate] = useState("");
  const [rawItems, setRawItems] = useState<ParsedItem[]>([]);

  // Step 3 state (matching)
  const [editableItems, setEditableItems] = useState<EditableItem[]>([]);

  // Step 4 state
  const [submitting, setSubmitting] = useState(false);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [importedOrderId, setImportedOrderId] = useState<string | null>(null);

  // Reset on close
  useEffect(() => {
    if (!open) {
      const t = setTimeout(() => {
        setStep(1);
        setPasteText("");
        setOrderDate(new Date().toISOString().slice(0, 10));
        setParseError(null);
        setShop("");
        setOrderNumber("");
        setReviewDate("");
        setRawItems([]);
        setEditableItems([]);
        setImportedOrderId(null);
      }, 300);
      return () => clearTimeout(t);
    }
  }, [open]);

  // Auto-close after success
  useEffect(() => {
    if (step === 4 && importedOrderId) {
      closeTimerRef.current = setTimeout(() => {
        onClose();
      }, 3000);
    }
    return () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    };
  }, [step, importedOrderId, onClose]);

  // ── Step 1: Parse ──────────────────────────────────────────────────────────

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
      const parsed = body.parsed;
      setShop(parsed.shop ?? "");
      setOrderNumber(parsed.orderNumber ?? "");
      setReviewDate(parsed.orderDate ?? orderDate);
      setRawItems(parsed.items ?? []);
      setStep(2);
    } catch {
      setParseError("Network error — please try again");
    } finally {
      setParsing(false);
    }
  }

  // ── Step 2 → 3: proceed to matching ───────────────────────────────────────

  function handleProceedToMatch() {
    const items = rawItems.map((item) =>
      toEditableItem(item, allSpools, Number(item.quantity) || 1)
    );
    setEditableItems(items);
    setStep(3);
  }

  // ── Step 3 helpers ─────────────────────────────────────────────────────────

  function toggleSpool(itemIdx: number, spoolId: string) {
    setEditableItems((prev) =>
      prev.map((item, i) => {
        if (i !== itemIdx) return item;
        const next = new Set(item.selectedSpoolIds);
        if (next.has(spoolId)) {
          next.delete(spoolId);
        } else {
          next.add(spoolId);
        }
        return { ...item, selectedSpoolIds: next };
      })
    );
  }

  function toggleSkip(itemIdx: number) {
    setEditableItems((prev) =>
      prev.map((item, i) =>
        i === itemIdx ? { ...item, skip: !item.skip } : item
      )
    );
  }

  function updateItemPrice(itemIdx: number, price: string) {
    setEditableItems((prev) =>
      prev.map((item, i) => (i === itemIdx ? { ...item, price } : item))
    );
  }

  // ── Step 4: Import ─────────────────────────────────────────────────────────

  async function handleImport() {
    setSubmitting(true);
    try {
      // Build items array — only non-skipped items that have spools selected
      const itemsToImport = editableItems
        .filter((item) => !item.skip && item.matchedFilamentId)
        .map((item) => ({
          filamentId: item.matchedFilamentId!,
          spoolIds: Array.from(item.selectedSpoolIds),
          quantity: Number(item.quantity) || 1,
          unitPrice: item.price !== "" ? Number(item.price) : 0,
        }));

      if (itemsToImport.length === 0) {
        toast.error("No items to import — match at least one line item to existing spools");
        return;
      }

      const result = await importHistoricalOrder({
        shopName: shop,
        orderNumber: orderNumber,
        orderedAt: reviewDate || new Date().toISOString().slice(0, 10),
        items: itemsToImport,
      });

      setImportedOrderId(result.orderId);
      setStep(4);
      toast.success("Historical order imported");
    } catch (err) {
      console.error(err);
      toast.error("Import failed — please try again");
    } finally {
      setSubmitting(false);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  const titles: Record<number, string> = {
    1: "Import Historical Order",
    2: "Review Parsed Data",
    3: "Match to Existing Spools",
    4: "Import Complete",
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between pr-6">
            <DialogTitle className="text-base font-semibold">
              {titles[step]}
            </DialogTitle>
            <StepDots step={step} total={4} />
          </div>
        </DialogHeader>

        {/* ── Step 1: Paste ──────────────────────────────────────────────── */}
        {step === 1 && (
          <div className="space-y-4 pt-1">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">
                Paste order confirmation email text
              </Label>
              <textarea
                className="w-full min-h-[180px] rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-y font-mono"
                placeholder="Paste your order confirmation email here…"
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleParse();
                }}
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Order date (if not in email)</Label>
              <Input
                type="date"
                value={orderDate}
                onChange={(e) => setOrderDate(e.target.value)}
                className="h-8 text-sm font-mono w-44"
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

        {/* ── Step 2: Review parsed data ─────────────────────────────────── */}
        {step === 2 && (
          <div className="space-y-4 pt-1">
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
                  value={reviewDate}
                  onChange={(e) => setReviewDate(e.target.value)}
                  className="h-8 text-sm font-mono"
                />
              </div>
            </div>

            {/* Line items preview */}
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">
                Line Items ({rawItems.length})
              </Label>
              <div className="rounded-xl border border-border divide-y divide-border overflow-hidden">
                {rawItems.length === 0 ? (
                  <div className="px-4 py-6 text-center text-xs text-muted-foreground">
                    No items parsed
                  </div>
                ) : (
                  rawItems.map((item, idx) => (
                    <div key={idx} className="px-3 py-2 flex items-center gap-3">
                      {item.colorHex && (
                        <SpoolColorDot hex={item.colorHex} size="sm" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate">
                          {item.vendor} {item.name}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          {item.material}
                          {item.colorName ? ` · ${item.colorName}` : ""}
                          {" · "}×{item.quantity}
                          {item.price != null ? ` · €${item.price.toFixed(2)}` : ""}
                        </p>
                      </div>
                      {item.matchedFilamentId ? (
                        <span className="text-[10px] text-emerald-500 font-medium flex items-center gap-1 shrink-0">
                          <Check className="h-3 w-3" />
                          matched
                        </span>
                      ) : (
                        <Badge
                          variant="outline"
                          className="text-[10px] h-5 px-1.5 border-amber-500/40 text-amber-500 shrink-0"
                        >
                          unmatched
                        </Badge>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>

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
                onClick={handleProceedToMatch}
                disabled={rawItems.length === 0}
                className="bg-primary hover:bg-primary/90 text-primary-foreground"
              >
                Match Spools
              </Button>
            </div>
          </div>
        )}

        {/* ── Step 3: Spool matching ─────────────────────────────────────── */}
        {step === 3 && (
          <div className="space-y-3 pt-1">
            <p className="text-xs text-muted-foreground">
              Select which existing spools correspond to each line item. Only existing spools will be linked — no new spools will be created.
            </p>

            <div className="space-y-3">
              {editableItems.map((item, itemIdx) => {
                const matches = item.matchedFilamentId
                  ? matchLineItemToSpools(
                      {
                        name: item.name,
                        vendor: item.vendor,
                        material: item.material,
                        colorName: item.colorName,
                        matchedFilamentId: item.matchedFilamentId,
                      },
                      allSpools
                    )
                  : [];

                return (
                  <div
                    key={itemIdx}
                    className={`rounded-xl border ${item.skip ? "border-border opacity-50" : "border-border"} overflow-hidden`}
                  >
                    {/* Item header */}
                    <div className="px-3 py-2 bg-muted/30 flex items-center justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate">
                          {item.vendor} {item.name}
                          <span className="text-muted-foreground font-normal ml-1.5">
                            ×{item.quantity}
                          </span>
                        </p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[11px] text-muted-foreground">
                            {item.material}
                            {item.colorName ? ` · ${item.colorName}` : ""}
                          </span>
                          {/* Price override */}
                          <div className="flex items-center gap-1">
                            <span className="text-[10px] text-muted-foreground">€</span>
                            <input
                              type="number"
                              value={item.price}
                              onChange={(e) => updateItemPrice(itemIdx, e.target.value)}
                              placeholder="0.00"
                              className="h-5 w-16 rounded border border-input bg-background px-1.5 text-[11px] font-mono focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                              min={0}
                              step={0.01}
                              disabled={item.skip}
                            />
                            <span className="text-[10px] text-muted-foreground">{item.currency}</span>
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={() => toggleSkip(itemIdx)}
                        className={`shrink-0 text-[10px] h-5 px-1.5 rounded border transition-colors ${
                          item.skip
                            ? "border-border text-muted-foreground"
                            : "border-amber-500/40 text-amber-500 hover:bg-amber-500/10"
                        }`}
                      >
                        {item.skip ? "Skipped" : "Skip"}
                      </button>
                    </div>

                    {/* Spool matches */}
                    {!item.skip && (
                      <div className="divide-y divide-border">
                        {matches.length === 0 ? (
                          <div className="px-3 py-2 text-xs text-muted-foreground italic">
                            No matching spools found — this item will be skipped
                          </div>
                        ) : (
                          matches.slice(0, 6).map(({ spool }) => {
                            const checked = item.selectedSpoolIds.has(spool.id);
                            const existingPrice = spool.purchasePrice;
                            const newPrice = item.price !== "" ? Number(item.price) : null;
                            const willOverwrite =
                              existingPrice != null &&
                              newPrice != null &&
                              String(newPrice) !== existingPrice;

                            return (
                              <label
                                key={spool.id}
                                className={`flex items-center gap-2.5 px-3 py-2 cursor-pointer hover:bg-muted/40 transition-colors ${
                                  checked ? "bg-primary/5" : ""
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => toggleSpool(itemIdx, spool.id)}
                                  className="h-3.5 w-3.5 accent-primary shrink-0"
                                />
                                {spool.filament.colorHex && (
                                  <SpoolColorDot hex={spool.filament.colorHex} size="sm" />
                                )}
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs truncate">
                                    {spool.filament.vendor.name}{" "}
                                    {spool.filament.name}
                                    {spool.filament.colorName
                                      ? ` (${spool.filament.colorName})`
                                      : ""}
                                  </p>
                                  <p className="text-[10px] text-muted-foreground">
                                    {spool.location ?? "storage"}
                                    {" · "}
                                    {spool.remainingWeight}g / {spool.initialWeight}g
                                    {existingPrice != null && (
                                      <span className="ml-1">
                                        · was €{existingPrice}
                                      </span>
                                    )}
                                  </p>
                                </div>
                                {willOverwrite && checked && (
                                  <span className="text-[10px] text-amber-500 shrink-0">
                                    price update
                                  </span>
                                )}
                              </label>
                            );
                          })
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="flex items-center justify-between pt-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setStep(2)}
                className="text-xs h-8"
              >
                Back
              </Button>
              <Button
                onClick={() => setStep(4)}
                className="bg-primary hover:bg-primary/90 text-primary-foreground"
              >
                Review Import
              </Button>
            </div>
          </div>
        )}

        {/* ── Step 4: Confirm & Import ───────────────────────────────────── */}
        {step === 4 && !importedOrderId && (
          <div className="space-y-4 pt-1">
            <p className="text-xs text-muted-foreground">
              Review what will be created, then confirm import.
            </p>

            {/* Summary */}
            <div className="rounded-xl border border-border overflow-hidden">
              <div className="px-3 py-2 bg-muted/30 border-b border-border">
                <p className="text-xs font-medium">
                  {shop || "Unknown shop"}
                  {orderNumber ? ` — #${orderNumber}` : ""}
                  <span className="text-muted-foreground font-normal ml-1.5">
                    {reviewDate}
                  </span>
                </p>
              </div>
              <div className="divide-y divide-border">
                {editableItems
                  .filter((item) => !item.skip)
                  .map((item, idx) => {
                    const spoolCount = item.selectedSpoolIds.size;
                    const price = item.price !== "" ? Number(item.price) : null;
                    return (
                      <div key={idx} className="px-3 py-2 flex items-center justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs truncate">
                            {item.vendor} {item.name}
                            {item.colorName ? ` (${item.colorName})` : ""}
                          </p>
                          <p className="text-[10px] text-muted-foreground">
                            {spoolCount} spool{spoolCount !== 1 ? "s" : ""} linked
                            {price != null ? ` · €${price.toFixed(2)} each` : ""}
                          </p>
                        </div>
                        {spoolCount > 0 ? (
                          <Check className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                        ) : (
                          <X className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        )}
                      </div>
                    );
                  })}
                {editableItems.filter((item) => item.skip).length > 0 && (
                  <div className="px-3 py-2">
                    <p className="text-[10px] text-muted-foreground italic">
                      {editableItems.filter((item) => item.skip).length} item(s) skipped
                    </p>
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between pt-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setStep(3)}
                className="text-xs h-8"
                disabled={submitting}
              >
                Back
              </Button>
              <Button
                onClick={handleImport}
                disabled={submitting}
                className="bg-primary hover:bg-primary/90 text-primary-foreground min-w-[120px]"
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                    Importing…
                  </>
                ) : (
                  "Import Order"
                )}
              </Button>
            </div>
          </div>
        )}

        {/* ── Done ───────────────────────────────────────────────────────── */}
        {step === 4 && importedOrderId && (
          <div className="flex flex-col items-center gap-4 py-8 text-center">
            <div className="h-12 w-12 rounded-full bg-emerald-500/15 flex items-center justify-center">
              <Check className="h-6 w-6 text-emerald-500" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium">Historical order imported</p>
              <p className="text-xs text-muted-foreground">
                Order created and spools linked with purchase prices.
              </p>
            </div>
            <p className="text-[10px] text-muted-foreground">Closing automatically…</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
                onClose();
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
