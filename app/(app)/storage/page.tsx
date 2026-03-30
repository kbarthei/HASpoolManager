import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq, or, like } from "drizzle-orm";
import { getRackConfig } from "@/lib/queries";
import { StorageClient } from "./storage-client";

export const dynamic = "force-dynamic";

export default async function StoragePage() {
  const rackConfig = await getRackConfig();
  const { rows, columns: cols } = rackConfig;

  // Auto-move out-of-bounds spools to workbench (direct DB, no revalidate)
  const allRackSpools = await db.query.spools.findMany({
    where: like(schema.spools.location, "rack:%"),
  });
  for (const spool of allRackSpools) {
    const match = spool.location?.match(/^rack:(\d+)-(\d+)$/);
    if (!match) continue;
    const r = parseInt(match[1], 10);
    const c = parseInt(match[2], 10);
    if (r > rows || c > cols) {
      await db.update(schema.spools)
        .set({ location: "workbench", updatedAt: new Date() })
        .where(eq(schema.spools.id, spool.id));
    }
  }

  const [storageSpools, surplusSpools, workbenchSpools] = await Promise.all([
    db.query.spools.findMany({
      where: or(
        like(schema.spools.location, "rack:%"),
        eq(schema.spools.location, "storage")
      ),
      with: { filament: { with: { vendor: true } } },
    }),
    db.query.spools.findMany({
      where: eq(schema.spools.location, "surplus"),
      with: { filament: { with: { vendor: true } } },
    }),
    db.query.spools.findMany({
      where: eq(schema.spools.location, "workbench"),
      with: { filament: { with: { vendor: true } } },
    }),
  ]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Spool Rack</h2>
          <p className="text-xs text-muted-foreground">
            {rows} × {cols} · {storageSpools.length} spools stored
          </p>
        </div>
      </div>
      <StorageClient
        spools={JSON.parse(JSON.stringify(storageSpools))}
        surplusSpools={JSON.parse(JSON.stringify(surplusSpools))}
        workbenchSpools={JSON.parse(JSON.stringify(workbenchSpools))}
        rows={rows}
        cols={cols}
      />
    </div>
  );
}
