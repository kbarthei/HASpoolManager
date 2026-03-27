"use client";

import { useReducer, useEffect } from "react";
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

type State = {
  spools: SpoolOption[];
  loading: boolean;
  error: string | null;
};

type Action =
  | { type: "FETCH_START" }
  | { type: "FETCH_SUCCESS"; spools: SpoolOption[] }
  | { type: "FETCH_ERROR"; error: string };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "FETCH_START":
      return { spools: [], loading: true, error: null };
    case "FETCH_SUCCESS":
      return { spools: action.spools, loading: false, error: null };
    case "FETCH_ERROR":
      return { spools: [], loading: false, error: action.error };
  }
}

export function SpoolPicker({ open, onSelect, onClose }: SpoolPickerProps) {
  const [{ spools, loading, error }, dispatch] = useReducer(reducer, {
    spools: [],
    loading: false,
    error: null,
  });

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    dispatch({ type: "FETCH_START" });

    fetch("/api/v1/spools?status=active")
      .then((res) => {
        if (!res.ok) throw new Error(`Error ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (cancelled) return;
        const available = Array.isArray(data)
          ? data.filter(
              (s: SpoolOption & { location?: string }) =>
                s.location === "storage" || s.location == null
            )
          : [];
        dispatch({ type: "FETCH_SUCCESS", spools: available });
      })
      .catch((err) => {
        if (cancelled) return;
        dispatch({
          type: "FETCH_ERROR",
          error: err instanceof Error ? err.message : "Unknown error",
        });
      });

    return () => {
      cancelled = true;
    };
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
