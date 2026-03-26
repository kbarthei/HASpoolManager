"use client";

import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Command, CommandInput, CommandList, CommandItem, CommandEmpty } from "@/components/ui/command";
import { SpoolColorDot } from "@/components/spool/spool-color-dot";
import { SpoolMaterialBadge } from "@/components/spool/spool-material-badge";

interface SpoolOption {
  id: string;
  remainingWeight: number;
  initialWeight: number;
  filament: {
    name: string;
    material: string;
    colorHex: string | null;
    vendor: { name: string };
  };
}

interface SpoolPickerProps {
  open: boolean;
  onSelect: (spoolId: string) => void;
  onClose: () => void;
}

export function SpoolPicker({ open, onSelect, onClose }: SpoolPickerProps) {
  const [spools, setSpools] = useState<SpoolOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;

    setLoading(true);
    setError(null);

    fetch("/api/v1/spools?status=active")
      .then((res) => {
        if (!res.ok) throw new Error(`Error ${res.status}`);
        return res.json();
      })
      .then((data) => {
        // Filter out spools already loaded in AMS (location != storage)
        const available = Array.isArray(data)
          ? data.filter((s: SpoolOption & { location?: string }) =>
              s.location === "storage" || s.location == null
            )
          : [];
        setSpools(available);
      })
      .catch((err) => {
        setError(err.message);
        setSpools([]);
      })
      .finally(() => setLoading(false));
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md p-0">
        <DialogHeader className="px-4 pt-4 pb-2">
          <DialogTitle>Select Spool</DialogTitle>
        </DialogHeader>

        <Command className="border-0">
          <CommandInput placeholder="Search by name, material, vendor..." />
          <CommandList className="max-h-72">
            {loading && (
              <div className="py-6 text-center text-sm text-muted-foreground">Loading spools...</div>
            )}
            {error && (
              <div className="py-6 text-center text-sm text-muted-foreground">
                Could not load spools ({error})
              </div>
            )}
            {!loading && !error && spools.length === 0 && (
              <CommandEmpty>No available spools found.</CommandEmpty>
            )}
            {!loading &&
              !error &&
              spools.map((spool) => {
                const percent =
                  spool.initialWeight > 0
                    ? Math.round((spool.remainingWeight / spool.initialWeight) * 100)
                    : 0;
                const searchValue = [
                  spool.filament.name,
                  spool.filament.material,
                  spool.filament.vendor.name,
                ]
                  .join(" ")
                  .toLowerCase();

                return (
                  <CommandItem
                    key={spool.id}
                    value={searchValue}
                    onSelect={() => {
                      onSelect(spool.id);
                      onClose();
                    }}
                    className="flex items-center gap-2 px-4 py-2 cursor-pointer"
                  >
                    <SpoolColorDot
                      hex={spool.filament.colorHex ?? "888888"}
                      size="sm"
                      className="shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{spool.filament.name}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {spool.filament.vendor.name}
                      </div>
                    </div>
                    <SpoolMaterialBadge material={spool.filament.material} className="shrink-0" />
                    <span className="text-xs font-mono text-muted-foreground shrink-0">
                      {spool.remainingWeight}g · {percent}%
                    </span>
                  </CommandItem>
                );
              })}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
