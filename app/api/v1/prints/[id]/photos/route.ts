import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { prints } from "@/lib/db/schema";
import { optionalAuth, requireAuth } from "@/lib/auth";
import {
  ALLOWED_MIME_TYPES,
  MAX_PHOTO_BYTES,
  MAX_USER_PHOTOS_PER_PRINT,
  getPhotos,
  listUserPhotoCount,
  savePhoto,
} from "@/lib/photo-manager";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await optionalAuth(request);
  if (!auth.authenticated) return auth.response;

  const { id } = await params;
  const row = await db.query.prints.findFirst({
    where: eq(prints.id, id),
    columns: { id: true },
  });
  if (!row) return NextResponse.json({ error: "Print not found" }, { status: 404 });

  const entries = await getPhotos(id);
  return NextResponse.json({ photos: entries });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(request);
  if (!auth.authenticated) return auth.response;

  const { id } = await params;
  const row = await db.query.prints.findFirst({
    where: eq(prints.id, id),
    columns: { id: true },
  });
  if (!row) return NextResponse.json({ error: "Print not found" }, { status: 404 });

  const current = await getPhotos(id);
  if (listUserPhotoCount(current) >= MAX_USER_PHOTOS_PER_PRINT) {
    return NextResponse.json(
      { error: `User-photo limit reached (${MAX_USER_PHOTOS_PER_PRINT}). Delete one before adding more.` },
      { status: 400 },
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid multipart body" }, { status: 400 });
  }

  const file = formData.get("photo");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing 'photo' field" }, { status: 400 });
  }
  if (file.size > MAX_PHOTO_BYTES) {
    return NextResponse.json(
      { error: `Photo too large (max ${Math.round(MAX_PHOTO_BYTES / 1024 / 1024)}MB)` },
      { status: 400 },
    );
  }
  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    return NextResponse.json(
      { error: `Unsupported mime type ${file.type}; allowed: ${[...ALLOWED_MIME_TYPES].join(", ")}` },
      { status: 400 },
    );
  }

  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const buffer = Buffer.from(await file.arrayBuffer());

  try {
    const saved = await savePhoto(id, buffer, "user", ext);
    return NextResponse.json({ ok: true, photo: saved }, { status: 201 });
  } catch (error) {
    console.error("POST /api/v1/prints/[id]/photos error:", error);
    return NextResponse.json({ error: "Photo save failed" }, { status: 500 });
  }
}
