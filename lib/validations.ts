import { z } from "zod";

// ─── Common ────────────────────────────────────────────────────────────────────
const uuid = z.string().uuid();

// ─── Vendors ───────────────────────────────────────────────────────────────────
export const createVendorSchema = z.object({
  name: z.string().min(1).max(200),
  website: z.string().url().nullable().optional(),
  country: z.string().max(100).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
});

export const updateVendorSchema = createVendorSchema.partial();

// ─── Filaments ─────────────────────────────────────────────────────────────────
export const createFilamentSchema = z.object({
  vendorId: uuid,
  name: z.string().min(1).max(200),
  material: z.string().min(1).max(50),
  diameter: z.number().positive().optional().default(1.75),
  density: z.number().positive().nullable().optional(),
  colorName: z.string().max(100).nullable().optional(),
  colorHex: z.string().regex(/^[0-9A-Fa-f]{6}$/).nullable().optional(),
  nozzleTempDefault: z.number().int().min(0).max(500).nullable().optional(),
  nozzleTempMin: z.number().int().min(0).max(500).nullable().optional(),
  nozzleTempMax: z.number().int().min(0).max(500).nullable().optional(),
  bedTempDefault: z.number().int().min(0).max(200).nullable().optional(),
  bedTempMin: z.number().int().min(0).max(200).nullable().optional(),
  bedTempMax: z.number().int().min(0).max(200).nullable().optional(),
  spoolWeight: z.number().int().positive().optional().default(1000),
  bambuIdx: z.string().max(20).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
});

export const updateFilamentSchema = createFilamentSchema.partial();

// ─── Spools ────────────────────────────────────────────────────────────────────
export const createSpoolSchema = z.object({
  filamentId: uuid,
  initialWeight: z.number().int().positive().optional().default(1000),
  remainingWeight: z.number().int().min(0).optional(),
  purchasePrice: z.number().min(0).nullable().optional(),
  currency: z.string().max(10).optional().default("EUR"),
  purchaseDate: z.string().nullable().optional(),
  location: z.string().max(100).optional().default("storage"),
  status: z.enum(["active", "archived", "empty", "returned"]).optional().default("active"),
  lotNumber: z.string().max(100).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
});

export const updateSpoolSchema = createSpoolSchema.partial();

// ─── Printers ──────────────────────────────────────────────────────────────────
export const createPrinterSchema = z.object({
  name: z.string().min(1).max(200),
  model: z.string().max(200).optional().default(""),
  serialNumber: z.string().max(100).nullable().optional(),
  ipAddress: z.string().max(100).nullable().optional(),
  amsCount: z.number().int().min(0).max(10).optional().default(1),
  isActive: z.boolean().optional().default(true),
});

export const updatePrinterSchema = createPrinterSchema.partial();

// ─── Prints ────────────────────────────────────────────────────────────────────
export const createPrintSchema = z.object({
  printerId: uuid,
  name: z.string().max(500).nullable().optional(),
  gcodeFile: z.string().max(500).nullable().optional(),
  status: z.enum(["running", "finished", "failed", "cancelled"]).optional().default("running"),
  totalLayers: z.number().int().min(0).nullable().optional(),
  printWeight: z.number().min(0).nullable().optional(),
  printLength: z.number().min(0).nullable().optional(),
  haEventId: z.string().max(200).nullable().optional(),
});

// ─── Tags ──────────────────────────────────────────────────────────────────────
export const createTagSchema = z.object({
  tagUid: z.string().min(1).max(50),
  spoolId: uuid,
  source: z.enum(["rfid", "nfc", "manual"]).optional().default("manual"),
});

// ─── Orders ────────────────────────────────────────────────────────────────────
export const createOrderSchema = z.object({
  shopId: uuid.nullable().optional(),
  vendorId: uuid.nullable().optional(),
  orderNumber: z.string().max(200).nullable().optional(),
  orderDate: z.string().nullable().optional(),
  status: z.enum(["ordered", "shipped", "delivered", "cancelled"]).optional().default("ordered"),
  totalCost: z.number().min(0).nullable().optional(),
  currency: z.string().max(10).optional().default("EUR"),
  sourceUrl: z.string().url().nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
});

// ─── Events ────────────────────────────────────────────────────────────────────
export const printStartedSchema = z.object({
  printer_id: uuid,
  name: z.string().max(500).nullable().optional(),
  gcode_file: z.string().max(500).nullable().optional(),
  total_layers: z.number().int().min(0).nullable().optional(),
  print_weight: z.number().min(0).nullable().optional(),
  print_length: z.number().min(0).nullable().optional(),
  ha_event_id: z.string().max(200).nullable().optional(),
  started_at: z.string().nullable().optional(),
});

