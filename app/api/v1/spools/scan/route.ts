import { NextRequest, NextResponse } from "next/server";
import { generateText } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { optionalAuth } from "@/lib/auth";

const SYSTEM_PROMPT = `You are analyzing a 3D printing filament spool label. Extract the following fields from the image:
- vendor: manufacturer name (e.g., "Bambu Lab", "Polymaker", "eSUN")
- material: filament type (e.g., "PLA", "PETG", "ABS", "TPU")
- color_name: color name if visible (e.g., "White", "Matte Black"). ALWAYS in English.
- color_hex: estimated hex color code without # (e.g., "FFFFFF" for white)
- weight: net weight in grams (e.g., 1000)
- filament_code: any product/filament code visible
- name: full product name if visible
- printing_temp_min: minimum printing temperature in celsius
- printing_temp_max: maximum printing temperature in celsius

Return JSON only. If a field is not visible, use null.`;

export async function POST(request: NextRequest) {
  const auth = await optionalAuth(request);
  if (!auth.authenticated) return auth.response;

  try {
    const raw = await request.json();
    const { image } = raw as { image?: string };

    if (!image || typeof image !== "string") {
      return NextResponse.json(
        { error: "Missing image field (base64 data URL)" },
        { status: 400 },
      );
    }

    const { text: aiResponse } = await generateText({
      model: anthropic("claude-sonnet-4.6"),
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              image,
            },
            {
              type: "text",
              text: "Analyze this spool label and extract the filament details as JSON.",
            },
          ],
        },
      ],
    });

    // Parse AI response
    let parsed: {
      vendor: string | null;
      material: string | null;
      color_name: string | null;
      color_hex: string | null;
      weight: number | null;
      filament_code: string | null;
      name: string | null;
      printing_temp_min: number | null;
      printing_temp_max: number | null;
    };
    try {
      const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("No JSON in AI response");
      parsed = JSON.parse(jsonMatch[0]);
    } catch {
      return NextResponse.json(
        { error: "Failed to parse AI response", raw: aiResponse },
        { status: 422 },
      );
    }

    return NextResponse.json({
      vendor: parsed.vendor ?? null,
      material: parsed.material ?? null,
      color_name: parsed.color_name ?? null,
      color_hex: parsed.color_hex?.replace("#", "").slice(0, 6) ?? null,
      weight: parsed.weight ?? null,
      filament_code: parsed.filament_code ?? null,
      name: parsed.name ?? null,
      printing_temp_min: parsed.printing_temp_min ?? null,
      printing_temp_max: parsed.printing_temp_max ?? null,
      confidence: "high",
    });
  } catch (error) {
    console.error("POST /api/v1/spools/scan error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
