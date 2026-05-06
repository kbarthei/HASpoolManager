import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { printers } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireAuth, optionalAuth } from "@/lib/auth";

// GET /api/v1/printers/:id — Get printer with amsSlots (each with spool)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await optionalAuth(request);
  if (!auth.authenticated) return auth.response;

  try {
    const { id } = await params;

    const printer = await db.query.printers.findFirst({
      where: eq(printers.id, id),
      with: {
        amsSlots: {
          with: { spool: { with: { filament: { with: { vendor: true } } } } },
        },
      },
    });

    if (!printer) {
      return NextResponse.json(
        { error: "Printer not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(printer);
  } catch (error) {
    console.error("GET /api/v1/printers/[id] error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// PUT /api/v1/printers/:id — Update printer
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
      name,
      model,
      serial,
      mqttTopic,
      haDeviceId,
      ipAddress,
      isActive,
      accessCode,
    } = body;

    // Build update set conditionally so an absent field doesn't null-out an existing value.
    // Fields that ARE present (including null) are written through.
    const updateSet: Record<string, unknown> = { updatedAt: new Date() };
    if (name !== undefined) updateSet.name = name;
    if (model !== undefined) updateSet.model = model;
    if (serial !== undefined) updateSet.serial = serial;
    if (mqttTopic !== undefined) updateSet.mqttTopic = mqttTopic;
    if (haDeviceId !== undefined) updateSet.haDeviceId = haDeviceId;
    if (ipAddress !== undefined) updateSet.ipAddress = ipAddress;
    if (isActive !== undefined) updateSet.isActive = isActive;
    if (accessCode !== undefined) updateSet.accessCode = accessCode;

    const [updated] = await db
      .update(printers)
      .set(updateSet)
      .where(eq(printers.id, id))
      .returning();

    if (!updated) {
      return NextResponse.json(
        { error: "Printer not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(updated);
  } catch (error) {
    console.error("PUT /api/v1/printers/[id] error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// DELETE /api/v1/printers/:id — Delete printer
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(request);
  if (!auth.authenticated) return auth.response;

  try {
    const { id } = await params;

    const [deleted] = await db
      .delete(printers)
      .where(eq(printers.id, id))
      .returning();

    if (!deleted) {
      return NextResponse.json(
        { error: "Printer not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(deleted);
  } catch (error) {
    console.error("DELETE /api/v1/printers/[id] error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
