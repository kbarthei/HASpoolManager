import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { vendors } from "@/lib/db/schema";
import { requireAuth } from "@/lib/auth";
import { asc } from "drizzle-orm";
import { validateBody, createVendorSchema } from "@/lib/validations";

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!auth.authenticated) return auth.response;

  try {
    const allVendors = await db
      .select()
      .from(vendors)
      .orderBy(asc(vendors.name));

    return NextResponse.json(allVendors);
  } catch (error) {
    console.error("Failed to list vendors:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!auth.authenticated) return auth.response;

  try {
    const raw = await request.json();
    const validation = validateBody(createVendorSchema, raw);
    if (!validation.success) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }
    const { name, website, country, notes } = validation.data;

    const [vendor] = await db
      .insert(vendors)
      .values({ name, website, country, notes })
      .returning();

    return NextResponse.json(vendor, { status: 201 });
  } catch (error) {
    console.error("Failed to create vendor:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
