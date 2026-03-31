/**
 * One-off fix: update the PLA Silk+ shop listing URL.
 * Old URL (404): https://eu.store.bambulab.com/products/pla-silk
 * New URL (200): https://eu.store.bambulab.com/en/products/pla-silk-upgrade
 *
 * Run with: npx tsx scripts/fix-pla-silk-url.ts
 */
import { config } from "dotenv";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { like, sql } from "drizzle-orm";
import * as schema from "../lib/db/schema";

config({ path: ".env.local" });

const sqlClient = neon(process.env.DATABASE_URL!);
const db = drizzle(sqlClient, { schema });

async function fix() {
  const OLD_URL_PATTERN = "%pla-silk%";
  const NEW_URL = "https://eu.store.bambulab.com/en/products/pla-silk-upgrade";

  // Preview affected rows
  const affected = await db.query.shopListings.findMany({
    where: like(schema.shopListings.productUrl, OLD_URL_PATTERN),
  });

  if (affected.length === 0) {
    console.log("No shop_listings rows match '%pla-silk%' — nothing to update.");
    return;
  }

  console.log(`Found ${affected.length} row(s) to update:`);
  for (const row of affected) {
    console.log(`  id=${row.id}  url=${row.productUrl}`);
  }

  const result = await db
    .update(schema.shopListings)
    .set({ productUrl: NEW_URL })
    .where(like(schema.shopListings.productUrl, OLD_URL_PATTERN));

  console.log(`\nUpdated. New URL: ${NEW_URL}`);
}

fix().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
