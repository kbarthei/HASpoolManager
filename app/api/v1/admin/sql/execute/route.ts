import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import Database from "better-sqlite3";

/**
 * POST /api/v1/admin/sql/execute
 *
 * Run a single write statement (UPDATE/INSERT/DELETE) against the production
 * database with parameter binding. REQUIRES Bearer token authentication.
 *
 * Body:
 *   sql:     string        — single SQL statement, no trailing semicolon
 *   params?: unknown[]     — positional bindings (preferred over string concat)
 *   dryRun?: boolean       — wrap in a transaction and ROLLBACK; report row
 *                            count without committing. Defaults to false.
 *
 * Blocks: DDL (CREATE/DROP/ALTER/PRAGMA/VACUUM/REINDEX/ATTACH/DETACH),
 * SELECT (use /api/v1/admin/query for reads), multi-statements (semicolons).
 *
 * Returns 200 { changes, lastInsertRowid, dryRun, operation }.
 */

const ALLOWED_VERBS = ["UPDATE", "INSERT", "DELETE", "WITH"] as const;
const BLOCKED_TOKENS = [
  "CREATE",
  "DROP",
  "ALTER",
  "PRAGMA",
  "VACUUM",
  "REINDEX",
  "ATTACH",
  "DETACH",
  "BEGIN",
  "COMMIT",
  "ROLLBACK",
] as const;

const MAX_SQL_LENGTH = 10_000;

function firstVerb(sql: string): string {
  // Strip leading comments and whitespace. Supports -- and /* */ styles.
  let s = sql.replace(/^\s+/, "");
  while (true) {
    if (s.startsWith("--")) {
      const nl = s.indexOf("\n");
      s = nl >= 0 ? s.slice(nl + 1).replace(/^\s+/, "") : "";
    } else if (s.startsWith("/*")) {
      const end = s.indexOf("*/");
      s = end >= 0 ? s.slice(end + 2).replace(/^\s+/, "") : "";
    } else {
      break;
    }
  }
  const match = s.match(/^(\w+)/);
  return match ? match[1].toUpperCase() : "";
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!auth.authenticated) return auth.response;

  let body: { sql?: unknown; params?: unknown; dryRun?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const sql = typeof body.sql === "string" ? body.sql.trim() : "";
  if (!sql) {
    return NextResponse.json({ error: "No sql provided" }, { status: 400 });
  }
  if (sql.length > MAX_SQL_LENGTH) {
    return NextResponse.json(
      { error: `SQL exceeds ${MAX_SQL_LENGTH} chars` },
      { status: 400 },
    );
  }

  const params = Array.isArray(body.params) ? body.params : [];
  const dryRun = body.dryRun === true;

  // Multi-statement guard: reject any semicolons except a single trailing one
  // (which we strip). Parameterised values never contain semicolons since
  // they are bound, not interpolated.
  const trimmed = sql.replace(/;\s*$/, "");
  if (trimmed.includes(";")) {
    return NextResponse.json(
      { error: "Multi-statement SQL not allowed" },
      { status: 400 },
    );
  }

  const verb = firstVerb(trimmed);
  if (!(ALLOWED_VERBS as readonly string[]).includes(verb)) {
    return NextResponse.json(
      {
        error: `Only ${ALLOWED_VERBS.join("/")} allowed. Use /api/v1/admin/query for SELECT.`,
      },
      { status: 400 },
    );
  }

  // Belt-and-braces: block DDL keywords anywhere in the statement. The
  // semicolon guard above already prevents `UPDATE x; DROP TABLE y`, but
  // keep this as defense in depth.
  const upper = trimmed.toUpperCase();
  for (const tok of BLOCKED_TOKENS) {
    const re = new RegExp(`\\b${tok}\\b`);
    if (re.test(upper)) {
      return NextResponse.json(
        { error: `Blocked keyword: ${tok}` },
        { status: 400 },
      );
    }
  }

  const dbPath = process.env.SQLITE_PATH ?? "./data/haspoolmanager.db";
  const writeDb = new Database(dbPath);
  writeDb.pragma("foreign_keys = ON");
  writeDb.pragma("busy_timeout = 5000");

  try {
    const stmt = writeDb.prepare(trimmed);
    let changes: number;
    let lastInsertRowid: number | bigint;

    if (dryRun) {
      const txn = writeDb.transaction((bind: unknown[]) => {
        const res = stmt.run(...bind);
        throw new DryRunRollback(res.changes, res.lastInsertRowid);
      });
      try {
        txn(params);
        // Unreachable — the transaction always throws to roll back.
        changes = 0;
        lastInsertRowid = 0;
      } catch (err) {
        if (err instanceof DryRunRollback) {
          changes = err.changes;
          lastInsertRowid = err.lastInsertRowid;
        } else {
          throw err;
        }
      }
    } else {
      const result = stmt.run(...params);
      changes = result.changes;
      lastInsertRowid = result.lastInsertRowid;
    }

    console.log(
      `[sql/execute] ${auth.name} ${dryRun ? "DRY-RUN " : ""}${verb} → ${changes} row(s)`,
    );

    return NextResponse.json({
      operation: verb,
      changes,
      lastInsertRowid:
        typeof lastInsertRowid === "bigint"
          ? lastInsertRowid.toString()
          : lastInsertRowid,
      dryRun,
    });
  } catch (error) {
    const msg = (error as Error).message || "Execution error";
    // Sanitize SQLite errors — they can leak table/column names.
    const safeMsg = msg.startsWith("SQLITE_")
      ? "SQL error"
      : msg.replace(/\b(table|column|constraint)\s+\S+/gi, "$1 ?");
    return NextResponse.json({ error: safeMsg }, { status: 400 });
  } finally {
    writeDb.close();
  }
}

class DryRunRollback extends Error {
  constructor(
    public readonly changes: number,
    public readonly lastInsertRowid: number | bigint,
  ) {
    super("DryRunRollback");
  }
}
