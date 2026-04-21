"use client";

import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

// ── Section wrapper ────────────────────────────────────────────────────────

export function DetailSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-1">
      <div className="text-2xs font-bold uppercase tracking-wider text-muted-foreground pb-2 border-b border-border">
        {title}
      </div>
      <div className="flex flex-col">{children}</div>
    </section>
  );
}

// ── Kv row (key/value line inside a section) ───────────────────────────────

interface KvRowProps {
  label: string;
  value: ReactNode;
  /** Render value in monospaced font (tabular) — for IDs, tags, hex. */
  mono?: boolean;
  /** Show a chevron + make the row interactive. */
  chevron?: boolean;
  /** If provided, wraps the row in an anchor (external link, new tab). */
  href?: string;
  /** If provided (and no href), wraps the row in a button. */
  onClick?: () => void;
  /** Hide the bottom divider — usually the last row in a section. */
  isLast?: boolean;
}

export function KvRow({
  label,
  value,
  mono,
  chevron,
  href,
  onClick,
  isLast,
}: KvRowProps) {
  const inner = (
    <div
      className={cn(
        "flex items-center gap-3 py-2 min-h-[32px] px-0.5",
        !isLast && "border-b border-border",
      )}
    >
      <div className="text-sm text-muted-foreground">{label}</div>
      <div
        className={cn(
          "ml-auto text-sm text-foreground text-right break-words",
          mono && "font-[family-name:var(--font-geist-mono)] tabular-nums",
        )}
      >
        {value}
      </div>
      {chevron && (
        <ChevronRight
          className="w-3.5 h-3.5 text-muted-foreground shrink-0"
          aria-hidden
        />
      )}
    </div>
  );

  const interactiveClasses =
    "block w-full text-left rounded -mx-2 px-2 hover:bg-muted/50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring";

  if (href) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={interactiveClasses}
      >
        {inner}
      </a>
    );
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={interactiveClasses}>
        {inner}
      </button>
    );
  }
  return inner;
}

// ── Usage history row (4-column grid) ──────────────────────────────────────

interface UsageHistoryRowProps {
  printName: string;
  grams: number;
  cost: number | null;
  /** Preformatted relative time, e.g. "3d ago" or "Yesterday". */
  dateLabel: string;
  /** Hide the bottom divider — usually the last row in the section. */
  isLast?: boolean;
  onClick?: () => void;
}

export function UsageHistoryRow({
  printName,
  grams,
  cost,
  dateLabel,
  isLast,
  onClick,
}: UsageHistoryRowProps) {
  const inner = (
    <div
      className={cn(
        "flex items-center gap-3 py-2 min-h-[32px] px-0.5",
        !isLast && "border-b border-border",
      )}
    >
      <div className="flex-1 min-w-0 text-sm truncate">{printName}</div>
      <div className="text-sm font-[family-name:var(--font-geist-mono)] tabular-nums text-right shrink-0 w-14">
        {Math.round(grams)}g
      </div>
      <div className="text-sm font-[family-name:var(--font-geist-mono)] tabular-nums text-right shrink-0 w-16 text-muted-foreground">
        {cost !== null ? `€${cost.toFixed(2)}` : "—"}
      </div>
      <div className="text-2xs text-muted-foreground text-right shrink-0 w-16">
        {dateLabel}
      </div>
    </div>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="block w-full text-left rounded -mx-2 px-2 hover:bg-muted/50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {inner}
      </button>
    );
  }
  return inner;
}
