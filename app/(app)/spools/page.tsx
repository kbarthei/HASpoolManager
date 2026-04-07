export const dynamic = "force-dynamic";

import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { desc } from "drizzle-orm";
import { SpoolsClient } from "./spools-client";

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

  const view = (params.view === "list" ? "list" : "grid") as "grid" | "list";

  // Fetch all filaments for the Identify dialog dropdown
  const allFilaments = await db.query.filaments.findMany({
    with: { vendor: true },
    orderBy: [desc(schema.filaments.createdAt)],
  });

  return (
    <SpoolsClient
      spools={JSON.parse(JSON.stringify(allSpools))}
      materials={materials}
      vendors={vendors}
      colors={colors}
      initialView={view}
      allFilaments={JSON.parse(JSON.stringify(allFilaments))}
    />
  );
}
