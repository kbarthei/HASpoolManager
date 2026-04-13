import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { orders } from "@/lib/db/schema";
import { desc } from "drizzle-orm";
import { requireAuth, optionalAuth } from "@/lib/auth";

// GET /api/v1/orders — List orders with vendor and items (with filament)
export async function GET(request: NextRequest) {
  const auth = await optionalAuth(request);
  if (!auth.authenticated) return auth.response;

  try {
    const result = await db.query.orders.findMany({
      with: {
        vendor: true,
        items: {
          with: { filament: true },
        },
      },
      orderBy: [desc(orders.orderDate)],
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("GET /api/v1/orders error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// POST /api/v1/orders — Create an order
export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!auth.authenticated) return auth.response;

  try {
    const body = await request.json();

    const [order] = await db
      .insert(orders)
      .values({
        vendorId: body.vendorId,
        orderNumber: body.orderNumber,
        orderDate: body.orderDate,
        expectedDelivery: body.expectedDelivery,
        status: body.status,
        shippingCost: body.shippingCost,
        totalCost: body.totalCost,
        currency: body.currency,
        sourceUrl: body.sourceUrl,
        notes: body.notes,
      })
      .returning();

    return NextResponse.json(order, { status: 201 });
  } catch (error) {
    console.error("POST /api/v1/orders error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
