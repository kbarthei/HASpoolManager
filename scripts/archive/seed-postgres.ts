import { config } from "dotenv";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { readFileSync } from "fs";
import { resolve } from "path";
import * as schema from "../lib/db/schema";

config({ path: ".env.local" });

const sql = neon(process.env.DATABASE_URL!);
const db = drizzle(sql, { schema });

interface SeedData {
  vendors: Array<{ id: number; name: string; website: string; emptySpoolWeight?: number }>;
  shops: Array<{ id: number; name: string; url: string; country: string }>;
  filaments: Array<{
    id: number; vendorId: number; name: string; material: string;
    diameter: number; density: number | null; colorName: string; colorHex: string;
    nozzleTempDefault: number | null; nozzleTempMin: number | null; nozzleTempMax: number | null;
    bedTempDefault: number | null; bedTempMin: number | null; bedTempMax: number | null;
    spoolWeight: number; bambuIdx: string | null; externalId: number;
  }>;
  spools: Array<{
    id: number; filamentId: number; purchasePrice: number; currency: string;
    initialWeight: number; remainingWeight: number; location: string; status: string;
    externalId: number; registered?: string;
  }>;
  tagMappings: Array<{
    spoolId: number; tagUid: string; source: string; isReal: boolean;
  }>;
  printer: {
    name: string; model: string; haDeviceId: string; ipAddress: string; amsCount: number;
  };
  amsSlots: Array<{
    amsIndex: number; trayIndex: number; spoolId: number | null;
    bambuTrayIdx: string | null; bambuColor: string | null; bambuType: string | null;
    bambuTagUid: string | null; bambuRemain: number; isEmpty: boolean;
  }>;
  orders: Array<{
    id: number; shopId: number; vendorId: number | null; orderNumber: string;
    orderDate: string; actualDelivery: string; status: string;
    shippingCost: number; totalCost: number; currency: string;
    sourceUrl: string; notes: string;
    items: Array<{
      spoolId: number; filamentId: number; quantity: number; unitPrice: number;
    }>;
  }>;
}

