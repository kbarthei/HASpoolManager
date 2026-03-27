import { Suspense } from "react";
import { db } from "@/lib/db";
import { getSelectedPrinter } from "@/lib/printer-context";
import { PrinterSelector } from "@/components/layout/printer-selector";
import { AmsClient } from "./ams-client";

export default async function AmsPage({
  searchParams,
}: {
  searchParams: Promise<{ printer?: string }>;
}) {
  const params = await searchParams;
  const { printers, selected } = await getSelectedPrinter(params);

  if (!selected) {
    return (
      <div className="p-4 text-sm text-muted-foreground">No printer configured.</div>
    );
  }

  const printer = await db.query.printers.findFirst({
    where: (p, { eq }) => eq(p.id, selected.id),
    with: {
      amsSlots: {
        with: {
          spool: { with: { filament: { with: { vendor: true } } } },
        },
      },
    },
  });

  if (!printer) {
    return (
      <div className="p-4 text-sm text-muted-foreground">No printer configured.</div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-sm font-semibold text-foreground">AMS Slots</h1>
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
      </div>
      <AmsClient
        initialSlots={JSON.parse(JSON.stringify(printer.amsSlots))}
        printerId={printer.id}
      />
    </div>
  );
}
