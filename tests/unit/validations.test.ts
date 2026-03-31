import { describe, it, expect } from "vitest";
import {
  printerSyncSchema,
  matchRequestSchema,
  createVendorSchema,
  updateVendorSchema,
  createFilamentSchema,
  updateFilamentSchema,
  createSpoolSchema,
  updateSpoolSchema,
  createPrinterSchema,
  updatePrinterSchema,
  createPrintSchema,
  createTagSchema,
  createOrderSchema,
  printStartedSchema,
  printFinishedSchema,
  amsSlotChangedSchema,
  printerSyncSlotSchema,
  orderParseSchema,
  validateWeight,
  getSpoolStatusForWeight,
  validateBody,
} from "@/lib/validations";

const VALID_UUID = "e6951ee6-c378-4a5c-9b60-8301fa5c3200";

// ─── printerSyncSchema ──────────────────────────────────────────────────────

describe("printerSyncSchema", () => {
  it("accepts valid payload", () => {
    const result = printerSyncSchema.safeParse({
      printer_id: VALID_UUID,
      print_state: "idle",
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing printer_id", () => {
    const result = printerSyncSchema.safeParse({ print_state: "idle" });
    expect(result.success).toBe(false);
  });

  it("rejects invalid printer_id (not a UUID)", () => {
    const result = printerSyncSchema.safeParse({
      printer_id: "not-a-uuid",
      print_state: "idle",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing print_state", () => {
    const result = printerSyncSchema.safeParse({ printer_id: VALID_UUID });
    expect(result.success).toBe(false);
  });

  it("applies defaults for optional numeric fields", () => {
    const result = printerSyncSchema.safeParse({
      printer_id: VALID_UUID,
      print_state: "idle",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.print_progress).toBe(0);
      expect(result.data.print_weight).toBe(0);
      expect(result.data.print_layers_total).toBe(0);
      expect(result.data.print_layers_current).toBe(0);
      expect(result.data.print_remaining_time).toBe(0);
    }
  });

  it("applies defaults for optional boolean and string fields", () => {
    const result = printerSyncSchema.safeParse({
      printer_id: VALID_UUID,
      print_state: "idle",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.print_error).toBe(false);
      expect(result.data.print_name).toBe("");
      expect(result.data.active_slot).toBe("");
      expect(result.data.ams_slots).toEqual([]);
    }
  });

  it("accepts a full valid payload with ams_slots", () => {
    const result = printerSyncSchema.safeParse({
      printer_id: VALID_UUID,
      print_state: "printing",
      print_progress: 42,
      print_weight: 12.5,
      print_error: false,
      ams_slots: [
        {
          slot_type: "ams",
          ams_index: 0,
          tray_index: 0,
          is_empty: false,
        },
      ],
    });
    expect(result.success).toBe(true);
  });
});

// ─── matchRequestSchema ─────────────────────────────────────────────────────

describe("matchRequestSchema", () => {
  it("accepts an empty object (all fields optional)", () => {
    const result = matchRequestSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("accepts a full valid payload", () => {
    const result = matchRequestSchema.safeParse({
      tag_uid: "AA:BB:CC:DD",
      tray_info_idx: "GFA00",
      tray_type: "PLA",
      tray_color: "FF0000FF",
      tray_sub_brands: "Bambu Lab PLA",
      printer_id: VALID_UUID,
      ams_index: 0,
      tray_index: 1,
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid printer_id UUID", () => {
    const result = matchRequestSchema.safeParse({ printer_id: "not-a-uuid" });
    expect(result.success).toBe(false);
  });

  it("rejects non-integer ams_index", () => {
    const result = matchRequestSchema.safeParse({ ams_index: 1.5 });
    expect(result.success).toBe(false);
  });
});

// ─── createVendorSchema ─────────────────────────────────────────────────────

describe("createVendorSchema", () => {
  it("accepts minimal valid payload", () => {
    const result = createVendorSchema.safeParse({ name: "Bambu Lab" });
    expect(result.success).toBe(true);
  });

  it("rejects empty name", () => {
    const result = createVendorSchema.safeParse({ name: "" });
    expect(result.success).toBe(false);
  });

  it("rejects missing name", () => {
    const result = createVendorSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rejects invalid website URL", () => {
    const result = createVendorSchema.safeParse({
      name: "Bambu Lab",
      website: "not-a-url",
    });
    expect(result.success).toBe(false);
  });

  it("accepts null for optional fields", () => {
    const result = createVendorSchema.safeParse({
      name: "Bambu Lab",
      website: null,
      country: null,
      notes: null,
    });
    expect(result.success).toBe(true);
  });
});

describe("updateVendorSchema", () => {
  it("accepts an empty object (all fields partial)", () => {
    const result = updateVendorSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("accepts partial update with just name", () => {
    const result = updateVendorSchema.safeParse({ name: "New Name" });
    expect(result.success).toBe(true);
  });
});

// ─── createFilamentSchema ───────────────────────────────────────────────────

describe("createFilamentSchema", () => {
  const base = {
    vendorId: VALID_UUID,
    name: "PLA Basic Black",
    material: "PLA",
  };

  it("accepts minimal valid payload with defaults", () => {
    const result = createFilamentSchema.safeParse(base);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.diameter).toBe(1.75);
      expect(result.data.spoolWeight).toBe(1000);
    }
  });

  it("rejects invalid vendorId", () => {
    const result = createFilamentSchema.safeParse({ ...base, vendorId: "bad" });
    expect(result.success).toBe(false);
  });

  it("rejects empty name", () => {
    const result = createFilamentSchema.safeParse({ ...base, name: "" });
    expect(result.success).toBe(false);
  });

  it("rejects invalid colorHex format", () => {
    const result = createFilamentSchema.safeParse({ ...base, colorHex: "GGG000" });
    expect(result.success).toBe(false);
  });

  it("accepts valid colorHex (6 hex chars)", () => {
    const result = createFilamentSchema.safeParse({ ...base, colorHex: "FF0000" });
    expect(result.success).toBe(true);
  });

  it("rejects nozzle temp exceeding max (>500)", () => {
    const result = createFilamentSchema.safeParse({ ...base, nozzleTempDefault: 600 });
    expect(result.success).toBe(false);
  });

  it("rejects negative diameter", () => {
    const result = createFilamentSchema.safeParse({ ...base, diameter: -1 });
    expect(result.success).toBe(false);
  });
});

describe("updateFilamentSchema", () => {
  it("accepts empty object", () => {
    expect(updateFilamentSchema.safeParse({}).success).toBe(true);
  });
});

// ─── createSpoolSchema ──────────────────────────────────────────────────────

describe("createSpoolSchema", () => {
  const base = { filamentId: VALID_UUID };

  it("accepts minimal payload with defaults", () => {
    const result = createSpoolSchema.safeParse(base);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.initialWeight).toBe(1000);
      expect(result.data.currency).toBe("EUR");
      expect(result.data.location).toBe("storage");
      expect(result.data.status).toBe("active");
    }
  });

  it("rejects invalid filamentId", () => {
    const result = createSpoolSchema.safeParse({ filamentId: "not-uuid" });
    expect(result.success).toBe(false);
  });

  it("rejects invalid status value", () => {
    const result = createSpoolSchema.safeParse({ ...base, status: "lost" });
    expect(result.success).toBe(false);
  });

  it("accepts all valid status values", () => {
    for (const status of ["active", "archived", "empty", "returned"]) {
      const result = createSpoolSchema.safeParse({ ...base, status });
      expect(result.success).toBe(true);
    }
  });

  it("rejects negative purchasePrice", () => {
    const result = createSpoolSchema.safeParse({ ...base, purchasePrice: -1 });
    expect(result.success).toBe(false);
  });

  it("rejects negative remainingWeight", () => {
    const result = createSpoolSchema.safeParse({ ...base, remainingWeight: -1 });
    expect(result.success).toBe(false);
  });
});

describe("updateSpoolSchema", () => {
  it("accepts empty object", () => {
    expect(updateSpoolSchema.safeParse({}).success).toBe(true);
  });
});

// ─── createPrinterSchema ────────────────────────────────────────────────────

describe("createPrinterSchema", () => {
  it("accepts minimal payload", () => {
    const result = createPrinterSchema.safeParse({ name: "H2S" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.amsCount).toBe(1);
      expect(result.data.isActive).toBe(true);
      expect(result.data.model).toBe("");
    }
  });

  it("rejects empty name", () => {
    expect(createPrinterSchema.safeParse({ name: "" }).success).toBe(false);
  });

  it("rejects amsCount above 10", () => {
    expect(createPrinterSchema.safeParse({ name: "H2S", amsCount: 11 }).success).toBe(false);
  });

  it("rejects negative amsCount", () => {
    expect(createPrinterSchema.safeParse({ name: "H2S", amsCount: -1 }).success).toBe(false);
  });
});

describe("updatePrinterSchema", () => {
  it("accepts empty object", () => {
    expect(updatePrinterSchema.safeParse({}).success).toBe(true);
  });
});

// ─── createPrintSchema ──────────────────────────────────────────────────────

describe("createPrintSchema", () => {
  it("accepts minimal payload with default status", () => {
    const result = createPrintSchema.safeParse({ printerId: VALID_UUID });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe("running");
    }
  });

  it("rejects invalid printerId", () => {
    expect(createPrintSchema.safeParse({ printerId: "bad" }).success).toBe(false);
  });

  it("accepts all valid status values", () => {
    for (const status of ["running", "finished", "failed", "cancelled"]) {
      expect(createPrintSchema.safeParse({ printerId: VALID_UUID, status }).success).toBe(true);
    }
  });

  it("rejects negative printWeight", () => {
    expect(createPrintSchema.safeParse({ printerId: VALID_UUID, printWeight: -1 }).success).toBe(false);
  });
});

// ─── createTagSchema ────────────────────────────────────────────────────────

describe("createTagSchema", () => {
  it("accepts minimal payload with default source", () => {
    const result = createTagSchema.safeParse({ tagUid: "AA:BB:CC:DD", spoolId: VALID_UUID });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.source).toBe("manual");
    }
  });

  it("rejects empty tagUid", () => {
    expect(createTagSchema.safeParse({ tagUid: "", spoolId: VALID_UUID }).success).toBe(false);
  });

  it("rejects invalid source value", () => {
    expect(createTagSchema.safeParse({ tagUid: "AA:BB", spoolId: VALID_UUID, source: "barcode" }).success).toBe(false);
  });

  it("accepts all valid source values", () => {
    for (const source of ["rfid", "nfc", "manual"]) {
      expect(createTagSchema.safeParse({ tagUid: "AA:BB", spoolId: VALID_UUID, source }).success).toBe(true);
    }
  });
});

// ─── createOrderSchema ──────────────────────────────────────────────────────

describe("createOrderSchema", () => {
  it("accepts empty object with defaults", () => {
    const result = createOrderSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe("ordered");
      expect(result.data.currency).toBe("EUR");
    }
  });

  it("rejects invalid sourceUrl", () => {
    expect(createOrderSchema.safeParse({ sourceUrl: "not-a-url" }).success).toBe(false);
  });

  it("accepts all valid order statuses", () => {
    for (const status of ["ordered", "shipped", "delivered", "cancelled"]) {
      expect(createOrderSchema.safeParse({ status }).success).toBe(true);
    }
  });

  it("rejects negative totalCost", () => {
    expect(createOrderSchema.safeParse({ totalCost: -5 }).success).toBe(false);
  });
});

// ─── printStartedSchema ─────────────────────────────────────────────────────

describe("printStartedSchema", () => {
  it("accepts minimal payload", () => {
    expect(printStartedSchema.safeParse({ printer_id: VALID_UUID }).success).toBe(true);
  });

  it("rejects invalid printer_id", () => {
    expect(printStartedSchema.safeParse({ printer_id: "bad" }).success).toBe(false);
  });

  it("rejects negative print_weight", () => {
    expect(printStartedSchema.safeParse({ printer_id: VALID_UUID, print_weight: -1 }).success).toBe(false);
  });
});

// ─── printFinishedSchema ────────────────────────────────────────────────────

describe("printFinishedSchema", () => {
  it("accepts minimal payload with required status", () => {
    expect(printFinishedSchema.safeParse({ status: "finished" }).success).toBe(true);
  });

  it("rejects missing status", () => {
    expect(printFinishedSchema.safeParse({}).success).toBe(false);
  });

  it("rejects invalid status (not in enum)", () => {
    expect(printFinishedSchema.safeParse({ status: "running" }).success).toBe(false);
  });

  it("accepts valid usage array", () => {
    const result = printFinishedSchema.safeParse({
      status: "finished",
      usage: [{ spool_id: VALID_UUID, weight_used: 15.3 }],
    });
    expect(result.success).toBe(true);
  });

  it("rejects negative weight_used in usage", () => {
    const result = printFinishedSchema.safeParse({
      status: "finished",
      usage: [{ spool_id: VALID_UUID, weight_used: -1 }],
    });
    expect(result.success).toBe(false);
  });
});

// ─── amsSlotChangedSchema ───────────────────────────────────────────────────

describe("amsSlotChangedSchema", () => {
  const base = {
    printer_id: VALID_UUID,
    ams_index: 0,
    tray_index: 0,
  };

  it("accepts minimal payload with default slot_type", () => {
    const result = amsSlotChangedSchema.safeParse(base);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.slot_type).toBe("ams");
    }
  });

  it("rejects tray_index below 0", () => {
    expect(amsSlotChangedSchema.safeParse({ ...base, tray_index: -1 }).success).toBe(false);
  });

  it("rejects remain above 100", () => {
    expect(amsSlotChangedSchema.safeParse({ ...base, remain: 101 }).success).toBe(false);
  });

  it("accepts remain = -1 (unknown)", () => {
    expect(amsSlotChangedSchema.safeParse({ ...base, remain: -1 }).success).toBe(true);
  });

  it("accepts all valid slot_type values", () => {
    for (const slot_type of ["ams", "ams_ht", "external"]) {
      expect(amsSlotChangedSchema.safeParse({ ...base, slot_type }).success).toBe(true);
    }
  });
});

