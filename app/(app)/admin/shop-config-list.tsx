import { db } from "@/lib/db";
import { shops, orders } from "@/lib/db/schema";
import { desc, sql } from "drizzle-orm";
import { Card } from "@/components/ui/card";
import { Store } from "lucide-react";
import { ShopConfigRow } from "./shop-config-row";

interface ShopWithStats {
  id: string;
  name: string;
  freeShippingThreshold: number | null;
  shippingCost: number | null;
  bulkDiscountRules: string | null;
  avgDeliveryDays: number | null;
  orderCount: number;
}

export async function ShopConfigList() {
  const rows = (await db.all(sql`
    SELECT
      s.id, s.name,
      s.free_shipping_threshold AS freeShippingThreshold,
      s.shipping_cost AS shippingCost,
      s.bulk_discount_rules AS bulkDiscountRules,
      s.avg_delivery_days AS avgDeliveryDays,
      (SELECT COUNT(*) FROM orders o WHERE o.shop_id = s.id) AS orderCount
    FROM shops s
    WHERE s.is_active = 1
    ORDER BY s.name
  `)) as ShopWithStats[];

  if (rows.length === 0) {
    return null;
  }

  return (
    <Card className="p-4 space-y-3">
      <div>
        <h2 className="text-sm font-semibold flex items-center gap-1.5">
          <Store className="w-4 h-4 text-primary" />
          Shop Configuration
        </h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Shipping + bulk-discount rules used by the order optimizer. Average delivery days is computed from order history (read-only).
        </p>
      </div>
      <div className="space-y-2">
        {rows.map((row) => (
          <ShopConfigRow
            key={row.id}
            shopId={row.id}
            name={row.name}
            orderCount={row.orderCount}
            initialFreeShippingThreshold={row.freeShippingThreshold}
            initialShippingCost={row.shippingCost}
            initialBulkDiscountRules={row.bulkDiscountRules}
            avgDeliveryDays={row.avgDeliveryDays}
          />
        ))}
      </div>
    </Card>
  );
}
