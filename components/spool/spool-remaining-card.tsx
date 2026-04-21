"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

interface SpoolRemainingCardProps {
  remainingG: number;
  initialG: number;
  /** Optional: estimated prints remaining at the current consumption pace. */
  estimatedPrintsLeft?: number | null;
  /**
   * When provided, an editable slider appears below the progress bar.
   * Fires once the user releases the slider (pointer up / key up / blur) with
   * the new whole-gram value, so a save action can wire here without the
   * spam of every drag tick.
   */
  onAdjust?: (newRemainingG: number) => void;
  /**
   * Live RFID percentage reported by the printer for this spool (0–100).
   * When it differs significantly from the tracked DB value, a drift warning
   * and a "Sync from RFID" button appear so the user can reconcile.
   */
  liveRfidPct?: number | null;
}

/**
 * Remaining hero card — the "Remaining" inset block in the Spool Inspector.
 * Big primary-colored grams readout, thin progress bar, % + pace footer, and
 * (optional) a commit-on-release slider so the user can correct the reading
 * right from the detail sheet.
 */
export function SpoolRemainingCard({
  remainingG,
  initialG,
  estimatedPrintsLeft,
  onAdjust,
  liveRfidPct,
}: SpoolRemainingCardProps) {
  const editable = typeof onAdjust === "function";

  // React's recommended pattern for "reset local state when a prop changes":
  // track the previous prop value and update during render. Replaces the
  // effect-based reset that the react-hooks/set-state-in-effect rule flags.
  const [draftG, setDraftG] = useState(remainingG);
  const [prevRemainingG, setPrevRemainingG] = useState(remainingG);
  if (remainingG !== prevRemainingG) {
    setPrevRemainingG(remainingG);
    setDraftG(remainingG);
  }

  const effectiveG = editable ? draftG : remainingG;
  const clampedRemaining = Math.max(0, effectiveG);
  const intGrams = Math.trunc(clampedRemaining);
  const decimals = Math.round((clampedRemaining - intGrams) * 100);
  const decimalStr = decimals > 0 ? `.${String(decimals).padStart(2, "0")}g` : "g";

  const pct =
    initialG > 0
      ? Math.max(0, Math.min(100, (clampedRemaining / initialG) * 100))
      : 0;

  const commit = () => {
    if (!editable) return;
    onAdjust!(Math.round(draftG));
  };

  return (
    <div className="bg-muted rounded-xl p-4">
      <div className="flex items-baseline justify-between gap-2">
        <div className="text-2xs font-bold uppercase tracking-wider text-muted-foreground">
          Remaining
        </div>
        {editable && draftG !== remainingG && (
          <div className="text-2xs font-semibold text-primary">
            Adjusting…
          </div>
        )}
      </div>

      <div className="flex items-baseline gap-1 mt-1.5">
        <span
          className="font-bold leading-none text-primary"
          style={{ fontSize: "46px", letterSpacing: "-1.2px" }}
        >
          {intGrams}
        </span>
        <span
          className="font-bold text-primary"
          style={{ fontSize: "22px", letterSpacing: "-0.4px" }}
        >
          {decimalStr}
        </span>
        <span className="ml-auto text-sm text-muted-foreground">
          of {initialG.toLocaleString()} g
        </span>
      </div>

      <div className="mt-3 relative">
        <div className="h-[5px] rounded-full bg-background/60 overflow-hidden">
          <div
            className={cn(
              "h-full rounded-full bg-primary",
              !editable && "transition-all duration-300 ease-out",
            )}
            style={{ width: `${pct}%` }}
          />
        </div>
        {editable && (
          <input
            type="range"
            min={0}
            max={initialG}
            step={1}
            value={Math.round(draftG)}
            onChange={(e) => setDraftG(Number(e.target.value))}
            onPointerUp={commit}
            onKeyUp={(e) => {
              const commitKeys = [
                "ArrowLeft",
                "ArrowRight",
                "ArrowUp",
                "ArrowDown",
                "Home",
                "End",
                "PageUp",
                "PageDown",
                "Enter",
              ];
              if (commitKeys.includes(e.key)) commit();
            }}
            onBlur={commit}
            className="spool-adjust-overlay"
            aria-label="Adjust remaining filament weight"
          />
        )}
      </div>

      <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
        <span>{Math.round(pct)}% left</span>
        {typeof estimatedPrintsLeft === "number" && estimatedPrintsLeft > 0 && (
          <>
            <span className="opacity-50">·</span>
            <span>
              ≈ {estimatedPrintsLeft} more print{estimatedPrintsLeft === 1 ? "" : "s"} at current pace
            </span>
          </>
        )}
      </div>

      {/* Drift warning — when the printer's live RFID% differs materially from
          the tracked DB value. Shown only when the spool is currently in an
          AMS slot (liveRfidPct provided) AND the gap is > 10 percentage points. */}
      {typeof liveRfidPct === "number" &&
        Math.abs(liveRfidPct - pct) > 10 &&
        editable && (
          <div className="mt-3 p-2.5 rounded-lg bg-warning/10 border border-warning/30 flex items-center gap-2 text-xs">
            <span className="shrink-0 text-warning" aria-hidden>
              ⚠
            </span>
            <div className="flex-1 min-w-0">
              <span className="font-medium text-warning">
                Printer RFID reports {Math.round(liveRfidPct)}%
              </span>
              <span className="text-muted-foreground ml-1">
                · tracked weight may be off
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                const newG = Math.round((initialG * liveRfidPct) / 100);
                onAdjust!(newG);
              }}
              className="shrink-0 text-2xs font-semibold px-2 py-1 rounded-md bg-warning text-background hover:bg-warning/90 transition-colors"
            >
              Sync from RFID
            </button>
          </div>
        )}
    </div>
  );
}
