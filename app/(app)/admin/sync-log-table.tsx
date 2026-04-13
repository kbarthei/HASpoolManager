"use client";

import { Fragment, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatDateTime } from "@/lib/date";
import type { SyncLogFilter } from "@/app/api/v1/admin/sync-log/route";

// ── Types ──────────────────────────────────────────────────────────────────

interface SyncLogEntry {
  id: string;
  rawState: string | null;
  normalizedState: string | null;
  printTransition: string | null;
  printName: string | null;
  printError: boolean | null;
  slotsUpdated: number | null;
  responseJson: string | null;
  createdAt: string | null;
}

interface SyncLogResponse {
  entries: SyncLogEntry[];
  total: number;
  page: number;
  limit: number;
}

// ── Helpers ────────────────────────────────────────────────────────────────

const LIMIT = 50;

function relativeTime(date: string | null): string {
  if (!date) return "—";
  const now = Date.now();
  const then = new Date(date).getTime();
  const diffSec = Math.floor((now - then) / 1000);
  if (diffSec < 60) return `${diffSec}s ago`;
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  return `${Math.floor(diffSec / 86400)}d ago`;
}

function TransitionBadge({ transition }: { transition: string | null }) {
  if (!transition || transition === "none")
    return <span className="text-muted-foreground/40">–</span>;

  const colors: Record<string, string> = {
    started: "bg-primary/15 text-primary border-primary/30",
    finished: "bg-green-500/15 text-green-600 border-green-500/30",
    failed: "bg-red-500/15 text-red-600 border-red-500/30",
  };

  return (
    <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${colors[transition] ?? ""}`}>
      {transition}
    </Badge>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────

export function SyncLogTable() {
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState<SyncLogFilter>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Auto-refresh only on page 1 with filter "all"
  const autoRefresh = page === 1 && filter === "all";

  const { data, isFetching, refetch } = useQuery<SyncLogResponse>({
    queryKey: ["sync-log", page, filter],
    queryFn: async () => {
      const res = await fetch(
        `/api/v1/admin/sync-log?page=${page}&limit=${LIMIT}&filter=${filter}`
      );
      if (!res.ok) throw new Error("Failed to fetch sync log");
      return res.json();
    },
    refetchInterval: autoRefresh ? 15_000 : false,
    staleTime: autoRefresh ? 0 : 30_000,
  });

  const entries = data?.entries ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / LIMIT));

  function handleFilterChange(value: string | null) {
    if (!value) return;
    setFilter(value as SyncLogFilter);
    setPage(1);
    setExpandedId(null);
  }

  return (
    <div className="space-y-3">
      {/* ── Header row ───────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold">Sync Log</h2>

        <div className="flex items-center gap-2">
          {/* Filter select */}
          <Select value={filter} onValueChange={handleFilterChange}>
            <SelectTrigger size="sm" className="h-7 text-xs min-w-[130px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="end">
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="transitions">Transitions only</SelectItem>
              <SelectItem value="active">Active states</SelectItem>
            </SelectContent>
          </Select>

          {/* Total count */}
          <span className="text-xs text-muted-foreground tabular-nums whitespace-nowrap">
            {total.toLocaleString()} entries
          </span>

          {/* Auto-refresh indicator */}
          {autoRefresh && (
            <span className="text-[10px] text-muted-foreground/60 whitespace-nowrap hidden sm:inline">
              Auto-refreshing
            </span>
          )}

          {/* Refresh button */}
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => refetch()}
            disabled={isFetching}
            title="Refresh"
            aria-label="Refresh sync log"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`}
            />
          </Button>
        </div>
      </div>

      {/* ── Table ───────────────────────────────────────────────────── */}
      {entries.length === 0 && !isFetching ? (
        <p className="text-xs text-muted-foreground py-4 text-center">No syncs recorded yet.</p>
      ) : (
        <div className="overflow-x-auto -mx-4 px-4">
          <table className="w-full text-xs min-w-[560px]">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left font-medium text-muted-foreground pb-2 pr-3 font-mono">Time</th>
                <th className="text-left font-medium text-muted-foreground pb-2 pr-3 font-mono">Raw</th>
                <th className="text-left font-medium text-muted-foreground pb-2 pr-3 font-mono">Normalized</th>
                <th className="text-left font-medium text-muted-foreground pb-2 pr-3">Transition</th>
                <th className="text-left font-medium text-muted-foreground pb-2 pr-3">Print Name</th>
                <th className="text-center font-medium text-muted-foreground pb-2 pr-3">Err</th>
                <th className="text-right font-medium text-muted-foreground pb-2">Slots</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {entries.map((log) => {
                const isExpanded = expandedId === log.id;
                let parsed: Record<string, unknown> | null = null;
                if (isExpanded && log.responseJson) {
                  try {
                    parsed = JSON.parse(log.responseJson);
                  } catch {
                    /* ignore */
                  }
                }

                return (
                  <Fragment key={log.id}>
                    <tr
                      className="hover:bg-muted/30 transition-colors cursor-pointer group"
                      onClick={() => setExpandedId(isExpanded ? null : log.id)}
                    >
                      <td
                        className="py-1.5 pr-3 font-mono text-muted-foreground whitespace-nowrap"
                        title={formatDateTime(log.createdAt)}
                      >
                        <div>{relativeTime(log.createdAt)}</div>
                        {isExpanded && (
                          <div className="text-[10px] text-muted-foreground/60 mt-0.5">
                            {formatDateTime(log.createdAt)}
                          </div>
                        )}
                      </td>
                      <td className="py-1.5 pr-3 font-mono text-muted-foreground">
                        {log.rawState ?? "—"}
                      </td>
                      <td className="py-1.5 pr-3 font-mono text-foreground font-semibold">
                        {log.normalizedState ?? "—"}
                      </td>
                      <td className="py-1.5 pr-3">
                        <TransitionBadge transition={log.printTransition} />
                      </td>
                      <td className="py-1.5 pr-3 max-w-[160px]">
                        <span
                          className="truncate block text-muted-foreground"
                          title={log.printName ?? undefined}
                        >
                          {log.printName || "—"}
                        </span>
                      </td>
                      <td className="py-1.5 pr-3 text-center">
                        {log.printError ? (
                          <span className="text-red-500 font-medium">✕</span>
                        ) : (
                          <span className="text-muted-foreground/40">—</span>
                        )}
                      </td>
                      <td className="py-1.5 text-right font-mono text-muted-foreground">
                        {log.slotsUpdated ?? 0}
                        <span className="ml-1 text-muted-foreground/30 opacity-0 group-hover:opacity-100 transition-opacity">
                          {isExpanded ? "▾" : "▸"}
                        </span>
                      </td>
                    </tr>
                    {isExpanded && parsed && (
                      <tr>
                        <td colSpan={7} className="pb-3 pt-0">
                          <pre className="text-[10px] font-mono bg-muted/50 rounded-md p-3 overflow-x-auto max-h-[300px] overflow-y-auto whitespace-pre-wrap break-all">
                            {JSON.stringify(parsed, null, 2)}
                          </pre>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Pagination ──────────────────────────────────────────────── */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-1">
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() => {
              setPage((p) => p - 1);
              setExpandedId(null);
            }}
            disabled={page <= 1 || isFetching}
          >
            ← Prev
          </Button>

          <span className="text-xs text-muted-foreground tabular-nums">
            Page {page} of {totalPages}
          </span>

          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() => {
              setPage((p) => p + 1);
              setExpandedId(null);
            }}
            disabled={page >= totalPages || isFetching}
          >
            Next →
          </Button>
        </div>
      )}
    </div>
  );
}
