"use client";

import { useState } from "react";
import { Database, Play, AlertCircle, CheckCircle2, Clock, Hash } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

interface QueryResult {
  rows?: Array<Record<string, unknown>>;
  count?: number;
  operation?: string;
  changes?: number;
  lastInsertRowid?: string;
  dryRun?: boolean;
  error?: string;
}

function getApiBase(): string {
  if (typeof window === "undefined") return "";
  return window.location.pathname.includes("/ingress/")
    ? window.location.pathname.split("/ingress/")[0] + "/ingress"
    : "";
}

const EXAMPLE_QUERIES = {
  read: [
    "SELECT COUNT(*) as total FROM spools",
    "SELECT vendor, COUNT(*) as count FROM filaments f JOIN vendors v ON f.vendor_id = v.id GROUP BY vendor ORDER BY count DESC LIMIT 5",
    "SELECT name, status, started_at FROM prints WHERE status = 'running' ORDER BY started_at DESC LIMIT 10",
  ],
  write: [
    "UPDATE spools SET notes = 'Updated via SQL runner' WHERE id = 'spool-id-here'",
    "INSERT INTO tags (uid, spool_id) VALUES ('tag-uid', 'spool-id')",
    "DELETE FROM tags WHERE uid = 'tag-uid-to-remove'",
  ],
};

