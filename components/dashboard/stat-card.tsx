import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  valueClassName,
}: {
  label: string;
  value: string | number;
  valueClassName?: string;
}) {
  return (
    <Card className="rounded-xl shadow-sm dark:shadow-none p-3">
      <div className="text-2xl font-bold font-[family-name:var(--font-geist-mono)] tabular-nums leading-none mb-1">
        <span className={cn(valueClassName)}>{value}</span>
      </div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </Card>
  );
}
