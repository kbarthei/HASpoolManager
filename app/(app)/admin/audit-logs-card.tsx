"use client";

import { useCallback, useEffect, useMemo, useRef, useState, Fragment } from "react";
import {
  AlertCircle,
  ChevronDown,
  ChevronRight,
  ChevronsUpDown,
  Clock,
  Database,
  RefreshCw,
  Search,
  TrendingUp,
  User as UserIcon,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

const OPERATIONS = ["SELECT", "INSERT", "UPDATE", "DELETE", "PRAGMA", "DDL"] as const;
const PAGE_SIZES = [25, 50, 100, 200] as const;
type SortField = "createdAt" | "userId" | "operation" | "executionTimeMs" | "rowsAffected";
type SortDir = "asc" | "desc";

interface AuditLog {
  id: string;
  action: string;
  userId: string;
  userKeyId: string;
  sqlStatement: string;
  sqlParams: string | null;
  operation: string | null;
  dryRun: boolean;
  success: boolean;
  rowsAffected: number | null;
  errorMessage: string | null;
  executionTimeMs: number | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
}

interface ListResponse {
  rows: AuditLog[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

interface StatsResponse {
  total: number;
  successes: number;
  failures: number;
  successRate: number | null;
  avgMs: number | null;
  maxMs: number | null;
  operations: Array<{ op: string; count: number }>;
  topUsers: Array<{ userId: string; count: number }>;
}

interface Filters {
  op: string | null;
  success: boolean | null;
  user: string;
  q: string;
  from: string;
  to: string;
  sort: SortField;
  dir: SortDir;
  page: number;
  pageSize: number;
}

const DEFAULT_FILTERS: Filters = {
  op: null,
  success: null,
  user: "",
  q: "",
  from: "",
  to: "",
  sort: "createdAt",
  dir: "desc",
  page: 1,
  pageSize: 50,
};

function getApiBase(): string {
  if (typeof window === "undefined") return "";
  return window.location.pathname.includes("/ingress/")
    ? window.location.pathname.split("/ingress/")[0] + "/ingress"
    : "";
}

function buildQuery(filters: Filters): string {
  const params = new URLSearchParams();
  if (filters.op) params.set("op", filters.op);
  if (filters.success !== null) params.set("success", String(filters.success));
  if (filters.user) params.set("user", filters.user);
  if (filters.q) params.set("q", filters.q);
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  params.set("sort", filters.sort);
  params.set("dir", filters.dir);
  params.set("page", String(filters.page));
  params.set("pageSize", String(filters.pageSize));
  return params.toString();
}

export function AuditLogsCard() {
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [data, setData] = useState<ListResponse | null>(null);
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchData = useCallback(async (f: Filters) => {
    setLoading(true);
    setError(null);
    try {
      const qs = buildQuery(f);
      const [listRes, statsRes] = await Promise.all([
        fetch(`${getApiBase()}/api/v1/admin/audit-logs?${qs}`),
        fetch(`${getApiBase()}/api/v1/admin/audit-logs/stats?${qs}`),
      ]);
      if (!listRes.ok) {
        const body = (await listRes.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? `${listRes.status} ${listRes.statusText}`);
      }
      const list = (await listRes.json()) as ListResponse;
      setData(list);
      if (statsRes.ok) {
        setStats((await statsRes.json()) as StatsResponse);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Debounce updates so each keystroke doesn't fire a fresh request.
  const debouncedFilters = useMemo(() => filters, [filters]);
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchData(debouncedFilters), 250);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [debouncedFilters, fetchData]);

  const update = useCallback((patch: Partial<Filters>) => {
    setFilters((prev) => ({ ...prev, page: 1, ...patch }));
  }, []);

  const toggleSort = useCallback((field: SortField) => {
    setFilters((prev) => ({
      ...prev,
      sort: field,
      dir: prev.sort === field && prev.dir === "desc" ? "asc" : "desc",
      page: 1,
    }));
  }, []);

  const toggleExpanded = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const successRatePct = stats?.successRate != null ? (stats.successRate * 100).toFixed(1) : null;

  return (
    <Card data-testid="admin-audit-logs">
      <CardHeader className="flex flex-row items-start justify-between space-y-0 gap-3">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            SQL Audit Log
          </CardTitle>
          <CardDescription>
            Every admin SQL execution — searchable, filterable, paginated.
          </CardDescription>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => fetchData(filters)}
          disabled={loading}
        >
          <RefreshCw className={cn("h-3 w-3 mr-1", loading && "animate-spin")} />
          Refresh
        </Button>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* ── Stats row ──────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatTile label="Total" value={stats?.total ?? "—"} icon={<Database className="h-3.5 w-3.5" />} />
          <StatTile
            label="Success"
            value={successRatePct != null ? `${successRatePct}%` : "—"}
            icon={<TrendingUp className="h-3.5 w-3.5" />}
            tone={
              successRatePct == null
                ? "neutral"
                : Number(successRatePct) >= 95
                  ? "good"
                  : Number(successRatePct) >= 80
                    ? "warn"
                    : "bad"
            }
          />
          <StatTile
            label="Avg Time"
            value={stats?.avgMs != null ? `${stats.avgMs.toFixed(1)} ms` : "—"}
            icon={<Clock className="h-3.5 w-3.5" />}
          />
          <StatTile
            label="Top User"
            value={stats?.topUsers[0]?.userId ?? "—"}
            sub={stats?.topUsers[0] ? `${stats.topUsers[0].count} queries` : undefined}
            icon={<UserIcon className="h-3.5 w-3.5" />}
          />
        </div>

        {/* ── Filter bar ─────────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2">
          <Select
            value={filters.op ?? "all"}
            onValueChange={(v) => update({ op: v === "all" ? null : v })}
          >
            <SelectTrigger className="h-9">
              <SelectValue placeholder="All operations" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All ops</SelectItem>
              {OPERATIONS.map((op) => (
                <SelectItem key={op} value={op}>{op}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={filters.success === null ? "all" : filters.success ? "true" : "false"}
            onValueChange={(v) => update({ success: v === "all" ? null : v === "true" })}
          >
            <SelectTrigger className="h-9">
              <SelectValue placeholder="Any outcome" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any outcome</SelectItem>
              <SelectItem value="true">Success only</SelectItem>
              <SelectItem value="false">Failures only</SelectItem>
            </SelectContent>
          </Select>

          <Input
            placeholder="User contains…"
            value={filters.user}
            onChange={(e) => update({ user: e.target.value })}
            className="h-9"
          />

          <div className="relative lg:col-span-2">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search SQL…"
              value={filters.q}
              onChange={(e) => update({ q: e.target.value })}
              className="h-9 pl-8"
              aria-label="Search SQL statements"
            />
          </div>

          <div className="flex gap-1">
            <Input
              type="date"
              aria-label="From date"
              value={filters.from}
              onChange={(e) => update({ from: e.target.value })}
              className="h-9"
            />
            <Input
              type="date"
              aria-label="To date"
              value={filters.to}
              onChange={(e) => update({ to: e.target.value })}
              className="h-9"
            />
          </div>
        </div>

        {error && (
          <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive">
            <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* ── Table ──────────────────────────────────────────────────────── */}
        <div className="rounded-md border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead className="w-8"></TableHead>
                <SortableHead label="When" field="createdAt" filters={filters} onClick={toggleSort} />
                <SortableHead label="User" field="userId" filters={filters} onClick={toggleSort} />
                <SortableHead label="Op" field="operation" filters={filters} onClick={toggleSort} />
                <TableHead>SQL</TableHead>
                <SortableHead label="Time" field="executionTimeMs" filters={filters} onClick={toggleSort} className="text-right" />
                <SortableHead label="Rows" field="rowsAffected" filters={filters} onClick={toggleSort} className="text-right" />
                <TableHead>Result</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data && data.rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                    {loading ? "Loading…" : "No audit-log entries match these filters."}
                  </TableCell>
                </TableRow>
              )}
              {data?.rows.map((log) => {
                const isOpen = expanded.has(log.id);
                return (
                  <Fragment key={log.id}>
                    <TableRow
                      className="cursor-pointer"
                      onClick={() => toggleExpanded(log.id)}
                      data-testid={`audit-row-${log.id}`}
                    >
                      <TableCell className="py-2">
                        {isOpen ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                      </TableCell>
                      <TableCell className="py-2 whitespace-nowrap font-mono text-[11px]">
                        {new Date(log.createdAt).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "medium" })}
                      </TableCell>
                      <TableCell className="py-2 text-xs">{log.userId}</TableCell>
                      <TableCell className="py-2">
                        {log.operation ? (
                          <Badge variant="outline" className="text-[10px]">
                            {log.operation}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="py-2 max-w-[300px]">
                        <code className="text-[11px] font-mono text-muted-foreground line-clamp-1">
                          {log.sqlStatement}
                        </code>
                      </TableCell>
                      <TableCell className="py-2 text-right font-mono text-[11px]">
                        {log.executionTimeMs != null ? `${log.executionTimeMs} ms` : "—"}
                      </TableCell>
                      <TableCell className="py-2 text-right font-mono text-[11px]">
                        {log.rowsAffected != null ? log.rowsAffected.toLocaleString("de-DE") : "—"}
                      </TableCell>
                      <TableCell className="py-2">
                        {log.success ? (
                          <Badge className="bg-emerald-600 text-white text-[10px]">OK</Badge>
                        ) : (
                          <Badge variant="destructive" className="text-[10px]">FAIL</Badge>
                        )}
                        {log.dryRun && <Badge variant="secondary" className="ml-1 text-[10px]">dryRun</Badge>}
                      </TableCell>
                    </TableRow>
                    {isOpen && (
                      <TableRow className="bg-muted/30">
                        <TableCell colSpan={8} className="p-3">
                          <ExpandedRow log={log} />
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        </div>

        {/* ── Pagination ─────────────────────────────────────────────────── */}
        {data && (
          <div className="flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between text-xs">
            <div className="text-muted-foreground">
              {data.total === 0
                ? "0 entries"
                : `${(data.page - 1) * data.pageSize + 1}–${Math.min(data.page * data.pageSize, data.total)} of ${data.total.toLocaleString("de-DE")}`}
            </div>
            <div className="flex gap-2 items-center">
              <Select value={String(filters.pageSize)} onValueChange={(v) => v && update({ pageSize: parseInt(v, 10) })}>
                <SelectTrigger className="h-7 w-24 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAGE_SIZES.map((s) => (
                    <SelectItem key={s} value={String(s)}>{s} / page</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="sm"
                disabled={data.page <= 1 || loading}
                onClick={() => setFilters((p) => ({ ...p, page: Math.max(p.page - 1, 1) }))}
              >
                Prev
              </Button>
              <span className="font-mono text-muted-foreground">
                {data.page} / {data.pageCount}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={data.page >= data.pageCount || loading}
                onClick={() => setFilters((p) => ({ ...p, page: Math.min(p.page + 1, data.pageCount) }))}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function StatTile({
  label,
  value,
  sub,
  icon,
  tone = "neutral",
}: {
  label: string;
  value: React.ReactNode;
  sub?: string;
  icon?: React.ReactNode;
  tone?: "neutral" | "good" | "warn" | "bad";
}) {
  const toneClass = {
    neutral: "text-foreground",
    good: "text-emerald-600 dark:text-emerald-400",
    warn: "text-yellow-600 dark:text-yellow-400",
    bad: "text-destructive",
  }[tone];
  return (
    <div className="rounded-md border p-2.5 space-y-0.5">
      <div className="flex items-center gap-1.5 text-2xs uppercase tracking-wider text-muted-foreground font-semibold">
        {icon}
        {label}
      </div>
      <div className={cn("text-lg font-semibold tabular-nums truncate", toneClass)}>{value}</div>
      {sub && <div className="text-2xs text-muted-foreground truncate">{sub}</div>}
    </div>
  );
}

function SortableHead({
  label,
  field,
  filters,
  onClick,
  className,
}: {
  label: string;
  field: SortField;
  filters: Filters;
  onClick: (field: SortField) => void;
  className?: string;
}) {
  const active = filters.sort === field;
  return (
    <TableHead className={cn("cursor-pointer select-none whitespace-nowrap", className)} onClick={() => onClick(field)}>
      <span className="inline-flex items-center gap-1">
        {label}
        <ChevronsUpDown className={cn("h-3 w-3", active ? "text-foreground" : "text-muted-foreground/50")} />
        {active && <span className="text-2xs text-muted-foreground">{filters.dir}</span>}
      </span>
    </TableHead>
  );
}

function ExpandedRow({ log }: { log: AuditLog }) {
  return (
    <div className="space-y-2 text-xs">
      <div>
        <div className="text-2xs uppercase tracking-wider text-muted-foreground mb-1">SQL Statement</div>
        <pre className="rounded-md bg-background border p-2 overflow-x-auto whitespace-pre-wrap break-all font-mono text-[11px]">
          {log.sqlStatement}
        </pre>
      </div>
      {log.sqlParams && (
        <div>
          <div className="text-2xs uppercase tracking-wider text-muted-foreground mb-1">Parameters</div>
          <pre className="rounded-md bg-background border p-2 overflow-x-auto font-mono text-[11px]">
            {prettyJson(log.sqlParams)}
          </pre>
        </div>
      )}
      {log.errorMessage && (
        <div>
          <div className="text-2xs uppercase tracking-wider text-muted-foreground mb-1">Error</div>
          <pre className="rounded-md border border-destructive/30 bg-destructive/10 p-2 text-destructive whitespace-pre-wrap break-all font-mono text-[11px]">
            {log.errorMessage}
          </pre>
        </div>
      )}
      <dl className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-2xs">
        <Meta label="Action" value={log.action} />
        <Meta label="Key ID" value={log.userKeyId} mono />
        <Meta label="IP" value={log.ipAddress ?? "—"} mono />
        <Meta label="UA" value={truncate(log.userAgent ?? null, 32)} />
      </dl>
    </div>
  );
}

function Meta({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="space-y-0.5">
      <dt className="uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className={cn("truncate", mono && "font-mono")}>{value}</dd>
    </div>
  );
}

function prettyJson(s: string): string {
  try {
    return JSON.stringify(JSON.parse(s), null, 2);
  } catch {
    return s;
  }
}

function truncate(s: string | null, max: number): string {
  if (!s) return "—";
  return s.length <= max ? s : s.slice(0, max) + "…";
}

// helper for typing — `truncate` takes string|null directly
