import { relations } from "drizzle-orm";
import {
  sqliteTable,
  text,
  integer,
  real,
  uniqueIndex,
  index,
  customType,
} from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

// Timestamp column: stored as ISO-8601 text on disk (so the existing
// production DB stays compatible), but typed as `Date` in JS land so
// callers can pass `new Date()` directly without manual stringification.
const tsCol = customType<{ data: Date; driverData: string }>({
  dataType() {
    return "text";
  },
  toDriver(value: Date): string {
    return value instanceof Date ? value.toISOString() : value;
  },
  fromDriver(value: string): Date {
    return new Date(value);
  },
});

// ─── Vendors ────────────────────────────────────────────────────────────────

export const vendors = sqliteTable("vendors", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull().unique(),
  website: text("website"),
  country: text("country"),
  logoUrl: text("logo_url"),
  bambuPrefix: text("bambu_prefix"),
  defaultSpoolWeight: integer("default_spool_weight"), // empty spool tare weight in grams (for scale-based remaining calculation)
  notes: text("notes"),
  createdAt: tsCol("created_at").notNull().default(sql`(datetime('now'))`),
  updatedAt: tsCol("updated_at").notNull().default(sql`(datetime('now'))`),
});

export const vendorsRelations = relations(vendors, ({ many }) => ({
  filaments: many(filaments),
  orders: many(orders),
}));

// ─── Filaments ──────────────────────────────────────────────────────────────

export const filaments = sqliteTable(
  "filaments",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    vendorId: text("vendor_id")
      .notNull()
      .references(() => vendors.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    material: text("material").notNull(),
    diameter: real("diameter").notNull().default(1.75),
    density: real("density"),
    colorName: text("color_name"),
    colorHex: text("color_hex"),
    nozzleTempDefault: integer("nozzle_temp_default"),
    nozzleTempMin: integer("nozzle_temp_min"),
    nozzleTempMax: integer("nozzle_temp_max"),
    bedTempDefault: integer("bed_temp_default"),
    bedTempMin: integer("bed_temp_min"),
    bedTempMax: integer("bed_temp_max"),
    spoolWeight: integer("spool_weight").default(1000),
    bambuIdx: text("bambu_idx"),
    externalId: text("external_id"),
    notes: text("notes"),
    createdAt: tsCol("created_at").notNull().default(sql`(datetime('now'))`),
    updatedAt: tsCol("updated_at").notNull().default(sql`(datetime('now'))`),
  },
  (table) => [
    uniqueIndex("uq_filaments_vendor_name_color").on(
      table.vendorId,
      table.name,
      table.colorHex
    ),
    index("idx_filaments_material").on(table.material),
    index("idx_filaments_bambu_idx").on(table.bambuIdx),
  ]
);

export const filamentsRelations = relations(filaments, ({ one, many }) => ({
  vendor: one(vendors, {
    fields: [filaments.vendorId],
    references: [vendors.id],
  }),
  spools: many(spools),
  orderItems: many(orderItems),
  reorderRules: many(reorderRules),
  shopListings: many(shopListings),
  shoppingListItems: many(shoppingListItems),
}));

// ─── Printers ───────────────────────────────────────────────────────────────

export const printers = sqliteTable("printers", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  model: text("model").notNull(),
  serial: text("serial").unique(),
  mqttTopic: text("mqtt_topic"),
  haDeviceId: text("ha_device_id"),
  ipAddress: text("ip_address"),
  amsCount: integer("ams_count").notNull().default(0),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdAt: tsCol("created_at").notNull().default(sql`(datetime('now'))`),
  updatedAt: tsCol("updated_at").notNull().default(sql`(datetime('now'))`),
});

export const printersRelations = relations(printers, ({ many }) => ({
  amsSlots: many(amsSlots),
  prints: many(prints),
  syncLogs: many(syncLog),
}));

// ─── Spools ─────────────────────────────────────────────────────────────────

