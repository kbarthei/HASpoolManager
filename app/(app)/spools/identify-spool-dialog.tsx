"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { confirmDraftSpool } from "@/lib/actions";

interface DraftSpool {
  id: string;
  initialWeight: number;
  filament: {
    name: string;
    material: string;
    colorHex: string | null;
    colorName: string | null;
    vendor: { name: string };
  };
}

interface FilamentOption {
  id: string;
  name: string;
  material: string;
  colorHex: string | null;
  vendor: { name: string };
}

interface IdentifySpoolDialogProps {
  spool: DraftSpool;
  filaments: FilamentOption[];
}

export function IdentifySpoolDialog({ spool, filaments }: IdentifySpoolDialogProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);

  // Mode: assign existing filament or create new
  const [mode, setMode] = useState<"existing" | "new">("existing");

  // Existing filament selection
  const [selectedFilamentId, setSelectedFilamentId] = useState("");
  const [search, setSearch] = useState("");

  // New filament fields — pre-filled with draft data
  const [vendorName, setVendorName] = useState(spool.filament.vendor.name === "Unknown" ? "" : spool.filament.vendor.name);
  const [filamentName, setFilamentName] = useState(spool.filament.name);
  const [material, setMaterial] = useState(spool.filament.material);
  const [colorHex, setColorHex] = useState(spool.filament.colorHex ? `#${spool.filament.colorHex}` : "#888888");
  const [colorName, setColorName] = useState(spool.filament.colorName ?? "");

  // Shared spool fields
  const [purchasePrice, setPurchasePrice] = useState("");
  const [initialWeight, setInitialWeight] = useState(String(spool.initialWeight));

  const filteredFilaments = filaments.filter((f) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      f.name.toLowerCase().includes(q) ||
      f.vendor.name.toLowerCase().includes(q) ||
      f.material.toLowerCase().includes(q)
    );
  });

  function handleConfirm() {
    startTransition(async () => {
      try {
        const weight = parseInt(initialWeight, 10) || spool.initialWeight;
        if (mode === "existing") {
          if (!selectedFilamentId) {
            toast.error("Please select a filament");
            return;
          }
          await confirmDraftSpool(spool.id, {
            filamentId: selectedFilamentId,
            initialWeight: weight,
            purchasePrice: purchasePrice ? Number(purchasePrice) : undefined,
          });
        } else {
          if (!filamentName.trim() || !material.trim()) {
            toast.error("Filament name and material are required");
            return;
          }
          await confirmDraftSpool(spool.id, {
            vendorName: vendorName.trim() || "Unknown",
            filamentName: filamentName.trim(),
            material: material.trim(),
            colorHex: colorHex.replace("#", ""),
            colorName: colorName.trim() || undefined,
            initialWeight: weight,
            purchasePrice: purchasePrice ? Number(purchasePrice) : undefined,
          });
        }
        toast.success("Spool identified and activated");
        setOpen(false);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to confirm spool");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button size="sm" variant="outline" className="h-7 text-xs border-amber-500/50 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10" />
        }
      >
        Identify
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Identify Draft Spool</DialogTitle>
          <DialogDescription>
            Link this spool to a filament to activate it.
          </DialogDescription>
        </DialogHeader>

        {/* Color swatch + current info */}
        <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 border">
          <div
            className="h-10 w-10 rounded-full border-2 border-white/20 shrink-0"
            style={{ backgroundColor: spool.filament.colorHex ? `#${spool.filament.colorHex}` : "#888888" }}
          />
          <div>
            <div className="text-sm font-medium">{spool.filament.material} filament</div>
            <div className="text-xs text-muted-foreground">
              Color: #{spool.filament.colorHex ?? "unknown"} · {spool.initialWeight}g
            </div>
          </div>
        </div>

        {/* Mode toggle */}
        <div className="flex rounded-lg border overflow-hidden">
          <button
            className={`flex-1 text-xs py-1.5 transition-colors ${mode === "existing" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
            onClick={() => setMode("existing")}
          >
            Use existing filament
          </button>
          <button
            className={`flex-1 text-xs py-1.5 transition-colors ${mode === "new" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
            onClick={() => setMode("new")}
          >
            Create new filament
          </button>
        </div>

        {mode === "existing" ? (
          <div className="space-y-2">
            <Input
              placeholder="Search filaments..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 text-sm"
            />
            <div className="max-h-48 overflow-y-auto rounded-lg border divide-y">
              {filteredFilaments.length === 0 ? (
                <div className="px-3 py-4 text-xs text-muted-foreground text-center">No filaments found</div>
              ) : (
                filteredFilaments.map((f) => (
                  <button
                    key={f.id}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 text-left text-xs hover:bg-muted transition-colors ${selectedFilamentId === f.id ? "bg-primary/10" : ""}`}
                    onClick={() => setSelectedFilamentId(f.id)}
                  >
                    <div
                      className="h-4 w-4 rounded-full shrink-0 border"
                      style={{ backgroundColor: f.colorHex ? `#${f.colorHex}` : "#888888" }}
                    />
                    <span className="font-medium truncate">{f.name}</span>
                    <span className="text-muted-foreground shrink-0">{f.material}</span>
                    <span className="text-muted-foreground truncate ml-auto">{f.vendor.name}</span>
                  </button>
                ))
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Vendor</Label>
                <Input value={vendorName} onChange={(e) => setVendorName(e.target.value)} placeholder="e.g. Bambu Lab" className="h-8 text-sm mt-1" />
              </div>
              <div>
                <Label className="text-xs">Material</Label>
                <Input value={material} onChange={(e) => setMaterial(e.target.value)} placeholder="e.g. PLA" className="h-8 text-sm mt-1" />
              </div>
            </div>
            <div>
              <Label className="text-xs">Filament Name</Label>
              <Input value={filamentName} onChange={(e) => setFilamentName(e.target.value)} placeholder="e.g. PLA Basic" className="h-8 text-sm mt-1" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Color</Label>
                <div className="flex gap-1 mt-1">
                  <input type="color" value={colorHex} onChange={(e) => setColorHex(e.target.value)} className="h-8 w-10 rounded border cursor-pointer p-0.5" />
                  <Input value={colorHex} onChange={(e) => setColorHex(e.target.value)} className="h-8 text-sm flex-1 font-mono" />
                </div>
              </div>
              <div>
                <Label className="text-xs">Color Name</Label>
                <Input value={colorName} onChange={(e) => setColorName(e.target.value)} placeholder="e.g. White" className="h-8 text-sm mt-1" />
              </div>
            </div>
          </div>
        )}

        {/* Shared spool fields */}
        <div className="grid grid-cols-2 gap-2 pt-1 border-t">
          <div>
            <Label className="text-xs">Initial Weight (g)</Label>
            <Input value={initialWeight} onChange={(e) => setInitialWeight(e.target.value)} type="number" min="1" className="h-8 text-sm mt-1" />
          </div>
          <div>
            <Label className="text-xs">Purchase Price (€)</Label>
            <Input value={purchasePrice} onChange={(e) => setPurchasePrice(e.target.value)} type="number" min="0" step="0.01" placeholder="optional" className="h-8 text-sm mt-1" />
          </div>
        </div>

        <DialogFooter>
          <DialogClose render={<Button variant="outline" size="sm" disabled={pending} />}>
            Cancel
          </DialogClose>
          <Button size="sm" onClick={handleConfirm} disabled={pending}>
            {pending ? "Saving..." : "Confirm"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
