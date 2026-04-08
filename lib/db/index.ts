// SQLite via better-sqlite3 — single driver. Lazy initialization so the
// build can run without SQLITE_PATH set, and so test code can swap the
// path before first access.

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";

type DbType = ReturnType<typeof drizzle<typeof schema>>;

function createDb(): DbType {
  const sqlitePath = process.env.SQLITE_PATH ?? "./data/haspoolmanager.db";
  const sqlite = new Database(sqlitePath);

  // Recommended pragmas for WAL mode (concurrent reads) + safety.
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("busy_timeout = 5000");

  // Provide gen_random_uuid() so seed/migration SQL written for Postgres
  // still resolves on SQLite.
  sqlite.function("gen_random_uuid", () => crypto.randomUUID());
  sqlite.function("now", () => new Date().toISOString());

  // Wrap prepare() so that bool/Date values bound by Drizzle (which assumes
  // a richer driver) are coerced to SQLite-safe primitives. better-sqlite3
  // refuses raw booleans and Date instances on bind.
  const origPrepare = sqlite.prepare.bind(sqlite);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const coerce = (v: any): any => {
    if (v === true) return 1;
    if (v === false) return 0;
    if (v instanceof Date) return v.toISOString();
    return v;
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sqlite.prepare = (source: string): any => {
    const stmt = origPrepare(source);
    for (const method of ["run", "get", "all", "values", "iterate"] as const) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const orig = (stmt as any)[method]?.bind(stmt);
      if (!orig) continue;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (stmt as any)[method] = (...args: any[]) => {
        const mapped = args.map((a) => {
          if (a && typeof a === "object" && !Array.isArray(a) && !(a instanceof Date)) {
            const out: Record<string, unknown> = {};
            for (const k of Object.keys(a)) out[k] = coerce((a as Record<string, unknown>)[k]);
            return out;
          }
          return coerce(a);
        });
        return orig(...mapped);
      };
    }
    return stmt;
  };

  return drizzle(sqlite, { schema });
}

let _db: DbType | undefined;

export const db: DbType = new Proxy({} as DbType, {
  get(_target, prop, receiver) {
    if (!_db) {
      _db = createDb();
    }
    const value = Reflect.get(_db, prop, receiver);
    return typeof value === "function" ? value.bind(_db) : value;
  },
});
