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

  const view = (params.view === "list" ? "list" : "grid") as "grid" | "list";

  return (
    <SpoolsClient
      spools={JSON.parse(JSON.stringify(allSpools))}
      materials={materials}
      vendors={vendors}
      initialView={view}
    />
  );
}
