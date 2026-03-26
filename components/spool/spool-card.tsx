import Link from "next/link";
import { Card } from "@/components/ui/card";
import { SpoolColorDot } from "@/components/spool/spool-color-dot";
import { SpoolProgressBar } from "@/components/spool/spool-progress-bar";
import { SpoolMaterialBadge } from "@/components/spool/spool-material-badge";

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

export function SpoolCard({ spool }: { spool: SpoolCardData }) {
  const colorHex = spool.filament.colorHex ?? "888888";

  return (
    <Link href={`/spools/${spool.id}`} className="block">
      <Card className="rounded-xl p-3 hover:bg-accent/50 transition gap-2 ring-0 bg-card/60">
        {/* Top row: color dot + material badge */}
        <div className="flex items-center gap-1.5 justify-between px-0">
          <div className="flex items-center gap-1.5">
            <SpoolColorDot hex={colorHex} size="md" />
            <SpoolMaterialBadge material={spool.filament.material} />
          </div>
        </div>

        {/* Filament name + vendor */}
        <div className="px-0">
          <p className="text-sm font-medium leading-tight truncate">
            {spool.filament.name}
          </p>
          <p className="text-xs text-muted-foreground truncate">
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
          <div className="flex items-center gap-1">
            <span className="font-mono text-xs">{spool.remainingWeight}g</span>
            <span className="text-xs text-muted-foreground">/ {spool.initialWeight}g</span>
          </div>
          {spool.location && (
            <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded-md truncate max-w-[80px]">
              {spool.location}
            </span>
          )}
        </div>

        {/* Price */}
        {spool.purchasePrice && (
          <p className="text-xs text-muted-foreground px-0">
            {spool.purchasePrice} {spool.currency ?? "EUR"}
          </p>
        )}
      </Card>
    </Link>
  );
}
