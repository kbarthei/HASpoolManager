import { NextRequest, NextResponse } from "next/server";
import { and, desc, gte, lte } from "drizzle-orm";
import { optionalAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { orders } from "@/lib/db/schema";
import { csvResponseHeaders, toCsv } from "@/lib/export-csv";

export const dynamic = "force-dynamic";

const COLUMNS = [
  "id",
  "order_date",
  "order_number",
  "vendor",
  "status",
  "item_count",
  "total_cost",
  "shipping_cost",
  "currency",
  "expected_delivery",
  "actual_delivery",
  "source_url",
];

export async function GET(request: NextRequest) {
  const auth = await optionalAuth(request);
  if (!auth.authenticated) return auth.response;

  const url = new URL(request.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");

  const filters = [];
  if (from) filters.push(gte(orders.orderDate, from));
  if (to) filters.push(lte(orders.orderDate, to));

  const rows = await db.query.orders.findMany({
    where: filters.length > 0 ? and(...filters) : undefined,
    orderBy: [desc(orders.orderDate)],
    with: {
      vendor: { columns: { name: true } },
      items: { columns: { id: true } },
    },
  });

  const csv = toCsv(
    rows.map((r) => ({
      id: r.id,
      order_date: r.orderDate,
      order_number: r.orderNumber ?? "",
      vendor: r.vendor?.name ?? "",
      status: r.status,
      item_count: r.items?.length ?? 0,
      total_cost: r.totalCost,
      shipping_cost: r.shippingCost,
      currency: r.currency ?? "",
      expected_delivery: r.expectedDelivery ?? "",
      actual_delivery: r.actualDelivery ?? "",
      source_url: r.sourceUrl ?? "",
    })),
    COLUMNS,
  );

  const filename = `haspoolmanager-orders-${new Date().toISOString().slice(0, 10)}.csv`;
  const buffer = Buffer.from(csv, "utf-8");
  return new NextResponse(buffer, {
    status: 200,
    headers: csvResponseHeaders(filename, buffer.byteLength),
  });
}
