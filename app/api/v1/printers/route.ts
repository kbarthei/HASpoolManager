import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { printers } from "@/lib/db/schema";
import { requireAuth } from "@/lib/auth";

// GET /api/v1/printers — List all printers with amsSlots
export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!auth.authenticated) return auth.response;

  try {
    const result = await db.query.printers.findMany({
      with: { amsSlots: true },
      orderBy: (printers, { asc }) => [asc(printers.name)],
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("GET /api/v1/printers error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// POST /api/v1/printers — Create a printer
export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!auth.authenticated) return auth.response;

  try {
    const body = await request.json();

    const [printer] = await db
      .insert(printers)
      .values({
        name: body.name,
        model: body.model,
        serial: body.serial,
        mqttTopic: body.mqttTopic,
        haDeviceId: body.haDeviceId,
        ipAddress: body.ipAddress,
        amsCount: body.amsCount,
      })
      .returning();

    return NextResponse.json(printer, { status: 201 });
  } catch (error) {
    console.error("POST /api/v1/printers error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
