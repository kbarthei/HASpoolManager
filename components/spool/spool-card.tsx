import Link from "next/link";
import { Card } from "@/components/ui/card";
import { SpoolColorDot } from "@/components/spool/spool-color-dot";
import { SpoolProgressBar } from "@/components/spool/spool-progress-bar";
import { SpoolMaterialBadge } from "@/components/spool/spool-material-badge";
import { cn } from "@/lib/utils";

type SpoolCardData = {
  id: string;
  remainingWeight: number;
  initialWeight: number;
  location: string | null;
  purchasePrice: string | null;
  currency: string | null;
  filament: {
    name: string;
    material: string;
    colorHex: string | null;
    vendor: {
      name: string;
    };
  };
};

interface SpoolCardProps {
  spool: SpoolCardData;
  /**
   * When provided, the card renders as a button that calls this handler with
   * the spool id (used by the Spools list to open the Spool Inspector panel).
   * Otherwise the card navigates to /spools/[id] via a Link (legacy / deep-link).
   */
  onClick?: (spoolId: string) => void;
}

export function SpoolCard({ spool, onClick }: SpoolCardProps) {
  const colorHex = spool.filament.colorHex ?? "888888";
  const percent =
    spool.initialWeight > 0
      ? Math.round((spool.remainingWeight / spool.initialWeight) * 100)
      : 0;
  const isLow = percent > 0 && percent <= 20;
  const isEmpty = percent === 0;

  const body = (
    <Card
      data-testid="spool-card"
      className={cn(
        "rounded-xl p-3 hover:bg-accent/50 transition-colors gap-2 ring-0 bg-card/60 text-left",
        isLow && "ring-1 ring-warning/60",
        isEmpty && "opacity-50",
      )}
    >
      {/* Top row: color dot + material badge */}
      <div className="flex items-center gap-1.5 justify-between px-0">
        <div className="flex items-center gap-1.5">
          <SpoolColorDot hex={colorHex} size="md" />
          <SpoolMaterialBadge material={spool.filament.material} />
        </div>
        {isLow && (
          <span className="text-2xs font-bold uppercase tracking-wider text-warning">
            Low
          </span>
        )}
      </div>

      {/* Filament name + vendor */}
      <div className="px-0">
        <p className="text-sm font-semibold leading-tight truncate">
          {spool.filament.name}
        </p>
        <p className="text-2xs text-muted-foreground truncate">
          {spool.filament.vendor.name}
        </p>
      </div>

      {/* Progress bar */}
      <SpoolProgressBar
        remaining={spool.remainingWeight}
        initial={spool.initialWeight}
        className="px-0"
      />

      {/* Bottom row: weight + location */}
      <div className="flex items-center justify-between px-0">
        <div className="flex items-center gap-1 font-[family-name:var(--font-geist-mono)] tabular-nums">
          <span
            className={cn(
              "text-xs font-semibold",
              isLow && "text-warning",
            )}
          >
            {spool.remainingWeight}g
          </span>
          <span className="text-2xs text-muted-foreground">
            / {spool.initialWeight}g
          </span>
        </div>
        {spool.location && (
          <span className="text-2xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded-md truncate max-w-[80px]">
            {spool.location}
          </span>
        )}
      </div>

      {/* Price */}
      {spool.purchasePrice && (
        <p className="text-2xs text-muted-foreground px-0 font-[family-name:var(--font-geist-mono)] tabular-nums">
          {spool.purchasePrice} {spool.currency ?? "EUR"}
        </p>
      )}
    </Card>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={() => onClick(spool.id)}
        className="block w-full text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-xl"
      >
        {body}
      </button>
    );
  }

  return (
    <Link href={`/spools/${spool.id}`} className="block">
      {body}
    </Link>
  );
}
