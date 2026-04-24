import { NextRequest, NextResponse } from "next/server";
import { createReadStream, statSync } from "fs";
import { Readable } from "stream";
import { optionalAuth, requireAuth } from "@/lib/auth";
import { deletePhoto, resolvePhotoPath } from "@/lib/photo-manager";

export const dynamic = "force-dynamic";

function mimeForExt(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  return "image/jpeg";
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; filename: string }> },
) {
  const auth = await optionalAuth(request);
  if (!auth.authenticated) return auth.response;

  const { id, filename } = await params;
  const fullPath = resolvePhotoPath(id, filename);
  if (!fullPath) return NextResponse.json({ error: "Photo not found" }, { status: 404 });

  const size = statSync(fullPath).size;
  const stream = Readable.toWeb(createReadStream(fullPath)) as unknown as ReadableStream;
  return new NextResponse(stream, {
    status: 200,
    headers: {
      "Content-Type": mimeForExt(filename),
      "Content-Length": String(size),
      "Cache-Control": "public, max-age=3600",
    },
  });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; filename: string }> },
) {
  const auth = await requireAuth(request);
  if (!auth.authenticated) return auth.response;

  const { id, filename } = await params;
  const ok = await deletePhoto(id, filename);
  if (!ok) return NextResponse.json({ error: "Photo not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
