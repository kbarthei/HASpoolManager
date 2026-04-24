"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { triggerBackupAction, deleteBackupAction } from "@/lib/actions";
import { Download, Trash2, PlayCircle } from "lucide-react";

interface BackupRow {
  filename: string;
  size: number;
  createdAt: string;
}

interface BackupsTableProps {
  backups: BackupRow[];
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function BackupsTable({ backups }: BackupsTableProps) {
  const [pending, startTransition] = useTransition();
  const [deletingName, setDeletingName] = useState<string | null>(null);

  async function handleBackupNow() {
    startTransition(async () => {
      const result = await triggerBackupAction();
      if (result.ok) {
        toast.success(`Backup created: ${result.filename} (${formatSize(result.size ?? 0)})`);
      } else {
        toast.error(result.error ?? "Backup failed");
      }
    });
  }

  async function handleDelete(filename: string) {
    if (!confirm(`Delete backup ${filename}?`)) return;
    setDeletingName(filename);
    const result = await deleteBackupAction(filename);
    setDeletingName(null);
    if (result.ok) {
      toast.success(`Deleted ${filename}`);
    } else {
      toast.error(result.error ?? "Delete failed");
    }
  }

  return (
    <div className="space-y-2">
      <button
        onClick={handleBackupNow}
        disabled={pending}
        className="w-full flex items-center justify-center gap-2 text-xs py-2 px-3 rounded-md bg-primary/10 border border-primary/20 hover:bg-primary/15 text-primary font-medium disabled:opacity-50 disabled:cursor-not-allowed"
        data-testid="backup-now-btn"
      >
        <PlayCircle className="w-3.5 h-3.5" />
        {pending ? "Running backup…" : "Backup now"}
      </button>

      {backups.length === 0 ? (
        <p className="text-xs text-muted-foreground py-2">No backups yet — one will run automatically, or click above.</p>
      ) : (
        <div className="divide-y divide-border border border-border rounded-md">
          {backups.map((b) => (
            <div key={b.filename} className="flex items-center gap-2 text-xs py-1.5 px-2">
              <div className="flex-1 min-w-0">
                <p className="truncate font-mono text-2xs">{b.filename}</p>
                <p className="text-muted-foreground text-2xs mt-0.5">
                  {formatTime(b.createdAt)} · {formatSize(b.size)}
                </p>
              </div>
              <a
                href={`/api/v1/admin/backup/${encodeURIComponent(b.filename)}`}
                className="inline-flex items-center gap-1 text-primary hover:underline shrink-0"
                title="Download"
              >
                <Download className="w-3.5 h-3.5" />
              </a>
              <button
                onClick={() => handleDelete(b.filename)}
                disabled={deletingName === b.filename}
                className="inline-flex items-center gap-1 text-muted-foreground hover:text-destructive shrink-0 disabled:opacity-50"
                title="Delete"
                data-testid={`backup-delete-${b.filename}`}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
