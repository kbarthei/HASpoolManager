import Link from "next/link";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface StatCardProps {
  label: string;
  value: string | number;
  subtitle?: string;
  valueClassName?: string;
  href?: string;
  testId?: string;
}

export function StatCard({ label, value, subtitle, valueClassName, href, testId }: StatCardProps) {
  const card = (
    <Card data-testid={testId} className={cn("rounded-xl shadow-sm dark:shadow-none p-3", href && "cursor-pointer hover:bg-accent/50 transition")}>
      <div className="text-2xl font-bold font-[family-name:var(--font-geist-mono)] tabular-nums leading-none mb-1">
        <span className={cn(valueClassName)}>{value}</span>
      </div>
      <div className="text-xs text-muted-foreground">{label}</div>
      {subtitle && (
        <div className="text-[10px] text-muted-foreground mt-1 truncate">{subtitle}</div>
      )}
    </Card>
  );

  if (href) {
    return <Link href={href}>{card}</Link>;
  }

  return card;
}
