"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { SpoolFilters } from "@/components/spool/spool-filters";
import { SpoolCard } from "@/components/spool/spool-card";
import { SpoolInspectorContainer } from "@/components/spool/spool-inspector-container";
import { ViewToggle } from "@/components/shared/view-toggle";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SpoolColorDot } from "@/components/spool/spool-color-dot";
import { SpoolMaterialBadge } from "@/components/spool/spool-material-badge";
import { SpoolProgressBar } from "@/components/spool/spool-progress-bar";
import {
  restoreSpool,
  permanentlyDeleteSpool,
  bulkDeleteSpools,
} from "@/lib/actions";
import { IdentifySpoolDialog } from "./identify-spool-dialog";
import { AddSpoolDialog } from "@/components/spool/add-spool-dialog";
import { ExportCsvButton } from "@/components/export-csv-button";

type Spool = {
  id: string;
  remainingWeight: number;
  initialWeight: number;
  location: string | null;
  purchasePrice: string | null;
  currency: string | null;
  status: string;
  filament: {
    name: string;
    material: string;
    colorHex: string | null;
    colorName: string | null;
    vendor: {
      name: string;
    };
  };
};

type FilamentOption = {
  id: string;
  name: string;
  material: string;
  colorHex: string | null;
  colorName: string | null;
  vendor: { name: string };
};

