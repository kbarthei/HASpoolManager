import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { ArrowRight, AlertTriangle, Info, CheckCircle2 } from "lucide-react";

export type IssueSeverity = "critical" | "warning" | "info";

interface IssueCardProps {
  title: string;
  description: string;
  count: number;
  severity: IssueSeverity;
  /** Deep-link to destination page with ?issue=<id> filter applied. */
  reviewHref?: string;
  reviewLabel?: string;
  /** Short 1-3 row preview of offending entities. Each row: label + optional meta. */
  preview?: Array<{ label: string; meta?: string }>;
  testId?: string;
}

function severityBadge(severity: IssueSeverity, count: number): string {
  if (count === 0) {
    return "bg-emerald-500/15 text-emerald-600 border-emerald-500/30";
  }
  if (severity === "critical") {
    return "bg-red-500/15 text-red-600 border-red-500/30";
  }
  if (severity === "warning") {
    return "bg-amber-500/15 text-amber-600 border-amber-500/30";
  }
  return "bg-muted text-muted-foreground";
}

function SeverityIcon({
  severity,
  count,
}: {
  severity: IssueSeverity;
  count: number;
}) {
  if (count === 0) return <CheckCircle2 className="w-4 h-4 text-emerald-500" />;
  if (severity === "critical") return <AlertTriangle className="w-4 h-4 text-red-500" />;
  if (severity === "warning") return <AlertTriangle className="w-4 h-4 text-amber-500" />;
  return <Info className="w-4 h-4 text-muted-foreground" />;
}

export function IssueCard({
  title,
  description,
  count,
  severity,
  reviewHref,
  reviewLabel = "Review",
  preview,
  testId,
}: IssueCardProps) {
  const clean = count === 0;
  return (
    <Card
      className={cn(
        "p-4 space-y-3 transition-opacity",
        clean && "opacity-60",
      )}
      data-testid={testId}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold flex items-center gap-1.5">
            <SeverityIcon severity={severity} count={count} />
            {title}
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
            {description}
          </p>
        </div>
        <Badge
          className={cn(
            "text-[11px] h-6 px-2 font-mono shrink-0",
            severityBadge(severity, count),
          )}
          data-testid={testId ? `${testId}-count` : undefined}
        >
          {count}
        </Badge>
      </div>

      {!clean && preview && preview.length > 0 && (
        <div className="space-y-1 text-2xs text-muted-foreground border-t border-border pt-2">
          {preview.slice(0, 3).map((row, i) => (
            <div key={i} className="flex items-center justify-between gap-2">
              <span className="truncate">{row.label}</span>
              {row.meta && (
                <span className="font-[family-name:var(--font-geist-mono)] tabular-nums shrink-0">
                  {row.meta}
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {!clean && reviewHref && (
        <Link
          href={reviewHref}
          className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          data-testid={testId ? `${testId}-review` : undefined}
        >
          {reviewLabel}
          <ArrowRight className="w-3 h-3" />
        </Link>
      )}

      {clean && (
        <p className="text-2xs text-emerald-600/80">All clear.</p>
      )}
    </Card>
  );
}