export const spools = sqliteTable(
  "spools",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    filamentId: text("filament_id")
      .notNull()
      .references(() => filaments.id, { onDelete: "restrict" }),
    lotNumber: text("lot_number"),
    purchaseDate: text("purchase_date"),
    purchasePrice: real("purchase_price"),
    currency: text("currency").default("EUR"),
    initialWeight: integer("initial_weight").notNull().default(1000),
    remainingWeight: integer("remaining_weight").notNull().default(1000),
    location: text("location").default("storage"),
    status: text("status").notNull().default("active"),
    firstUsedAt: tsCol("first_used_at"),
    lastUsedAt: tsCol("last_used_at"),
    notes: text("notes"),
    externalId: text("external_id"),
    createdAt: tsCol("created_at").notNull().default(sql`(datetime('now'))`),
    updatedAt: tsCol("updated_at").notNull().default(sql`(datetime('now'))`),
  },
  (table) => [
    index("idx_spools_filament").on(table.filamentId),
    index("idx_spools_status").on(table.status),
    index("idx_spools_location").on(table.location),
    // chk_spools_status: enforce in app code ('active','archived','empty','returned','draft')
  ]
);

export const spoolsRelations = relations(spools, ({ one, many }) => ({
  filament: one(filaments, {
    fields: [spools.filamentId],
    references: [filaments.id],
  }),
  tagMappings: many(tagMappings),
  amsSlots: many(amsSlots),
  printUsage: many(printUsage),
  orderItems: many(orderItems),
}));

// ─── Tag Mappings ───────────────────────────────────────────────────────────

export const tagMappings = sqliteTable(
  "tag_mappings",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    tagUid: text("tag_uid").notNull().unique(),
    spoolId: text("spool_id")
      .notNull()
      .references(() => spools.id, { onDelete: "cascade" }),
    source: text("source").default("bambu"),
    createdAt: tsCol("created_at").notNull().default(sql`(datetime('now'))`),
  },
  (table) => [
    index("idx_tag_mappings_tag").on(table.tagUid),
    // chk_tag_source: enforce in app code ('bambu','nfc','manual')
  ]
);

export const tagMappingsRelations = relations(tagMappings, ({ one }) => ({
  spool: one(spools, {
    fields: [tagMappings.spoolId],
    references: [spools.id],
  }),
}));

// ─── AMS Slots ──────────────────────────────────────────────────────────────

export const amsSlots = sqliteTable(
  "ams_slots",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    printerId: text("printer_id")
      .notNull()
      .references(() => printers.id, { onDelete: "cascade" }),
    slotType: text("slot_type").notNull().default("ams"),
    amsIndex: integer("ams_index").notNull(),
    trayIndex: integer("tray_index").notNull(),
    spoolId: text("spool_id").references(() => spools.id, {
      onDelete: "set null",
    }),
    bambuTrayIdx: text("bambu_tray_idx"),
    bambuColor: text("bambu_color"),
    bambuType: text("bambu_type"),
    bambuTagUid: text("bambu_tag_uid"),
    bambuRemain: integer("bambu_remain").default(-1),
    isEmpty: integer("is_empty", { mode: "boolean" }).notNull().default(true),
    updatedAt: tsCol("updated_at").notNull().default(sql`(datetime('now'))`),
  },
  (table) => [
    uniqueIndex("uq_ams_slot").on(table.printerId, table.slotType, table.amsIndex, table.trayIndex),
    // chk_slot_type: enforce in app code ('ams','ams_ht','external')
  ]
);

export const amsSlotsRelations = relations(amsSlots, ({ one }) => ({
  printer: one(printers, {
    fields: [amsSlots.printerId],
    references: [printers.id],
  }),
  spool: one(spools, {
    fields: [amsSlots.spoolId],
    references: [spools.id],
  }),
}));

// ─── Prints ─────────────────────────────────────────────────────────────────

