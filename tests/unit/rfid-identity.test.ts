import { describe, it, expect } from "vitest";
import { pickLearnCandidate, isRealTag, type LearnCandidate } from "@/lib/matching";
import { rfidReactivation, bambuProductName } from "@/lib/printer-sync-helpers";

function cand(over: Partial<LearnCandidate>): LearnCandidate {
  return {
    spoolId: "s",
    bambuIdx: "GFA01",
    material: "PLA",
    colorHex: "1C1C1C",
    initialWeight: 1000,
    remainingWeight: 550,
    hasTag: false,
    boundElsewhere: false,
    boundToThisSlot: false,
    ...over,
  };
}

const BLACK_MATTE = { bambuIdx: "GFA01", material: "PLA", color: "000000FF", remain: 55 };

describe("isRealTag()", () => {
  it("rejects empty, undefined and the all-zero tag", () => {
    expect(isRealTag(undefined)).toBe(false);
    expect(isRealTag("")).toBe(false);
    expect(isRealTag("0000000000000000")).toBe(false);
  });
  it("accepts a Bambu tag", () => {
    expect(isRealTag("B676E2C900000100")).toBe(true);
  });
});

describe("pickLearnCandidate()", () => {
  it("learns Bambu black (000000) onto stored Charcoal Black (1C1C1C)", () => {
    expect(pickLearnCandidate([cand({ spoolId: "a" })], BLACK_MATTE)?.spoolId).toBe("a");
  });

  it("rejects a spool that already has a tag", () => {
    expect(pickLearnCandidate([cand({ hasTag: true })], BLACK_MATTE)).toBeNull();
  });

  it("rejects a spool bound to another slot", () => {
    expect(pickLearnCandidate([cand({ boundElsewhere: true })], BLACK_MATTE)).toBeNull();
  });

  it("allows a duplicate-bound spool when it is also bound to this slot", () => {
    const c = cand({ boundElsewhere: true, boundToThisSlot: true });
    expect(pickLearnCandidate([c], BLACK_MATTE)).toBe(c);
  });

  it("rejects different product line (Silk+ GFA06 vs Matte GFA01)", () => {
    expect(
      pickLearnCandidate([cand({})], { bambuIdx: "GFA06", material: "PLA", color: "D02727FF" })
    ).toBeNull();
  });

  it("rejects same product line but different colour (Bone White vs Ivory White, ΔE≈21)", () => {
    expect(
      pickLearnCandidate([cand({ colorHex: "FFFFFF" })], { bambuIdx: "GFA01", material: "PLA", color: "CBC6B8FF" })
    ).toBeNull();
  });

  it("rejects material mismatch", () => {
    expect(pickLearnCandidate([cand({ material: "PETG" })], BLACK_MATTE)).toBeNull();
  });

  it("returns null without bambu_idx (third-party trays never learn)", () => {
    expect(pickLearnCandidate([cand({})], { ...BLACK_MATTE, bambuIdx: undefined })).toBeNull();
  });

  it("does not treat the current slot binding as evidence", () => {
    // Two equally good candidates; one is bound to this slot → still ambiguous
    const rack = cand({ spoolId: "rack", remainingWeight: 550 });
    const slot = cand({ spoolId: "slot", remainingWeight: 550, boundToThisSlot: true });
    expect(pickLearnCandidate([rack, slot], BLACK_MATTE)).toBeNull();
  });

  it("rejects a full rack spool for a tray at 55% (live 2026-11-07 case)", () => {
    expect(pickLearnCandidate([cand({ remainingWeight: 1000 })], BLACK_MATTE)).toBeNull();
  });

  it("accepts a weight within 10% of initial × remain%", () => {
    expect(pickLearnCandidate([cand({ remainingWeight: 620 })], BLACK_MATTE)?.spoolId).toBe("s");
  });

  it("returns null when remain% is unknown", () => {
    expect(pickLearnCandidate([cand({ remainingWeight: 550 })], { ...BLACK_MATTE, remain: -1 })).toBeNull();
  });

  it("returns null when more than one candidate fits (never guess a rack slot)", () => {
    const a = cand({ spoolId: "a", remainingWeight: 1000 });
    const b = cand({ spoolId: "b", remainingWeight: 1000 });
    expect(pickLearnCandidate([a, b], { ...BLACK_MATTE, remain: 100 })).toBeNull();
  });
});

describe("rfidReactivation()", () => {
  it("leaves active spools alone", () => {
    expect(rfidReactivation({ status: "active", initialWeight: 1000, remain: 50 })).toBeNull();
  });

  it("reactivates an empty spool with weight from remain%", () => {
    expect(rfidReactivation({ status: "empty", initialWeight: 1000, remain: 97 })).toEqual({
      status: "active",
      remainingWeight: 970,
    });
  });

  it("reactivates an archived spool", () => {
    expect(rfidReactivation({ status: "archived", initialWeight: 1000, remain: 43 })?.remainingWeight).toBe(430);
  });

  it("does not guess when remain% is unknown", () => {
    expect(rfidReactivation({ status: "empty", initialWeight: 1000, remain: -1 })).toBeNull();
  });

  it("does not touch draft spools", () => {
    expect(rfidReactivation({ status: "draft", initialWeight: 1000, remain: 50 })).toBeNull();
  });
});

describe("bambuProductName()", () => {
  it("strips the Bambu vendor prefix from the HA tray name", () => {
    expect(bambuProductName("Bambu PLA Silk+", "PLA", "GFA06")).toBe("PLA Silk+");
    expect(bambuProductName("Bambu PLA Matte", "PLA", "GFA01")).toBe("PLA Matte");
    expect(bambuProductName("Bambu Lab PETG HF", "PETG", "GFG02")).toBe("PETG HF");
  });

  it("falls back to the bambu_idx line map when name is missing or '?'", () => {
    expect(bambuProductName("", "PETG", "GFG02")).toBe("PETG HF");
    expect(bambuProductName("?", "PLA", "GFA00")).toBe("PLA Basic");
  });
});
