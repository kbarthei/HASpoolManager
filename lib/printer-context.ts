import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function getSelectedPrinter(searchParams: { printer?: string }) {
  const printers = await db.query.printers.findMany({
    where: eq(schema.printers.isActive, true),
  });

  const selectedId = searchParams.printer || printers[0]?.id;
  const selected = printers.find((p) => p.id === selectedId) || printers[0];

  return { printers, selected };
}
