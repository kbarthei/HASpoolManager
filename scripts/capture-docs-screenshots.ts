/**
 * scripts/capture-docs-screenshots.ts
 *
 * Captures synthetic UI screenshots of every major page × dark/light × desktop/mobile.
 * Reuses the e2e addon stack (Docker nginx + ingress simulator + Next.js standalone)
 * so the screenshots show the production rendering path, not bare `next dev`.
 *
 * Output: docs/screenshots/<theme>/<viewport>/<page>.png — committed to git as
 * the canonical visual reference for docs and PR review.
 *
 * Run locally:    npm run screenshots:docs
 * CI:             .github/workflows/screenshots.yml (weekly + workflow_dispatch)
 *
 * Companion: scripts/marketing-screenshots.ts captures the LIVE addon for marketing
 * material — uncommitted, real data.
 */

import path from "node:path";
import fs from "node:fs";
import { chromium, type Page } from "playwright";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "@/lib/db/schema";
import { startAddonStack, type AddonStack } from "../tests/harness/addon-stack";

const REPO_ROOT = path.resolve(__dirname, "..");
const OUT_ROOT = path.join(REPO_ROOT, "docs", "screenshots");

type Viewport = { name: string; width: number; height: number; deviceScaleFactor: number };

const VIEWPORTS: Viewport[] = [
  { name: "desktop", width: 1440, height: 900, deviceScaleFactor: 2 },
  { name: "mobile", width: 390, height: 844, deviceScaleFactor: 2 }, // iPhone 14
];

const THEMES = ["dark", "light"] as const;
type Theme = (typeof THEMES)[number];

type PageDef = {
  /** Filename stem (without extension) */
  slug: string;
  /** Path appended after the ingress prefix, no leading slash */
  ingressPath: string;
  /** Selector that must be visible before we capture (data-testid for stability) */
  ready: string;
  /** Optional extra wait — pages that render charts need a moment for animation */
  postLoadDelayMs?: number;
};

const PAGES: PageDef[] = [
  { slug: "01-dashboard", ingressPath: "", ready: "[data-testid='page-dashboard'], main", postLoadDelayMs: 600 },
  { slug: "02-inventory", ingressPath: "inventory", ready: "[data-testid='page-inventory']", postLoadDelayMs: 400 },
  { slug: "03-spools", ingressPath: "spools", ready: "[data-testid='page-spools']" },
  { slug: "04-spool-inspector", ingressPath: "__SPOOL_INSPECTOR__", ready: "main", postLoadDelayMs: 500 },
  { slug: "05-prints", ingressPath: "prints", ready: "[data-testid='page-prints']" },
  { slug: "06-history", ingressPath: "history", ready: "[data-testid='page-history']" },
  { slug: "07-orders", ingressPath: "orders", ready: "[data-testid='page-orders']", postLoadDelayMs: 300 },
  { slug: "08-analytics", ingressPath: "analytics", ready: "main", postLoadDelayMs: 800 },
  { slug: "09-scan", ingressPath: "scan", ready: "[data-testid='page-scan']" },
  { slug: "10-admin", ingressPath: "admin", ready: "[data-testid='page-admin']" },
  { slug: "11-admin-diagnostics", ingressPath: "admin/diagnostics", ready: "main", postLoadDelayMs: 400 },
];

// ── Seed ────────────────────────────────────────────────────────────────────

