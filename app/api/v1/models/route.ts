import { NextRequest, NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { modelFiles, modelFileFilaments } from "@/lib/db/schema";
import { optionalAuth } from "@/lib/auth";
import { parseModelFile, summarize } from "@/lib/3mf-parser";
import { saveCover } from "@/lib/model-file-store";
import { validate3MFUpload, sanitizeFilename, validateExtension } from "@/lib/file-validator";

const MAX_3MF_BYTES = 150 * 1024 * 1024; // 150 MB

export async function GET(request: NextRequest) {
  const auth = await optionalAuth(request);
  if (!auth.authenticated) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get("limit") ?? "50", 10), 200);
    const offset = parseInt(searchParams.get("offset") ?? "0", 10);

    const rows = await db.query.modelFiles.findMany({
      orderBy: [desc(modelFiles.uploadedAt)],
      limit,
      offset,
    });

    return NextResponse.json(rows);
  } catch (error) {
    console.error("GET /api/v1/models error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// Browser-callable from /models drag-drop. optionalAuth keeps the LAN-only
// PWA + HA ingress gate as the security boundary (consistent with
// /admin/printer-mappings POST + other admin UI mutations).
export async function POST(request: NextRequest) {
  const auth = await optionalAuth(request);
  if (!auth.authenticated) return auth.response;

  try {
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Missing file in form-data" }, { status: 400 });
    }

    // Sanitize filename to prevent path traversal
    const safeFilename = sanitizeFilename(file.name);
    if (!safeFilename) {
      return NextResponse.json({ error: "Invalid filename" }, { status: 400 });
    }

    // Validate file extension
    if (!validateExtension(safeFilename, ['3mf'])) {
      return NextResponse.json(
        { error: "File must have .3mf extension" },
        { status: 400 },
      );
    }

    // Read file buffer for validation
    const buffer = Buffer.from(await file.arrayBuffer());

    // Comprehensive validation: size, MIME type, magic bytes (ZIP format)
    const validation = validate3MFUpload(buffer, file.type, MAX_3MF_BYTES);
    if (!validation.valid) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    // Parse 3MF structure (additional validation happens here)
    const parsed = await parseModelFile(buffer);

    // Dedup: identical sha256 → return existing row instead of creating duplicate.
    const existing = await db.query.modelFiles.findFirst({
      where: eq(modelFiles.sha256, parsed.sha256),
    });
    if (existing) {
      return NextResponse.json({ ...existing, deduped: true }, { status: 200 });
    }

    const summary = summarize(parsed);
    const id = crypto.randomUUID();

    let coverPath: string | null = null;
    if (parsed.cover) {
      try {
        coverPath = saveCover(id, parsed.cover);
      } catch (err) {
        console.error("Cover save failed:", err);
        parsed.warnings.push(`cover-save-failed: ${(err as Error).message}`);
      }
    }

    const [row] = await db
      .insert(modelFiles)
      .values({
        id,
        filename: file.name,
        sha256: parsed.sha256,
        format: parsed.format,
        printerModel: parsed.printerModel,
        layerHeightMm: parsed.layerHeightMm,
        nozzleDiameterMm: parsed.nozzleDiameterMm,
        platerName: parsed.platerName,
        plateCount: Math.max(parsed.plates.length, 1),
        totalPredictionSeconds: summary.totalPredictionSeconds,
        totalWeightGrams: summary.totalWeightGrams,
        coverPath,
        parseWarnings: parsed.warnings.length > 0 ? JSON.stringify(parsed.warnings) : null,
      })
      .returning();

    if (parsed.filaments.length > 0) {
      await db.insert(modelFileFilaments).values(
        parsed.filaments.map((f) => ({
          modelFileId: id,
          plateIndex: f.plateIndex,
          sequenceId: f.sequenceId,
          trayInfoIdx: f.trayInfoIdx,
          filamentType: f.type,
          colorHex: f.colorHex,
          usedGrams: f.usedGrams,
          usedMeters: f.usedMeters,
        })),
      );
    }

    return NextResponse.json(row, { status: 201 });
  } catch (error) {
    console.error("POST /api/v1/models error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
