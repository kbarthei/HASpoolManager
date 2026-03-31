"use client";

import { Fragment, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/date";

interface SyncLogEntry {
  id: string;
  rawState: string | null;
  normalizedState: string | null;
  printTransition: string | null;
  printName: string | null;
  printError: boolean | null;
  slotsUpdated: number | null;
  responseJson: string | null;
  createdAt: Date | string | null;
}

function relativeTime(date: Date | string | null): string {
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

export function SyncLogTable({ logs }: { logs: SyncLogEntry[] }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (logs.length === 0) {
    return <p className="text-xs text-muted-foreground py-4 text-center">No syncs recorded yet.</p>;
  }

  return (
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
          {logs.map((log) => {
            const isExpanded = expandedId === log.id;
            let parsed: Record<string, unknown> | null = null;
            if (isExpanded && log.responseJson) {
              try { parsed = JSON.parse(log.responseJson); } catch { /* ignore */ }
            }

            return (
              <Fragment key={log.id}>
              <tr
                className="hover:bg-muted/30 transition-colors cursor-pointer group"
                onClick={() => setExpandedId(isExpanded ? null : log.id)}
              >
                <td className="py-1.5 pr-3 font-mono text-muted-foreground whitespace-nowrap" title={formatDateTime(log.createdAt)}>
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
                  <span className="truncate block text-muted-foreground" title={log.printName ?? undefined}>
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
  );
}
