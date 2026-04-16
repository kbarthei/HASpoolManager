/**
 * Shop deduplication script.
 * Finds duplicate shop entries and merges them.
 *
 * Run:   npx tsx scripts/cleanup-shops.ts           # preview
 *        npx tsx scripts/cleanup-shops.ts --apply    # write changes
 */

import { db } from "../lib/db/index.js";
import { shops, orders, shopListings } from "../lib/db/schema.js";
import { eq, sql } from "drizzle-orm";

const apply = process.argv.includes("--apply");

interface ShopRow {
  id: string;
  name: string;
  website: string | null;
  orderCount: number;
  listingCount: number;
}

async function main() {
  // Load all shops with counts
  const allShops = await db.all(sql`
    SELECT s.id, s.name, s.website,
      (SELECT COUNT(*) FROM orders o WHERE o.shop_id = s.id) as orderCount,
      (SELECT COUNT(*) FROM shop_listings sl WHERE sl.shop_id = s.id) as listingCount
    FROM shops s
    ORDER BY s.name
  `) as ShopRow[];

  console.log("");
  console.log("Shop Deduplication Preview");
  console.log("=".repeat(80));
  console.log(`Total shops: ${allShops.length}`);
  console.log("-".repeat(80));

  // Group by normalized name (lowercase, strip "store", "eu", common suffixes)
  const groups = new Map<string, ShopRow[]>();
  for (const shop of allShops) {
    const key = normalizeName(shop.name);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(shop);
  }

  const merges: Array<{ target: ShopRow; sources: ShopRow[] }> = [];

  for (const [key, group] of groups) {
    if (group.length <= 1) continue;

    // Pick the best target: prefer one with website, then most orders+listings
    const sorted = [...group].sort((a, b) => {
      const aScore = (a.website ? 100 : 0) + a.orderCount + a.listingCount;
      const bScore = (b.website ? 100 : 0) + b.orderCount + b.listingCount;
      return bScore - aScore;
    });

    const target = sorted[0];
    const sources = sorted.slice(1);
    merges.push({ target, sources });
  }

  if (merges.length === 0) {
    console.log("\nNo duplicates found. All shops are unique.");
    return;
  }

  console.log(`\nFound ${merges.length} group(s) to merge:\n`);

  for (const { target, sources } of merges) {
    console.log(`  Keep: "${target.name}" (${target.orderCount} orders, ${target.listingCount} listings, URL: ${target.website ?? "none"})`);
    for (const s of sources) {
      console.log(`  Merge: "${s.name}" (${s.orderCount} orders, ${s.listingCount} listings) → into above`);
    }
    console.log("");
  }

  if (apply) {
    console.log("Applying merges...");
    for (const { target, sources } of merges) {
      for (const source of sources) {
        // Move orders
        if (source.orderCount > 0) {
          await db.update(orders).set({ shopId: target.id }).where(eq(orders.shopId, source.id));
          console.log(`  Moved ${source.orderCount} orders from "${source.name}" → "${target.name}"`);
        }
        // Move listings
        if (source.listingCount > 0) {
          await db.update(shopListings).set({ shopId: target.id }).where(eq(shopListings.shopId, source.id));
          console.log(`  Moved ${source.listingCount} listings from "${source.name}" → "${target.name}"`);
        }
        // Delete source
        await db.delete(shops).where(eq(shops.id, source.id));
        console.log(`  Deleted "${source.name}"`);
      }
    }
    console.log("\nDone.");
  } else {
    console.log("Run with --apply to execute merges.");
  }
}

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+(store|shop|eu|de|com|online|gmbh|ag)\b/g, "")
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

main().catch(console.error);
