/**
 * Match a print's name to a previously-uploaded 3MF.
 *
 * Bambu sends `print_name` like "kamerahalter_nord_sliced" — that often
 * matches the original 3MF filename. We do a normalized substring containment
 * check: if either string contains the other (after stripping spaces, slicer
 * suffixes, ".3mf"), the longer common substring / shorter string ratio is
 * the confidence score.
 *
 * Threshold for auto-link: 0.9 (per plan §3).
 */

import { eq } from "drizzle-orm";
import { db } from "./db";
import { modelFiles, prints } from "./db/schema";

const AUTO_LINK_CONFIDENCE = 0.9;

export function normalizeForMatch(s: string): string {
  return s
    .toLowerCase()
    .replace(/\.3mf$/i, "")
    .replace(/[\s\-_]+/g, "")
    .replace(/sliced$/, "")
    .trim();
}

/** Returns 0–1 score; 1 = exact normalized equality, 0 = no overlap. */
export function matchConfidence(printName: string, modelFilename: string): number {
  const a = normalizeForMatch(printName);
  const b = normalizeForMatch(modelFilename);
  if (!a || !b) return 0;
  if (a === b) return 1;
  const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a];
  if (longer.includes(shorter)) {
    return shorter.length / longer.length;
  }
  // No containment — quick bigram overlap check for partial similarity.
  const aGrams = new Set<string>();
  for (let i = 0; i < a.length - 1; i++) aGrams.add(a.slice(i, i + 2));
  const bGrams = new Set<string>();
  for (let i = 0; i < b.length - 1; i++) bGrams.add(b.slice(i, i + 2));
  if (aGrams.size === 0 || bGrams.size === 0) return 0;
  let overlap = 0;
  for (const g of aGrams) if (bGrams.has(g)) overlap++;
  return overlap / Math.max(aGrams.size, bGrams.size);
}

/**
 * Try to auto-link a print to its source 3MF. Pure side-effect: writes
 * prints.modelFileId + prints.plannedWeightG when a confident match exists.
 *
 * Best-effort — never throws. Logs the decision for the sync log.
 */
export async function tryMatchModelFile(printId: string, printName: string | null): Promise<void> {
  if (!printName) return;
  try {
    // Pull recent uploads (most likely candidates).
    const candidates = await db
      .select({
        id: modelFiles.id,
        filename: modelFiles.filename,
        totalWeightGrams: modelFiles.totalWeightGrams,
      })
      .from(modelFiles)
      .orderBy(modelFiles.uploadedAt)
      .limit(50);

    let best: { id: string; weight: number | null; score: number } | null = null;
    for (const c of candidates) {
      const score = matchConfidence(printName, c.filename);
      if (!best || score > best.score) {
        best = { id: c.id, weight: c.totalWeightGrams, score };
      }
    }

    if (!best || best.score < AUTO_LINK_CONFIDENCE) {
      console.log(
        `[model-match] no auto-link for print="${printName}" — best score=${best?.score.toFixed(2) ?? "n/a"}`,
      );
      return;
    }

    await db
      .update(prints)
      .set({
        modelFileId: best.id,
        plannedWeightG: best.weight,
        updatedAt: new Date(),
      })
      .where(eq(prints.id, printId));

    console.log(
      `[model-match] linked print=${printId} → modelFile=${best.id} (score=${best.score.toFixed(2)})`,
    );
  } catch (err) {
    console.error("[model-match] failed:", (err as Error).message);
  }
}
