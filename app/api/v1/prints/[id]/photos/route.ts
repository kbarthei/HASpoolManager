import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { prints } from "@/lib/db/schema";
import { optionalAuth, requireAuth } from "@/lib/auth";
import {
  MAX_PHOTO_BYTES,
  MAX_USER_PHOTOS_PER_PRINT,
  getPhotos,
  listUserPhotoCount,
  savePhoto,
} from "@/lib/photo-manager";
import { validateImageUpload, sanitizeFilename } from "@/lib/file-validator";

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

  // Sanitize filename to prevent path traversal
  const safeFilename = sanitizeFilename(file.name);
  if (!safeFilename) {
    return NextResponse.json({ error: "Invalid filename" }, { status: 400 });
  }

  // Read file buffer for validation
  const buffer = Buffer.from(await file.arrayBuffer());

  // Comprehensive validation: size, MIME type, magic bytes
  const validation = validateImageUpload(buffer, file.type, MAX_PHOTO_BYTES);
  if (!validation.valid) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  // Use validated extension from magic bytes detection
  const ext = validation.extension!;

  try {
    const saved = await savePhoto(id, buffer, "user", ext);
    return NextResponse.json({ ok: true, photo: saved }, { status: 201 });
  } catch (error) {
    console.error("POST /api/v1/prints/[id]/photos error:", error);
    return NextResponse.json({ error: "Photo save failed" }, { status: 500 });
  }
}