// ─── printerSyncSlotSchema ──────────────────────────────────────────────────

describe("printerSyncSlotSchema", () => {
  const base = {
    slot_type: "ams" as const,
    ams_index: 0,
    tray_index: 0,
  };

  it("accepts minimal payload with default is_empty", () => {
    const result = printerSyncSlotSchema.safeParse(base);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.is_empty).toBe(false);
    }
  });

  it("rejects missing slot_type", () => {
    expect(printerSyncSlotSchema.safeParse({ ams_index: 0, tray_index: 0 }).success).toBe(false);
  });

  it("rejects invalid slot_type", () => {
    expect(printerSyncSlotSchema.safeParse({ ...base, slot_type: "unknown" }).success).toBe(false);
  });

  it("rejects tray_index below 0", () => {
    expect(printerSyncSlotSchema.safeParse({ ...base, tray_index: -1 }).success).toBe(false);
  });
});

// ─── orderParseSchema ───────────────────────────────────────────────────────

describe("orderParseSchema", () => {
  it("accepts valid text", () => {
    expect(orderParseSchema.safeParse({ text: "Order #12345" }).success).toBe(true);
  });

  it("rejects empty text", () => {
    expect(orderParseSchema.safeParse({ text: "" }).success).toBe(false);
  });

  it("rejects missing text", () => {
    expect(orderParseSchema.safeParse({}).success).toBe(false);
  });
});

