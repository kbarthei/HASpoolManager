"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { adjustSpoolWeight } from "@/lib/actions";
import { toast } from "sonner";
import { Pencil, Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { getStockLevelColor } from "@/lib/theme";

interface WeightAdjusterProps {
  spoolId: string;
  currentWeight: number;
  initialWeight: number;
}

export function WeightAdjuster({ spoolId, currentWeight, initialWeight }: WeightAdjusterProps) {
  const [editing, setEditing] = useState(false);
  const [weight, setWeight] = useState(String(currentWeight));
  const [saving, setSaving] = useState(false);

  const percent = initialWeight > 0 ? Math.round((currentWeight / initialWeight) * 100) : 0;

  async function handleSave() {
    const newWeight = Number(weight);
    if (isNaN(newWeight) || newWeight < 0) {
      toast.error("Invalid weight");
      return;
    }
    setSaving(true);
    try {
      await adjustSpoolWeight(spoolId, newWeight);
      toast.success(`Weight updated to ${Math.round(newWeight)}g`);
      setEditing(false);
    } catch {
      toast.error("Failed to update weight");
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <div className="flex items-center gap-1.5">
        <Input
          type="number"
          value={weight}
          onChange={(e) => setWeight(e.target.value)}
          className="h-7 w-20 text-sm font-mono"
          min={0}
          max={initialWeight}
          step={1}
          autoFocus
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSave();
            if (e.key === "Escape") setEditing(false);
          }}
        />
        <span className="text-xs text-muted-foreground">g</span>
        <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={handleSave} disabled={saving}>
          <Check className="h-3.5 w-3.5 text-emerald-500" />
        </Button>
        <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => setEditing(false)}>
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <span className={cn("text-lg font-bold font-mono", getStockLevelColor(percent))}>
        {currentWeight}g
      </span>
      <Button
        size="sm"
        variant="ghost"
        className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
        onClick={() => setEditing(true)}
        title="Adjust weight"
      >
        <Pencil className="h-3 w-3" />
      </Button>
    </div>
  );
}
