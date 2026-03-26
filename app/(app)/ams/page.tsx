import { db } from "@/lib/db";
import { AmsClient } from "./ams-client";

export default async function AmsPage() {
  const printer = await db.query.printers.findFirst({
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
    <div className="p-4">
      <AmsClient
        initialSlots={JSON.parse(JSON.stringify(printer.amsSlots))}
        printerId={printer.id}
      />
    </div>
  );
}
