/**
 * Pure eligibility + label helpers for the SpoolPicker dialog.
 *
 * Extracted so the rules ("which spools can be loaded into an AMS slot vs.
 * placed into a rack cell") are unit-testable without a React renderer.
 */

import { parseRackLocation } from "./rack-helpers";

export type PickerMode = "ams" | "storage";

export interface PickerSpool {
  remainingWeight: number;
  location: string | null;
}

/** True if a spool is eligible to be picked from the dialog in this mode.
 *
 * - Always exclude empty spools (`remainingWeight <= 0`) — nothing to load.
 * - Always exclude spools currently loaded in the printer (`ams`/`ams-ht`)
 *   or in the external spool holder (`external`) — they're already in use.
 * - Always exclude `archive` location (defensive — archived spools also
 *   carry status='archived' which the API filter strips).
 * - In "storage" mode (filling a rack cell), also exclude spools that
 *   already live in a rack cell — moving between cells uses a separate
 *   move-dialog, not this picker.
 * - In "ams" mode (filling an AMS slot), spools in racks/workbench/surplus
 *   are all valid candidates — that's the whole point of the picker.
 */
export function isEligibleForPicker(spool: PickerSpool, mode: PickerMode): boolean {
  if (spool.remainingWeight <= 0) return false;
  const loc = spool.location ?? "";
  if (loc === "ams" || loc === "ams-ht" || loc === "external") return false;
  if (loc === "archive") return false;
  if (mode === "storage" && parseRackLocation(loc) !== null) return false;
  return true;
}

/** Short human label for where the spool currently is. */
export function locationLabel(loc: string | null): string {
  if (!loc) return "—";
  const rack = parseRackLocation(loc);
  if (rack) return `R${rack.row}·${rack.col}`;
  if (loc === "workbench") return "Workbench";
  if (loc === "surplus") return "Surplus";
  if (loc === "storage") return "Storage";
  if (loc === "ams") return "AMS";
  if (loc === "ams-ht") return "AMS HT";
  if (loc === "external") return "External";
  return loc;
}
