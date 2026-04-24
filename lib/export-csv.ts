export type CsvValue = string | number | boolean | null | undefined | Date;

function escapeCell(value: CsvValue): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  const str = typeof value === "string" ? value : String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function toCsv(rows: Array<Record<string, CsvValue>>, columns?: string[]): string {
  if (rows.length === 0) {
    return (columns ?? []).join(",") + "\r\n";
  }
  const cols = columns ?? Object.keys(rows[0]);
  const header = cols.join(",");
  const body = rows.map((row) => cols.map((c) => escapeCell(row[c])).join(",")).join("\r\n");
  return `${header}\r\n${body}\r\n`;
}

export function csvResponseHeaders(filename: string, byteLength: number): Record<string, string> {
  return {
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="${filename}"`,
    "Content-Length": String(byteLength),
  };
}
