import { NextRequest, NextResponse } from "next/server";
import { readFileSync, existsSync } from "fs";
import path from "path";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path: segments } = await params;
  const filePath = path.join("/config/snapshots", ...segments);

  const resolved = path.resolve(filePath);
  if (!resolved.startsWith("/config/snapshots")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  if (!existsSync(resolved)) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const buffer = readFileSync(resolved);
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "image/jpeg",
      "Cache-Control": "public, max-age=86400",
    },
  });
}