export function SpoolsClient({
  spools,
  materials,
  vendors,
  colors,
  initialView,
  allFilaments = [],
  activeIssue = null,
  activeIssueLabel = null,
}: {
  spools: Spool[];
  materials: string[];
  vendors: string[];
  colors: { hex: string; name: string }[];
  initialView: "grid" | "list";
  allFilaments?: FilamentOption[];
  activeIssue?: string | null;
  activeIssueLabel?: string | null;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [inspectorSpoolId, setInspectorSpoolId] = useState<string | null>(null);

  const isArchiveView = searchParams.get("status") === "archived";
  const isDraftView = searchParams.get("status") === "draft";
  // Draft + Archive views keep their bulk-select / identify actions; only the
  // regular view opens the inspector on card click.
  const useInspector = !isArchiveView && !isDraftView;

  function handleViewChange(v: "grid" | "list") {
    const params = new URLSearchParams(searchParams.toString());
    params.set("view", v);
    router.push(`/spools?${params.toString()}`);
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll() {
    if (selectedIds.size === spools.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(spools.map((s) => s.id)));
  }

  async function handleBulkDelete() {
    if (
      !confirm(
        `Permanently delete ${selectedIds.size} spool(s)? This cannot be undone.`
      )
    )
      return;
    try {
      await bulkDeleteSpools(Array.from(selectedIds));
      toast.success(`Deleted ${selectedIds.size} spool(s)`);
      setSelectedIds(new Set());
      router.refresh();
    } catch {
      toast.error("Failed to delete spools");
    }
  }

  async function handleBulkRestore() {
    try {
      for (const id of selectedIds) {
        await restoreSpool(id);
      }
      toast.success(`Restored ${selectedIds.size} spool(s)`);
      setSelectedIds(new Set());
      router.refresh();
    } catch {
      toast.error("Failed to restore spools");
    }
  }

  async function handleRestoreOne(id: string) {
    try {
      await restoreSpool(id);
      toast.success("Restored");
      router.refresh();
    } catch {
      toast.error("Failed to restore spool");
    }
  }

  async function handleDeleteOne(id: string) {
    if (!confirm("Permanently delete this spool? This cannot be undone."))
      return;
    try {
      await permanentlyDeleteSpool(id);
      toast.success("Deleted");
      router.refresh();
    } catch {
      toast.error("Failed to delete spool");
    }
  }

  return (
    <div data-testid="page-spools" className="space-y-4">
      {/* Page header */}
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-bold tracking-tight">
          Spools
          <span className="ml-2 text-sm font-normal text-muted-foreground align-middle">
            {spools.length}
          </span>
        </h1>
        <div className="flex items-center gap-2">
          <ExportCsvButton href="/api/v1/export/spools" />
          <ViewToggle view={initialView} onViewChange={handleViewChange} />
          {!isArchiveView && (
            <AddSpoolDialog filaments={allFilaments} spools={spools} />
          )}
        </div>
      </div>

      {/* Diagnostics issue banner */}
      {activeIssue && (
        <div
          data-testid="issue-banner"
          className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/30"
        >
          <div className="text-xs">
            <span className="font-semibold text-amber-600">Filtered:</span>{" "}
            <span className="text-foreground">{activeIssueLabel}</span>
            <span className="text-muted-foreground"> · {spools.length} spool{spools.length === 1 ? "" : "s"}</span>
          </div>
          <button
            type="button"
            onClick={() => router.push("/spools")}
            className="text-xs text-amber-600 hover:underline"
          >
            Clear
          </button>
        </div>
      )}

      {/* Filters toolbar */}
      <SpoolFilters materials={materials} vendors={vendors} colors={colors} />

      {/* Draft toolbar */}
      {isDraftView && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-warning/10 border border-warning/30 text-warning">
          <span className="text-base leading-none">⚠</span>
          <span className="text-xs font-medium">
            {spools.length} spool{spools.length !== 1 ? "s" : ""} need{spools.length === 1 ? "s" : ""} review — identify them to make them active.
          </span>
        </div>
      )}

      {/* Archive toolbar */}
      {isArchiveView && (
        <div className="flex items-center justify-between gap-2 bg-muted/50 rounded-lg px-3 py-2">
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={
                selectedIds.size === spools.length && spools.length > 0
              }
              onChange={selectAll}
              className="rounded"
            />
            <span className="text-xs text-muted-foreground">
              {selectedIds.size > 0
                ? `${selectedIds.size} selected`
                : `${spools.length} archived spool(s)`}
            </span>
          </div>
          {selectedIds.size > 0 && (
            <div className="flex gap-1.5">
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                onClick={handleBulkRestore}
              >
                Restore
              </Button>
              <Button
                size="sm"
                variant="destructive"
                className="h-7 text-xs"
                onClick={handleBulkDelete}
              >
                Delete {selectedIds.size}
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Empty state */}
      {spools.length === 0 && (
        <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
          {isArchiveView ? "No archived spools." : isDraftView ? "No draft spools — all good!" : "No spools found."}
        </div>
      )}

      {/* Grid view */}
      {initialView === "grid" && spools.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
          {spools.map((spool) =>
            isDraftView ? (
              <div key={spool.id} className="relative rounded-xl border-2 border-warning/60 overflow-hidden">
                <SpoolCard spool={spool} />
                <div className="absolute top-2 left-2">
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-2xs font-bold uppercase tracking-wide bg-warning/15 text-warning border border-warning/30">
                    Draft
                  </span>
                </div>
                <div className="px-2 pb-2">
                  <IdentifySpoolDialog spool={spool} filaments={allFilaments} />
                </div>
              </div>
            ) : isArchiveView ? (
              <div key={spool.id} className="relative">
                <input
                  type="checkbox"
                  checked={selectedIds.has(spool.id)}
                  onChange={() => toggleSelect(spool.id)}
                  className="absolute top-2 left-2 z-10 rounded"
                />
                <SpoolCard spool={spool} />
                <div className="flex gap-1 mt-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 text-[10px] flex-1"
                    onClick={() => handleRestoreOne(spool.id)}
                  >
                    Restore
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 text-[10px] flex-1 text-destructive"
                    onClick={() => handleDeleteOne(spool.id)}
                  >
                    Delete
                  </Button>
                </div>
              </div>
            ) : (
              <SpoolCard
                key={spool.id}
                spool={spool}
                onClick={useInspector ? setInspectorSpoolId : undefined}
              />
            )
          )}
        </div>
      )}

      {/* List view */}
      {initialView === "list" && spools.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              {isArchiveView && <TableHead className="w-8"></TableHead>}
              <TableHead className="w-8">Color</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Material</TableHead>
              <TableHead>Vendor</TableHead>
              <TableHead>Remaining</TableHead>
              <TableHead>Location</TableHead>
              <TableHead>Price</TableHead>
              {(isArchiveView || isDraftView) && <TableHead className="w-24">Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {spools.map((spool) => {
              const colorHex = spool.filament.colorHex ?? "888888";
              return (
                <TableRow
                  key={spool.id}
                  className={useInspector ? "cursor-pointer" : undefined}
                  onClick={
                    useInspector
                      ? () => setInspectorSpoolId(spool.id)
                      : undefined
                  }
                >
                  {isArchiveView && (
                    <TableCell
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        type="checkbox"
                        checked={selectedIds.has(spool.id)}
                        onChange={() => toggleSelect(spool.id)}
                        className="rounded"
                      />
                    </TableCell>
                  )}
                  <TableCell>
                    <SpoolColorDot hex={colorHex} size="sm" />
                  </TableCell>
                  <TableCell className="font-medium text-xs">
                    <div className="flex items-center gap-1.5">
                      {spool.filament.name}
                      {isDraftView && (
                        <span className="inline-flex items-center px-1 py-0.5 rounded text-2xs font-bold uppercase tracking-wide bg-warning/15 text-warning border border-warning/30">
                          Draft
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <SpoolMaterialBadge material={spool.filament.material} />
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {spool.filament.vendor.name}
                  </TableCell>
                  <TableCell className="min-w-[120px]">
                    <div className="space-y-1">
                      <SpoolProgressBar
                        remaining={spool.remainingWeight}
                        initial={spool.initialWeight}
                      />
                      <span className="font-mono text-xs text-muted-foreground">
                        {spool.remainingWeight}g / {spool.initialWeight}g
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {spool.location ?? "—"}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {spool.purchasePrice
                      ? `${spool.purchasePrice} ${spool.currency ?? "EUR"}`
                      : "—"}
                  </TableCell>
                  {isDraftView && (
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <IdentifySpoolDialog spool={spool} filaments={allFilaments} />
                    </TableCell>
                  )}
                  {isArchiveView && (
                    <TableCell
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 text-[10px] px-1.5"
                          onClick={() => handleRestoreOne(spool.id)}
                        >
                          Restore
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 text-[10px] px-1.5 text-destructive"
                          onClick={() => handleDeleteOne(spool.id)}
                        >
                          Delete
                        </Button>
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      {/* Spool Inspector — slide-in panel on desktop, bottom sheet on mobile */}
      <SpoolInspectorContainer
        spoolId={inspectorSpoolId}
        open={inspectorSpoolId !== null}
        onClose={() => setInspectorSpoolId(null)}
      />
    </div>
  );
}
