"use client";

import { cn } from "@/lib/utils";
import { MaterialPill } from "./material-pill";

export interface RackCardSpool {
  id: string;
  remainingWeight: number;
  initialWeight: number;
  filament: {
    name: string;
    material: string;
    colorHex: string | null;
    vendor: { name: string };
  };
}

interface RackSpoolCardProps {
  spool: RackCardSpool | null;
  selected?: boolean;
  onClick?: () => void;
  emptyLabel?: string;
  /** Micro coordinate label shown top-left, e.g. "R3·5". */
  coord?: string;
  /** When a filter is active, non-matching cards render dimmed. */
  dimmed?: boolean;
  /** Drag-and-drop: optional; filled cards are draggable, empty cells are drop targets. */
  isDragging?: boolean;
  isDragOver?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDrop?: (e: React.DragEvent) => void;
  onDragEnd?: (e: React.DragEvent) => void;
}

export function RackSpoolCard({
  spool,
  selected,
  onClick,
  emptyLabel,
  coord,
  dimmed,
  isDragging,
  isDragOver,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: RackSpoolCardProps) {
  if (!spool) {
    return (
      <button
        type="button"
        onClick={onClick}
        onDragOver={onDragOver}
        onDrop={onDrop}
        className={cn(
          "relative h-[52px] md:h-[60px] w-full rounded-lg border border-dashed border-border",
          "flex items-center justify-center transition-colors",
          "hover:border-primary/60 hover:bg-primary/5",
          selected && "border-[1.5px] border-primary shadow-[0_0_0_3px_rgba(48,176,199,0.18)]",
          dimmed && "opacity-30 hover:opacity-60",
          isDragOver && "border-primary bg-primary/5 ring-2 ring-primary",
        )}
        aria-label={coord ? `${coord} — ${emptyLabel ?? "empty rack slot"}` : emptyLabel ?? "Empty rack slot"}
      >
        {coord && <CoordLabel value={coord} />}
        <span className="text-muted-foreground/40 text-lg leading-none select-none">+</span>
      </button>
    );
  }

  const pct =
    spool.initialWeight > 0
      ? (spool.remainingWeight / spool.initialWeight) * 100
      : 0;
  const health = healthLevel(pct);
  const dotStyle = DOT_STYLES[health];

  // Sanitize filament hex before inline style interpolation (CSS injection guard)
  const rawHex = spool.filament.colorHex ?? "";
  const validHex = /^#?[0-9A-Fa-f]{6,8}$/.test(rawHex);
  const colorHex = validHex
    ? rawHex.startsWith("#")
      ? rawHex.slice(0, 7)
      : `#${rawHex.slice(0, 6)}`
    : "#e5e5ea";
  const isLight = validHex && isColorLight(colorHex);

  return (
    <button
      type="button"
      onClick={onClick}
      draggable={!!onDragStart}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      className={cn(
        "relative h-[52px] md:h-[60px] w-full rounded-lg bg-card text-left overflow-hidden",
        "flex items-center gap-2 pl-1.5 md:pl-2 pr-2.5",
        "transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        onDragStart && "cursor-grab active:cursor-grabbing",
        selected
          ? "border-[1.5px] border-primary shadow-[0_0_0_3px_rgba(48,176,199,0.18)]"
          : "border border-border hover:border-border/80 hover:bg-accent/30",
        dimmed && "opacity-30 hover:opacity-60",
        isDragging && "opacity-40",
        isDragOver && !isDragging && "ring-2 ring-primary border-primary",
      )}
      aria-label={`${coord ? `${coord} — ` : ""}${spool.filament.vendor.name} ${spool.filament.name}, ${Math.round(spool.remainingWeight)}g remaining`}
    >
      {coord && <CoordLabel value={coord} />}
      <Swatch colorHex={colorHex} isLight={isLight} />

      <div className="flex-1 min-w-0 pr-2">
        <div className="flex items-center gap-1 min-w-0">
          <span className="text-[12px] font-semibold leading-tight truncate">
            {spool.filament.name}
          </span>
          <MaterialPill
            material={spool.filament.material}
            className="text-[9px] px-1 py-0"
          />
        </div>
        <div className="text-[10px] text-muted-foreground leading-tight truncate mt-0.5">
          <span>{spool.filament.vendor.name}</span>
          <span className="mx-1 opacity-60">·</span>
          <span className="font-[family-name:var(--font-geist-mono)] tabular-nums">
            {Math.round(spool.remainingWeight)}g
          </span>
        </div>
      </div>

      <span
        aria-hidden
        className="absolute w-[7px] h-[7px] rounded-full"
        style={{
          top: "9px",
          right: "9px",
          backgroundColor: dotStyle.bg,
          boxShadow: `0 0 0 2px ${dotStyle.halo}`,
        }}
      />
    </button>
  );
}

// ── Micro coord label ─────────────────────────────────────────────────────

function CoordLabel({ value }: { value: string }) {
  return (
    <span
      aria-hidden
      className="absolute text-[9px] leading-none font-[family-name:var(--font-geist-mono)] tabular-nums tracking-tight text-muted-foreground/70 select-none pointer-events-none"
      style={{ top: "4px", left: "5px" }}
    >
      {value}
    </span>
  );
}

// ── Swatch ────────────────────────────────────────────────────────────────

function Swatch({ colorHex, isLight }: { colorHex: string; isLight: boolean }) {
  return (
    <div
      className={cn(
        "relative w-6 h-6 md:w-7 md:h-7 rounded-full shrink-0",
        isLight && "border border-border",
      )}
      style={{
        backgroundColor: colorHex,
        boxShadow:
          "inset 0 0 0 3px rgba(255,255,255,0.18), inset 0 0 5px rgba(0,0,0,0.22)",
      }}
      aria-hidden
    >
      {/* hub — inner highlight block, reminiscent of a filament reel centre */}
      <span
        className="absolute rounded-md"
        style={{
          inset: "7px",
          backgroundColor: "rgba(255,255,255,0.35)",
        }}
      />
    </div>
  );
}

// ── Health dot ────────────────────────────────────────────────────────────

type Health = "ok" | "warn" | "low";

const DOT_STYLES: Record<Health, { bg: string; halo: string }> = {
  ok: { bg: "var(--success)", halo: "rgba(52,199,89,0.22)" },
  warn: { bg: "var(--warning)", halo: "rgba(255,149,0,0.25)" },
  low: { bg: "var(--destructive)", halo: "rgba(255,59,48,0.25)" },
};

function healthLevel(pct: number): Health {
  if (pct < 10) return "low";
  if (pct < 30) return "warn";
  return "ok";
}

// ── Color-brightness helper ────────────────────────────────────────────────

function isColorLight(hex: string): boolean {
  const h = hex.replace("#", "").slice(0, 6);
  if (h.length !== 6) return false;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  if ([r, g, b].some(Number.isNaN)) return false;
  // Perceived luminance (Rec. 709)
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum > 210;
}
