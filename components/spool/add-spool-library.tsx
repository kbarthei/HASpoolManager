"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { SpoolColorDot } from "./spool-color-dot";
import { SpoolMaterialBadge } from "./spool-material-badge";
import { createSpoolsFromFilament } from "@/lib/actions";
import { toast } from "sonner";
import { Loader2, Search } from "lucide-react";

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
  const [creating, setCreating] = useState<string | null>(null);

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

  async function handleSelect(filamentId: string) {
    setCreating(filamentId);
    try {
      const safeCount = Math.max(1, Math.min(100, count));
      const created = await createSpoolsFromFilament(filamentId, {
        initialWeight: 1000,
        count: safeCount,
        lotNumber: lotBase.trim() || null,
      });
      toast.success(`${created.length} spool${created.length === 1 ? "" : "s"} created`);
      onSuccess();
    } catch {
      toast.error("Failed to create spool");
    } finally {
      setCreating(null);
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
      {count > 1 && (
        <p className="text-[10px] text-muted-foreground">
          {count} spools werden erzeugt
          {lotBase.trim() && `, Lot-Nummern: ${lotBase.trim()}-001 … ${lotBase.trim()}-${String(count).padStart(3, "0")}`}
          .
        </p>
      )}

      <div className="max-h-[320px] overflow-y-auto space-y-1 pr-1">
        {filtered.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-8">
            No filaments found.
          </p>
        ) : (
          filtered.map((f) => (
            <button
              key={f.id}
              disabled={creating === f.id}
              onClick={() => handleSelect(f.id)}
              className="flex items-center gap-2.5 w-full rounded-lg border border-border bg-card px-3 py-2 text-left transition-colors hover:bg-muted/50 disabled:opacity-50"
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
              {creating === f.id ? (
                <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
              ) : (
                <span className="text-xs text-muted-foreground">+</span>
              )}
            </button>
          ))
        )}
      </div>

      {filaments.length > 0 && (
        <p className="text-[10px] text-muted-foreground text-center">
          {filaments.length} filament{filaments.length !== 1 ? "s" : ""} in library
        </p>
      )}
    </div>
  );
}
