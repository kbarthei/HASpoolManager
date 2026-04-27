"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { CheckCircle2, AlertTriangle } from "lucide-react";
import { cleanupOrphanPhotosAction } from "@/lib/actions";
import type { OrphanPhotosSummary } from "@/lib/diagnostics";

interface OrphanPhotosCardProps {
  initial: OrphanPhotosSummary;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function OrphanPhotosCard({ initial }: OrphanPhotosCardProps) {
  const [summary, setSummary] = useState(initial);
  const [pending, startTransition] = useTransition();
  const clean = summary.count === 0;

  function handleCleanup() {
    if (
      !confirm(
        `Delete ${summary.fileCount + summary.legacyCount} orphan files (${formatSize(summary.bytes)}) and clean up ${summary.deadEntryCount} dead photo references?`,
      )
    )
      return;
    startTransition(async () => {
      const result = await cleanupOrphanPhotosAction();
      if (!result.ok) {
        toast.error(result.error ?? "Cleanup failed");
        return;
      }
      toast.success(
        `Cleaned ${result.filesDeleted ?? 0} files (${formatSize(result.bytesReclaimed ?? 0)}), ${result.deadEntriesRemoved ?? 0} dead refs, ${result.emptyDirsRemoved ?? 0} empty dirs`,
      );
      setSummary({
        count: 0,
        fileCount: 0,
        deadEntryCount: 0,
        legacyCount: 0,
        bytes: 0,
        preview: [],
      });
    });
  }

  return (
    <Card className="p-4 space-y-3" data-testid="issue-orphan-photos">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold flex items-center gap-1.5">
            {clean ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-amber-500" />
            )}
            Orphan photos
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
            Files on disk no print references, plus DB entries pointing at deleted files. Includes the legacy /config/snapshots/ directory.
          </p>
        </div>
        <Badge
          className={cn(
            "text-[11px] h-6 px-2 font-mono shrink-0",
            clean
              ? "bg-emerald-500/15 text-emerald-600 border-emerald-500/30"
              : "bg-amber-500/15 text-amber-600 border-amber-500/30",
          )}
          data-testid="issue-orphan-photos-count"
        >
          {summary.count}
        </Badge>
      </div>

      {!clean && (
        <>
          <div className="grid grid-cols-3 gap-2 text-2xs">
            <div className="rounded-md bg-muted px-2 py-1.5">
              <div className="text-muted-foreground">Orphan files</div>
              <div className="font-[family-name:var(--font-geist-mono)] tabular-nums font-semibold">
                {summary.fileCount + summary.legacyCount}
              </div>
            </div>
            <div className="rounded-md bg-muted px-2 py-1.5">
              <div className="text-muted-foreground">Dead refs</div>
              <div className="font-[family-name:var(--font-geist-mono)] tabular-nums font-semibold">
                {summary.deadEntryCount}
              </div>
            </div>
            <div className="rounded-md bg-muted px-2 py-1.5">
              <div className="text-muted-foreground">Reclaim</div>
              <div className="font-[family-name:var(--font-geist-mono)] tabular-nums font-semibold">
                {formatSize(summary.bytes)}
              </div>
            </div>
          </div>

          {summary.preview.length > 0 && (
            <div className="space-y-1 text-2xs text-muted-foreground border-t border-border pt-2">
              {summary.preview.map((row, i) => (
                <div key={i} className="flex items-center justify-between gap-2">
                  <span className="truncate">{row.label}</span>
                  {row.meta && (
                    <span className="font-[family-name:var(--font-geist-mono)] tabular-nums shrink-0">
                      {row.meta}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}

          <button
            type="button"
            onClick={handleCleanup}
            disabled={pending}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-amber-500/15 text-amber-600 hover:bg-amber-500/25 text-xs font-medium disabled:opacity-50"
            data-testid="issue-orphan-photos-cleanup"
          >
            <Trash2 className="w-3.5 h-3.5" />
            {pending ? "Cleaning…" : "Cleanup now"}
          </button>
        </>
      )}

      {clean && <p className="text-2xs text-emerald-600/80">All clear.</p>}
    </Card>
  );
}
