"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Plus, Pencil, Archive, ArchiveRestore } from "lucide-react";
import { createRack, updateRack, archiveRack, restoreRack } from "@/lib/actions";

interface Rack {
  id: string;
  name: string;
  rows: number;
  cols: number;
  sortOrder: number;
  archivedAt: string | null;
}

interface RacksCardProps {
  initialRacks: Rack[];
}

export function RacksCard({ initialRacks }: RacksCardProps) {
  const [racks, setRacks] = useState<Rack[]>(initialRacks);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<{ name: string; rows: number; cols: number }>({
    name: "",
    rows: 3,
    cols: 10,
  });
  const [newOpen, setNewOpen] = useState(false);
  const [newDraft, setNewDraft] = useState<{ name: string; rows: number; cols: number }>({
    name: "",
    rows: 3,
    cols: 10,
  });
  const [confirmArchive, setConfirmArchive] = useState<Rack | null>(null);
  const [isPending, startTransition] = useTransition();

  const active = racks.filter((r) => r.archivedAt === null);
  const archived = racks.filter((r) => r.archivedAt !== null);

  function startEdit(rack: Rack) {
    setEditingId(rack.id);
    setEditDraft({ name: rack.name, rows: rack.rows, cols: rack.cols });
  }

  function handleSaveEdit(id: string) {
    const name = editDraft.name.trim();
    if (!name) {
      toast.error("Name is required");
      return;
    }
    const rows = Math.min(10, Math.max(1, editDraft.rows));
    const cols = Math.min(20, Math.max(1, editDraft.cols));
    startTransition(async () => {
      try {
        await updateRack(id, { name, rows, cols });
        setRacks((prev) => prev.map((r) => (r.id === id ? { ...r, name, rows, cols } : r)));
        setEditingId(null);
      } catch {
        toast.error("Failed to update rack");
      }
    });
  }

  function handleCreate() {
    const name = newDraft.name.trim();
    if (!name) {
      toast.error("Name is required");
      return;
    }
    const rows = Math.min(10, Math.max(1, newDraft.rows));
    const cols = Math.min(20, Math.max(1, newDraft.cols));
    startTransition(async () => {
      try {
        const created = await createRack(name, rows, cols);
        setRacks((prev) => [...prev, { ...created, archivedAt: null } as Rack]);
        setNewOpen(false);
        setNewDraft({ name: "", rows: 3, cols: 10 });
        toast.success(`Created rack '${name}'`);
      } catch {
        toast.error("Failed to create rack");
      }
    });
  }

  function handleArchive(rack: Rack) {
    startTransition(async () => {
      try {
        await archiveRack(rack.id);
        setRacks((prev) =>
          prev.map((r) => (r.id === rack.id ? { ...r, archivedAt: new Date().toISOString() } : r)),
        );
        setConfirmArchive(null);
        toast.success(`Archived '${rack.name}' — spools moved to storage`);
      } catch {
        toast.error("Failed to archive rack");
      }
    });
  }

  function handleRestore(rack: Rack) {
    startTransition(async () => {
      try {
        await restoreRack(rack.id);
        setRacks((prev) => prev.map((r) => (r.id === rack.id ? { ...r, archivedAt: null } : r)));
        toast.success(`Restored '${rack.name}'`);
      } catch {
        toast.error("Failed to restore rack");
      }
    });
  }

  return (
    <div data-testid="racks-card" className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {active.length} active rack{active.length !== 1 ? "s" : ""}
          {archived.length > 0 && ` · ${archived.length} archived`}
        </p>
        <Button
          size="sm"
          onClick={() => setNewOpen(true)}
          className="h-7 text-xs"
          data-testid="add-rack-btn"
        >
          <Plus className="w-3 h-3 mr-1" />
          Add Rack
        </Button>
      </div>

      <div className="space-y-2">
        {active.map((r) => (
          <div
            key={r.id}
            data-testid={`rack-row-${r.id}`}
            className="flex items-center gap-2 py-1.5 border-b border-border/50 last:border-b-0"
          >
            <Badge variant="outline" className="h-5 px-1.5 text-[10px]">●</Badge>
            {editingId === r.id ? (
              <>
                <Input
                  value={editDraft.name}
                  onChange={(e) => setEditDraft({ ...editDraft, name: e.target.value })}
                  className="h-7 text-xs flex-1"
                  autoFocus
                />
                <Input
                  type="number"
                  value={editDraft.rows}
                  onChange={(e) => setEditDraft({ ...editDraft, rows: +e.target.value })}
                  className="h-7 text-xs w-14"
                  min={1}
                  max={10}
                />
                <span className="text-xs text-muted-foreground">×</span>
                <Input
                  type="number"
                  value={editDraft.cols}
                  onChange={(e) => setEditDraft({ ...editDraft, cols: +e.target.value })}
                  className="h-7 text-xs w-14"
                  min={1}
                  max={20}
                />
                <Button
                  size="sm"
                  onClick={() => handleSaveEdit(r.id)}
                  disabled={isPending}
                  className="h-7 text-xs"
                >
                  Save
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setEditingId(null)}
                  disabled={isPending}
                  className="h-7 text-xs"
                >
                  Cancel
                </Button>
              </>
            ) : (
              <>
                <span className="text-xs font-medium flex-1">{r.name}</span>
                <span className="text-[10px] text-muted-foreground tabular-nums">
                  {r.rows} × {r.cols}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => startEdit(r)}
                  className="h-7 px-2"
                  aria-label={`Edit ${r.name}`}
                >
                  <Pencil className="w-3 h-3" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setConfirmArchive(r)}
                  data-testid={`archive-rack-${r.id}`}
                  className="h-7 px-2 text-muted-foreground hover:text-destructive"
                  aria-label={`Archive ${r.name}`}
                >
                  <Archive className="w-3 h-3" />
                </Button>
              </>
            )}
          </div>
        ))}

        {active.length === 0 && (
          <p className="text-xs text-muted-foreground py-3 text-center">
            No active racks. Add one to start organizing spools.
          </p>
        )}
      </div>

      {archived.length > 0 && (
        <details className="pt-2 border-t border-border/50">
          <summary className="text-[10px] uppercase tracking-wider text-muted-foreground cursor-pointer select-none py-1">
            Archived ({archived.length})
          </summary>
          <div className="mt-2 space-y-1">
            {archived.map((r) => (
              <div
                key={r.id}
                data-testid={`rack-row-${r.id}`}
                className="flex items-center gap-2 py-1 text-muted-foreground"
              >
                <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">⊘</Badge>
                <span className="text-xs flex-1">{r.name}</span>
                <span className="text-[10px] tabular-nums">
                  {r.rows} × {r.cols}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleRestore(r)}
                  className="h-7 px-2"
                  data-testid={`restore-rack-${r.id}`}
                >
                  <ArchiveRestore className="w-3 h-3 mr-1" />
                  <span className="text-xs">Restore</span>
                </Button>
              </div>
            ))}
          </div>
        </details>
      )}

      {/* New Rack dialog */}
      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle className="text-sm">New Rack</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="new-rack-name" className="text-xs">Name</Label>
              <Input
                id="new-rack-name"
                value={newDraft.name}
                onChange={(e) => setNewDraft({ ...newDraft, name: e.target.value })}
                placeholder="e.g., Lager Keller"
                className="h-8 text-sm"
                data-testid="new-rack-name"
                autoFocus
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label htmlFor="new-rack-rows" className="text-xs">Rows (1–10)</Label>
                <Input
                  id="new-rack-rows"
                  type="number"
                  value={newDraft.rows}
                  onChange={(e) => setNewDraft({ ...newDraft, rows: +e.target.value })}
                  className="h-8 text-sm"
                  min={1}
                  max={10}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="new-rack-cols" className="text-xs">Cols (1–20)</Label>
                <Input
                  id="new-rack-cols"
                  type="number"
                  value={newDraft.cols}
                  onChange={(e) => setNewDraft({ ...newDraft, cols: +e.target.value })}
                  className="h-8 text-sm"
                  min={1}
                  max={20}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setNewOpen(false)}
              disabled={isPending}
              className="h-7 text-xs"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleCreate}
              disabled={isPending}
              className="h-7 text-xs"
              data-testid="confirm-create-rack"
            >
              {isPending ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Archive confirmation */}
      <Dialog open={!!confirmArchive} onOpenChange={(v) => !v && setConfirmArchive(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm">Archive rack?</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">
            All spools in <span className="font-medium text-foreground">{confirmArchive?.name}</span> will be moved to Storage. You can restore the rack later.
          </p>
          <DialogFooter>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setConfirmArchive(null)}
              disabled={isPending}
              className="h-7 text-xs"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => confirmArchive && handleArchive(confirmArchive)}
              disabled={isPending}
              className="h-7 text-xs"
              data-testid="confirm-archive-rack"
            >
              {isPending ? "Archiving..." : "Archive"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
