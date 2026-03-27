import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq, or, like } from "drizzle-orm";
import { StorageClient } from "./storage-client";

export default async function StoragePage() {
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

  const rows = 4;
  const cols = 8;

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
