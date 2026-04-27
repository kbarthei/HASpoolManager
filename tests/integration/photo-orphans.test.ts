/**
 * Orphan-photo scan + cleanup against a temp PHOTO_DIR + per-worker SQLite.
 *
 * Verifies the three orphan classes:
 *   1. file under PHOTO_DIR/<printId>/ that no print row references
 *   2. file under PHOTO_DIR/<missingPrintId>/ where the print row is gone
 *   3. photo_urls JSON entry pointing at a file that no longer exists
 * plus a cleanup run that should leave only "valid" combinations behind.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "node:path";
import fs from "node:fs";
import { setupTestDb } from "@/tests/harness/sqlite-db";
import { db } from "@/lib/db";
import { prints } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { makePrinter } from "@/tests/fixtures/seed";

const TMP_PHOTO_DIR = path.join(process.cwd(), "tests", "tmp", "photos");

beforeAll(async () => {
  await setupTestDb();
  process.env.PHOTO_DIR = TMP_PHOTO_DIR;
  fs.rmSync(TMP_PHOTO_DIR, { recursive: true, force: true });
  fs.mkdirSync(TMP_PHOTO_DIR, { recursive: true });
});

afterAll(() => {
  fs.rmSync(TMP_PHOTO_DIR, { recursive: true, force: true });
});

function writeFile(rel: string, bytes: number): void {
  const full = path.join(TMP_PHOTO_DIR, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, Buffer.alloc(bytes, 0xff));
}

async function makePrintWith(
  id: string,
  printerId: string,
  photoUrls: string | null,
): Promise<void> {
  await db.insert(prints).values({
    id,
    printerId,
    name: `test-${id.slice(0, 8)}`,
    status: "finished",
    startedAt: new Date(),
    photoUrls,
  });
}

describe("scanForOrphans + cleanupOrphans", () => {
  it("classifies the four orphan flavours and cleanup leaves valid files alone", async () => {
    const { scanForOrphans, cleanupOrphans } = await import("@/lib/photo-manager");
    const printerId = await makePrinter();

    // ── Setup ──────────────────────────────────────────────────────────
    // Print A: has a referenced file (valid) + an unreferenced file (orphan)
    const printA = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa01";
    writeFile(`${printA}/cover-valid.jpg`, 5000);
    writeFile(`${printA}/orphan-extra.jpg`, 3000);
    await makePrintWith(
      printA,
      printerId,
      JSON.stringify([
        { path: `${printA}/cover-valid.jpg`, kind: "cover", captured_at: null },
      ]),
    );

    // Print B: photo_urls mentions a file that doesn't exist (dead entry)
    const printB = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb01";
    await makePrintWith(
      printB,
      printerId,
      JSON.stringify([
        { path: `${printB}/missing.jpg`, kind: "snapshot", captured_at: null },
      ]),
    );

    // Print C: directory exists but no print row at all (print was deleted)
    const ghostId = "cccccccc-cccc-cccc-cccc-cccccccccc01";
    writeFile(`${ghostId}/old.jpg`, 1500);

    // ── Scan ──────────────────────────────────────────────────────────
    const scan = await scanForOrphans();

    const orphanPaths = scan.orphanFiles.map((o) => o.filePath).sort();
    expect(orphanPaths).toEqual(
      [`${ghostId}/old.jpg`, `${printA}/orphan-extra.jpg`].sort(),
    );
    expect(scan.deadEntries).toEqual([
      { printId: printB, entryPath: `${printB}/missing.jpg` },
    ]);

    // ── Cleanup ───────────────────────────────────────────────────────
    const result = await cleanupOrphans();
    expect(result.filesDeleted).toBe(2); // orphan-extra.jpg + ghost/old.jpg
    expect(result.deadEntriesRemoved).toBe(1);
    expect(result.bytesReclaimed).toBe(3000 + 1500);
    expect(result.emptyDirsRemoved).toBe(1); // ghost dir is now empty

    // ── Post-cleanup invariants ───────────────────────────────────────
    expect(fs.existsSync(path.join(TMP_PHOTO_DIR, printA, "cover-valid.jpg"))).toBe(true);
    expect(fs.existsSync(path.join(TMP_PHOTO_DIR, printA, "orphan-extra.jpg"))).toBe(false);
    expect(fs.existsSync(path.join(TMP_PHOTO_DIR, ghostId))).toBe(false);

    const printBRow = await db.query.prints.findFirst({ where: eq(prints.id, printB) });
    expect(JSON.parse(printBRow!.photoUrls!)).toEqual([]);

    // Re-running scan should now find nothing.
    const reScan = await scanForOrphans();
    expect(reScan.orphanFiles).toEqual([]);
    expect(reScan.deadEntries).toEqual([]);
  });
});
