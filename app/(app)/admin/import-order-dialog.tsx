"use client";

import { useState, useEffect, useRef, useMemo } from "react";
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
import { importHistoricalOrder, importBatchOrders } from "@/lib/actions";
import { toast } from "sonner";
import { Loader2, Check, AlertCircle, X, Upload, ChevronDown, ChevronRight } from "lucide-react";

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
  matchedFilamentId: string | null;
  selectedSpoolIds: Set<string>;
  skip: boolean;
}

// ─── CSV types ────────────────────────────────────────────────────────────────

interface CSVOrderItem {
  name: string;
  quantity: number;
  unitPrice: number;
}

interface CSVParsedOrder {
  shop: string;
  orderNumber: string;
  orderedAt: string; // YYYY-MM-DD
  items: CSVOrderItem[];
}

interface BatchOrderRow extends CSVParsedOrder {
  selected: boolean;
  // auto-matched items with filament + spool ids
  matchedItems: Array<{
    name: string;
    quantity: number;
    unitPrice: number;
    filamentId: string | null;
    spoolIds: string[];
  }>;
}

export interface ImportOrderDialogProps {
  open: boolean;
  onClose: () => void;
  allSpools: SpoolData[];
}

// ─── German → English color map ───────────────────────────────────────────────

const DE_COLORS: Record<string, string> = {
  "Grau": "Gray",
  "Schwarz": "Black",
  "Weiß": "White",
  "Kohleschwarz": "Charcoal Black",
  "Knochenweiß": "Bone White",
  "Dunkelgrau": "Dark Gray",
  "Leuchtend-Grün": "Glow Green",
  "Champagner": "Champagne",
  "Eisen-Metallgrau": "Iron Gray",
  "Klar": "Clear",
  "Pink": "Pink",
  "Frozen": "Frozen",
  "Milchkaffee-Braun": "Latte Brown",
  "Jade-Weiß": "Jade White",
};

function translateColor(german: string): string {
  return DE_COLORS[german] ?? german;
}

// ─── CSV Parsing ──────────────────────────────────────────────────────────────

/**
 * Parse "PETG HF – Grau (33101), Spule, 1kg"
 * Returns { material, colorName, name }
 * where name = "PETG HF Grau" (material + optional product line + color)
 */
function parseFilamentTyp(raw: string): { material: string; colorName: string; name: string } {
  // Remove trailing weight/form descriptors: ", Spule, 1kg" / ", Nachfüllung" etc.
  let cleaned = raw
    .replace(/,\s*(Spule|Nachfüllung|Refill)\b.*/i, "")
    .replace(/,\s*\d+(\.\d+)?kg\b.*/i, "")
    .trim();

  // Remove Bambu product code in parens: "(33101)"
  cleaned = cleaned.replace(/\s*\(\d+\)\s*/g, " ").trim();

  // Split on " – " (em-dash with spaces) or " - " to get [materialPart, colorPart]
  const dashParts = cleaned.split(/\s+[–-]\s+/);

  const materialPart = dashParts[0]?.trim() ?? cleaned;
  const colorPart = dashParts[1]?.trim() ?? "";

  // Extract material token (first word)
  const materialMatch = materialPart.match(/^([A-Z][A-Z0-9-]*(?:\s+[A-Z][A-Z0-9-]*)*)/);
  const material = materialMatch ? materialMatch[1] : materialPart;

  // Translate color
  const colorName = colorPart ? translateColor(colorPart) : "";

  // Build display name: materialPart (without code) + colorName
  const name = colorName
    ? `${materialPart} ${colorName}`.trim()
    : materialPart.trim();

  return { material, colorName, name };
}

/**
 * Parse "24,43 €" → 24.43
 * Returns 0 if unparseable.
 */
function parsePrice(raw: string): number {
  const cleaned = raw
    .replace(/[€$£\s]/g, "")
    .replace(",", ".");
  const val = parseFloat(cleaned);
  return isNaN(val) ? 0 : val;
}

/**
 * Parse "27.12.2025" → "2025-12-27"
 */