// ─── validateWeight ─────────────────────────────────────────────────────────

describe("validateWeight", () => {
  it("returns valid for weight within bounds", () => {
    expect(validateWeight(500, 1000)).toEqual({ valid: true });
  });

  it("returns valid for weight = 0 (empty spool)", () => {
    expect(validateWeight(0, 1000)).toEqual({ valid: true });
  });

  it("returns valid for weight = initialWeight", () => {
    expect(validateWeight(1000, 1000)).toEqual({ valid: true });
  });

  it("allows up to 10% over initial weight", () => {
    expect(validateWeight(1100, 1000)).toEqual({ valid: true });
  });

  it("rejects weight exceeding 110% of initial", () => {
    const result = validateWeight(1101, 1000);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("exceeds");
  });

  it("rejects negative weight", () => {
    const result = validateWeight(-1, 1000);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("negative");
  });

  it("rejects NaN", () => {
    const result = validateWeight(NaN, 1000);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Invalid");
  });
});

// ─── getSpoolStatusForWeight ────────────────────────────────────────────────

describe("getSpoolStatusForWeight", () => {
  it("returns 'empty' for weight = 0", () => {
    expect(getSpoolStatusForWeight(0)).toBe("empty");
  });

  it("returns 'empty' for negative weight", () => {
    expect(getSpoolStatusForWeight(-1)).toBe("empty");
  });

  it("returns 'active' for weight > 0", () => {
    expect(getSpoolStatusForWeight(1)).toBe("active");
    expect(getSpoolStatusForWeight(500)).toBe("active");
    expect(getSpoolStatusForWeight(1000)).toBe("active");
  });
});

// ─── validateBody ───────────────────────────────────────────────────────────

describe("validateBody", () => {
  it("returns success with parsed data for valid input", () => {
    const result = validateBody(createVendorSchema, { name: "Bambu Lab" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe("Bambu Lab");
    }
  });

  it("returns failure with error string for invalid input", () => {
    const result = validateBody(createVendorSchema, { name: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("name");
    }
  });

  it("formats multiple errors joined by semicolon", () => {
    const result = validateBody(createFilamentSchema, { vendorId: "bad", name: "", material: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain(";");
    }
  });
});
