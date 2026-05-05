export type DashboardStat = {
  label: string;
  value: number;
  format: "currency" | "count";
  unit?: string;
};

export const dashboardStats: DashboardStat[] = [
  { label: "Monthly spend", value: 124.5, format: "currency", unit: "€" },
  { label: "Prints today", value: 3, format: "count" },
  { label: "Low stock alerts", value: 2, format: "count" },
  { label: "Spools tracked", value: 32, format: "count" },
];

export type AmsSlot = {
  id: string;
  color: string;
  brand: string;
  material: string;
  remainingPct: number;
  match: "rfid" | "fuzzy" | "empty";
  confidence: number;
  label: string;
};

export const amsSlots: AmsSlot[] = [
  {
    id: "s1",
    color: "#F4E9D8",
    brand: "BL",
    material: "PLA",
    remainingPct: 73,
    match: "rfid",
    confidence: 100,
    label: "RFID exact · Bambu PLA Basic Ivory",
  },
  {
    id: "s2",
    color: "#1F1F1F",
    brand: "PT",
    material: "PLA",
    remainingPct: 41,
    match: "fuzzy",
    confidence: 94,
    label: "ΔE fuzzy · PolyTerra Charcoal Black",
  },
  {
    id: "s3",
    color: "#40C8E0",
    brand: "BL",
    material: "PETG",
    remainingPct: 88,
    match: "rfid",
    confidence: 100,
    label: "RFID exact · Bambu PETG Mint",
  },
  {
    id: "s4",
    color: "#FF453A",
    brand: "eS",
    material: "PETG",
    remainingPct: 22,
    match: "fuzzy",
    confidence: 89,
    label: "ΔE fuzzy · eSun PETG Red",
  },
];

export type OrderRow = {
  id: string;
  name: string;
  quantity: number;
  unitPriceEur: number;
  shop: string;
  color: string;
};

export const parsedOrderRows: OrderRow[] = [
  { id: "o1", name: "Bambu PLA Matte Ivory",      quantity: 2, unitPriceEur: 21.99, shop: "bambulab.com",  color: "#F4E9D8" },
  { id: "o2", name: "PolyTerra Charcoal Black",   quantity: 3, unitPriceEur: 16.50, shop: "polymaker.com", color: "#1F1F1F" },
  { id: "o3", name: "eSun PETG-HF Black",         quantity: 4, unitPriceEur: 19.00, shop: "esun3d.com",    color: "#0A0A0A" },
  { id: "o4", name: "Bambu Support-for-PLA",      quantity: 1, unitPriceEur: 27.99, shop: "bambulab.com",  color: "#E6E6E6" },
];

// Spool inspector — matches what the 04-spool-inspector.png screenshot shows.
export const inspectorSpool = {
  name: "PLA Basic",
  brand: "Bambu Lab",
  material: "PLA",
  color: "#161616",
  remainingPct: 81,
  remainingGrams: 810,
  startGrams: 1000,
  costPerGramEur: 0.013,
  totalCostEur: 12.64,
  location: "AMS · Slot 1",
  lastUsed: "2 days ago",
};

// Scan beat — fuzzy match candidates for unknown spool
export const scanCandidates = [
  { name: "PolyTerra Charcoal Black", confidence: 94, color: "#1F1F1F", reason: "ΔE 2.3 · PLA · 175g" },
  { name: "Bambu PLA Black",          confidence: 81, color: "#161616", reason: "ΔE 5.1 · PLA · 920g" },
  { name: "eSun PLA+ Black",          confidence: 68, color: "#0F0F0F", reason: "ΔE 8.4 · PLA · 240g" },
];

// Prints beat — last 3 prints with cost breakdown
export type PrintRow = {
  id: string;
  name: string;
  duration: string;
  filamentEur: number;
  energyEur: number;
  totalEur: number;
  status: "completed" | "running";
};

export const recentPrints: PrintRow[] = [
  { id: "p1", name: "Benchy",            duration: "1h 14m", filamentEur: 0.42, energyEur: 0.18, totalEur: 0.60, status: "completed" },
  { id: "p2", name: "Filament guide",    duration: "3h 02m", filamentEur: 1.84, energyEur: 0.31, totalEur: 2.15, status: "completed" },
  { id: "p3", name: "AMS spool holder",  duration: "5h 47m", filamentEur: 3.21, energyEur: 0.58, totalEur: 3.79, status: "running" },
];

// Analytics — 90-day price-per-kg series + 6-month monthly spend
export const pricePerKg90d: number[] = [
  21.5, 21.6, 21.4, 21.7, 22.0, 22.1, 22.3, 22.0, 21.8, 21.5,
  21.4, 21.5, 21.7, 21.9, 22.1, 22.4, 22.7, 22.5, 22.3, 22.0,
  21.8, 21.6, 21.4, 21.3, 21.5, 21.7, 22.0, 22.2, 22.5, 22.7,
  22.9, 22.7, 22.5, 22.2, 21.9, 21.7, 21.5, 21.3, 21.2, 21.4,
  21.6, 21.8, 22.1, 22.3, 22.5, 22.7, 22.9, 23.0, 22.8, 22.5,
  22.3, 22.0, 21.8, 21.6, 21.5, 21.4, 21.6, 21.9, 22.2, 22.5,
  22.8, 23.0, 23.1, 23.0, 22.7, 22.4, 22.1, 21.9, 21.7, 21.6,
  21.8, 22.0, 22.3, 22.5, 22.7, 22.8, 22.9, 23.0, 22.9, 22.7,
  22.5, 22.3, 22.0, 21.8, 21.7, 21.6, 21.7, 21.8, 21.9, 22.0,
];

export const monthlySpend: { label: string; value: number }[] = [
  { label: "Dec", value:  78.4 },
  { label: "Jan", value:  92.1 },
  { label: "Feb", value: 110.5 },
  { label: "Mar", value:  68.0 },
  { label: "Apr", value: 124.5 },
  { label: "May", value:  46.8 },
];

export const totalFilamentCostEur = 124.5;