export const prints = sqliteTable(
  "prints",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    printerId: text("printer_id")
      .notNull()
      .references(() => printers.id, { onDelete: "cascade" }),
    name: text("name"),
    gcodeFile: text("gcode_file"),
    status: text("status").notNull().default("running"),
    startedAt: tsCol("started_at"),
    finishedAt: tsCol("finished_at"),
    durationSeconds: integer("duration_seconds"),
    totalLayers: integer("total_layers"),
    printWeight: real("print_weight"),
    printLength: real("print_length"),
    filamentCost: real("filament_cost"),
    energyCost: real("energy_cost"),
    energyKwh: real("energy_kwh"),
    energyStartKwh: real("energy_start_kwh"),
    energyEndKwh: real("energy_end_kwh"),
    totalCost: real("total_cost"),
    activeSpoolId: text("active_spool_id").references(() => spools.id),
    activeSpoolIds: text("active_spool_ids"), // JSON array of all spool IDs seen during print
    remainSnapshot: text("remain_snapshot"), // JSON: {"slot_1": 80, "slot_2": 100, ...} — captured at print start
    spoolSwaps: text("spool_swaps"), // JSON array of mid-print spool swaps: [{trayIndex, oldSpoolId, newSpoolId, progressAtSwap}]
    coverImagePath: text("cover_image_path"), // 3D model preview from slicer (captured at print start)
    snapshotPath: text("snapshot_path"), // Camera snapshot (captured at print finish)
    haEventId: text("ha_event_id"),
    notes: text("notes"),
    createdAt: tsCol("created_at").notNull().default(sql`(datetime('now'))`),
    updatedAt: tsCol("updated_at").notNull().default(sql`(datetime('now'))`),
  },
  (table) => [
    index("idx_prints_printer").on(table.printerId),
    index("idx_prints_status").on(table.status),
    index("idx_prints_started").on(table.startedAt),
    // chk_prints_status: enforce in app code ('running','finished','failed','cancelled')
  ]
);

export const printsRelations = relations(prints, ({ one, many }) => ({
  printer: one(printers, {
    fields: [prints.printerId],
    references: [printers.id],
  }),
  usage: many(printUsage),
}));

// ─── Print Usage ────────────────────────────────────────────────────────────

export const printUsage = sqliteTable(
  "print_usage",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    printId: text("print_id")
      .notNull()
      .references(() => prints.id, { onDelete: "cascade" }),
    spoolId: text("spool_id")
      .notNull()
      .references(() => spools.id, { onDelete: "restrict" }),
    amsSlotId: text("ams_slot_id").references(() => amsSlots.id),
    weightUsed: real("weight_used").notNull(),
    lengthUsed: real("length_used"),
    cost: real("cost"),
    createdAt: tsCol("created_at").notNull().default(sql`(datetime('now'))`),
  },
  (table) => [
    index("idx_print_usage_print").on(table.printId),
    index("idx_print_usage_spool").on(table.spoolId),
  ]
);

export const printUsageRelations = relations(printUsage, ({ one }) => ({
  print: one(prints, {
    fields: [printUsage.printId],
    references: [prints.id],
  }),
  spool: one(spools, {
    fields: [printUsage.spoolId],
    references: [spools.id],
  }),
  amsSlot: one(amsSlots, {
    fields: [printUsage.amsSlotId],
    references: [amsSlots.id],
  }),
}));

// ─── Orders ─────────────────────────────────────────────────────────────────

export const orders = sqliteTable("orders", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  vendorId: text("vendor_id").references(() => vendors.id),
  shopId: text("shop_id").references(() => shops.id, { onDelete: "set null" }),
  autoSupplyLogId: text("auto_supply_log_id"),
  orderNumber: text("order_number"),
  orderDate: text("order_date").notNull().default(sql`(date('now'))`),
  expectedDelivery: text("expected_delivery"),
  actualDelivery: text("actual_delivery"),
  status: text("status").notNull().default("ordered"),
  shippingCost: real("shipping_cost").default(0),
  totalCost: real("total_cost"),
  currency: text("currency").default("EUR"),
  sourceUrl: text("source_url"),
  notes: text("notes"),
  createdAt: tsCol("created_at").notNull().default(sql`(datetime('now'))`),
  updatedAt: tsCol("updated_at").notNull().default(sql`(datetime('now'))`),
});

export const ordersRelations = relations(orders, ({ one, many }) => ({
  vendor: one(vendors, {
    fields: [orders.vendorId],
    references: [vendors.id],
  }),
  shop: one(shops, {
    fields: [orders.shopId],
    references: [shops.id],
  }),
  items: many(orderItems),
}));

// ─── Order Items ────────────────────────────────────────────────────────────

