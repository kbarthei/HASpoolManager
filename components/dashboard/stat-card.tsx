import Link from "next/link";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface StatCardProps {
  label: string;
  value: string | number;
  sub?: string;
  tone?: "success" | "destructive" | "muted";
  href?: string;
  testId?: string;
}

export function StatCard({ label, value, sub, tone, href, testId }: StatCardProps) {
  const card = (
    <Card
      data-testid={testId}
      className={cn(
        "rounded-xl p-4 flex items-center gap-4 h-full",
        href && "hover:bg-accent/50 transition-colors",
      )}
    >
      <div className="flex-1 min-w-0">
        <div className="text-2xs font-semibold tracking-wide uppercase text-muted-foreground">
          {label}
        </div>
        {sub && (
          <div className="text-2xs text-muted-foreground mt-px truncate">{sub}</div>
        )}
      </div>
      <div
        className={cn(
          "text-2xl font-bold font-[family-name:var(--font-geist-mono)] tabular-nums tracking-[-0.02em] leading-none shrink-0",
          tone === "success" && "text-success",
          tone === "destructive" && "text-destructive",
          tone === "muted" && "text-muted-foreground",
        )}
      >
        {value}
      </div>
    </Card>
  );

  return href ? <Link href={href} className="block h-full">{card}</Link> : card;
}