/** Returns the spool id used to render the spool-inspector page. */
function seedDemoData(dbPath: string): string {
  const sqlite = new Database(dbPath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite, { schema });

  // Vendors
  const vendorRows = [
    { id: "demo-vendor-bambu", name: "Bambu Lab" },
    { id: "demo-vendor-polymaker", name: "Polymaker" },
    { id: "demo-vendor-esun", name: "eSUN" },
    { id: "demo-vendor-prusament", name: "Prusament" },
  ];
  for (const v of vendorRows) {
    sqlite.prepare("INSERT OR IGNORE INTO vendors (id, name) VALUES (?, ?)").run(v.id, v.name);
  }

  // Filaments — varied palette, named colors, realistic
  const filamentRows = [
    { id: "demo-fil-pla-charcoal", vendor: "demo-vendor-bambu", name: "PLA Matte Charcoal", material: "PLA", color: "2B2B2D", colorName: "Matte Charcoal" },
    { id: "demo-fil-pla-jade", vendor: "demo-vendor-bambu", name: "PLA Basic Jade White", material: "PLA", color: "F5F5F0", colorName: "Jade White" },
    { id: "demo-fil-petg-translucent", vendor: "demo-vendor-bambu", name: "PETG Translucent Lemon", material: "PETG", color: "F4E76E", colorName: "Translucent Lemon" },
    { id: "demo-fil-asa-white", vendor: "demo-vendor-polymaker", name: "Polymaker ASA White", material: "ASA", color: "EFEFEF", colorName: "Pure White" },
    { id: "demo-fil-tpu-red", vendor: "demo-vendor-esun", name: "eSUN TPU Red", material: "TPU", color: "C8312B", colorName: "Cherry Red" },
    { id: "demo-fil-pla-galaxy", vendor: "demo-vendor-bambu", name: "PLA Galaxy Black", material: "PLA", color: "1F1F38", colorName: "Galaxy Black" },
    { id: "demo-fil-petg-blue", vendor: "demo-vendor-prusament", name: "Prusament PETG Ocean Blue", material: "PETG", color: "1A6CB0", colorName: "Ocean Blue" },
    { id: "demo-fil-pla-orange", vendor: "demo-vendor-bambu", name: "PLA Basic Bambu Orange", material: "PLA", color: "F09A2C", colorName: "Bambu Orange" },
    { id: "demo-fil-abs-gf", vendor: "demo-vendor-bambu", name: "ABS-GF Gray", material: "ABS-GF", color: "9A9A9A", colorName: "Industrial Gray" },
    { id: "demo-fil-pla-emerald", vendor: "demo-vendor-bambu", name: "PLA Silk Emerald", material: "PLA", color: "00866B", colorName: "Silk Emerald" },
  ];
  for (const f of filamentRows) {
    sqlite.prepare(
      "INSERT OR IGNORE INTO filaments (id, vendor_id, name, material, color_hex, color_name, spool_weight) VALUES (?, ?, ?, ?, ?, ?, 1000)",
    ).run(f.id, f.vendor, f.name, f.material, f.color, f.colorName);
  }

  // Spools — 12 active, varied weights to make the inventory grid look healthy
  const spoolRows = [
    { id: "demo-spool-pla-charcoal", fil: "demo-fil-pla-charcoal", weight: 845, location: "ams" },
    { id: "demo-spool-pla-jade", fil: "demo-fil-pla-jade", weight: 230, location: "ams" },
    { id: "demo-spool-petg-translucent", fil: "demo-fil-petg-translucent", weight: 770, location: "ams" },
    { id: "demo-spool-asa-white", fil: "demo-fil-asa-white", weight: 655, location: "ams-ht" },
    { id: "demo-spool-tpu-red", fil: "demo-fil-tpu-red", weight: 520, location: "external" },
    { id: "demo-spool-pla-galaxy", fil: "demo-fil-pla-galaxy", weight: 980, location: "workbench" },
    { id: "demo-spool-petg-blue", fil: "demo-fil-petg-blue", weight: 410, location: "workbench" },
    { id: "demo-spool-pla-orange", fil: "demo-fil-pla-orange", weight: 690, location: "storage" },
    { id: "demo-spool-abs-gf", fil: "demo-fil-abs-gf", weight: 880, location: "storage" },
    { id: "demo-spool-pla-emerald", fil: "demo-fil-pla-emerald", weight: 560, location: "storage" },
    { id: "demo-spool-pla-orange-2", fil: "demo-fil-pla-orange", weight: 920, location: "storage" },
    { id: "demo-spool-petg-blue-2", fil: "demo-fil-petg-blue", weight: 780, location: "storage" },
  ];
  for (const s of spoolRows) {
    sqlite.prepare(
      "INSERT OR IGNORE INTO spools (id, filament_id, initial_weight, remaining_weight, location, status, purchase_price) VALUES (?, ?, 1000, ?, ?, 'active', 23.99)",
    ).run(s.id, s.fil, s.weight, s.location);
  }

  // Printer + AMS units + slots
  const printerId = "demo-printer-h2s";
  sqlite.prepare(
    "INSERT OR IGNORE INTO printers (id, name, model) VALUES (?, ?, ?)",
  ).run(printerId, "Bambu Lab H2S", "H2S");

  sqlite.prepare(
    "INSERT OR IGNORE INTO printer_ams_units (id, printer_id, ams_index, slot_type, ha_device_id, display_name, enabled) VALUES (?, ?, 0, 'ams', 'demo-ha-ams', 'AMS', 1)",
  ).run("demo-ams-unit-0", printerId);
  sqlite.prepare(
    "INSERT OR IGNORE INTO printer_ams_units (id, printer_id, ams_index, slot_type, ha_device_id, display_name, enabled) VALUES (?, ?, 1, 'ams_ht', 'demo-ha-htams', 'AMS HT', 1)",
  ).run("demo-ams-unit-1", printerId);

  // Bind AMS slots to the active spools so inventory looks loaded
  const slotBindings = [
    { id: "demo-slot-ams-0", slotType: "ams", amsIdx: 0, trayIdx: 0, spoolId: "demo-spool-pla-charcoal" },
    { id: "demo-slot-ams-1", slotType: "ams", amsIdx: 0, trayIdx: 1, spoolId: "demo-spool-pla-jade" },
    { id: "demo-slot-ams-2", slotType: "ams", amsIdx: 0, trayIdx: 2, spoolId: "demo-spool-petg-translucent" },
    { id: "demo-slot-ams-3", slotType: "ams", amsIdx: 0, trayIdx: 3, spoolId: null },
    { id: "demo-slot-ht-0", slotType: "ams_ht", amsIdx: 1, trayIdx: 0, spoolId: "demo-spool-asa-white" },
  ];
  for (const sl of slotBindings) {
    sqlite.prepare(
      `INSERT OR IGNORE INTO ams_slots
       (id, printer_id, slot_type, ams_index, tray_index, spool_id, is_empty)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(sl.id, printerId, sl.slotType, sl.amsIdx, sl.trayIdx, sl.spoolId, sl.spoolId ? 0 : 1);
  }

  // Rack with a few cells
  sqlite.prepare(
    "INSERT OR IGNORE INTO racks (id, name, rows, cols, sort_order) VALUES (?, ?, 4, 6, 0)",
  ).run("demo-rack-0", "Main Storage Rack");

  // A finished + a running print
  const yesterday = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const lastWeek = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
  sqlite.prepare(
    `INSERT OR IGNORE INTO prints (id, printer_id, name, status, started_at, finished_at, duration_seconds, print_weight, total_cost, active_spool_ids)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    "demo-print-finished-1",
    printerId,
    "router_mount_v3.gcode",
    "finished",
    lastWeek,
    yesterday,
    14580,
    243,
    5.83,
    JSON.stringify(["demo-spool-pla-charcoal"]),
  );

  sqlite.prepare(
    `INSERT OR IGNORE INTO prints (id, printer_id, name, status, started_at, total_layers, active_spool_ids)
     VALUES (?, ?, ?, 'running', ?, 412, ?)`,
  ).run(
    "demo-print-running",
    printerId,
    "kamerahalter_north_pillar.gcode",
    new Date(Date.now() - 3 * 3600 * 1000).toISOString(),
    JSON.stringify(["demo-spool-asa-white"]),
  );

  // Sync log entry to make dashboard look "live"
  sqlite.prepare(
    `INSERT OR IGNORE INTO sync_log (id, printer_id, raw_state, normalized_state, response_json, created_at)
     VALUES (?, ?, ?, ?, ?, datetime('now'))`,
  ).run(
    "demo-synclog-0",
    printerId,
    "RUNNING",
    "PRINTING",
    JSON.stringify({
      request: { print_progress: 47, print_remaining_time: 5.5, gcode_state: "running" },
    }),
  );

  // An order to make /orders interesting
  const shopId = "demo-shop-0";
  sqlite.prepare(
    "INSERT OR IGNORE INTO shops (id, name, country, currency) VALUES (?, ?, 'DE', 'EUR')",
  ).run(shopId, "Bambu Lab EU Store");

  sqlite.prepare(
    `INSERT OR IGNORE INTO orders (id, shop_id, order_number, order_date, total_cost, currency, status)
     VALUES (?, ?, '306-7723421-0193445', date('now', '-3 days'), 64.97, 'EUR', 'delivered')`,
  ).run("demo-order-0", shopId);

  sqlite.prepare(
    `INSERT OR IGNORE INTO order_items (id, order_id, filament_id, quantity, unit_price)
     VALUES (?, ?, ?, 3, 19.99)`,
  ).run("demo-order-item-0", "demo-order-0", "demo-fil-pla-charcoal");

  sqlite.close();
  return "demo-spool-asa-white"; // shown in the spool-inspector
}

// ── Capture ─────────────────────────────────────────────────────────────────

async function ensureFreshOutDir(): Promise<void> {
  if (fs.existsSync(OUT_ROOT)) {
    fs.rmSync(OUT_ROOT, { recursive: true, force: true });
  }
  fs.mkdirSync(OUT_ROOT, { recursive: true });
}

async function capturePage(
  page: Page,
  baseUrl: string,
  pageDef: PageDef,
  spoolId: string,
  outFile: string,
): Promise<void> {
  const ingressPath = pageDef.ingressPath === "__SPOOL_INSPECTOR__"
    ? `spools/${spoolId}`
    : pageDef.ingressPath;

  const url = ingressPath ? `${baseUrl.replace(/\/$/, "")}/${ingressPath}` : baseUrl;
  await page.goto(url, { waitUntil: "networkidle", timeout: 20_000 });

  // Wait for the page-ready selector. Fall back to a generous delay if missing,
  // since some pages don't have a stable testid yet.
  try {
    await page.waitForSelector(pageDef.ready, { timeout: 8_000, state: "visible" });
  } catch {
    await page.waitForTimeout(1500);
  }
  if (pageDef.postLoadDelayMs) {
    await page.waitForTimeout(pageDef.postLoadDelayMs);
  }
  await page.screenshot({ path: outFile, fullPage: true, animations: "disabled" });
}

async function captureAll(stack: AddonStack, spoolId: string): Promise<void> {
  const browser = await chromium.launch();
  try {
    for (const theme of THEMES) {
      for (const vp of VIEWPORTS) {
        const ctx = await browser.newContext({
          viewport: { width: vp.width, height: vp.height },
          deviceScaleFactor: vp.deviceScaleFactor,
          colorScheme: theme,
          isMobile: vp.name === "mobile",
          hasTouch: vp.name === "mobile",
        });
        const page = await ctx.newPage();
        const outDir = path.join(OUT_ROOT, theme, vp.name);
        fs.mkdirSync(outDir, { recursive: true });
        for (const def of PAGES) {
          const outFile = path.join(outDir, `${def.slug}.png`);
          process.stderr.write(`[shot] ${theme}/${vp.name}/${def.slug}.png … `);
          try {
            await capturePage(page, stack.baseUrl, def, spoolId, outFile);
            process.stderr.write("ok\n");
          } catch (err) {
            process.stderr.write(`FAILED: ${(err as Error).message}\n`);
          }
        }
        await ctx.close();
      }
    }
  } finally {
    await browser.close();
  }
}

// ── Entry ───────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log("[shot] starting addon stack …");
  const stack = await startAddonStack();
  try {
    console.log("[shot] seeding demo data …");
    const spoolId = seedDemoData(stack.dbPath);
    await ensureFreshOutDir();
    console.log(`[shot] capturing ${PAGES.length} pages × ${THEMES.length} themes × ${VIEWPORTS.length} viewports = ${PAGES.length * THEMES.length * VIEWPORTS.length} screenshots`);
    await captureAll(stack, spoolId);
    console.log(`[shot] done — output in ${path.relative(REPO_ROOT, OUT_ROOT)}/`);
  } finally {
    await stack.teardown();
  }
}

main().catch((err) => {
  console.error("[shot] failed:", err);
  process.exit(1);
});
