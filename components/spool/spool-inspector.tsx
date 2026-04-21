"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { X, Pencil, Move, Archive, ShoppingCart } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SpoolInspectorActions {
  onEdit?: () => void;
  onMove?: () => void;
  onArchive?: () => void;
  onAddToShoppingList?: () => void;
}

interface SpoolInspectorProps extends SpoolInspectorActions {
  open: boolean;
  onClose: () => void;
  /** Optional subtitle rendered under the "Spool details" header. */
  headerSubtitle?: string;
  /** The body content — slotted in by piece 2+ (hero, remaining card, detail sections). */
  children?: ReactNode;
}

/**
 * Slide-in Spool Inspector panel.
 *
 * Desktop (≥ md): 520px right-slide panel with scrim overlay.
 * Mobile (< md): full-height bottom-up sheet (≈ 88vh tall, rounded top edges).
 *
 * Animation: 180ms ease-out on transform (translateX desktop / translateY mobile).
 * Body is slotted via children; chrome (header + footer) lives here.
 */
export function SpoolInspector({
  open,
  onClose,
  headerSubtitle,
  children,
  onEdit,
  onMove,
  onArchive,
  onAddToShoppingList,
}: SpoolInspectorProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  // Escape key closes. Attach only when open so stale handlers don't linger.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Lock body scroll while the panel is open so the page doesn't scroll
  // underneath the scrim on desktop.
  useEffect(() => {
    if (!open) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = original;
    };
  }, [open]);

  return (
    <>
      {/* Scrim — z-[60] so it covers the fixed bottom-nav (z-50) on mobile */}
      <div
        aria-hidden
        onClick={onClose}
        className={cn(
          "fixed inset-0 z-[60] bg-black/20 transition-opacity duration-150 ease-out",
          open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none",
        )}
      />

      {/* Panel */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="spool-inspector-title"
        className={cn(
          "fixed z-[70] bg-card text-foreground shadow-2xl flex flex-col",
          "transition-[transform,opacity] duration-200 ease-out will-change-transform",
          // Mobile layout: bottom sheet at the viewport edge, full width,
          // ≤88vh, rounded top. The panel covers the bottom-nav area visually
          // (z-70 > scrim z-60 > nav z-50); no vertical offset is needed.
          // Internal padding on the footer reserves space for the iPhone
          // safe-area below the action bar.
          "left-0 right-0 bottom-0 max-h-[88vh] rounded-t-2xl border-t border-border",
          // Desktop layout: right-slide panel, 520px wide, full height
          "md:left-auto md:top-0 md:bottom-0 md:w-[520px] md:max-h-none md:rounded-t-none md:border-t-0 md:border-l",
          // State: open = translate 0 + full opacity; closed = pushed fully
          // off-viewport (200% overshoot so rounded top + shadow never peek)
          // AND opacity-0 as a safety net so any missed pixels are invisible.
          open
            ? "translate-x-0 translate-y-0 opacity-100"
            : "translate-y-[200%] md:translate-y-0 md:translate-x-full pointer-events-none opacity-0",
        )}
      >
        {/* Header */}
        <header className="flex items-start justify-between gap-4 px-5 py-4 border-b border-border shrink-0">
          <div className="min-w-0">
            <h2
              id="spool-inspector-title"
              className="text-lg font-bold tracking-tight leading-tight"
            >
              Spool details
            </h2>
            {headerSubtitle && (
              <p className="text-2xs text-muted-foreground mt-0.5 truncate">
                {headerSubtitle}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            aria-label="Close inspector"
          >
            <X className="w-4 h-4" />
          </button>
        </header>

        {/* Body — slotted, scrolls */}
        <div className="flex-1 overflow-y-auto px-5 py-5">
          {children ?? <EmptyBody />}
        </div>

        {/* Footer — action bar. pb-safe keeps the buttons above the iPhone home indicator. */}
        <footer className="flex items-center gap-2 px-5 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] border-t border-border shrink-0 bg-card/95 backdrop-blur-sm">
          <FooterAction icon={Pencil} label="Edit" onClick={onEdit} />
          <FooterAction icon={Move} label="Move to…" onClick={onMove} />
          <div className="flex-1" />
          <FooterAction
            icon={Archive}
            label="Archive"
            onClick={onArchive}
            variant="destructive"
          />
          <FooterAction
            icon={ShoppingCart}
            label="Add to list"
            onClick={onAddToShoppingList}
            variant="primary"
          />
        </footer>
      </div>
    </>
  );
}

// ── Footer action button ────────────────────────────────────────────────────

function FooterAction({
  icon: Icon,
  label,
  onClick,
  variant,
}: {
  icon: typeof X;
  label: string;
  onClick?: () => void;
  variant?: "primary" | "destructive";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={cn(
        "inline-flex items-center gap-1.5 h-9 px-3 rounded-lg text-sm font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed",
        !variant &&
          "bg-transparent text-foreground hover:bg-muted border border-border",
        variant === "primary" &&
          "bg-primary text-primary-foreground hover:bg-primary/90",
        variant === "destructive" &&
          "bg-transparent text-destructive border border-destructive/50 hover:bg-destructive/10",
      )}
    >
      <Icon className="w-3.5 h-3.5 shrink-0" />
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

// ── Placeholder body (replaced by piece 2+) ─────────────────────────────────

function EmptyBody() {
  return (
    <div className="h-full min-h-[300px] flex items-center justify-center">
      <div className="text-center space-y-2 max-w-xs">
        <div className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
          Inspector shell · piece 1
        </div>
        <p className="text-sm text-muted-foreground">
          Hero (color ring + SVG progress arc), Remaining card, 3-up stats, and
          grouped detail sections will land here in pieces 2–4.
        </p>
      </div>
    </div>
  );
}
