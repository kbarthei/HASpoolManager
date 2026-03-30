"use client";

import { useState, useTransition } from "react";
import { updateRackConfig, moveAllRackToWorkbench } from "@/lib/actions";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface RackSettingsProps {
  initialRows: number;
  initialColumns: number;
}

export function RackSettings({ initialRows, initialColumns }: RackSettingsProps) {
  const [rows, setRows] = useState(initialRows);
  const [cols, setCols] = useState(initialColumns);
  const [isPending, startTransition] = useTransition();

  function handleSave() {
    const r = Math.min(10, Math.max(1, rows));
    const c = Math.min(20, Math.max(1, cols));
    startTransition(async () => {
      try {
        await updateRackConfig(r, c);
        toast.success(`Rack grid updated to ${r} × ${c}`);
      } catch {
        toast.error("Failed to save rack configuration");
      }
    });
  }

  const previewRows = Math.min(10, Math.max(1, rows));
  const previewCols = Math.min(20, Math.max(1, cols));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 max-w-xs">
        <div className="space-y-1.5">
          <Label htmlFor="rack-rows" className="text-xs">Rows (1–10)</Label>
          <Input
            id="rack-rows"
            type="number"
            min={1}
            max={10}
            value={rows}
            onChange={(e) => setRows(parseInt(e.target.value, 10) || 1)}
            className="h-8 text-sm"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="rack-cols" className="text-xs">Columns (1–20)</Label>
          <Input
            id="rack-cols"
            type="number"
            min={1}
            max={20}
            value={cols}
            onChange={(e) => setCols(parseInt(e.target.value, 10) || 1)}
            className="h-8 text-sm"
          />
        </div>
      </div>

      {/* Visual preview */}
      <div className="space-y-1">
        <p className="text-xs text-muted-foreground">Preview ({previewRows} × {previewCols})</p>
        <div
          className="inline-grid gap-[3px] p-2 bg-muted/30 rounded-lg border border-border"
          style={{ gridTemplateColumns: `repeat(${previewCols}, 10px)` }}
        >
          {/* Rows rendered top-to-bottom as R(max)…R1 */}
          {Array.from({ length: previewRows }, (_, ri) => {
            const row = previewRows - ri;
            return Array.from({ length: previewCols }, (_, ci) => (
              <div
                key={`${row}-${ci}`}
                className="w-[10px] h-[10px] rounded-[2px] bg-muted border border-border"
              />
            ));
          })}
        </div>
        <p className="text-[10px] text-muted-foreground">R1 = bottom-left · S1 = leftmost column</p>
      </div>

      <div className="flex items-center gap-2">
        <Button
          size="sm"
          onClick={handleSave}
          disabled={isPending}
          className="h-8 text-xs"
        >
          {isPending ? "Saving…" : "Save"}
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-8 text-xs"
          disabled={isPending}
          onClick={() => {
            startTransition(async () => {
              const count = await moveAllRackToWorkbench();
              if (count > 0) {
                toast.success(`Moved ${count} spool${count !== 1 ? "s" : ""} to workbench`);
              } else {
                toast.info("Rack is already empty");
              }
            });
          }}
        >
          Clear Rack
        </Button>
      </div>
    </div>
  );
}
