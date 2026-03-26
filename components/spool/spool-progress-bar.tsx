import { cn } from "@/lib/utils";
import { getStockLevelBg } from "@/lib/theme";

export function SpoolProgressBar({
  remaining,
  initial,
  className,
}: {
  remaining: number;
  initial: number;
  className?: string;
}) {
  const percent = initial > 0 ? Math.round((remaining / initial) * 100) : 0;
  const colorClass = getStockLevelBg(percent);

  return (
    <div className={cn("h-1 w-full rounded-full bg-muted overflow-hidden", className)}>
      <div
        className={cn("h-full rounded-full transition-all", colorClass)}
        style={{ width: `${Math.min(percent, 100)}%` }}
      />
    </div>
  );
}
