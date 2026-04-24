"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { SpoolColorDot } from "./spool-color-dot";
import { SpoolMaterialBadge } from "./spool-material-badge";
import { createSpoolsFromFilament } from "@/lib/actions";
import { toast } from "sonner";
import { Loader2, Search, Check } from "lucide-react";

type FilamentOption = {
  id: string;
  name: string;
  material: string;
  colorHex: string | null;
  colorName: string | null;
  vendor: { name: string };
};

export function AddSpoolLibrary({
  filaments,
  onSuccess,
}: {
  filaments: FilamentOption[];
  onSuccess: () => void;
}) {
  const [search, setSearch] = useState("");
  const [count, setCount] = useState(1);
  const [lotBase, setLotBase] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const filtered = filaments.filter((f) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      f.name.toLowerCase().includes(q) ||
      f.vendor.name.toLowerCase().includes(q) ||
      f.material.toLowerCase().includes(q) ||
      (f.colorName?.toLowerCase().includes(q) ?? false)
    );
  });

  const selected = filaments.find((f) => f.id === selectedId) ?? null;

  async function handleConfirm() {
    if (!selected) return;
    setCreating(true);
    try {
      const safeCount = Math.max(1, Math.min(100, count));
      const created = await createSpoolsFromFilament(selected.id, {
        initialWeight: 1000,
        count: safeCount,
        lotNumber: lotBase.trim() || null,
      });
      toast.success(`${created.length} spool${created.length === 1 ? "" : "s"} created`);
      onSuccess();
    } catch {
      toast.error("Failed to create spool");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
        <Input
          placeholder="Search filaments..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-8"
        />
      </div>

      <div className="grid grid-cols-[72px_1fr] gap-2">
        <div>
          <label className="text-[10px] font-medium text-muted-foreground block mb-1">
            Anzahl
          </label>
          <Input
            type="number"
            min={1}
            max={100}
            value={count}
            onChange={(e) => setCount(parseInt(e.target.value, 10) || 1)}
            className="text-sm h-9"
            data-testid="bulk-count-input"
          />
        </div>
        <div>
          <label className="text-[10px] font-medium text-muted-foreground block mb-1">
            Lot-Nummer (optional)
          </label>
          <Input
            placeholder="e.g. B2026Q2"
            value={lotBase}
            onChange={(e) => setLotBase(e.target.value)}
            className="text-sm h-9"
            data-testid="bulk-lot-input"
          />
        </div>
      </div>

      <div className="max-h-[280px] overflow-y-auto space-y-1 pr-1">
        {filtered.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-8">
            No filaments found.
          </p>
        ) : (
          filtered.map((f) => {
            const isSelected = f.id === selectedId;
            return (
              <button
                key={f.id}
                type="button"
                disabled={creating}
                onClick={() => setSelectedId(f.id)}
                data-testid={`filament-option-${f.id}`}
                className={`flex items-center gap-2.5 w-full rounded-lg border px-3 py-2 text-left transition-colors ${
                  isSelected
                    ? "bg-primary/15 border-primary ring-2 ring-primary/40"
                    : "bg-card border-border hover:bg-muted/50"
                } disabled:opacity-50`}
              >
                <SpoolColorDot hex={f.colorHex ?? "888888"} size="sm" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate">
                    {f.vendor.name} {f.name}
                  </p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <SpoolMaterialBadge material={f.material} />
                    {f.colorName && (
                      <span className="text-[10px] text-muted-foreground">
                        {f.colorName}
                      </span>
                    )}
                  </div>
                </div>
                {isSelected && <Check className="size-4 text-primary shrink-0" />}
              </button>
            );
          })
        )}
      </div>

      <div className="sticky bottom-0 bg-background border-t border-border pt-3 -mx-1 px-1 flex items-center gap-2">
        <div className="flex-1 text-[11px] text-muted-foreground">
          {selected ? (
            <>
              <strong className="text-foreground">{selected.vendor.name} {selected.name}</strong>
              {count > 1 && <span> × {count}</span>}
              {lotBase.trim() && count > 1 && (
                <span className="block mt-0.5">
                  Lot: {lotBase.trim()}-001 … {lotBase.trim()}-{String(count).padStart(3, "0")}
                </span>
              )}
              {lotBase.trim() && count === 1 && (
                <span className="block mt-0.5">Lot: {lotBase.trim()}</span>
              )}
            </>
          ) : (
            <span>Select a filament to create spools.</span>
          )}
        </div>
        <Button
          type="button"
          size="sm"
          disabled={!selected || creating}
          onClick={handleConfirm}
          data-testid="bulk-confirm-btn"
          className="shrink-0"
        >
          {creating ? (
            <>
              <Loader2 className="size-3.5 animate-spin" />
              Creating…
            </>
          ) : (
            <>Create {count > 1 ? `${count} spools` : "spool"}</>
          )}
        </Button>
      </div>
    </div>
  );
}
