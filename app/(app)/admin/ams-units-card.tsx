"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Pencil, Check, X } from "lucide-react";

interface Unit {
  id: string;
  printerId: string;
  amsIndex: number;
  slotType: string;
  displayName: string;
  enabled: boolean;
  haDeviceId: string;
}

interface Props {
  printerId: string;
  printerName: string;
  initialUnits: Unit[];
}

export function AmsUnitsCard({ printerId, printerName, initialUnits }: Props) {
  const [units, setUnits] = useState<Unit[]>(initialUnits);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [confirmDisable, setConfirmDisable] = useState<Unit | null>(null);
  const [isPending, startTransition] = useTransition();

  async function patchUnit(unit: Unit, body: Partial<Pick<Unit, "displayName" | "enabled">>) {
    const res = await fetch(`/api/v1/printers/${printerId}/ams-units/${unit.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      toast.error("Failed to update AMS unit");
      return null;
    }
    const updated = (await res.json()) as Unit;
    setUnits((prev) => prev.map((u) => (u.id === unit.id ? updated : u)));
    return updated;
  }

  function startEdit(unit: Unit) {
    setEditingId(unit.id);
    setEditName(unit.displayName);
  }

  function saveEdit(unit: Unit) {
    const next = editName.trim();
    if (!next) {
      toast.error("Name is required");
      return;
    }
    startTransition(async () => {
      await patchUnit(unit, { displayName: next });
      setEditingId(null);
    });
  }

  function toggleEnabled(unit: Unit, nextEnabled: boolean) {
    if (unit.enabled && !nextEnabled) {
      // Disabling — require confirmation
      setConfirmDisable(unit);
      return;
    }
    startTransition(async () => {
      await patchUnit(unit, { enabled: nextEnabled });
    });
  }

  function confirmDisableAction() {
    if (!confirmDisable) return;
    const unit = confirmDisable;
    startTransition(async () => {
      const updated = await patchUnit(unit, { enabled: false });
      setConfirmDisable(null);
      if (updated) {
        toast.success(`Disabled '${unit.displayName}' — loaded spools moved to storage`);
      }
    });
  }

  if (units.length === 0) {
    return (
      <div data-testid={`ams-units-card-${printerId}`} className="space-y-2">
        <p className="text-xs text-muted-foreground">
          No AMS units discovered yet for <span className="font-medium text-foreground">{printerName}</span>.
          Units are auto-created the first time the sync worker connects to HA.
        </p>
      </div>
    );
  }

  return (
    <div data-testid={`ams-units-card-${printerId}`} className="space-y-2">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
        {printerName}
      </p>
      <div className="space-y-1">
        {units.map((u) => (
          <div
            key={u.id}
            data-testid={`ams-unit-row-${u.id}`}
            className="flex items-center gap-2 py-1.5 border-b border-border/50 last:border-b-0"
          >
            <Badge
              variant={u.enabled ? "default" : "secondary"}
              className="h-5 px-1.5 text-[10px] tabular-nums"
            >
              {u.enabled ? "●" : "⊘"}
            </Badge>
            {editingId === u.id ? (
              <>
                <Input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="h-7 text-xs flex-1"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") saveEdit(u);
                    if (e.key === "Escape") setEditingId(null);
                  }}
                />
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => saveEdit(u)}
                  disabled={isPending}
                  className="h-7 px-2"
                  aria-label="Save"
                >
                  <Check className="w-3 h-3" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setEditingId(null)}
                  disabled={isPending}
                  className="h-7 px-2"
                  aria-label="Cancel"
                >
                  <X className="w-3 h-3" />
                </Button>
              </>
            ) : (
              <>
                <span className="text-xs font-medium flex-1">{u.displayName}</span>
                <span className="text-[10px] text-muted-foreground tabular-nums">
                  {u.slotType} · #{u.amsIndex}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => startEdit(u)}
                  className="h-7 px-2"
                  aria-label={`Rename ${u.displayName}`}
                >
                  <Pencil className="w-3 h-3" />
                </Button>
                <button
                  type="button"
                  role="switch"
                  aria-checked={u.enabled}
                  aria-label={`${u.enabled ? "Disable" : "Enable"} ${u.displayName}`}
                  onClick={() => toggleEnabled(u, !u.enabled)}
                  disabled={isPending}
                  data-testid={`toggle-ams-${u.id}`}
                  className={`relative h-5 w-9 rounded-full transition-colors ${
                    u.enabled ? "bg-primary" : "bg-muted"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 h-4 w-4 rounded-full bg-background transition-transform ${
                      u.enabled ? "translate-x-4" : "translate-x-0.5"
                    }`}
                  />
                </button>
              </>
            )}
          </div>
        ))}
      </div>

      <Dialog open={!!confirmDisable} onOpenChange={(v) => !v && setConfirmDisable(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm">Disable AMS unit?</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">
            Any spools loaded in{" "}
            <span className="font-medium text-foreground">{confirmDisable?.displayName}</span>{" "}
            will be moved to Storage. You can re-enable the unit at any time.
          </p>
          <DialogFooter>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setConfirmDisable(null)}
              disabled={isPending}
              className="h-7 text-xs"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={confirmDisableAction}
              disabled={isPending}
              className="h-7 text-xs"
              data-testid="confirm-disable-ams"
            >
              {isPending ? "Disabling..." : "Disable"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
