/**
 * Safe JSON.parse for text columns that store serialised arrays/objects.
 *
 * Previous pattern across the codebase:
 *
 *   try { return JSON.parse(row.activeSpoolIds); } catch { return []; }
 *
 * That silently turns corrupted-JSON columns into empty values. Looks
 * normal in the UI, but the print's usage tracking has effectively
 * disappeared. Now we log to `data_quality_log` on parse failure so
 * `/admin/diagnostics` surfaces the corruption.
 */

import { db } from "./db";
import { dataQualityLog } from "./db/schema";

interface ParseContext {
  table: string;
  column: string;
  entityId?: string | null;
}

function logCorrupt(ctx: ParseContext, raw: string, error: string): void {
  // Fire-and-forget — a failed diagnostic write must not mask the
  // original corruption, and we shouldn't throw from a parse helper.
  void db
    .insert(dataQualityLog)
    .values({
      runAt: new Date(),
      ruleId: "corrupt_json_column",
      severity: "warning",
      entityType: ctx.table,
      entityId: ctx.entityId ?? null,
      action: "flagged",
      details: JSON.stringify({
        column: ctx.column,
        sample: raw.slice(0, 200),
        error,
      }),
    })
    .catch(() => {
      /* diagnostic write itself failed; nothing useful to do */
    });
}

export function safeJsonArray<T = unknown>(raw: string | null | undefined, ctx: ParseContext): T[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed as T[];
    logCorrupt(ctx, raw, `parsed value is not an array (got ${typeof parsed})`);
    return [];
  } catch (err) {
    logCorrupt(ctx, raw, (err as Error).message);
    return [];
  }
}

export function safeJsonObject<V = unknown>(
  raw: string | null | undefined,
  ctx: ParseContext,
): Record<string, V> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, V>;
    }
    logCorrupt(ctx, raw, `parsed value is not a plain object (got ${typeof parsed})`);
    return {};
  } catch (err) {
    logCorrupt(ctx, raw, (err as Error).message);
    return {};
  }
}

export function safeJsonStringArray(raw: string | null | undefined, ctx: ParseContext): string[] {
  const arr = safeJsonArray<unknown>(raw, ctx);
  return arr.filter((v): v is string => typeof v === "string");
}