export const printFinishedSchema = z.object({
  ha_event_id: z.string().max(200).optional(),
  print_id: uuid.optional(),
  status: z.enum(["finished", "failed", "cancelled"]),
  finished_at: z.string().nullable().optional(),
  duration_seconds: z.number().int().min(0).nullable().optional(),
  print_weight: z.number().min(0).nullable().optional(),
  usage: z.array(z.object({
    spool_id: uuid,
    weight_used: z.number().min(0),
    length_used: z.number().min(0).nullable().optional(),
  })).optional(),
});

export const amsSlotChangedSchema = z.object({
  printer_id: uuid,
  slot_type: z.enum(["ams", "ams_ht", "external"]).optional().default("ams"),
  ams_index: z.number().int(),
  tray_index: z.number().int().min(0),
  tray_info_idx: z.string().max(20).nullable().optional(),
  tray_type: z.string().max(50).nullable().optional(),
  tray_color: z.string().max(20).nullable().optional(),
  tag_uid: z.string().max(50).nullable().optional(),
  tray_sub_brands: z.string().max(200).nullable().optional(),
  tray_weight: z.number().min(0).nullable().optional(),
  remain: z.number().int().min(-1).max(100).nullable().optional(),
  nozzle_temp_min: z.number().int().nullable().optional(),
  nozzle_temp_max: z.number().int().nullable().optional(),
  is_empty: z.boolean().optional(),
});

export const printerSyncSlotSchema = z.object({
  slot_type: z.enum(["ams", "ams_ht", "external"]),
  ams_index: z.number().int(),
  tray_index: z.number().int().min(0),
  tray_type: z.string().max(50).optional(),
  tray_color: z.string().max(20).optional(),
  tag_uid: z.string().max(50).optional(),
  filament_id: z.string().max(20).optional(),
  remain: z.number().int().min(-1).max(100).optional(),
  is_empty: z.boolean().optional().default(false),
});

export const printerSyncSchema = z.object({
  printer_id: uuid,
  print_state: z.string().max(50),
  print_name: z.string().max(500).optional().default(""),
  print_progress: z.number().min(0).max(100).optional().default(0),
  print_weight: z.number().min(0).optional().default(0),
  print_layers_total: z.number().int().min(0).optional().default(0),
  print_layers_current: z.number().int().min(0).optional().default(0),
  print_remaining_time: z.number().min(0).optional().default(0),
  print_error: z.boolean().optional().default(false),
  active_slot: z.string().max(50).optional().default(""),
  ams_slots: z.array(printerSyncSlotSchema).optional().default([]),
});

export const matchRequestSchema = z.object({
  tag_uid: z.string().max(50).optional(),
  tray_info_idx: z.string().max(20).optional(),
  tray_type: z.string().max(50).optional(),
  tray_color: z.string().max(20).optional(),
  tray_sub_brands: z.string().max(200).optional(),
  printer_id: uuid.optional(),
  ams_index: z.number().int().optional(),
  tray_index: z.number().int().optional(),
});

export const orderParseSchema = z.object({
  text: z.string().min(1).max(50000),
});

export const priceRefreshSchema = z.object({
  filamentId: uuid.optional(),
}).optional();

// ─── Pure weight helpers ────────────────────────────────────────────────────────

/** Validate a proposed new weight against the spool's initial weight. */
export function validateWeight(
  newWeight: number,
  initialWeight: number,
): { valid: boolean; error?: string } {
  if (isNaN(newWeight)) return { valid: false, error: "Invalid number" };
  if (newWeight < 0) return { valid: false, error: "Weight cannot be negative" };
  if (newWeight > initialWeight * 1.1) return { valid: false, error: "Weight exceeds initial weight" };
  return { valid: true };
}

/** Derive spool status from remaining weight (mirrors adjustSpoolWeight logic). */
export function getSpoolStatusForWeight(weight: number): "empty" | "active" {
  return weight <= 0 ? "empty" : "active";
}

// ─── Helper ────────────────────────────────────────────────────────────────────
export function validateBody<T>(
  schema: z.ZodSchema<T>,
  body: unknown,
): { success: true; data: T } | { success: false; error: string } {
  const result = schema.safeParse(body);
  if (result.success) return { success: true, data: result.data };
  const errors = result.error.issues
    .map((i) => `${i.path.join(".")}: ${i.message}`)
    .join("; ");
  return { success: false, error: errors };
}