async function seed() {
  const dataPath = resolve(__dirname, "seed-data/seed-final.json");
  const raw = readFileSync(dataPath, "utf-8");
  const data: SeedData = JSON.parse(raw);

  // Maps from seed IDs to DB UUIDs
  const vendorMap = new Map<number, string>();
  const shopMap = new Map<number, string>();
  const filamentMap = new Map<number, string>();
  const spoolMap = new Map<number, string>();
  const printerIdHolder: { id?: string } = {};

  console.log("Seeding HASpoolManager database...\n");

  // === 1. Vendors ===
  console.log(`Inserting ${data.vendors.length} vendors...`);
  for (const v of data.vendors) {
    const [row] = await db.insert(schema.vendors).values({
      name: v.name,
      website: v.website,
      country: v.name === "R3D" ? "DE" : "CN",
    }).returning();
    vendorMap.set(v.id, row.id);
    console.log(`  [${v.id}] ${v.name} → ${row.id}`);
  }

  // === 2. Shops ===
  console.log(`\nInserting ${data.shops.length} shops...`);
  for (const s of data.shops) {
    const [row] = await db.insert(schema.shops).values({
      name: s.name,
      website: s.url,
      country: s.country,
      currency: "EUR",
    }).returning();
    shopMap.set(s.id, row.id);
    console.log(`  [${s.id}] ${s.name} → ${row.id}`);
  }

  // === 3. Filaments ===
  console.log(`\nInserting ${data.filaments.length} filaments...`);
  for (const f of data.filaments) {
    const [row] = await db.insert(schema.filaments).values({
      vendorId: vendorMap.get(f.vendorId)!,
      name: f.name,
      material: f.material,
      diameter: f.diameter,
      density: f.density,
      colorName: f.colorName,
      colorHex: f.colorHex,
      nozzleTempDefault: f.nozzleTempDefault,
      nozzleTempMin: f.nozzleTempMin,
      nozzleTempMax: f.nozzleTempMax,
      bedTempDefault: f.bedTempDefault,
      bedTempMin: f.bedTempMin,
      bedTempMax: f.bedTempMax,
      spoolWeight: f.spoolWeight,
      bambuIdx: f.bambuIdx,
      externalId: String(f.externalId),
    }).returning();
    filamentMap.set(f.id, row.id);
    console.log(`  [${f.id}] ${f.name} (${f.material}) → ${row.id}`);
  }

  // === 4. Spools ===
  console.log(`\nInserting ${data.spools.length} spools...`);
  for (const s of data.spools) {
    const [row] = await db.insert(schema.spools).values({
      filamentId: filamentMap.get(s.filamentId)!,
      purchasePrice: String(s.purchasePrice),
      currency: s.currency,
      initialWeight: s.initialWeight,
      remainingWeight: s.remainingWeight,
      location: s.location,
      status: s.status,
      externalId: String(s.externalId),
    }).returning();
    spoolMap.set(s.id, row.id);
    console.log(`  [${s.id}] ${s.remainingWeight}g @ ${s.location} → ${row.id}`);
  }

  // === 5. Tag Mappings ===
  console.log(`\nInserting ${data.tagMappings.length} tag mappings...`);
  for (const t of data.tagMappings) {
    await db.insert(schema.tagMappings).values({
      tagUid: t.tagUid,
      spoolId: spoolMap.get(t.spoolId)!,
      source: t.source,
    });
    const label = t.isReal ? "REAL" : "placeholder";
    console.log(`  spool ${t.spoolId} → ${t.tagUid} (${label})`);
  }

  // === 6. Printer ===
  console.log("\nInserting printer...");
  const [printer] = await db.insert(schema.printers).values({
    name: data.printer.name,
    model: data.printer.model,
    haDeviceId: data.printer.haDeviceId,
    ipAddress: data.printer.ipAddress,
    amsCount: data.printer.amsCount,
  }).returning();
  printerIdHolder.id = printer.id;
  console.log(`  ${data.printer.name} (${data.printer.model}) → ${printer.id}`);

  // === 7. AMS Slots ===
  console.log(`\nInserting ${data.amsSlots.length} AMS slots...`);
  for (const slot of data.amsSlots) {
    await db.insert(schema.amsSlots).values({
      printerId: printerIdHolder.id!,
      amsIndex: slot.amsIndex,
      trayIndex: slot.trayIndex,
      spoolId: slot.spoolId ? spoolMap.get(slot.spoolId) ?? null : null,
      bambuTrayIdx: slot.bambuTrayIdx,
      bambuColor: slot.bambuColor,
      bambuType: slot.bambuType,
      bambuTagUid: slot.bambuTagUid,
      bambuRemain: slot.bambuRemain,
      isEmpty: slot.isEmpty,
    });
    const status = slot.isEmpty ? "empty" : `spool #${slot.spoolId}`;
    console.log(`  AMS ${slot.amsIndex} tray ${slot.trayIndex} → ${status}`);
  }

  // === 8. Orders + Order Items ===
  console.log(`\nInserting ${data.orders.length} orders...`);
  for (const o of data.orders) {
    const [order] = await db.insert(schema.orders).values({
      vendorId: o.vendorId ? vendorMap.get(o.vendorId) ?? null : null,
      shopId: shopMap.get(o.shopId) ?? null,
      orderNumber: o.orderNumber,
      orderDate: o.orderDate,
      actualDelivery: o.actualDelivery,
      status: o.status,
      shippingCost: String(o.shippingCost),
      totalCost: String(o.totalCost),
      currency: o.currency,
      sourceUrl: o.sourceUrl,
      notes: o.notes,
    }).returning();

    console.log(`  Order #${o.id} (${o.orderNumber}) → ${order.id}`);

    for (const item of o.items) {
      await db.insert(schema.orderItems).values({
        orderId: order.id,
        filamentId: filamentMap.get(item.filamentId)!,
        spoolId: spoolMap.get(item.spoolId) ?? null,
        quantity: item.quantity,
        unitPrice: String(item.unitPrice),
      });
    }
    console.log(`    ${o.items.length} items inserted`);
  }

  // === Summary ===
  console.log("\n=== SEED COMPLETE ===");
  console.log(`  Vendors:      ${vendorMap.size}`);
  console.log(`  Shops:        ${shopMap.size}`);
  console.log(`  Filaments:    ${filamentMap.size}`);
  console.log(`  Spools:       ${spoolMap.size}`);
  console.log(`  Tag Mappings: ${data.tagMappings.length}`);
  console.log(`  Printer:      1`);
  console.log(`  AMS Slots:    ${data.amsSlots.length}`);
  console.log(`  Orders:       ${data.orders.length}`);
  console.log(`  Order Items:  ${data.orders.reduce((n, o) => n + o.items.length, 0)}`);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
