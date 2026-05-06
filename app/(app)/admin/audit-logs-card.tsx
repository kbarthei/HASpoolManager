"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle, Clock, User, Database } from "lucide-react";

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

export function AuditLogsCard() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchLogs();
  }, []);

  async function fetchLogs() {
    try {
      const response = await fetch("/api/v1/admin/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sql: `
            SELECT * FROM audit_logs 
            ORDER BY created_at DESC 
            LIMIT 50
          `,
        }),
      });
      const data = await response.json();
      if (data.rows) {
        setLogs(data.rows);
      }
    } catch (error) {
      console.error("Failed to fetch audit logs:", error);
    } finally {
      setLoading(false);
    }
  }

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleString("de-DE", {
      dateStyle: "short",
      timeStyle: "medium",
    });
  }

  function truncateSQL(sql: string, maxLength = 80) {
    if (sql.length <= maxLength) return sql;
    return sql.substring(0, maxLength) + "...";
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Database className="h-5 w-5" />
          SQL Audit Log
        </CardTitle>
        <CardDescription>
          Recent SQL executions via admin endpoint (last 50)
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="text-center py-8 text-muted-foreground">Loading...</div>
        ) : logs.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No audit logs yet
          </div>
        ) : (
          <div className="space-y-3">
            {logs.map((log) => (
              <div
                key={log.id}
                className="border rounded-lg p-3 space-y-2 hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    {log.success ? (
                      <CheckCircle2 className="h-4 w-4 text-green-600 flex-shrink-0" />
                    ) : (
                      <XCircle className="h-4 w-4 text-red-600 flex-shrink-0" />
                    )}
                    <code className="text-xs bg-muted px-2 py-1 rounded font-mono truncate">
                      {truncateSQL(log.sqlStatement)}
                    </code>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {log.dryRun && (
                      <Badge variant="outline" className="text-xs">
                        DRY RUN
                      </Badge>
                    )}
                    {log.operation && (
                      <Badge variant="secondary" className="text-xs">
                        {log.operation}
                      </Badge>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
                  <div className="flex items-center gap-1">
                    <User className="h-3 w-3" />
                    <span>{log.userId}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    <span>{formatDate(log.createdAt)}</span>
                  </div>
                  {log.executionTimeMs !== null && (
                    <span>{log.executionTimeMs}ms</span>
                  )}
                  {log.rowsAffected !== null && (
                    <span>{log.rowsAffected} row(s)</span>
                  )}
                  {log.ipAddress && log.ipAddress !== "unknown" && (
                    <span className="font-mono">{log.ipAddress}</span>
                  )}
                </div>

                {log.errorMessage && (
                  <div className="text-xs text-red-600 bg-red-50 dark:bg-red-950/20 p-2 rounded">
                    <strong>Error:</strong> {log.errorMessage}
                  </div>
                )}

                {log.sqlParams && log.sqlParams !== "[]" && (
                  <details className="text-xs">
                    <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                      Parameters
                    </summary>
                    <code className="block mt-1 bg-muted p-2 rounded font-mono">
                      {log.sqlParams}
                    </code>
                  </details>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Made with Bob
