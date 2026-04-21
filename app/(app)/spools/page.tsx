export const dynamic = "force-dynamic";

import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { desc, eq, sql } from "drizzle-orm";
import { SpoolsClient } from "./spools-client";
import { FilamentReliability } from "./filament-reliability";
import {
  getSpoolDrift,
  getSpoolStale,
  getSpoolZeroActive,
} from "@/lib/diagnostics";

type SpoolIssue = "drift" | "stale" | "zero-active";

async function getSpoolIdsForIssue(issue: SpoolIssue): Promise<Set<string>> {
  if (issue === "drift") {
    const { rows } = await getSpoolDrift();
    return new Set(rows.map((r) => r.spoolId));
  }
  if (issue === "stale") {
    const { rows } = await getSpoolStale();
    return new Set(rows.map((r) => r.spoolId));
  }
  const { rows } = await getSpoolZeroActive();
  return new Set(rows.map((r) => r.spoolId));
}

function issueLabel(issue: SpoolIssue): string {
  if (issue === "drift") return "RFID drift > 10pp";
  if (issue === "stale") return "No usage in 90+ days";
  return "Zero weight but still active";
}

export default async function SpoolsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | undefined }>;
}) {
  const params = await searchParams;

  // Fetch all spools with relations
  let allSpools = await db.query.spools.findMany({
    with: { filament: { with: { vendor: true } }, tagMappings: true },
    orderBy: [desc(schema.spools.updatedAt)],
  });

  // Apply filters in JS (simpler than building dynamic SQL)
  if (params.material) {
    allSpools = allSpools.filter((s) => s.filament.material === params.material);
  }
  if (params.vendor) {
    allSpools = allSpools.filter((s) => s.filament.vendor.name === params.vendor);
  }
  if (params.status === "low") {
    allSpools = allSpools.filter(
      (s) => s.remainingWeight / s.initialWeight < 0.3
    );
  } else if (params.status === "active") {
    allSpools = allSpools.filter((s) => s.status === "active");
  } else if (params.status === "empty") {
    allSpools = allSpools.filter((s) => s.status === "empty");
  } else if (params.status === "archived") {
    allSpools = allSpools.filter((s) => s.status === "archived");
  } else if (params.status === "draft") {
    allSpools = allSpools.filter((s) => s.status === "draft");
  } else {
    // Default: hide archived and draft spools
    allSpools = allSpools.filter((s) => s.status !== "archived" && s.status !== "draft");
  }
  if (params.search) {
    const q = params.search.toLowerCase();
    allSpools = allSpools.filter(
      (s) =>
        s.filament.name.toLowerCase().includes(q) ||
        s.filament.vendor.name.toLowerCase().includes(q) ||
        s.filament.material.toLowerCase().includes(q)
    );
  }

  // Get unique materials and vendors for filter options
  const allData = await db.query.spools.findMany({
    with: { filament: { with: { vendor: true } } },
  });
  const materials = [...new Set(allData.map((s) => s.filament.material))].sort();
  const vendors = [...new Set(allData.map((s) => s.filament.vendor.name))].sort();

  // Extract unique colors with names
  const colorMap = new Map<string, string>();
  for (const s of allData) {
    if (s.filament.colorHex && !colorMap.has(s.filament.colorHex)) {
      colorMap.set(s.filament.colorHex, s.filament.colorName || s.filament.name);
    }
  }
  const colors = Array.from(colorMap.entries())
    .map(([hex, name]) => ({ hex, name }))
    .sort((a, b) => a.name.localeCompare(b.name));

  // Apply color filter
  if (params.color) {
    allSpools = allSpools.filter((s) => s.filament.colorHex === params.color);
  }

  // Apply diagnostic issue filter (from /admin/diagnostics Review links)
  const validIssues: SpoolIssue[] = ["drift", "stale", "zero-active"];
  const activeIssue = validIssues.includes(params.issue as SpoolIssue)
    ? (params.issue as SpoolIssue)
    : null;
  if (activeIssue) {
    const ids = await getSpoolIdsForIssue(activeIssue);
    // Issue filters override the default "hide archived/draft" filter so
    // flagged zero-weight spools stay visible regardless of status.
    const allUnfiltered = await db.query.spools.findMany({
      with: { filament: { with: { vendor: true } }, tagMappings: true },
      orderBy: [desc(schema.spools.updatedAt)],
    });
    allSpools = allUnfiltered.filter((s) => ids.has(s.id));
  }

  const view = (params.view === "list" ? "list" : "grid") as "grid" | "list";

  // Fetch all filaments for the Identify dialog dropdown
  const allFilaments = await db.query.filaments.findMany({
    with: { vendor: true },
    orderBy: [desc(schema.filaments.createdAt)],
  });

  // Filament reliability: count prints and HMS errors per vendor+material
  const reliabilityData = await db.all(sql`
    SELECT
      v.name as vendor,
      f.material,
      COUNT(DISTINCT pu.print_id) as print_count,
      (SELECT COUNT(*) FROM hms_events h WHERE h.filament_id = f.id) as error_count
    FROM filaments f
    JOIN vendors v ON v.id = f.vendor_id
    JOIN spools s ON s.filament_id = f.id
    JOIN print_usage pu ON pu.spool_id = s.id
    GROUP BY v.name, f.material
    ORDER BY print_count DESC
  `) as Array<{ vendor: string; material: string; print_count: number; error_count: number }>;

  // Aggregate by vendor+material (filaments table may have multiple entries per vendor+material)
  const reliabilityMap = new Map<string, { vendor: string; material: string; prints: number; errors: number }>();
  for (const row of reliabilityData) {
    const key = `${row.vendor}|${row.material}`;
    const existing = reliabilityMap.get(key);
    if (existing) {
      existing.prints += row.print_count;
      existing.errors += row.error_count;
    } else {
      reliabilityMap.set(key, { vendor: row.vendor, material: row.material, prints: row.print_count, errors: row.error_count });
    }
  }
  const reliability = Array.from(reliabilityMap.values())
    .filter(r => r.prints > 0)
    .sort((a, b) => b.prints - a.prints);

  return (
    <>
      <SpoolsClient
        spools={JSON.parse(JSON.stringify(allSpools))}
        materials={materials}
        vendors={vendors}
        colors={colors}
        initialView={view}
        allFilaments={JSON.parse(JSON.stringify(allFilaments))}
        activeIssue={activeIssue}
        activeIssueLabel={activeIssue ? issueLabel(activeIssue) : null}
      />
      {reliability.length > 0 && (
        <FilamentReliability data={reliability} />
      )}
    </>
  );
}
