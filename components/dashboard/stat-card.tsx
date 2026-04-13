import Link from "next/link";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface StatCardProps {
  label: string;
  value: string | number;
  subtitle?: string;
  valueClassName?: string;
  accent?: boolean;
  href?: string;
  testId?: string;
}

export function StatCard({ label, value, subtitle, valueClassName, accent, href, testId }: StatCardProps) {
  const card = (
    <Card
      data-testid={testId}
      className={cn(
        "rounded-xl shadow-sm dark:shadow-none p-4 relative overflow-hidden",
        href && "cursor-pointer hover:bg-accent/50 transition",
      )}
    >
      {accent && (
        <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-primary/80 to-primary/20" />
      )}
      <div
        className={cn(
          "text-3xl md:text-4xl font-bold font-[family-name:var(--font-geist-mono)] tabular-nums leading-none mb-1.5",
          accent && "text-primary",
          valueClassName,
        )}
      >
        {value}
      </div>
      <div className="text-xs text-muted-foreground font-medium">{label}</div>
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
