import Link from "next/link";
import { db } from "@/lib/db";
import { dataQualityLog } from "@/lib/db/schema";
import { desc, sql } from "drizzle-orm";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/lib/date";
import { ShieldCheck, AlertTriangle, CheckCircle2, Info, Stethoscope, ArrowRight } from "lucide-react";

type QualityRow = { action: string };

export async function DataQualityCard() {
  // Fetch latest run's rows (all share the same run_at timestamp)
  const latestRunRow = await db
    .select({ runAt: dataQualityLog.runAt })
    .from(dataQualityLog)
    .orderBy(desc(dataQualityLog.runAt))
    .limit(1);

  const latestRunAt = latestRunRow[0]?.runAt;

  const latestRows = latestRunAt
    ? ((await db.all(
        sql`SELECT action FROM data_quality_log WHERE run_at = ${latestRunAt}`
      )) as QualityRow[])
    : [];

  const counts = {
    autoFixed: latestRows.filter((r) => r.action === "auto_fixed").length,
    flagged: latestRows.filter((r) => r.action === "flagged").length,
    info: latestRows.filter((r) => r.action === "info").length,
  };

  // Score: of the universe of "things that could be wrong", how many are unresolved flags?
  const totalRows = (await db.all(sql`
    SELECT
      (SELECT COUNT(*) FROM spools) +
      (SELECT COUNT(*) FROM shops) +
      (SELECT COUNT(*) FROM vendors) +
      (SELECT COUNT(*) FROM filaments) AS total
  `)) as Array<{ total: number }>;
  const total = totalRows[0]?.total || 1;
  const score = Math.max(0, Math.min(100, Math.round(((total - counts.flagged) / total) * 100)));
  const scoreTone =
    score >= 95 ? "bg-emerald-500/15 text-emerald-600 border-emerald-500/30"
    : score >= 80 ? "bg-amber-500/15 text-amber-600 border-amber-500/30"
    : "bg-red-500/15 text-red-600 border-red-500/30";

  return (
    <Card className="p-4 space-y-3" data-testid="data-quality-card">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-primary" />
            Data Quality
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {latestRunAt
              ? `Last health check: ${formatDateTime(latestRunAt)}`
              : "No health check has run yet (restart addon to trigger one)"}
          </p>
        </div>
        {latestRunAt && (
          <Badge className={cn("text-[11px] h-6 px-2 font-mono", scoreTone)}>
            {score}%
          </Badge>
        )}
      </div>

      {latestRunAt && (
        <div className="grid grid-cols-3 gap-2 text-xs">
          <div className="flex items-center gap-1.5 p-2 rounded border border-border">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
            <div>
              <div className="font-mono font-semibold">{counts.autoFixed}</div>
              <div className="text-[10px] text-muted-foreground">auto-fixed</div>
            </div>
          </div>
          <div className="flex items-center gap-1.5 p-2 rounded border border-border">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
            <div>
              <div className="font-mono font-semibold">{counts.flagged}</div>
              <div className="text-[10px] text-muted-foreground">flagged</div>
            </div>
          </div>
          <div className="flex items-center gap-1.5 p-2 rounded border border-border">
            <Info className="w-3.5 h-3.5 text-muted-foreground" />
            <div>
              <div className="font-mono font-semibold">{counts.info}</div>
              <div className="text-[10px] text-muted-foreground">info</div>
            </div>
          </div>
        </div>
      )}

      {/* ── Diagnostics CTA — full detail lives there now ─────────────────── */}
      <Link
        href="/admin/diagnostics"
        data-testid="admin-diagnostics-link"
        className="group flex items-center gap-3 p-3 rounded-lg border border-primary/30 bg-primary/5 hover:bg-primary/10 transition-colors"
      >
        <Stethoscope className="w-5 h-5 text-primary shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold">Open Diagnostics</div>
          <div className="text-2xs text-muted-foreground leading-tight mt-0.5">
            Full health-check findings plus spool drift, stuck prints, stale orders — grouped review with one-click jumps to fix.
          </div>
        </div>
        <ArrowRight className="w-4 h-4 text-primary shrink-0 transition-transform group-hover:translate-x-0.5" />
      </Link>
    </Card>
  );
}