function parseDDMMYYYY(raw: string): string {
  const m = raw.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (!m) return new Date().toISOString().slice(0, 10);
  const [, d, mo, y] = m;
  return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

function parseCSV(text: string): CSVParsedOrder[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];

  // Detect separator: tab wins if first line has tabs, else semicolon
  const sep = lines[0].includes("\t") ? "\t" : ";";

  const headers = lines[0].split(sep).map((h) => h.trim().toLowerCase());

  const colIdx = (names: string[]): number => {
    for (const name of names) {
      const i = headers.findIndex((h) => h.includes(name));
      if (i !== -1) return i;
    }
    return -1;
  };

  const iDatum = colIdx(["datum"]);
  const iShop = colIdx(["shop"]);
  const iBestellung = colIdx(["bestellnummer"]);
  const iFilament = colIdx(["filament"]);
  const iMenge = colIdx(["menge"]);
  const iPreis = colIdx(["preis"]);

  if ([iDatum, iShop, iBestellung, iFilament, iMenge, iPreis].includes(-1)) {
    return [];
  }

  // Group rows by order number
  const orderMap = new Map<string, CSVParsedOrder>();

  for (let li = 1; li < lines.length; li++) {
    const cols = lines[li].split(sep).map((c) => c.trim());

    // Skip GESAMT row
    if (cols.some((c) => c.toUpperCase() === "GESAMT")) continue;
    // Skip empty rows
    if (cols.every((c) => c === "")) continue;

    const orderNumber = cols[iBestellung] ?? "";
    const shop = cols[iShop] ?? "";
    const datum = cols[iDatum] ?? "";
    const filamentRaw = cols[iFilament] ?? "";
    const mengeRaw = cols[iMenge] ?? "1";
    const preisRaw = cols[iPreis] ?? "0";

    if (!orderNumber) continue;

    const orderedAt = parseDDMMYYYY(datum);
    const { name } = parseFilamentTyp(filamentRaw);
    const quantity = parseInt(mengeRaw, 10) || 1;
    const unitPrice = parsePrice(preisRaw);

    if (!orderMap.has(orderNumber)) {
      orderMap.set(orderNumber, {
        shop,
        orderNumber,
        orderedAt,
        items: [],
      });
    }

    orderMap.get(orderNumber)!.items.push({ name, quantity, unitPrice });
  }

  return Array.from(orderMap.values());
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

      if (item.matchedFilamentId && f.id === item.matchedFilamentId) {
        score += 100;
      }

      if (f.vendor.name.toLowerCase() === item.vendor.toLowerCase()) {
        score += 20;
      }

      if (f.material.toLowerCase() === item.material.toLowerCase()) {
        score += 30;
      }

      const fNameLower = f.name.toLowerCase();
      const itemNameLower = item.name.toLowerCase();
      if (fNameLower === itemNameLower) {
        score += 25;
      } else if (fNameLower.includes(itemNameLower) || itemNameLower.includes(fNameLower)) {
        score += 10;
      }

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

/**
 * Auto-match a CSV item name against filaments in allSpools.
 * Returns { filamentId, spoolIds } for top N spools.
 */
function autoMatchCSVItem(
  itemName: string,
  quantity: number,
  allSpools: SpoolData[]
): { filamentId: string | null; spoolIds: string[] } {
  // Parse filament name to extract material + color
  const { material, colorName, name } = parseFilamentTyp(itemName);

  const matches = matchLineItemToSpools(
    { name, material, colorName, vendor: "", matchedFilamentId: null },
    allSpools
  );

  if (matches.length === 0) return { filamentId: null, spoolIds: [] };

  const topFilamentId = matches[0].spool.filament.id;
  const spoolIds = matches
    .slice(0, quantity)
    .map((m) => m.spool.id);

  return { filamentId: topFilamentId, spoolIds };
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
  const [inputMode, setInputMode] = useState<"email" | "csv">("email");

  // Step 1 — Email mode state
  const [pasteText, setPasteText] = useState("");
  const [orderDate, setOrderDate] = useState(
    () => new Date().toISOString().slice(0, 10)
  );
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);

  // Step 1 — CSV mode state
  const [csvOrders, setCSVOrders] = useState<BatchOrderRow[]>([]);
  const [csvParseError, setCSVParseError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Batch import state
  const [batchImporting, setBatchImporting] = useState(false);
  const [batchProgress, setBatchProgress] = useState("");
  const [batchResult, setBatchResult] = useState<{ ordersCreated: number; spoolsUpdated: number } | null>(null);

  // CSV review mode: track expanded item rows (`${orderIdx}:${itemIdx}`)
  const [expandedCSVItems, setExpandedCSVItems] = useState<Set<string>>(new Set());

  // Unique filaments derived from allSpools (for dropdown override)
  const allFilaments = useMemo(() => {
    const map = new Map<string, FilamentData>();
    for (const s of allSpools) {
      if (s.filament && !map.has(s.filament.id)) map.set(s.filament.id, s.filament);
    }
    return Array.from(map.values()).sort((a, b) => {
      const v = a.vendor.name.localeCompare(b.vendor.name);
      if (v !== 0) return v;
      return a.name.localeCompare(b.name);
    });
  }, [allSpools]);

  // Spools keyed by filament id (for spool chip picker)
  const spoolsByFilament = useMemo(() => {
    const map = new Map<string, SpoolData[]>();
    for (const s of allSpools) {
      if (!s.filament) continue;
      const list = map.get(s.filament.id) ?? [];
      list.push(s);
      map.set(s.filament.id, list);
    }
    return map;
  }, [allSpools]);

  // Step 2 state (review parsed data — email mode)
  const [shop, setShop] = useState("");
  const [orderNumber, setOrderNumber] = useState("");
  const [reviewDate, setReviewDate] = useState("");
  const [rawItems, setRawItems] = useState<ParsedItem[]>([]);

  // Step 3 state (matching — email mode)
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
        setInputMode("email");
        setPasteText("");
        setOrderDate(new Date().toISOString().slice(0, 10));
        setParseError(null);
        setShop("");
        setOrderNumber("");
        setReviewDate("");
        setRawItems([]);
        setEditableItems([]);
        setImportedOrderId(null);
        setCSVOrders([]);
        setCSVParseError(null);
        setBatchResult(null);
        setBatchProgress("");
        setExpandedCSVItems(new Set());
      }, 300);
      return () => clearTimeout(t);
    }
  }, [open]);

  // Auto-close after single-order email import success
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

  // ── CSV helpers ────────────────────────────────────────────────────────────

  function processCSVFile(text: string) {
    setCSVParseError(null);
    const parsed = parseCSV(text);
    if (parsed.length === 0) {
      setCSVParseError("No orders found. Check that the file has the expected columns: Datum, Shop, Bestellnummer, Filament-Typ, Menge, Preis.");
      setCSVOrders([]);
      return;
    }

    // Auto-match each item
    const rows: BatchOrderRow[] = parsed.map((order) => ({
      ...order,
      selected: true,
      matchedItems: order.items.map((item) => {
        const { filamentId, spoolIds } = autoMatchCSVItem(item.name, item.quantity, allSpools);
        return {
          name: item.name,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          filamentId,
          spoolIds,
        };
      }),
    }));

    setCSVOrders(rows);
  }

  function handleFileChange(file: File) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      processCSVFile(text);
    };
    reader.readAsText(file, "UTF-8");
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileChange(file);
  }

  function toggleExpandedItem(orderIdx: number, itemIdx: number) {
    const key = `${orderIdx}:${itemIdx}`;
    setExpandedCSVItems((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function setCSVItemFilament(orderIdx: number, itemIdx: number, filamentId: string | null) {
    setCSVOrders((prev) =>
      prev.map((order, oi) => {
        if (oi !== orderIdx) return order;
        const matchedItems = order.matchedItems.map((it, ii) => {
          if (ii !== itemIdx) return it;
          // Reset spool selection when filament changes
          const newSpools = (filamentId && spoolsByFilament.get(filamentId)) || [];
          const autoSpoolIds = newSpools.slice(0, it.quantity).map((s) => s.id);
          return { ...it, filamentId, spoolIds: autoSpoolIds };
        });
        return { ...order, matchedItems };
      })
    );
  }

  function toggleCSVItemSpool(orderIdx: number, itemIdx: number, spoolId: string) {
    setCSVOrders((prev) =>
      prev.map((order, oi) => {
        if (oi !== orderIdx) return order;
        const matchedItems = order.matchedItems.map((it, ii) => {
          if (ii !== itemIdx) return it;
          const set = new Set(it.spoolIds);
          if (set.has(spoolId)) set.delete(spoolId);
          else set.add(spoolId);
          return { ...it, spoolIds: Array.from(set) };
        });
        return { ...order, matchedItems };
      })
    );
  }

  function updateCSVItemPrice(orderIdx: number, itemIdx: number, price: number) {
    setCSVOrders((prev) =>
      prev.map((order, oi) => {
        if (oi !== orderIdx) return order;
        const matchedItems = order.matchedItems.map((it, ii) =>
          ii === itemIdx ? { ...it, unitPrice: price } : it,
        );
        return { ...order, matchedItems };
      })
    );
  }

  function toggleOrderSelected(idx: number) {
    setCSVOrders((prev) =>
      prev.map((row, i) => (i === idx ? { ...row, selected: !row.selected } : row))
    );
  }

  async function handleBatchImport() {
    const selected = csvOrders.filter((o) => o.selected);
    if (selected.length === 0) {
      toast.error("Select at least one order to import");
      return;
    }

    setBatchImporting(true);
    setBatchProgress(`Importing 0/${selected.length}…`);

    try {
      const payload = selected.map((order) => ({
        shopName: order.shop,
        orderNumber: order.orderNumber,
        orderedAt: order.orderedAt,
        items: order.matchedItems,
      }));

      // Call in chunks so progress is visible
      let done = 0;
      const chunkSize = 3;
      let totalSpools = 0;

      for (let i = 0; i < payload.length; i += chunkSize) {
        const chunk = payload.slice(i, i + chunkSize);
        const result = await importBatchOrders(chunk);
        done += result.ordersCreated;
        totalSpools += result.spoolsUpdated;
        setBatchProgress(`Importing ${done}/${selected.length}…`);
      }

      setBatchResult({ ordersCreated: done, spoolsUpdated: totalSpools });
      toast.success(`Imported ${done} orders, updated ${totalSpools} spool prices`);
    } catch (err) {
      console.error(err);
      toast.error("Batch import failed — please try again");
    } finally {
      setBatchImporting(false);
    }
  }

  // ── Step 1: Parse (email mode) ─────────────────────────────────────────────

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
              {inputMode === "csv" && step === 1 ? "Import from CSV" : titles[step]}
            </DialogTitle>
            {inputMode === "email" && <StepDots step={step} total={4} />}
          </div>
        </DialogHeader>

        {/* ── Step 1 ─────────────────────────────────────────────────────── */}
        {step === 1 && (
          <div className="space-y-4 pt-1">
            {/* Mode tabs */}
            <div className="flex rounded-lg border border-border overflow-hidden text-xs">
              <button
                onClick={() => setInputMode("email")}
                className={`flex-1 py-1.5 font-medium transition-colors ${
                  inputMode === "email"
                    ? "bg-primary text-primary-foreground"
                    : "bg-background text-muted-foreground hover:bg-muted/50"
                }`}
              >
                Email
              </button>
              <button
                onClick={() => setInputMode("csv")}
                className={`flex-1 py-1.5 font-medium transition-colors border-l border-border ${
                  inputMode === "csv"
                    ? "bg-primary text-primary-foreground"
                    : "bg-background text-muted-foreground hover:bg-muted/50"
                }`}
              >
                CSV
              </button>
            </div>

            {/* ── Email tab ──────────────────────────────────────────────── */}
            {inputMode === "email" && (
              <>
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
              </>
            )}

            {/* ── CSV tab ────────────────────────────────────────────────── */}
            {inputMode === "csv" && (
              <>
                {/* Drop zone */}
                <div
                  onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={`flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed cursor-pointer transition-colors py-8 px-4 ${
                    isDragging
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/50 hover:bg-muted/30"
                  }`}
                >
                  <Upload className="h-6 w-6 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground text-center">
                    Drop your CSV / TSV file here, or <span className="text-primary font-medium">click to browse</span>
                  </p>
                  <p className="text-[11px] text-muted-foreground/60">
                    Expects columns: Datum · Shop · Bestellnummer · Filament-Typ · Menge · Preis
                  </p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv,.tsv,.txt"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleFileChange(file);
                    }}
                  />
                </div>

                {csvParseError && (
                  <div className="flex items-center gap-2 rounded-lg bg-destructive/10 border border-destructive/20 px-3 py-2 text-xs text-destructive">
                    <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                    {csvParseError}
                  </div>
                )}

                {/* Parsed orders preview */}
                {csvOrders.length > 0 && !batchResult && (
                  <>
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs text-muted-foreground">
                          {csvOrders.length} order{csvOrders.length !== 1 ? "s" : ""} found
                          {" · "}
                          {csvOrders.filter((o) => o.selected).length} selected
                        </Label>
                        <button
                          onClick={() =>
                            setCSVOrders((prev) =>
                              prev.map((o) => ({ ...o, selected: !prev.every((p) => p.selected) }))
                            )
                          }
                          className="text-[11px] text-primary hover:underline"
                        >
                          {csvOrders.every((o) => o.selected) ? "Deselect all" : "Select all"}
                        </button>
                      </div>

                      <div className="rounded-xl border border-border divide-y divide-border overflow-hidden max-h-96 overflow-y-auto">
                        {csvOrders.map((order, idx) => {
                          const matchedCount = order.matchedItems.filter((i) => i.filamentId).length;
                          const total = order.matchedItems.length;
                          return (
                            <div
                              key={idx}
                              className={`transition-colors ${
                                order.selected ? "bg-primary/5" : ""
                              }`}
                            >
                              {/* Order header */}
                              <div className="flex items-start gap-2.5 px-3 py-2">
                                <input
                                  type="checkbox"
                                  checked={order.selected}
                                  onChange={() => toggleOrderSelected(idx)}
                                  className="h-3.5 w-3.5 accent-primary mt-0.5 shrink-0"
                                />
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-medium truncate">
                                    {order.shop}
                                    {order.orderNumber ? (
                                      <span className="text-muted-foreground font-normal ml-1.5 font-mono">
                                        #{order.orderNumber}
                                      </span>
                                    ) : null}
                                  </p>
                                  <p className="text-[11px] text-muted-foreground">
                                    {order.orderedAt}
                                    {" · "}
                                    {total} item{total !== 1 ? "s" : ""}
                                    {" · "}
                                    {order.items.reduce((s, i) => s + i.quantity, 0)} spools
                                  </p>
                                </div>
                                <span
                                  className={`text-[10px] font-medium shrink-0 mt-0.5 ${
                                    matchedCount === total
                                      ? "text-emerald-500"
                                      : matchedCount > 0
                                      ? "text-amber-500"
                                      : "text-muted-foreground"
                                  }`}
                                >
                                  {matchedCount}/{total}
                                </span>
                              </div>

                              {/* Items sub-list (expandable per item) */}
                              <div className="pl-8 pr-3 pb-2 space-y-1">
                                {order.matchedItems.map((item, ii) => {
                                  const key = `${idx}:${ii}`;
                                  const expanded = expandedCSVItems.has(key);
                                  const matchedFilament = item.filamentId
                                    ? allFilaments.find((f) => f.id === item.filamentId) ?? null
                                    : null;
                                  const availableSpools = item.filamentId
                                    ? spoolsByFilament.get(item.filamentId) ?? []
                                    : [];
                                  return (
                                    <div
                                      key={ii}
                                      className="rounded-md border border-border/50 bg-background"
                                    >
                                      <button
                                        type="button"
                                        onClick={() => toggleExpandedItem(idx, ii)}
                                        className="w-full flex items-center gap-1.5 px-2 py-1 text-left hover:bg-muted/30 transition-colors"
                                      >
                                        {expanded ? (
                                          <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
                                        ) : (
                                          <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
                                        )}
                                        {item.filamentId ? (
                                          <Check className="h-2.5 w-2.5 text-emerald-500 shrink-0" />
                                        ) : (
                                          <X className="h-2.5 w-2.5 text-destructive shrink-0" />
                                        )}
                                        <span className="text-[10px] flex-1 min-w-0 truncate">
                                          ×{item.quantity} {item.name}
                                          {matchedFilament && (
                                            <span className="text-muted-foreground ml-1.5">
                                              → {matchedFilament.vendor.name} {matchedFilament.name}
                                            </span>
                                          )}
                                        </span>
                                        <span className="text-[10px] text-muted-foreground shrink-0">
                                          {item.spoolIds.length}/{item.quantity} sp
                                          {item.unitPrice > 0 ? ` · €${item.unitPrice.toFixed(2)}` : ""}
                                        </span>
                                      </button>

                                      {expanded && (
                                        <div className="border-t border-border/50 px-2 py-2 space-y-2">
                                          {/* Filament override */}
                                          <div>
                                            <Label className="text-[10px] text-muted-foreground uppercase tracking-wide">
                                              Filament
                                            </Label>
                                            <select
                                              value={item.filamentId ?? ""}
                                              onChange={(e) =>
                                                setCSVItemFilament(idx, ii, e.target.value || null)
                                              }
                                              className="mt-0.5 w-full h-7 text-[11px] rounded-md border border-input bg-background px-2"
                                            >
                                              <option value="">— none —</option>
                                              {allFilaments.map((f) => (
                                                <option key={f.id} value={f.id}>
                                                  {f.vendor.name} · {f.material} · {f.name}
                                                  {f.colorName ? ` (${f.colorName})` : ""}
                                                </option>
                                              ))}
                                            </select>
                                          </div>

                                          {/* Spool chips */}
                                          {item.filamentId && (
                                            <div>
                                              <Label className="text-[10px] text-muted-foreground uppercase tracking-wide">
                                                Linked spools ({item.spoolIds.length} selected)
                                              </Label>
                                              {availableSpools.length === 0 ? (
                                                <p className="mt-0.5 text-[10px] text-muted-foreground italic">
                                                  No spools for this filament
                                                </p>
                                              ) : (
                                                <div className="mt-0.5 flex flex-wrap gap-1">
                                                  {availableSpools.map((sp) => {
                                                    const selected = item.spoolIds.includes(sp.id);
                                                    const pct = Math.round(
                                                      (sp.remainingWeight / sp.initialWeight) * 100,
                                                    );
                                                    return (
                                                      <button
                                                        key={sp.id}
                                                        type="button"
                                                        onClick={() => toggleCSVItemSpool(idx, ii, sp.id)}
                                                        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] border transition-colors ${
                                                          selected
                                                            ? "bg-primary/10 border-primary/40 text-primary"
                                                            : "bg-background border-border hover:bg-muted/40"
                                                        }`}
                                                      >
                                                        <SpoolColorDot
                                                          hex={sp.filament.colorHex ?? "888888"}
                                                          size="sm"
                                                          className="!h-2.5 !w-2.5"
                                                        />
                                                        <span className="font-mono">
                                                          {sp.id.slice(0, 6)}
                                                        </span>
                                                        <span className="text-muted-foreground">
                                                          {pct}%
                                                        </span>
                                                        {sp.location && (
                                                          <span className="text-muted-foreground/70">
                                                            · {sp.location}
                                                          </span>
                                                        )}
                                                      </button>
                                                    );
                                                  })}
                                                </div>
                                              )}
                                            </div>
                                          )}

                                          {/* Price */}
                                          <div>
                                            <Label className="text-[10px] text-muted-foreground uppercase tracking-wide">
                                              Unit price (€)
                                            </Label>
                                            <Input
                                              type="number"
                                              step="0.01"
                                              min="0"
                                              value={item.unitPrice || ""}
                                              onChange={(e) =>
                                                updateCSVItemPrice(
                                                  idx,
                                                  ii,
                                                  parseFloat(e.target.value) || 0,
                                                )
                                              }
                                              className="mt-0.5 h-7 text-[11px]"
                                            />
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {batchImporting && (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        {batchProgress}
                      </div>
                    )}

                    <div className="flex justify-end">
                      <Button
                        onClick={handleBatchImport}
                        disabled={batchImporting || csvOrders.filter((o) => o.selected).length === 0}
                        className="bg-primary hover:bg-primary/90 text-primary-foreground min-w-[140px]"
                      >
                        {batchImporting ? (
                          <>
                            <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                            {batchProgress}
                          </>
                        ) : (
                          `Match & Import All (${csvOrders.filter((o) => o.selected).length})`
                        )}
                      </Button>
                    </div>
                  </>
                )}

                {/* Batch import success */}
                {batchResult && (
                  <div className="flex flex-col items-center gap-4 py-6 text-center">
                    <div className="h-12 w-12 rounded-full bg-emerald-500/15 flex items-center justify-center">
                      <Check className="h-6 w-6 text-emerald-500" />
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm font-medium">Batch import complete</p>
                      <p className="text-xs text-muted-foreground">
                        {batchResult.ordersCreated} order{batchResult.ordersCreated !== 1 ? "s" : ""} imported
                        {" · "}
                        {batchResult.spoolsUpdated} spool price{batchResult.spoolsUpdated !== 1 ? "s" : ""} updated
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={onClose}
                      className="h-7 text-xs"
                    >
                      Close
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ── Step 2: Review parsed data (email only) ────────────────────── */}
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

        {/* ── Step 3: Spool matching (email only) ───────────────────────── */}
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

        {/* ── Step 4: Confirm & Import (email only) ─────────────────────── */}
        {step === 4 && !importedOrderId && (
          <div className="space-y-4 pt-1">
            <p className="text-xs text-muted-foreground">
              Review what will be created, then confirm import.
            </p>

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

        {/* ── Done (email only) ───────────────────────────────────────────── */}
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