export function SqlRunnerCard() {
  const [mode, setMode] = useState<"query" | "execute">("query");
  const [sql, setSql] = useState("");
  const [params, setParams] = useState("[]");
  const [dryRun, setDryRun] = useState(true);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<QueryResult | null>(null);
  const [executionTime, setExecutionTime] = useState<number | null>(null);

  const handleRun = async () => {
    if (!sql.trim()) return;

    setLoading(true);
    setResult(null);
    setExecutionTime(null);

    const startTime = Date.now();

    try {
      const endpoint = mode === "query" 
        ? `${getApiBase()}/api/v1/admin/query`
        : `${getApiBase()}/api/v1/admin/sql/execute`;

      const body = mode === "query"
        ? { sql: sql.trim() }
        : { 
            sql: sql.trim(), 
            params: JSON.parse(params || "[]"),
            dryRun 
          };

      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify(body),
      });

      const data = await res.json();
      const elapsed = Date.now() - startTime;
      setExecutionTime(elapsed);

      if (!res.ok) {
        setResult({ error: data.error || `${res.status} ${res.statusText}` });
      } else {
        setResult(data);
      }
    } catch (err) {
      setResult({ error: (err as Error).message });
      setExecutionTime(Date.now() - startTime);
    } finally {
      setLoading(false);
    }
  };

  const loadExample = (query: string) => {
    setSql(query);
    setResult(null);
    setExecutionTime(null);
  };

  return (
    <Card data-testid="admin-sql-runner">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Database className="h-5 w-5" />
          SQL Query Runner
        </CardTitle>
        <CardDescription>
          Execute read-only queries or write operations with parameter binding and dry-run mode
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Mode Tabs */}
        <Tabs value={mode} onValueChange={(v) => setMode(v as "query" | "execute")}>
          <TabsList>
            <TabsTrigger value="query">
              <Database className="h-3.5 w-3.5 mr-1.5" />
              Read (SELECT)
            </TabsTrigger>
            <TabsTrigger value="execute">
              <Play className="h-3.5 w-3.5 mr-1.5" />
              Write (INSERT/UPDATE/DELETE)
            </TabsTrigger>
          </TabsList>

          <TabsContent value="query" className="space-y-3 mt-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                SQL Query (read-only)
              </label>
              <Textarea
                value={sql}
                onChange={(e) => setSql(e.target.value)}
                placeholder="SELECT * FROM spools WHERE status = 'active' LIMIT 10"
                className="font-mono text-xs min-h-24"
                disabled={loading}
              />
            </div>

            <div className="flex flex-wrap gap-1.5">
              <span className="text-2xs text-muted-foreground self-center">Examples:</span>
              {EXAMPLE_QUERIES.read.map((q, i) => (
                <Button
                  key={i}
                  variant="outline"
                  size="xs"
                  onClick={() => loadExample(q)}
                  disabled={loading}
                >
                  {i + 1}
                </Button>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="execute" className="space-y-3 mt-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                SQL Statement (INSERT/UPDATE/DELETE)
              </label>
              <Textarea
                value={sql}
                onChange={(e) => setSql(e.target.value)}
                placeholder="UPDATE spools SET notes = ? WHERE id = ?"
                className="font-mono text-xs min-h-24"
                disabled={loading}
              />
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                Parameters (JSON array)
              </label>
              <Textarea
                value={params}
                onChange={(e) => setParams(e.target.value)}
                placeholder='["Updated note", "spool-id-123"]'
                className="font-mono text-xs min-h-16"
                disabled={loading}
              />
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="dryRun"
                checked={dryRun}
                onChange={(e) => setDryRun(e.target.checked)}
                className="h-4 w-4 rounded border-input"
                disabled={loading}
              />
              <label htmlFor="dryRun" className="text-xs cursor-pointer">
                Dry run (preview changes without committing)
              </label>
            </div>

            <div className="flex flex-wrap gap-1.5">
              <span className="text-2xs text-muted-foreground self-center">Examples:</span>
              {EXAMPLE_QUERIES.write.map((q, i) => (
                <Button
                  key={i}
                  variant="outline"
                  size="xs"
                  onClick={() => loadExample(q)}
                  disabled={loading}
                >
                  {i + 1}
                </Button>
              ))}
            </div>
          </TabsContent>
        </Tabs>

        {/* Execute Button */}
        <Button
          onClick={handleRun}
          disabled={loading || !sql.trim()}
          className="w-full"
        >
          <Play className={cn("h-4 w-4 mr-2", loading && "animate-pulse")} />
          {loading ? "Executing..." : mode === "query" ? "Run Query" : dryRun ? "Preview Changes" : "Execute"}
        </Button>

        {/* Results */}
        {result && (
          <div className="space-y-3">
            {/* Status Bar */}
            <div className="flex items-center justify-between p-2.5 rounded-md border bg-muted/30">
              <div className="flex items-center gap-2">
                {result.error ? (
                  <>
                    <AlertCircle className="h-4 w-4 text-destructive" />
                    <span className="text-xs font-medium text-destructive">Error</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    <span className="text-xs font-medium text-emerald-600">Success</span>
                  </>
                )}
                {result.dryRun && (
                  <Badge variant="secondary" className="text-[10px]">DRY RUN</Badge>
                )}
              </div>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                {executionTime !== null && (
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {executionTime}ms
                  </span>
                )}
                {result.count !== undefined && (
                  <span className="flex items-center gap-1">
                    <Hash className="h-3 w-3" />
                    {result.count} rows
                  </span>
                )}
                {result.changes !== undefined && (
                  <span className="flex items-center gap-1">
                    <Hash className="h-3 w-3" />
                    {result.changes} changed
                  </span>
                )}
              </div>
            </div>

            {/* Error Message */}
            {result.error && (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3">
                <pre className="text-xs text-destructive whitespace-pre-wrap break-all font-mono">
                  {result.error}
                </pre>
              </div>
            )}

            {/* Query Results Table */}
            {result.rows && result.rows.length > 0 && (
              <div className="rounded-md border overflow-hidden">
                <div className="overflow-x-auto max-h-96">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/40">
                        {Object.keys(result.rows[0]).map((col) => (
                          <TableHead key={col} className="font-mono text-[11px]">
                            {col}
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {result.rows.map((row, i) => (
                        <TableRow key={i}>
                          {Object.values(row).map((val, j) => (
                            <TableCell key={j} className="font-mono text-[11px] max-w-xs truncate">
                              {val === null ? (
                                <span className="text-muted-foreground italic">null</span>
                              ) : typeof val === "object" ? (
                                JSON.stringify(val)
                              ) : (
                                String(val)
                              )}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}

            {/* Empty Result */}
            {result.rows && result.rows.length === 0 && !result.error && (
              <div className="text-center py-6 text-xs text-muted-foreground">
                Query returned 0 rows
              </div>
            )}

            {/* Write Operation Result */}
            {result.operation && (
              <div className="rounded-md border p-3 space-y-1.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Operation</span>
                  <Badge variant="outline" className="text-[10px]">{result.operation}</Badge>
                </div>
                {result.changes !== undefined && (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Rows affected</span>
                    <span className="font-mono">{result.changes}</span>
                  </div>
                )}
                {result.lastInsertRowid && result.lastInsertRowid !== "0" && (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Last insert ID</span>
                    <span className="font-mono">{result.lastInsertRowid}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Help Text */}
        <div className="rounded-md bg-muted/30 p-3 space-y-1.5 text-xs text-muted-foreground">
          <p className="font-medium">Security Notes:</p>
          <ul className="list-disc list-inside space-y-0.5 text-2xs">
            <li>Read mode: SELECT only, readonly connection, blocks all write operations</li>
            <li>Write mode: Parameter binding prevents SQL injection, DDL operations blocked</li>
            <li>All queries are logged to the audit log with user, IP, and execution time</li>
            <li>Dry-run mode previews changes without committing to the database</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}

// Made with Bob
