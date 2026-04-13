import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { orders } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireAuth, optionalAuth } from "@/lib/auth";

// GET /api/v1/orders/:id — Get order with vendor and items (with filament and spool)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await optionalAuth(request);
  if (!auth.authenticated) return auth.response;

  try {
    const { id } = await params;

    const order = await db.query.orders.findFirst({
      where: eq(orders.id, id),
      with: {
        vendor: true,
        items: {
          with: {
            filament: true,
            spool: true,
          },
        },
      },
    });

    if (!order) {
      return NextResponse.json(
        { error: "Order not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(order);
  } catch (error) {
    console.error("GET /api/v1/orders/[id] error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// PUT /api/v1/orders/:id — Update order
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(request);
  if (!auth.authenticated) return auth.response;

  try {
    const { id } = await params;
    const body = await request.json();
    const {
      vendorId,
      shopId,
      orderNumber,
      orderDate,
      expectedDelivery,
      actualDelivery,
      status,
      shippingCost,
      totalCost,
      currency,
      sourceUrl,
      notes,
    } = body;

    const [updated] = await db
      .update(orders)
      .set({
        vendorId,
        shopId,
        orderNumber,
        orderDate,
        expectedDelivery,
        actualDelivery,
        status,
        shippingCost,
        totalCost,
        currency,
        sourceUrl,
        notes,
        updatedAt: new Date(),
      })
      .where(eq(orders.id, id))
      .returning();

    if (!updated) {
      return NextResponse.json(
        { error: "Order not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(updated);
  } catch (error) {
    console.error("PUT /api/v1/orders/[id] error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// DELETE /api/v1/orders/:id — Delete order
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(request);
  if (!auth.authenticated) return auth.response;

  try {
    const { id } = await params;

    const [deleted] = await db
      .delete(orders)
      .where(eq(orders.id, id))
      .returning();

    if (!deleted) {
      return NextResponse.json(
        { error: "Order not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(deleted);
  } catch (error) {
    console.error("DELETE /api/v1/orders/[id] error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
