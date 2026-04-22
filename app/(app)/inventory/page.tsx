import { Suspense } from "react";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq, or, like, desc } from "drizzle-orm";
import { getActiveRacks, getPrinterAmsUnits } from "@/lib/queries";
import { parseRackLocation } from "@/lib/rack-helpers";
import { getSelectedPrinter } from "@/lib/printer-context";
import { PrinterSelector } from "@/components/layout/printer-selector";
import { AddSpoolDialog } from "@/components/spool/add-spool-dialog";
import { AmsDryingStatus } from "@/components/ams/ams-drying-status";
import { InventoryClient } from "./inventory-client";

export const dynamic = "force-dynamic";

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<{ printer?: string }>;
}) {
  const params = await searchParams;
  const { printers, selected } = await getSelectedPrinter(params);

  // Load printer + AMS slots
  const printer = selected
    ? await db.query.printers.findFirst({
        where: (p, { eq }) => eq(p.id, selected.id),
        with: {
          amsSlots: {
            with: {
              spool: { with: { filament: { with: { vendor: true } } } },
            },
          },
        },
      })
    : null;

  // Load active racks and AMS units for the selected printer
  const activeRacks = await getActiveRacks();
  const amsUnits = printer ? await getPrinterAmsUnits(printer.id) : [];

  // Auto-move orphaned spools: "storage" sentinel → workbench,
  // and out-of-bounds rack spools (rack archived or row/col outside
  // current bounds) → workbench
  const rackById = new Map(activeRacks.map((r) => [r.id, r]));
  const allRackSpools = await db.query.spools.findMany({
    where: or(like(schema.spools.location, "rack:%"), eq(schema.spools.location, "storage")),
  });
  for (const spool of allRackSpools) {
    if (spool.location === "storage") {
      await db.update(schema.spools)
        .set({ location: "workbench", updatedAt: new Date() })
        .where(eq(schema.spools.id, spool.id));
      continue;
    }
    const parsed = parseRackLocation(spool.location);
    if (!parsed) continue;
    const rack = rackById.get(parsed.rackId);
    if (!rack || parsed.row > rack.rows || parsed.col > rack.cols) {
      await db.update(schema.spools)
        .set({ location: "workbench", updatedAt: new Date() })
        .where(eq(schema.spools.id, spool.id));
    }
  }

  // Fetch filaments for Add Spool dialog
  const allFilaments = await db.query.filaments.findMany({
    with: { vendor: true },
    orderBy: [desc(schema.filaments.createdAt)],
  });

  // Fetch storage sections
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

  const allSpoolsForClone = [...storageSpools, ...surplusSpools, ...workbenchSpools];

  return (
    <div data-testid="page-inventory" className="p-4 space-y-6">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <h1 className="text-sm font-semibold text-foreground">Inventory</h1>
        <div className="flex items-center gap-2">
          <AddSpoolDialog
            filaments={JSON.parse(JSON.stringify(allFilaments))}
            spools={JSON.parse(JSON.stringify(allSpoolsForClone))}
          />
          {selected && (
            <Suspense fallback={null}>
              <PrinterSelector
                printers={printers.map((p) => ({
                  id: p.id,
                  name: p.name,
                  model: p.model,
                  isActive: p.isActive,
                }))}
                currentPrinterId={selected.id}
              />
            </Suspense>
          )}
        </div>
      </div>

      <AmsDryingStatus />

      <InventoryClient
        initialSlots={printer ? JSON.parse(JSON.stringify(printer.amsSlots)) : []}
        printerId={printer?.id ?? null}
        printerName={printer?.name ?? null}
        spools={JSON.parse(JSON.stringify(storageSpools))}
        surplusSpools={JSON.parse(JSON.stringify(surplusSpools))}
        workbenchSpools={JSON.parse(JSON.stringify(workbenchSpools))}
        activeRacks={JSON.parse(JSON.stringify(activeRacks))}
        amsUnits={JSON.parse(JSON.stringify(amsUnits))}
      />
    </div>
  );
}
