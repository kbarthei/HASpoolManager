import catalogData from "./data/hms-codes.json";

export interface HmsCatalogEntry {
  code: string;
  message_en: string;
  wiki_url: string;
}

interface HmsCatalog {
  _meta: {
    source: string;
    original_source: string;
    license: string;
    imported_at: string;
    count: number;
  };
  entries: HmsCatalogEntry[];
}

const catalog = catalogData as HmsCatalog;

const lookupMap: Map<string, HmsCatalogEntry> = new Map(
  catalog.entries.map((entry) => [entry.code.toUpperCase(), entry]),
);

export function lookupHmsMessage(code: string | null | undefined): HmsCatalogEntry | null {
  if (!code) return null;
  const normalized = normalizeCode(code);
  return lookupMap.get(normalized) ?? null;
}

export function normalizeCode(code: string): string {
  const trimmed = code.trim().toUpperCase();
  const firstTwo = trimmed.split("_").slice(0, 2).join("_");
  return firstTwo;
}

export function getCatalogMeta() {
  return catalog._meta;
}
