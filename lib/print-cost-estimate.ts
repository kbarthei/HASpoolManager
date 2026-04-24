import { desc, eq } from "drizzle-orm";
import { db } from "./db";
import { prints, spools, syncLog } from "./db/schema";

export interface SpoolEstimate {
  spool_id: string;
  vendor: string | null;
  material: string | null;
  purchase_price: number | null;
  initial_weight: number | null;
  cost_per_gram: number | null;
}

export interface CostEstimate {
  print_id: string;
  status: string;
  progress_percent: number;
  total_weight_g: number | null;
  estimated_weight_used_g: number;
  estimated_cost_eur: number | null;
  currency: string;
  spools: SpoolEstimate[];
  warnings: string[];
}

function parseSpoolIds(json: string | null): string[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export async function computeCostEstimate(printId: string): Promise<CostEstimate | null> {
  const print = await db.query.prints.findFirst({ where: eq(prints.id, printId) });
  if (!print) return null;

  const warnings: string[] = [];
  let progressPercent = 0;

  if (print.status === "running") {
    const lastSync = await db.query.syncLog.findFirst({
      where: eq(syncLog.printerId, print.printerId),
      orderBy: [desc(syncLog.createdAt)],
    });
    if (lastSync?.responseJson) {
      try {
        const parsed = JSON.parse(lastSync.responseJson);
        const req = parsed.request ?? parsed;
        progressPercent = parseFloat(req.print_progress ?? "0") || 0;
      } catch {
        warnings.push("Could not parse progress from sync log");
      }
    } else {
      warnings.push("No sync data yet for this printer");
    }
  } else {
    progressPercent = 100;
  }

  const spoolIds = parseSpoolIds(print.activeSpoolIds);
  const spoolRows: SpoolEstimate[] = [];
  let currency = "EUR";

  if (spoolIds.length > 0) {
    const rows = await db.query.spools.findMany({
      where: (s, { inArray }) => inArray(s.id, spoolIds),
      with: { filament: { with: { vendor: { columns: { name: true } } } } },
    });
    for (const r of rows) {
      const costPerGram =
        r.purchasePrice != null && r.initialWeight > 0
          ? r.purchasePrice / r.initialWeight
          : null;
      spoolRows.push({
        spool_id: r.id,
        vendor: r.filament?.vendor?.name ?? null,
        material: r.filament?.material ?? null,
        purchase_price: r.purchasePrice,
        initial_weight: r.initialWeight,
        cost_per_gram: costPerGram,
      });
      if (r.currency) currency = r.currency;
    }
  } else {
    warnings.push("No active spools matched");
  }

  const totalWeight = print.printWeight ?? null;
  const estimatedWeightUsed =
    totalWeight != null ? Math.round(totalWeight * (progressPercent / 100) * 10) / 10 : 0;

  const costableSpools = spoolRows.filter((s) => s.cost_per_gram != null);
  const averageCostPerGram =
    costableSpools.length > 0
      ? costableSpools.reduce((sum, s) => sum + (s.cost_per_gram ?? 0), 0) / costableSpools.length
      : null;

  const estimatedCost =
    averageCostPerGram != null && totalWeight != null
      ? Math.round(estimatedWeightUsed * averageCostPerGram * 100) / 100
      : null;

  if (averageCostPerGram == null && spoolRows.length > 0) {
    warnings.push("Active spools have no purchase price — cost cannot be estimated");
  }
  if (totalWeight == null) {
    warnings.push("Print weight not yet known");
  }

  // keep imports referenced in case the table is lazy-loaded in future
  void spools;

  return {
    print_id: print.id,
    status: print.status,
    progress_percent: Math.round(progressPercent * 10) / 10,
    total_weight_g: totalWeight,
    estimated_weight_used_g: estimatedWeightUsed,
    estimated_cost_eur: estimatedCost,
    currency,
    spools: spoolRows,
    warnings,
  };
}
