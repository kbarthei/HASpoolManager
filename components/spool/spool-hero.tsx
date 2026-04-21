"use client";

import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

export interface SpoolHeroProps {
  colorHex: string | null;
  filamentName: string;
  vendorName: string;
  material: string;
  diameterMm?: number | null;
  initialWeightG?: number | null;
  remainingPct: number;
  /** Eyebrow location: e.g. "Rack · R2·5" or "AMS · Slot 1". */
  locationLabel: string;
  /** Optional secondary state after the location: "selected", "active", "drying". */
  locationState?: string | null;
  /** Identifier source for the third badge: RFID, ΔE, manual. Omit if unknown. */
  idSource?: "RFID" | "ΔE" | "manual" | null;
}

const RADIUS = 58;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function SpoolHero({
  colorHex,
  filamentName,
  vendorName,
  material,
  diameterMm,
  initialWeightG,
  remainingPct,
  locationLabel,
  locationState,
  idSource,
}: SpoolHeroProps) {
  // Sanitize filament hex
  const rawHex = colorHex ?? "";
  const validHex = /^#?[0-9A-Fa-f]{6,8}$/.test(rawHex);
  const swatchColor = validHex
    ? rawHex.startsWith("#")
      ? rawHex.slice(0, 7)
      : `#${rawHex.slice(0, 6)}`
    : "#e5e5ea";
  const isLight = validHex && isColorLight(swatchColor);

  const pct = Math.max(0, Math.min(100, remainingPct));
  const dashOffset = CIRCUMFERENCE * (1 - pct / 100);

  const subtitleParts = [
    vendorName,
    material,
    diameterMm ? `${diameterMm.toFixed(2)} mm` : null,
    initialWeightG ? formatWeight(initialWeightG) : null,
  ].filter(Boolean);

  return (
    <div className="flex items-center gap-6">
      {/* Swatch + ring */}
      <div className="relative w-[110px] h-[110px] shrink-0">
        {/* Filament disk */}
        <div
          className={cn(
            "absolute inset-0 rounded-full",
            isLight && "border border-border",
          )}
          style={{
            backgroundColor: swatchColor,
            boxShadow:
              "inset 0 0 0 10px rgba(255,255,255,0.18), inset 0 0 14px rgba(0,0,0,0.22)",
          }}
          aria-hidden
        />
        {/* Hub — inner spool centre */}
        <div
          className="absolute bg-muted border border-border rounded-[6px]"
          style={{ inset: "38px" }}
          aria-hidden
        />
        {/* Progress arc — SVG overlay, 122×122 at offset -6,-6 so it wraps just outside the swatch */}
        <svg
          viewBox="0 0 122 122"
          className="absolute w-[122px] h-[122px] -top-[6px] -left-[6px] pointer-events-none overflow-visible"
          aria-hidden
        >
          {/* Track */}
          <circle
            cx="61"
            cy="61"
            r={RADIUS}
            fill="none"
            stroke="var(--border)"
            strokeWidth="2"
          />
          {/* Progress */}
          <circle
            cx="61"
            cy="61"
            r={RADIUS}
            fill="none"
            stroke="var(--primary)"
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={dashOffset}
            transform="rotate(-90 61 61)"
            className="transition-[stroke-dashoffset] duration-500 ease-out"
          />
        </svg>
      </div>

      {/* Identity */}
      <div className="min-w-0 flex-1">
        <div className="text-2xs font-bold uppercase tracking-wider text-muted-foreground">
          <span>{locationLabel}</span>
          {locationState && (
            <span className="ml-1 text-ink-2 normal-case tracking-normal font-medium">
              · {locationState}
            </span>
          )}
        </div>
        <h2 className="text-2xl font-bold tracking-tight leading-tight mt-1 truncate">
          {filamentName}
        </h2>
        <p className="text-sm text-muted-foreground mt-1 truncate">
          {subtitleParts.join(" · ")}
        </p>
        <div className="flex items-center gap-1.5 mt-3 flex-wrap">
          <HeroBadge>{material}</HeroBadge>
          <HeroBadge>{locationLabel}</HeroBadge>
          {idSource && <HeroBadge variant="subtle">{idSource}</HeroBadge>}
        </div>
      </div>
    </div>
  );
}

// ── Bits ────────────────────────────────────────────────────────────────────

function HeroBadge({
  children,
  variant,
}: {
  children: ReactNode;
  variant?: "subtle";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded-full text-2xs font-semibold border",
        variant === "subtle"
          ? "border-border/60 text-muted-foreground bg-transparent"
          : "border-border text-ink-2 bg-card",
      )}
    >
      {children}
    </span>
  );
}

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

function formatWeight(g: number): string {
  if (g >= 1000) {
    const kg = g / 1000;
    return kg === Math.trunc(kg) ? `${kg} kg` : `${kg.toFixed(1)} kg`;
  }
  return `${g} g`;
}
