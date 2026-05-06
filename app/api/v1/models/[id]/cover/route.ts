import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { modelFiles } from "@/lib/db/schema";
import { optionalAuth } from "@/lib/auth";
import { readCover } from "@/lib/model-file-store";

export async function GET(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await optionalAuth(request);
  if (!auth.authenticated) return auth.response;

  const { id } = await ctx.params;

  const model = await db.query.modelFiles.findFirst({
    where: eq(modelFiles.id, id),
    columns: { coverPath: true },
  });
  if (!model || !model.coverPath) {
    return NextResponse.json({ error: "Cover not found" }, { status: 404 });
  }

  const result = readCover(model.coverPath);
  if (!result) {
    return NextResponse.json({ error: "Cover file missing on disk" }, { status: 404 });
  }

  // Convert Buffer to a fresh Uint8Array so the response gets a proper
  // ArrayBuffer-backed body (Buffer.buffer can be a SharedArrayBuffer slice).
  const bodyBytes = new Uint8Array(result.buffer);
  return new NextResponse(bodyBytes, {
    status: 200,
    headers: {
      "Content-Type": "image/png",
      "Content-Length": String(result.bytes),
      "Cache-Control": "public, max-age=3600",
    },
  });
}