export const orderItems = sqliteTable("order_items", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  orderId: text("order_id")
    .notNull()
    .references(() => orders.id, { onDelete: "cascade" }),
  filamentId: text("filament_id")
    .notNull()
    .references(() => filaments.id, { onDelete: "restrict" }),
  spoolId: text("spool_id").references(() => spools.id),
  quantity: integer("quantity").notNull().default(1),
  unitPrice: real("unit_price"),
  createdAt: tsCol("created_at").notNull().default(sql`(datetime('now'))`),
});

export const orderItemsRelations = relations(orderItems, ({ one }) => ({
  order: one(orders, {
    fields: [orderItems.orderId],
    references: [orders.id],
  }),
  filament: one(filaments, {
    fields: [orderItems.filamentId],
    references: [filaments.id],
  }),
  spool: one(spools, {
    fields: [orderItems.spoolId],
    references: [spools.id],
  }),
}));

// ─── API Keys ───────────────────────────────────────────────────────────────

export const apiKeys = sqliteTable("api_keys", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  keyHash: text("key_hash").notNull(),
  keyPrefix: text("key_prefix").notNull(),
  permissions: text("permissions", { mode: "json" }).$type<string[]>().default([]),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  lastUsedAt: tsCol("last_used_at"),
  createdAt: tsCol("created_at").notNull().default(sql`(datetime('now'))`),
});

// ─── Reorder Rules ──────────────────────────────────────────────────────────

export const reorderRules = sqliteTable("reorder_rules", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  filamentId: text("filament_id")
    .notNull()
    .references(() => filaments.id, { onDelete: "cascade" }),
  minSpools: integer("min_spools").notNull().default(1),
  minWeight: integer("min_weight").notNull().default(200),
  autoNotify: integer("auto_notify", { mode: "boolean" }).default(true),
  autoOrder: integer("auto_order", { mode: "boolean" }).default(false),
  createdAt: tsCol("created_at").notNull().default(sql`(datetime('now'))`),
});

export const reorderRulesRelations = relations(reorderRules, ({ one, many }) => ({
  filament: one(filaments, {
    fields: [reorderRules.filamentId],
    references: [filaments.id],
  }),
  autoSupplyLogs: many(autoSupplyLog),
}));

// ─── Shops ──────────────────────────────────────────────────────────────────

export const shops = sqliteTable("shops", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull().unique(),
  website: text("website"),
  country: text("country"),
  currency: text("currency").default("EUR"),
  notes: text("notes"),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdAt: tsCol("created_at").notNull().default(sql`(datetime('now'))`),
  updatedAt: tsCol("updated_at").notNull().default(sql`(datetime('now'))`),
});

export const shopsRelations = relations(shops, ({ many }) => ({
  listings: many(shopListings),
  orders: many(orders),
  autoSupplyRules: many(autoSupplyRules),
}));

// ─── Shop Listings ──────────────────────────────────────────────────────────

export const shopListings = sqliteTable(
  "shop_listings",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    shopId: text("shop_id")
      .notNull()
      .references(() => shops.id, { onDelete: "cascade" }),
    filamentId: text("filament_id")
      .notNull()
      .references(() => filaments.id, { onDelete: "cascade" }),
    productUrl: text("product_url").notNull(),
    sku: text("sku"),
    packSize: integer("pack_size").notNull().default(1),
    currentPrice: real("current_price"),
    pricePerSpool: real("price_per_spool"),
    currency: text("currency").default("EUR"),
    inStock: integer("in_stock", { mode: "boolean" }).default(true),
    lastCheckedAt: tsCol("last_checked_at"),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    notes: text("notes"),
    createdAt: tsCol("created_at").notNull().default(sql`(datetime('now'))`),
    updatedAt: tsCol("updated_at").notNull().default(sql`(datetime('now'))`),
  },
  (table) => [
    uniqueIndex("uq_shop_listing").on(table.shopId, table.filamentId, table.packSize),
    index("idx_sl_filament").on(table.filamentId),
    index("idx_sl_shop").on(table.shopId),
    index("idx_sl_price").on(table.pricePerSpool),
  ]
);

export const shopListingsRelations = relations(shopListings, ({ one, many }) => ({
  shop: one(shops, {
    fields: [shopListings.shopId],
    references: [shops.id],
  }),
  filament: one(filaments, {
    fields: [shopListings.filamentId],
    references: [filaments.id],
  }),
  priceHistory: many(shopListingPriceHistory),
}));

