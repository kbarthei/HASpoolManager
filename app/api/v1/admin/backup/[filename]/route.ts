import { NextRequest, NextResponse } from "next/server";
import { createReadStream, statSync, unlinkSync } from "fs";
import { Readable } from "stream";
import { optionalAuth, requireAuth } from "@/lib/auth";
import { resolveBackupFile } from "@/lib/backup-manager";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: Promise<{ filename: string }> }) {
  const auth = await optionalAuth(request);
  if (!auth.authenticated) return auth.response;

  const { filename } = await params;
  const fullPath = resolveBackupFile(filename);
  if (!fullPath) {
    return NextResponse.json({ error: "Backup not found" }, { status: 404 });
  }

  const size = statSync(fullPath).size;
  const nodeStream = createReadStream(fullPath);
  const webStream = Readable.toWeb(nodeStream) as unknown as ReadableStream;

  return new NextResponse(webStream, {
    status: 200,
    headers: {
      "Content-Type": "application/gzip",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(size),
    },
  });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ filename: string }> }) {
  const auth = await requireAuth(request);
  if (!auth.authenticated) return auth.response;

  const { filename } = await params;
  const fullPath = resolveBackupFile(filename);
  if (!fullPath) {
    return NextResponse.json({ error: "Backup not found" }, { status: 404 });
  }

  try {
    unlinkSync(fullPath);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("DELETE /api/v1/admin/backup/[filename] error:", error);
    return NextResponse.json({ error: "Delete failed" }, { status: 500 });
  }
}
