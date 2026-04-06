// Lazy initialization — only connects when first accessed at runtime.
// This allows the build to succeed without DATABASE_URL in CI.
// Set DATABASE_PROVIDER=sqlite to use better-sqlite3 (HA addon).
// Default (no env var) uses Neon Postgres (Vercel).

const provider = process.env.DATABASE_PROVIDER ?? "postgres";

function createDb() {
  if (provider === "sqlite") {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Database = require("better-sqlite3");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { drizzle } = require("drizzle-orm/better-sqlite3");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const schemaSqlite = require("./schema-sqlite");

    const sqlitePath = process.env.SQLITE_PATH ?? "./data/haspoolmanager.db";
    const sqlite = new Database(sqlitePath);

    // Recommended pragmas for WAL mode (concurrent reads) + safety
    sqlite.pragma("journal_mode = WAL");
    sqlite.pragma("foreign_keys = ON");
    sqlite.pragma("busy_timeout = 5000");

    return drizzle(sqlite, { schema: schemaSqlite });
  }

  // Default: Neon Postgres (Vercel deployment)
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { neon } = require("@neondatabase/serverless");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { drizzle } = require("drizzle-orm/neon-http");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const schemaPg = require("./schema");

  const sql = neon(process.env.DATABASE_URL!);
  return drizzle(sql, { schema: schemaPg });
}

// Use the Postgres schema type for the proxy — column names are identical
// between both schemas, so TypeScript inference is correct for both drivers.
import * as schemaPg from "./schema";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";

// Type alias derived from the Postgres driver (used for build-time type checking)
type DbType = ReturnType<typeof drizzleNeon<typeof schemaPg>>;

let _db: DbType | undefined;

export const db: DbType = new Proxy({} as DbType, {
  get(_target, prop, receiver) {
    if (!_db) {
      _db = createDb() as DbType;
    }
    const value = Reflect.get(_db, prop, receiver);
    return typeof value === "function" ? value.bind(_db) : value;
  },
});
