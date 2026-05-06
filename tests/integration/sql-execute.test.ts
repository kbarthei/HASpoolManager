/**
 * POST /api/v1/admin/sql/execute — write SQL runner endpoint.
 * Verifies auth, allowed verbs, DDL/semicolon blocks, parameter binding,
 * and dry-run rollback semantics.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { setupTestDb } from "../harness/sqlite-db";
import { makePostRequest } from "../harness/request";
import { POST as executeSQL } from "@/app/api/v1/admin/sql/execute/route";
import { db } from "@/lib/db";
import { spools } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { makeVendor, makeFilament, makeSpool } from "../fixtures/seed";

async function post(body: unknown, auth = true) {
  const req = makePostRequest("/api/v1/admin/sql/execute", body, auth);
  const res = await executeSQL(req);
  const json = (await res.json()) as Record<string, unknown>;
  return { status: res.status, json };
}

beforeAll(async () => {
  await setupTestDb();
});

describe("POST /api/v1/admin/sql/execute — auth", () => {
  it("rejects unauthenticated requests with 401", async () => {
    const { status } = await post({ sql: "UPDATE spools SET location = 'x'" }, false);
    expect(status).toBe(401);
  });
});

describe("POST /api/v1/admin/sql/execute — validation", () => {
  it("rejects missing sql field", async () => {
    const { status, json } = await post({});
    expect(status).toBe(400);
    expect(json.error).toBeTruthy();
  });

  it("rejects SELECT (reads belong on /query)", async () => {
    const { status, json } = await post({ sql: "SELECT * FROM spools" });
    expect(status).toBe(400);
    expect(String(json.error)).toMatch(/UPDATE\/INSERT\/DELETE/);
  });

  it("rejects DDL keywords", async () => {
    for (const ddl of [
      "DROP TABLE spools",
      "CREATE TABLE foo (id INT)",
      "ALTER TABLE spools ADD COLUMN foo TEXT",
      "PRAGMA foreign_keys = OFF",
    ]) {
      const { status, json } = await post({ sql: ddl });
      expect(status).toBe(400);
      expect(String(json.error)).toMatch(/Blocked|allowed/);
    }
  });

  it("rejects multi-statement SQL", async () => {
    const { status, json } = await post({
      sql: "UPDATE spools SET location = 'a'; UPDATE spools SET location = 'b'",
    });
    expect(status).toBe(400);
    expect(String(json.error)).toMatch(/Multi-statement/);
  });

  it("accepts a trailing semicolon", async () => {
    const v = await makeVendor("SQLExecSemiVendor");
    const f = await makeFilament(v);
    const s = await makeSpool(f);
    const { status, json } = await post({
      sql: "UPDATE spools SET location = 'x' WHERE id = ?;",
      params: [s],
    });
    expect(status).toBe(200);
    expect(json.changes).toBe(1);
  });
});

describe("POST /api/v1/admin/sql/execute — execution", () => {
  it("applies UPDATE with bind parameters", async () => {
    const v = await makeVendor("SQLExecVendor1");
    const f = await makeFilament(v);
    const s = await makeSpool(f, { remainingWeight: 500 });

    const { status, json } = await post({
      sql: "UPDATE spools SET remaining_weight = ? WHERE id = ?",
      params: [777, s],
    });
    expect(status).toBe(200);
    expect(json.operation).toBe("UPDATE");
    expect(json.changes).toBe(1);
    expect(json.dryRun).toBe(false);

    const [row] = await db
      .select({ w: spools.remainingWeight })
      .from(spools)
      .where(eq(spools.id, s));
    expect(row.w).toBe(777);
  });

  it("applies DELETE with bind parameters", async () => {
    const v = await makeVendor("SQLExecVendor2");
    const f = await makeFilament(v);
    const s = await makeSpool(f);

    const { status, json } = await post({
      sql: "DELETE FROM spools WHERE id = ?",
      params: [s],
    });
    expect(status).toBe(200);
    expect(json.changes).toBe(1);

    const rows = await db.select().from(spools).where(eq(spools.id, s));
    expect(rows.length).toBe(0);
  });
});

describe("POST /api/v1/admin/sql/execute — dry run", () => {
  it("reports changes without committing", async () => {
    const v = await makeVendor("SQLExecDryVendor");
    const f = await makeFilament(v);
    const s = await makeSpool(f, { remainingWeight: 500 });

    const { status, json } = await post({
      sql: "UPDATE spools SET remaining_weight = ? WHERE id = ?",
      params: [123, s],
      dryRun: true,
    });
    expect(status).toBe(200);
    expect(json.changes).toBe(1);
    expect(json.dryRun).toBe(true);

    // Verify the DB was NOT actually modified
    const [row] = await db
      .select({ w: spools.remainingWeight })
      .from(spools)
      .where(eq(spools.id, s));
    expect(row.w).toBe(500);
  });
});
