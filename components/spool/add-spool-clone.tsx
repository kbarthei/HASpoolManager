"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { SpoolColorDot } from "./spool-color-dot";
import { SpoolMaterialBadge } from "./spool-material-badge";
import { cloneSpool } from "@/lib/actions";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

type SpoolOption = {
  id: string;
  remainingWeight: number;
  initialWeight: number;
  location: string | null;
  status: string;
  filament: {
    name: string;
    material: string;
    colorHex: string | null;
    colorName: string | null;
    vendor: { name: string };
  };
};

export function AddSpoolClone({
  spools,
  onSuccess,
}: {
  spools: SpoolOption[];
  onSuccess: () => void;
}) {
  const [selected, setSelected] = useState<SpoolOption | null>(null);
  const [weight, setWeight] = useState(1000);
  const [cloning, setCloning] = useState(false);

  async function handleClone() {
    if (!selected) return;
    setCloning(true);
    try {
      await cloneSpool(selected.id, weight);
      toast.success("Spool cloned");
      onSuccess();
    } catch {
      toast.error("Failed to clone spool");
    } finally {
      setCloning(false);
    }
  }

  if (selected) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2.5 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2.5">
          <SpoolColorDot hex={selected.filament.colorHex ?? "888888"} size="sm" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium truncate">
              {selected.filament.vendor.name} {selected.filament.name}
            </p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <SpoolMaterialBadge material={selected.filament.material} />
              {selected.filament.colorName && (
                <span className="text-[10px] text-muted-foreground">
                  {selected.filament.colorName}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">
            Initial Weight (g)
          </label>
          <Input
            type="number"
            value={weight}
            onChange={(e) => setWeight(parseInt(e.target.value) || 1000)}
          />
        </div>

        <div className="flex gap-2">
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => setSelected(null)}
          >
            Back
          </Button>
          <Button className="flex-1" onClick={handleClone} disabled={cloning}>
            {cloning ? (
              <>
                <Loader2 className="size-3.5 mr-1 animate-spin" />
                Cloning...
              </>
            ) : (
              "Clone Spool"
            )}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        Pick an existing spool to clone with fresh weight.
      </p>
      <div className="max-h-[320px] overflow-y-auto space-y-1 pr-1">
        {spools.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-8">
            No spools to clone.
          </p>
        ) : (
          spools.map((s) => (
            <button
              key={s.id}
              onClick={() => {
                setSelected(s);
                setWeight(s.initialWeight);
              }}
              className="flex items-center gap-2.5 w-full rounded-lg border border-border bg-card px-3 py-2 text-left transition-colors hover:bg-muted/50"
            >
              <SpoolColorDot hex={s.filament.colorHex ?? "888888"} size="sm" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium truncate">
                  {s.filament.vendor.name} {s.filament.name}
                </p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <SpoolMaterialBadge material={s.filament.material} />
                  <span className="text-[10px] text-muted-foreground">
                    {s.remainingWeight}g / {s.initialWeight}g
                  </span>
                  {s.location && (
                    <span className="text-[10px] text-muted-foreground">
                      {s.location}
                    </span>
                  )}
                </div>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
