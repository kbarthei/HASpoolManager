import { db } from "@/lib/db";
import { dataQualityLog } from "@/lib/db/schema";
import { desc, sql } from "drizzle-orm";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/lib/date";
import { ShieldCheck, AlertTriangle, CheckCircle2, Info } from "lucide-react";

interface QualityRow {
  id: string;
  runAt: string;
  ruleId: string;
  severity: string;
  entityType: string | null;
  entityId: string | null;
  action: string;
  details: string | null;
}

function severityStyle(severity: string): string {
  if (severity === "critical") return "bg-red-500/15 text-red-600 border-red-500/30";
  if (severity === "warning") return "bg-amber-500/15 text-amber-600 border-amber-500/30";
  return "bg-muted text-muted-foreground";
}

function actionLabel(action: string): string {
  if (action === "auto_fixed") return "auto-fixed";
  if (action === "flagged") return "flagged";
  return "info";
}

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
        sql`SELECT id, run_at AS runAt, rule_id AS ruleId, severity, entity_type AS entityType, entity_id AS entityId, action, details
            FROM data_quality_log
            WHERE run_at = ${latestRunAt}
            ORDER BY severity DESC, rule_id`
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
        <>
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

          {latestRows.length > 0 && (
            <details className="text-xs">
              <summary className="cursor-pointer text-muted-foreground hover:text-foreground py-1">
                Show details ({latestRows.length} item{latestRows.length === 1 ? "" : "s"})
              </summary>
              <div className="space-y-1 mt-2">
                {latestRows.map((row) => {
                  const details = row.details ? safeParse(row.details) : null;
                  const detailSummary = summarizeDetails(details);
                  return (
                    <div
                      key={row.id}
                      className="flex items-start gap-2 py-1.5 border-b border-border last:border-0"
                    >
                      <Badge className={cn("text-[9px] h-4 px-1 shrink-0 mt-0.5", severityStyle(row.severity))}>
                        {actionLabel(row.action)}
                      </Badge>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs truncate font-mono">{row.ruleId}</p>
                        <div className="text-[10px] text-muted-foreground truncate">
                          {row.entityType && row.entityId
                            ? `${row.entityType} · ${row.entityId.slice(0, 8)}`
                            : null}
                          {detailSummary ? ` · ${detailSummary}` : null}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </details>
          )}
        </>
      )}
    </Card>
  );
}

function safeParse(json: string): unknown {
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function summarizeDetails(details: unknown): string {
  if (!details || typeof details !== "object") return "";
  const d = details as Record<string, unknown>;
  if ("before" in d && "after" in d) return `${d.before} → ${d.after}`;
  if ("name" in d && typeof d.name === "string") return d.name;
  if ("duplicates" in d && Array.isArray(d.duplicates)) {
    return `${d.duplicates.length} duplicates`;
  }
  return "";
}
