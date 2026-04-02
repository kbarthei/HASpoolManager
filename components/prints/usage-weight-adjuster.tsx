"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Pencil, Check, X } from "lucide-react";

interface UsageWeightAdjusterProps {
  printId: string;
  usageId: string;
  weightUsed: number;
}

export function UsageWeightAdjuster({ printId, usageId, weightUsed }: UsageWeightAdjusterProps) {
  const [editing, setEditing] = useState(false);
  const [weight, setWeight] = useState(weightUsed.toFixed(1));
  const [saving, setSaving] = useState(false);
  const [current, setCurrent] = useState(weightUsed);

  async function handleSave() {
    const newWeight = Number(weight);
    if (isNaN(newWeight) || newWeight < 0) {
      toast.error("Invalid weight");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/v1/prints/${printId}/usage/${usageId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weightUsed: newWeight }),
      });
      if (!res.ok) throw new Error("Request failed");
      setCurrent(newWeight);
      setWeight(newWeight.toFixed(1));
      toast.success(`Weight updated to ${newWeight.toFixed(1)}g`);
      setEditing(false);
    } catch {
      toast.error("Failed to update weight");
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <span className="inline-flex items-center gap-1">
        <Input
          type="number"
          value={weight}
          onChange={(e) => setWeight(e.target.value)}
          className="h-6 w-16 text-xs font-mono px-1.5 py-0"
          min={0}
          step={0.1}
          autoFocus
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSave();
            if (e.key === "Escape") setEditing(false);
          }}
        />
        <span className="text-xs text-muted-foreground">g</span>
        <Button
          size="sm"
          variant="ghost"
          className="h-5 w-5 p-0"
          onClick={handleSave}
          disabled={saving}
        >
          <Check className="h-3 w-3 text-emerald-500" />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-5 w-5 p-0"
          onClick={() => {
            setWeight(current.toFixed(1));
            setEditing(false);
          }}
        >
          <X className="h-3 w-3" />
        </Button>
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-0.5 group/weight">
      <span className="text-xs text-muted-foreground font-mono">{current.toFixed(1)}g</span>
      <Button
        size="sm"
        variant="ghost"
        className="h-4 w-4 p-0 opacity-0 group-hover/weight:opacity-100 text-muted-foreground hover:text-foreground transition-opacity"
        onClick={() => setEditing(true)}
        title="Adjust weight"
      >
        <Pencil className="h-2.5 w-2.5" />
      </Button>
    </span>
  );
}
