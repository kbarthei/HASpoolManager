/**
 * Runs every cleanup script in sequence.
 *
 *   npx tsx scripts/run-all-cleanups.ts           # preview everything
 *   npx tsx scripts/run-all-cleanups.ts --apply    # apply everything
 *
 * Respects SQLITE_PATH for snapshot runs.
 */

import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const apply = process.argv.includes("--apply");

const __filename = fileURLToPath(import.meta.url);
const SCRIPTS_DIR = path.dirname(__filename);

const cleanups = [
  { name: "Shop deduplication", file: "cleanup-shops.ts" },
  { name: "Color corrections", file: "preview-color-corrections.ts" },
  { name: "Energy-cost backfill", file: "backfill-energy-estimates.ts" },
];

for (const c of cleanups) {
  console.log("");
  console.log("─".repeat(80));
  console.log(`Running: ${c.name}`);
  console.log("─".repeat(80));
  const args = [path.join(SCRIPTS_DIR, c.file)];
  if (apply) args.push("--apply");
  const result = spawnSync("npx", ["tsx", ...args], {
    stdio: "inherit",
    env: process.env,
  });
  if (result.status !== 0) {
    console.error(`[${c.name}] exited with code ${result.status}`);
    process.exit(result.status ?? 1);
  }
}

console.log("");
console.log("All cleanups complete" + (apply ? " (applied)." : " (preview only — use --apply to write)."));