// ─── Shop Listing Price History ─────────────────────────────────────────────

export const shopListingPriceHistory = sqliteTable(
  "shop_listing_price_history",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    listingId: text("listing_id")
      .notNull()
      .references(() => shopListings.id, { onDelete: "cascade" }),
    price: real("price").notNull(),
    pricePerSpool: real("price_per_spool").notNull(),
    currency: text("currency").default("EUR"),
    inStock: integer("in_stock", { mode: "boolean" }).default(true),
    recordedAt: tsCol("recorded_at").notNull().default(sql`(datetime('now'))`),
  },
  (table) => [
    index("idx_slph_listing").on(table.listingId),
    index("idx_slph_recorded").on(table.recordedAt),
  ]
);

export const shopListingPriceHistoryRelations = relations(shopListingPriceHistory, ({ one }) => ({
  listing: one(shopListings, {
    fields: [shopListingPriceHistory.listingId],
    references: [shopListings.id],
  }),
}));

// ─── Auto Supply Rules ──────────────────────────────────────────────────────

export const autoSupplyRules = sqliteTable(
  "auto_supply_rules",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    name: text("name").notNull(),
    isEnabled: integer("is_enabled", { mode: "boolean" }).notNull().default(true),
    shopId: text("shop_id").references(() => shops.id, { onDelete: "cascade" }),
    filamentId: text("filament_id").references(() => filaments.id, { onDelete: "cascade" }),
    material: text("material"),
    maxPricePerSpool: real("max_price_per_spool"),
    currency: text("currency").default("EUR"),
    maxMonthlySpend: real("max_monthly_spend"),
    budgetPeriodStart: integer("budget_period_start").default(1),
    preferStrategy: text("prefer_strategy").notNull().default("cheapest"),
    autoExecute: integer("auto_execute", { mode: "boolean" }).notNull().default(false),
    priority: integer("priority").notNull().default(100),
    createdAt: tsCol("created_at").notNull().default(sql`(datetime('now'))`),
    updatedAt: tsCol("updated_at").notNull().default(sql`(datetime('now'))`),
  },
  (table) => [
    index("idx_asr_shop").on(table.shopId),
    index("idx_asr_filament").on(table.filamentId),
    index("idx_asr_enabled").on(table.isEnabled),
    // chk_prefer_strategy: enforce in app code ('cheapest','fastest','preferred_shop','manual')
  ]
);

export const autoSupplyRulesRelations = relations(autoSupplyRules, ({ one, many }) => ({
  shop: one(shops, {
    fields: [autoSupplyRules.shopId],
    references: [shops.id],
  }),
  filament: one(filaments, {
    fields: [autoSupplyRules.filamentId],
    references: [filaments.id],
  }),
  logs: many(autoSupplyLog),
}));

// ─── Auto Supply Log ────────────────────────────────────────────────────────

export const autoSupplyLog = sqliteTable(
  "auto_supply_log",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    reorderRuleId: text("reorder_rule_id")
      .notNull()
      .references(() => reorderRules.id, { onDelete: "cascade" }),
    supplyRuleId: text("supply_rule_id").references(() => autoSupplyRules.id, {
      onDelete: "set null",
    }),
    listingId: text("listing_id").references(() => shopListings.id, { onDelete: "set null" }),
    orderId: text("order_id").references(() => orders.id, { onDelete: "set null" }),
    triggerReason: text("trigger_reason").notNull(),
    actionTaken: text("action_taken").notNull(),
    evaluatedPrice: real("evaluated_price"),
    currency: text("currency").default("EUR"),
    monthlySpendAtTime: real("monthly_spend_at_time"),
    agentSessionId: text("agent_session_id"),
    details: text("details", { mode: "json" }),
    createdAt: tsCol("created_at").notNull().default(sql`(datetime('now'))`),
  },
  (table) => [
    index("idx_asl_created").on(table.createdAt),
    index("idx_asl_action").on(table.actionTaken),
    index("idx_asl_reorder_rule").on(table.reorderRuleId),
    // chk_action_taken: enforce in app code
  ]
);

