/**
 * Preview filament color corrections from SpoolmanDB vendor-colors lookup.
 * Run: npx tsx scripts/preview-color-corrections.ts
 * Add --apply to write changes to DB.
 */

import { lookupVendorColor } from "../lib/color-lookup.js";
import { db } from "../lib/db/index.js";
import { filaments } from "../lib/db/schema.js";
import { eq } from "drizzle-orm";

const apply = process.argv.includes("--apply");

async function main() {
  const allFilaments = await db.query.filaments.findMany({
    with: { vendor: { columns: { name: true } } },
  });

  const changes: Array<{ id: string; vendor: string; name: string; oldHex: string; newHex: string }> = [];
  let matched = 0;
  let unchanged = 0;
  let noMatch = 0;

  for (const f of allFilaments) {
    const vendorName = f.vendor?.name;
    if (!vendorName) { noMatch++; continue; }

    const newHex = lookupVendorColor(vendorName, f.name);
    if (!newHex) { noMatch++; continue; }

    matched++;
    const oldHex = (f.colorHex ?? "").toUpperCase();
    if (oldHex === newHex) { unchanged++; continue; }

    changes.push({ id: f.id, vendor: vendorName, name: f.name, oldHex: oldHex || "(empty)", newHex });
  }

  console.log("");
  console.log("Filament Color Correction Preview");
  console.log("=".repeat(85));
  console.log(`Total filaments: ${allFilaments.length}`);
  console.log(`SpoolmanDB match: ${matched} (${unchanged} already correct)`);
  console.log(`No match (keep as-is): ${noMatch}`);
  console.log(`Would change: ${changes.length}`);
  console.log("-".repeat(85));

  if (changes.length > 0) {
    console.log("");
    console.log(`${"Vendor".padEnd(12)}| ${"Filament".padEnd(26)}| ${"Old Hex".padEnd(11)}| ${"New Hex".padEnd(11)}| Note`);
    console.log("-".repeat(85));
    for (const c of changes) {
      console.log(
        `${c.vendor.padEnd(12)}| ${c.name.slice(0, 24).padEnd(26)}| #${c.oldHex.padEnd(9)}| #${c.newHex.padEnd(9)}| ${c.oldHex === "(empty)" ? "was empty" : "color shift"}`
      );
    }
  }

  if (apply && changes.length > 0) {
    console.log("");
    console.log(`Applying ${changes.length} corrections...`);
    for (const c of changes) {
      await db.update(filaments).set({ colorHex: c.newHex }).where(eq(filaments.id, c.id));
    }
    console.log("Done.");
  } else if (changes.length > 0) {
    console.log("");
    console.log("Run with --apply to write changes to DB.");
  }
}

main().catch(console.error);
