import { NextRequest, NextResponse } from "next/server";
import { requireAuth, optionalAuth } from "@/lib/auth";
import { listBackups, runBackup, cleanupOldBackups, DEFAULT_RETENTION_DAYS } from "@/lib/backup-manager";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await optionalAuth(request);
  if (!auth.authenticated) return auth.response;

  const backups = listBackups().map((b) => ({
    filename: b.filename,
    size: b.size,
    createdAt: b.createdAt.toISOString(),
  }));

  return NextResponse.json({ backups, retentionDays: DEFAULT_RETENTION_DAYS });
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!auth.authenticated) return auth.response;

  try {
    const result = await runBackup();
    const cleanup = cleanupOldBackups();
    return NextResponse.json({
      ok: true,
      filename: result.filename,
      size: result.size,
      durationMs: result.durationMs,
      cleanupDeleted: cleanup.deleted.length,
    });
  } catch (error) {
    console.error("POST /api/v1/admin/backup error:", error);
    return NextResponse.json({ error: "Backup failed" }, { status: 500 });
  }
}
