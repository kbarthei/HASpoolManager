/* eslint-disable no-console */
/**
 * Standalone validation script — verifies that the Bambu printer's FTPS
 * server is reachable, the access code authenticates, and a 3MF can be
 * downloaded + parsed.
 *
 * Run from a Mac on the same LAN as the printer:
 *
 *   PRINTER_IP=192.168.178.99 PRINTER_ACCESS_CODE=12345678 \
 *     npx tsx scripts/test-printer-ftp.ts
 *
 * Or against the local mock (no real printer needed):
 *
 *   npx tsx scripts/mock-bambu-printer.ts &
 *   PRINTER_IP=127.0.0.1 PRINTER_PORT=9990 PRINTER_ACCESS_CODE=12345678 \
 *     npx tsx scripts/test-printer-ftp.ts
 *
 * Optional env vars:
 *   PRINTER_PORT   default 990
 *   PRINTER_FILE   download a specific filename instead of newest
 */

import { listCache3mfs, downloadCacheFile, testFtpConnection } from "../lib/printer-ftp";
import { parseModelFile } from "../lib/3mf-parser";

const PRINTER_IP = process.env.PRINTER_IP;
const PRINTER_PORT = parseInt(process.env.PRINTER_PORT ?? "990", 10);
const ACCESS_CODE = process.env.PRINTER_ACCESS_CODE;
const TARGET_FILE = process.env.PRINTER_FILE;

if (!PRINTER_IP || !ACCESS_CODE) {
  console.error("Missing env: PRINTER_IP and PRINTER_ACCESS_CODE both required");
  console.error("  Real printer:  Drucker-LCD → Settings → WLAN → Access Code");
  console.error("  Local mock:    PRINTER_IP=127.0.0.1 PRINTER_PORT=9990 PRINTER_ACCESS_CODE=12345678");
  process.exit(1);
}

async function main() {
  const config = { host: PRINTER_IP!, port: PRINTER_PORT, accessCode: ACCESS_CODE! };

  console.log(`[1/4] Test connection to ${PRINTER_IP}:${PRINTER_PORT} ...`);
  const test = await testFtpConnection(config);
  if (!test.ok) {
    console.error(`  ✗ Failed at step "${test.step}": ${test.error}`);
    process.exit(2);
  }
  console.log(`  ✓ Connected — ${test.fileCount ?? 0} 3MF files in cache/`);

  console.log(`[2/4] List cache/ ...`);
  const entries = await listCache3mfs(config);
  console.log(`  ✓ ${entries.length} files (newest first):`);
  for (const e of entries.slice(0, 10)) {
    const ts = e.modifiedAt ? `, ${e.modifiedAt.toISOString()}` : "";
    console.log(`    - ${e.name}  (${(e.size / 1024).toFixed(1)} KB${ts})`);
  }
  if (entries.length > 10) console.log(`    ... +${entries.length - 10} more`);

  if (entries.length === 0) {
    console.log(`\n[3/4] Nothing to download. Click "Send to Printer" in Bambu Studio first.`);
    return;
  }

  const target = TARGET_FILE ?? entries[0].name;
  console.log(`\n[3/4] Download cache/${target} ...`);
  const buffer = await downloadCacheFile(config, target);
  console.log(`  ✓ ${(buffer.byteLength / 1024).toFixed(1)} KB downloaded`);

  console.log(`\n[4/4] Parse via lib/3mf-parser.ts ...`);
  const parsed = await parseModelFile(buffer);
  console.log(`  ✓ format=${parsed.format}`);
  console.log(`    sha256:        ${parsed.sha256.slice(0, 16)}…`);
  console.log(`    cover:         ${parsed.cover ? `${parsed.cover.byteLength} bytes` : "(none)"}`);
  console.log(`    printerModel:  ${parsed.printerModel ?? "(none)"}`);
  console.log(`    platerName:    ${parsed.platerName ?? "(none)"}`);
  console.log(`    plates:        ${parsed.plates.length}`);
  console.log(`    filaments:     ${parsed.filaments.length}`);
  if (parsed.plates[0]?.predictionSeconds !== null && parsed.plates[0]?.predictionSeconds !== undefined) {
    const total = parsed.plates.reduce((a, p) => a + (p.predictionSeconds ?? 0), 0);
    console.log(`    print time:    ${Math.round(total / 60)} min`);
  }
  if (parsed.plates[0]?.weightGrams !== null && parsed.plates[0]?.weightGrams !== undefined) {
    const total = parsed.plates.reduce((a, p) => a + (p.weightGrams ?? 0), 0);
    console.log(`    weight:        ${total.toFixed(1)} g`);
  }
  if (parsed.warnings.length > 0) console.log(`    warnings:      ${parsed.warnings.join(", ")}`);

  console.log(`\n✅ Phase 1 (Printer-FTP-Pull) is fully implementable.`);
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(99);
});