export const autoSupplyLogRelations = relations(autoSupplyLog, ({ one }) => ({
  reorderRule: one(reorderRules, {
    fields: [autoSupplyLog.reorderRuleId],
    references: [reorderRules.id],
  }),
  supplyRule: one(autoSupplyRules, {
    fields: [autoSupplyLog.supplyRuleId],
    references: [autoSupplyRules.id],
  }),
  listing: one(shopListings, {
    fields: [autoSupplyLog.listingId],
    references: [shopListings.id],
  }),
  order: one(orders, {
    fields: [autoSupplyLog.orderId],
    references: [orders.id],
  }),
}));

// ─── Shopping List ────────────────────────────────────────────────────────────

export const shoppingListItems = sqliteTable("shopping_list_items", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  filamentId: text("filament_id")
    .notNull()
    .references(() => filaments.id, { onDelete: "cascade" }),
  quantity: integer("quantity").notNull().default(1),
  notes: text("notes"),
  createdAt: tsCol("created_at").notNull().default(sql`(datetime('now'))`),
  updatedAt: tsCol("updated_at").notNull().default(sql`(datetime('now'))`),
});

export const shoppingListItemsRelations = relations(shoppingListItems, ({ one }) => ({
  filament: one(filaments, {
    fields: [shoppingListItems.filamentId],
    references: [filaments.id],
  }),
}));

// ─── Sync Log ───────────────────────────────────────────────────────────────

export const syncLog = sqliteTable(
  "sync_log",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    printerId: text("printer_id").references(() => printers.id),
    rawState: text("raw_state"),
    normalizedState: text("normalized_state"),
    printTransition: text("print_transition"),
    printName: text("print_name"),
    printError: integer("print_error", { mode: "boolean" }).default(false),
    slotsUpdated: integer("slots_updated").default(0),
    responseJson: text("response_json"),
    createdAt: tsCol("created_at").default(sql`(datetime('now'))`),
  },
  (table) => [
    index("idx_sync_log_created").on(table.createdAt),
    index("idx_sync_log_printer").on(table.printerId),
  ]
);

export const syncLogRelations = relations(syncLog, ({ one }) => ({
  printer: one(printers, {
    fields: [syncLog.printerId],
    references: [printers.id],
  }),
}));

// ─── Settings ───────────────────────────────────────────────────────────────

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: tsCol("updated_at").notNull().default(sql`(datetime('now'))`),
});

// ─── HMS Events ──────────────────────────────────────────────────────────────

export const hmsEvents = sqliteTable(
  "hms_events",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    printerId: text("printer_id")
      .notNull()
      .references(() => printers.id, { onDelete: "cascade" }),
    printId: text("print_id").references(() => prints.id, { onDelete: "set null" }),
    spoolId: text("spool_id").references(() => spools.id, { onDelete: "set null" }),
    filamentId: text("filament_id").references(() => filaments.id, { onDelete: "set null" }),
    hmsCode: text("hms_code").notNull(), // e.g. "0700_2000_0002_0001"
    module: text("module"), // "ams", "mc", "toolhead", "mainboard", "xcam", "unknown"
    severity: text("severity"), // "fatal", "serious", "common", "info"
    message: text("message"), // human-readable error description
    wikiUrl: text("wiki_url"), // Bambu Lab wiki troubleshooting link
    slotKey: text("slot_key"), // "slot_1", "slot_2", "slot_ht" etc
    rawAttr: integer("raw_attr"), // original attr value from MQTT
    rawCode: integer("raw_code"), // original code value from MQTT
    createdAt: tsCol("created_at").notNull().default(sql`(datetime('now'))`),
  },
  (table) => [
    index("idx_hms_printer").on(table.printerId),
    index("idx_hms_filament").on(table.filamentId),
    index("idx_hms_created").on(table.createdAt),
  ]
);

export const hmsEventsRelations = relations(hmsEvents, ({ one }) => ({
  printer: one(printers, {
    fields: [hmsEvents.printerId],
    references: [printers.id],
  }),
  print: one(prints, {
    fields: [hmsEvents.printId],
    references: [prints.id],
  }),
  spool: one(spools, {
    fields: [hmsEvents.spoolId],
    references: [spools.id],
  }),
  filament: one(filaments, {
    fields: [hmsEvents.filamentId],
    references: [filaments.id],
  }),
}));
