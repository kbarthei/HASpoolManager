/**
 * Historical energy-cost backfill.
 *
 * Estimates energy_kwh / energy_cost / total_cost for finished prints that have
 * print_weight but no measured energy data. Uses a per-material model:
 *
 *   energy_kwh = base_overhead + print_weight_g * kwh_per_gram
 *
 * Values are Bambu Lab H2S defaults (official Bambu wiki + community
 * smart-plug measurements). Leaves energy_start_kwh/energy_end_kwh NULL so
 * the UI can distinguish estimates from measured values.
 *
 * Run:   npx tsx scripts/backfill-energy-estimates.ts           # preview
 *        npx tsx scripts/backfill-energy-estimates.ts --apply    # write
 *
 * Respects SQLITE_PATH to target a snapshot:
 *   SQLITE_PATH=testdata/db-snapshots/prod-2026-04-17.db npx tsx ...
 */

import { db } from "../lib/db/index.js";
import { prints, spools, filaments, settings } from "../lib/db/schema.js";
import { eq, sql } from "drizzle-orm";

const apply = process.argv.includes("--apply");

interface MaterialModel {
  baseKwh: number;
  kwhPerGram: number;
}

// Bambu H2S model values. See workdir research note.
const MATERIAL_MODELS: Record<string, MaterialModel> = {
  PLA: { baseKwh: 0.05, kwhPerGram: 0.008 },
  "PLA-CF": { baseKwh: 0.05, kwhPerGram: 0.0085 },
  "PLA-SILK": { baseKwh: 0.05, kwhPerGram: 0.008 },
  "PLA-MATTE": { baseKwh: 0.05, kwhPerGram: 0.008 },
  PETG: { baseKwh: 0.06, kwhPerGram: 0.009 },
  "PETG-CF": { baseKwh: 0.06, kwhPerGram: 0.0095 },
  ABS: { baseKwh: 0.15, kwhPerGram: 0.014 },
  "ABS-GF": { baseKwh: 0.15, kwhPerGram: 0.014 },
  ASA: { baseKwh: 0.15, kwhPerGram: 0.015 },
  PC: { baseKwh: 0.18, kwhPerGram: 0.018 },
  PA: { baseKwh: 0.18, kwhPerGram: 0.017 },
  NYLON: { baseKwh: 0.18, kwhPerGram: 0.017 },
  TPU: { baseKwh: 0.04, kwhPerGram: 0.009 },
};

const DEFAULT_MODEL = MATERIAL_MODELS.PLA;

function normalizeMaterial(raw: string | null | undefined): string {
  if (!raw) return "PLA";
  const up = raw.toUpperCase().trim();
  if (up in MATERIAL_MODELS) return up;
  // Fuzzy: strip "HF", "BASIC", vendor suffixes
  const stripped = up.replace(/\s+(HF|BASIC|TOUGH|PRO|HS)$/g, "").trim();
  if (stripped in MATERIAL_MODELS) return stripped;
  // Prefix match (e.g. "PLA-XYZ" → PLA)
  for (const key of Object.keys(MATERIAL_MODELS)) {
    if (up.startsWith(key + "-") || up.startsWith(key + " ")) return key;
  }
  return "PLA";
}

interface PrintRow {
  id: string;
  startedAt: string | null;
  printWeight: number | null;
  material: string | null;
  filamentCost: number | null;
}

async function main() {
  // Load price-per-kWh from settings
  const priceRow = await db.query.settings.findFirst({
    where: eq(settings.key, "electricity_price_per_kwh"),
  });
  const pricePerKwh = priceRow ? parseFloat(priceRow.value) : 0.3537;

  console.log("");
  console.log("Historical Energy Cost Backfill");
  console.log("=".repeat(80));
  console.log(`Price per kWh: ${pricePerKwh.toFixed(4)} EUR`);
  console.log(`Mode: ${apply ? "APPLY" : "PREVIEW (read-only)"}`);
  console.log("-".repeat(80));

  // Eligible prints: finished, have weight, no energy data yet
  const rows = (await db.all(sql`
    SELECT p.id as id, p.started_at as startedAt, p.print_weight as printWeight,
           f.material as material, p.filament_cost as filamentCost
    FROM prints p
    LEFT JOIN spools s ON p.active_spool_id = s.id
    LEFT JOIN filaments f ON s.filament_id = f.id
    WHERE p.energy_kwh IS NULL
      AND p.print_weight IS NOT NULL
      AND p.print_weight > 0
      AND p.status = 'finished'
    ORDER BY p.started_at
  `)) as PrintRow[];

  console.log(`Eligible prints: ${rows.length}`);
  console.log("");

  const perMaterial = new Map<string, { count: number; kwh: number; cost: number }>();
  const updates: Array<{ id: string; kwh: number; cost: number; totalCost: number; material: string }> = [];

  for (const row of rows) {
    const material = normalizeMaterial(row.material);
    const model = MATERIAL_MODELS[material] ?? DEFAULT_MODEL;
    const kwh = model.baseKwh + row.printWeight! * model.kwhPerGram;
    const cost = kwh * pricePerKwh;
    const totalCost = (row.filamentCost ?? 0) + cost;

    updates.push({
      id: row.id,
      kwh: Math.round(kwh * 1000) / 1000,
      cost: Math.round(cost * 100) / 100,
      totalCost: Math.round(totalCost * 100) / 100,
      material,
    });

    const agg = perMaterial.get(material) ?? { count: 0, kwh: 0, cost: 0 };
    agg.count += 1;
    agg.kwh += kwh;
    agg.cost += cost;
    perMaterial.set(material, agg);
  }

  // Summary per material
  console.log("Per-material breakdown:");
  console.log("  Material   Count   Total kWh   Total EUR");
  console.log("  " + "-".repeat(44));
  for (const [material, agg] of [...perMaterial.entries()].sort()) {
    console.log(
      `  ${material.padEnd(10)} ${String(agg.count).padStart(5)}   ${agg.kwh.toFixed(3).padStart(9)}   ${agg.cost.toFixed(2).padStart(8)}`
    );
  }

  const totalKwh = updates.reduce((s, u) => s + u.kwh, 0);
  const totalCost = updates.reduce((s, u) => s + u.cost, 0);
  console.log("  " + "-".repeat(44));
  console.log(
    `  ${"TOTAL".padEnd(10)} ${String(updates.length).padStart(5)}   ${totalKwh.toFixed(3).padStart(9)}   ${totalCost.toFixed(2).padStart(8)}`
  );
  console.log("");

  // Sample rows
  console.log("Sample (first 5, last 2):");
  const samples = [...updates.slice(0, 5), ...updates.slice(-2)];
  for (const u of samples) {
    const row = rows.find((r) => r.id === u.id)!;
    console.log(
      `  ${u.id.slice(0, 8)}  ${u.material.padEnd(8)}  ${String(row.printWeight).padStart(6)}g  →  ${u.kwh.toFixed(3)} kWh  ${u.cost.toFixed(2)} EUR`
    );
  }
  console.log("");

  if (!apply) {
    console.log("Run with --apply to write these estimates.");
    return;
  }

  console.log("Applying...");
  for (const u of updates) {
    await db
      .update(prints)
      .set({
        energyKwh: u.kwh,
        energyCost: u.cost,
        totalCost: u.totalCost,
        // energy_start_kwh / energy_end_kwh intentionally left NULL (signals estimate)
      })
      .where(eq(prints.id, u.id));
  }
  console.log(`Wrote ${updates.length} prints.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
