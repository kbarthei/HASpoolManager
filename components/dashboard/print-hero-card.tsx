import { Card } from "@/components/ui/card";
import { SpoolColorDot } from "@/components/spool/spool-color-dot";
import { Printer } from "lucide-react";
import Link from "next/link";

interface PrintHeroProps {
  printName: string;
  progress: number;
  remainingTime: number | null;
  spoolName: string | null;
  spoolColor: string | null;
  material: string | null;
  coverImageUrl?: string | null;
}

export function PrintHeroCard({
  printName,
  progress,
  remainingTime,
  spoolName,
  spoolColor,
  material,
  coverImageUrl,
}: PrintHeroProps) {
  const circumference = 2 * Math.PI * 36;
  const strokeDashoffset = circumference - (progress / 100) * circumference;

  // Format remaining time
  const etaText = remainingTime && remainingTime > 0
    ? remainingTime >= 60
      ? `${Math.floor(remainingTime / 60)}h ${Math.round(remainingTime % 60)}m`
      : `${Math.round(remainingTime)}m`
    : null;

  return (
    <Link href="/prints">
      <Card data-testid="print-hero" className="rounded-xl p-4 bg-gradient-to-r from-primary/10 to-primary/5 border-primary/20 hover:from-primary/15 hover:to-primary/10 transition-all">
        <div className="flex items-center gap-4">
          {/* Progress ring */}
          <div className="relative shrink-0">
            <svg width="80" height="80" viewBox="0 0 80 80" className="-rotate-90">
              <circle
                cx="40" cy="40" r="36"
                fill="none"
                stroke="currentColor"
                strokeWidth="4"
                className="text-muted/50"
              />
              <circle
                cx="40" cy="40" r="36"
                fill="none"
                stroke="currentColor"
                strokeWidth="4"
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                className="text-primary transition-all duration-1000"
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-lg font-bold font-mono tabular-nums">{progress}%</span>
            </div>
          </div>

          {/* Cover image */}
          {coverImageUrl && (
            <img
              src={coverImageUrl}
              alt="3D preview"
              className="h-16 w-16 rounded-lg object-cover bg-muted shrink-0"
            />
          )}

          {/* Print info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 mb-1">
              <Printer className="h-3.5 w-3.5 text-primary shrink-0" />
              <span className="text-xs font-medium text-primary uppercase tracking-wider">Printing</span>
            </div>
            <p className="text-sm font-semibold truncate">{printName}</p>
            <div className="flex items-center gap-2 mt-1">
              {spoolColor && <SpoolColorDot hex={spoolColor} size="sm" />}
              <span className="text-xs text-muted-foreground truncate">
                {spoolName || material || "Unknown filament"}
              </span>
            </div>
            {etaText && (
              <p className="text-xs text-muted-foreground mt-1">
                ~{etaText} remaining
              </p>
            )}
          </div>
        </div>
      </Card>
    </Link>
  );
}
