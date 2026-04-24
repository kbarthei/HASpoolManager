import { describe, it, expect } from "vitest";
import { toCsv } from "@/lib/export-csv";

describe("toCsv", () => {
  it("emits header + rows with CRLF", () => {
    const csv = toCsv([
      { a: 1, b: 2 },
      { a: 3, b: 4 },
    ]);
    expect(csv).toBe("a,b\r\n1,2\r\n3,4\r\n");
  });

  it("escapes values containing commas", () => {
    const csv = toCsv([{ name: "foo, bar" }]);
    expect(csv).toBe('name\r\n"foo, bar"\r\n');
  });

  it("escapes values containing double quotes", () => {
    const csv = toCsv([{ text: 'he said "hi"' }]);
    expect(csv).toBe('text\r\n"he said ""hi"""\r\n');
  });

  it("escapes values containing newlines", () => {
    const csv = toCsv([{ note: "line1\nline2" }]);
    expect(csv).toBe('note\r\n"line1\nline2"\r\n');
  });

  it("renders null and undefined as empty cell", () => {
    const csv = toCsv([{ a: null, b: undefined, c: 0 }]);
    expect(csv).toBe("a,b,c\r\n,,0\r\n");
  });

  it("renders Date as ISO string", () => {
    const d = new Date("2026-04-24T10:00:00.000Z");
    const csv = toCsv([{ when: d }]);
    expect(csv).toBe("when\r\n2026-04-24T10:00:00.000Z\r\n");
  });

  it("respects explicit column ordering", () => {
    const csv = toCsv([{ z: 1, a: 2, m: 3 }], ["a", "m", "z"]);
    expect(csv).toBe("a,m,z\r\n2,3,1\r\n");
  });

  it("empty array produces just the header", () => {
    const csv = toCsv([], ["a", "b"]);
    expect(csv).toBe("a,b\r\n");
  });
});
