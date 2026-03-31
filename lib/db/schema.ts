import { relations } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  varchar,
  integer,
  real,
  numeric,
  boolean,
  timestamp,
  date,
  jsonb,
  bigint,
  uniqueIndex,
  index,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// ─── Vendors ────────────────────────────────────────────────────────────────

export const vendors = pgTable("vendors", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull().unique(),
  website: text("website"),
  country: text("country"),
  logoUrl: text("logo_url"),
  bambuPrefix: text("bambu_prefix"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const vendorsRelations = relations(vendors, ({ many }) => ({
  filaments: many(filaments),
  orders: many(orders),
}));

// ─── Filaments ──────────────────────────────────────────────────────────────

export const filaments = pgTable(
  "filaments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    vendorId: uuid("vendor_id")
      .notNull()
      .references(() => vendors.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    material: text("material").notNull(),
    diameter: real("diameter").notNull().default(1.75),
    density: real("density"),
    colorName: text("color_name"),
    colorHex: varchar("color_hex", { length: 6 }),
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
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
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

export const printers = pgTable("printers", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  model: text("model").notNull(),
  serial: text("serial").unique(),
  mqttTopic: text("mqtt_topic"),
  haDeviceId: text("ha_device_id"),
  ipAddress: text("ip_address"),
  amsCount: integer("ams_count").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const printersRelations = relations(printers, ({ many }) => ({
  amsSlots: many(amsSlots),
  prints: many(prints),
  syncLogs: many(syncLog),
}));

// ─── Spools ─────────────────────────────────────────────────────────────────

export const spools = pgTable(
  "spools",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    filamentId: uuid("filament_id")
      .notNull()
      .references(() => filaments.id, { onDelete: "restrict" }),
    lotNumber: text("lot_number"),
    purchaseDate: date("purchase_date"),
    purchasePrice: numeric("purchase_price", { precision: 8, scale: 2 }),
    currency: text("currency").default("EUR"),
    initialWeight: integer("initial_weight").notNull().default(1000),
    remainingWeight: integer("remaining_weight").notNull().default(1000),
    location: text("location").default("storage"),
    status: text("status").notNull().default("active"),
    firstUsedAt: timestamp("first_used_at", { withTimezone: true }),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    notes: text("notes"),
    externalId: text("external_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_spools_filament").on(table.filamentId),
    index("idx_spools_status").on(table.status),
    index("idx_spools_location").on(table.location),
    check("chk_spools_status", sql`${table.status} IN ('active','archived','empty','returned','draft')`),
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

export const tagMappings = pgTable(
  "tag_mappings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tagUid: text("tag_uid").notNull().unique(),
    spoolId: uuid("spool_id")
      .notNull()
      .references(() => spools.id, { onDelete: "cascade" }),
    source: text("source").default("bambu"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_tag_mappings_tag").on(table.tagUid),
    check("chk_tag_source", sql`${table.source} IN ('bambu','nfc','manual')`),
  ]
);

export const tagMappingsRelations = relations(tagMappings, ({ one }) => ({
  spool: one(spools, {
    fields: [tagMappings.spoolId],
    references: [spools.id],
  }),
}));

// ─── AMS Slots ──────────────────────────────────────────────────────────────

export const amsSlots = pgTable(
  "ams_slots",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    printerId: uuid("printer_id")
      .notNull()
      .references(() => printers.id, { onDelete: "cascade" }),
    slotType: text("slot_type").notNull().default("ams"),
    amsIndex: integer("ams_index").notNull(),
    trayIndex: integer("tray_index").notNull(),
    spoolId: uuid("spool_id").references(() => spools.id, {
      onDelete: "set null",
    }),
    bambuTrayIdx: text("bambu_tray_idx"),
    bambuColor: text("bambu_color"),
    bambuType: text("bambu_type"),
    bambuTagUid: text("bambu_tag_uid"),
    bambuRemain: integer("bambu_remain").default(-1),
    isEmpty: boolean("is_empty").notNull().default(true),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("uq_ams_slot").on(table.printerId, table.slotType, table.amsIndex, table.trayIndex),
    check("chk_slot_type", sql`${table.slotType} IN ('ams','ams_ht','external')`),
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

export const prints = pgTable(
  "prints",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    printerId: uuid("printer_id")
      .notNull()
      .references(() => printers.id, { onDelete: "cascade" }),
    name: text("name"),
    gcodeFile: text("gcode_file"),
    status: text("status").notNull().default("running"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    durationSeconds: integer("duration_seconds"),
    totalLayers: integer("total_layers"),
    printWeight: real("print_weight"),
    printLength: real("print_length"),
    totalCost: numeric("total_cost", { precision: 8, scale: 2 }),
    activeSpoolId: uuid("active_spool_id").references(() => spools.id),
    activeSpoolIds: text("active_spool_ids"), // JSON array of all spool IDs seen during print
    haEventId: text("ha_event_id"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_prints_printer").on(table.printerId),
    index("idx_prints_status").on(table.status),
    index("idx_prints_started").on(table.startedAt),
    check("chk_prints_status", sql`${table.status} IN ('running','finished','failed','cancelled')`),
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

export const printUsage = pgTable(
  "print_usage",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    printId: uuid("print_id")
      .notNull()
      .references(() => prints.id, { onDelete: "cascade" }),
    spoolId: uuid("spool_id")
      .notNull()
      .references(() => spools.id, { onDelete: "restrict" }),
    amsSlotId: uuid("ams_slot_id").references(() => amsSlots.id),
    weightUsed: real("weight_used").notNull(),
    lengthUsed: real("length_used"),
    cost: numeric("cost", { precision: 8, scale: 2 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
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

export const orders = pgTable("orders", {
  id: uuid("id").defaultRandom().primaryKey(),
  vendorId: uuid("vendor_id").references(() => vendors.id),
  shopId: uuid("shop_id").references(() => shops.id, { onDelete: "set null" }),
  autoSupplyLogId: uuid("auto_supply_log_id"),
  orderNumber: text("order_number"),
  orderDate: date("order_date").notNull().defaultNow(),
  expectedDelivery: date("expected_delivery"),
  actualDelivery: date("actual_delivery"),
  status: text("status").notNull().default("ordered"),
  shippingCost: numeric("shipping_cost", { precision: 8, scale: 2 }).default("0"),
  totalCost: numeric("total_cost", { precision: 8, scale: 2 }),
  currency: text("currency").default("EUR"),
  sourceUrl: text("source_url"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
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

export const orderItems = pgTable("order_items", {
  id: uuid("id").defaultRandom().primaryKey(),
  orderId: uuid("order_id")
    .notNull()
    .references(() => orders.id, { onDelete: "cascade" }),
  filamentId: uuid("filament_id")
    .notNull()
    .references(() => filaments.id, { onDelete: "restrict" }),
  spoolId: uuid("spool_id").references(() => spools.id),
  quantity: integer("quantity").notNull().default(1),
  unitPrice: numeric("unit_price", { precision: 8, scale: 2 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
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

export const apiKeys = pgTable("api_keys", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  keyHash: text("key_hash").notNull(),
  keyPrefix: text("key_prefix").notNull(),
  permissions: text("permissions").array().default([]),
  isActive: boolean("is_active").notNull().default(true),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// ─── Reorder Rules ──────────────────────────────────────────────────────────

export const reorderRules = pgTable("reorder_rules", {
  id: uuid("id").defaultRandom().primaryKey(),
  filamentId: uuid("filament_id")
    .notNull()
    .references(() => filaments.id, { onDelete: "cascade" }),
  minSpools: integer("min_spools").notNull().default(1),
  minWeight: integer("min_weight").notNull().default(200),
  autoNotify: boolean("auto_notify").default(true),
  autoOrder: boolean("auto_order").default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const reorderRulesRelations = relations(reorderRules, ({ one, many }) => ({
  filament: one(filaments, {
    fields: [reorderRules.filamentId],
    references: [filaments.id],
  }),
  autoSupplyLogs: many(autoSupplyLog),
}));

// ─── Shops ──────────────────────────────────────────────────────────────────

export const shops = pgTable("shops", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull().unique(),
  website: text("website"),
  country: text("country"),
  currency: text("currency").default("EUR"),
  notes: text("notes"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const shopsRelations = relations(shops, ({ many }) => ({
  listings: many(shopListings),
  orders: many(orders),
  autoSupplyRules: many(autoSupplyRules),
}));

// ─── Shop Listings ──────────────────────────────────────────────────────────

export const shopListings = pgTable(
  "shop_listings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    shopId: uuid("shop_id")
      .notNull()
      .references(() => shops.id, { onDelete: "cascade" }),
    filamentId: uuid("filament_id")
      .notNull()
      .references(() => filaments.id, { onDelete: "cascade" }),
    productUrl: text("product_url").notNull(),
    sku: text("sku"),
    packSize: integer("pack_size").notNull().default(1),
    currentPrice: numeric("current_price", { precision: 8, scale: 2 }),
    pricePerSpool: numeric("price_per_spool", { precision: 8, scale: 2 }),
    currency: text("currency").default("EUR"),
    inStock: boolean("in_stock").default(true),
    lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
    isActive: boolean("is_active").notNull().default(true),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
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

export const shopListingPriceHistory = pgTable(
  "shop_listing_price_history",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    listingId: uuid("listing_id")
      .notNull()
      .references(() => shopListings.id, { onDelete: "cascade" }),
    price: numeric("price", { precision: 8, scale: 2 }).notNull(),
    pricePerSpool: numeric("price_per_spool", { precision: 8, scale: 2 }).notNull(),
    currency: text("currency").default("EUR"),
    inStock: boolean("in_stock").default(true),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).defaultNow().notNull(),
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

export const autoSupplyRules = pgTable(
  "auto_supply_rules",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),
    isEnabled: boolean("is_enabled").notNull().default(true),
    shopId: uuid("shop_id").references(() => shops.id, { onDelete: "cascade" }),
    filamentId: uuid("filament_id").references(() => filaments.id, { onDelete: "cascade" }),
    material: text("material"),
    maxPricePerSpool: numeric("max_price_per_spool", { precision: 8, scale: 2 }),
    currency: text("currency").default("EUR"),
    maxMonthlySpend: numeric("max_monthly_spend", { precision: 8, scale: 2 }),
    budgetPeriodStart: integer("budget_period_start").default(1),
    preferStrategy: text("prefer_strategy").notNull().default("cheapest"),
    autoExecute: boolean("auto_execute").notNull().default(false),
    priority: integer("priority").notNull().default(100),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_asr_shop").on(table.shopId),
    index("idx_asr_filament").on(table.filamentId),
    index("idx_asr_enabled").on(table.isEnabled),
    check(
      "chk_prefer_strategy",
      sql`${table.preferStrategy} IN ('cheapest','fastest','preferred_shop','manual')`
    ),
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

export const autoSupplyLog = pgTable(
  "auto_supply_log",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    reorderRuleId: uuid("reorder_rule_id")
      .notNull()
      .references(() => reorderRules.id, { onDelete: "cascade" }),
    supplyRuleId: uuid("supply_rule_id").references(() => autoSupplyRules.id, {
      onDelete: "set null",
    }),
    listingId: uuid("listing_id").references(() => shopListings.id, { onDelete: "set null" }),
    orderId: uuid("order_id").references(() => orders.id, { onDelete: "set null" }),
    triggerReason: text("trigger_reason").notNull(),
    actionTaken: text("action_taken").notNull(),
    evaluatedPrice: numeric("evaluated_price", { precision: 8, scale: 2 }),
    currency: text("currency").default("EUR"),
    monthlySpendAtTime: numeric("monthly_spend_at_time", { precision: 8, scale: 2 }),
    agentSessionId: text("agent_session_id"),
    details: jsonb("details"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_asl_created").on(table.createdAt),
    index("idx_asl_action").on(table.actionTaken),
    index("idx_asl_reorder_rule").on(table.reorderRuleId),
    check(
      "chk_action_taken",
      sql`${table.actionTaken} IN ('auto_ordered','pending_approval','blocked_budget','blocked_price','no_listing','notify_only','agent_executing','agent_completed','agent_failed','error')`
    ),
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

export const shoppingListItems = pgTable("shopping_list_items", {
  id: uuid("id").defaultRandom().primaryKey(),
  filamentId: uuid("filament_id")
    .notNull()
    .references(() => filaments.id, { onDelete: "cascade" }),
  quantity: integer("quantity").notNull().default(1),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const shoppingListItemsRelations = relations(shoppingListItems, ({ one }) => ({
  filament: one(filaments, {
    fields: [shoppingListItems.filamentId],
    references: [filaments.id],
  }),
}));

// ─── Sync Log ───────────────────────────────────────────────────────────────

export const syncLog = pgTable(
  "sync_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    printerId: uuid("printer_id").references(() => printers.id),
    rawState: varchar("raw_state", { length: 50 }),
    normalizedState: varchar("normalized_state", { length: 50 }),
    printTransition: varchar("print_transition", { length: 20 }),
    printName: varchar("print_name", { length: 500 }),
    printError: boolean("print_error").default(false),
    slotsUpdated: integer("slots_updated").default(0),
    responseJson: text("response_json"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
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

export const settings = pgTable("settings", {
  key: varchar("key", { length: 100 }).primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

