import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { vendors } from "@/lib/db/schema";
import { requireAuth } from "@/lib/auth";
import { asc } from "drizzle-orm";

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
    const body = await request.json();
    const { name, website, country, logoUrl, bambuPrefix, notes } = body;

    if (!name) {
      return NextResponse.json(
        { error: "Name is required" },
        { status: 400 }
      );
    }

    const [vendor] = await db
      .insert(vendors)
      .values({ name, website, country, logoUrl, bambuPrefix, notes })
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
