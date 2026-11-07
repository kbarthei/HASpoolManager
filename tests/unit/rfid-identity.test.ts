import { describe, it, expect } from "vitest";
import {
  pickLearnCandidate,
  isRealTag,
  applyFuzzyGuards,
  isRackLocation,
  type LearnCandidate,
  type FuzzyScored,
} from "@/lib/matching";
import { rfidReactivation, bambuProductName, calculateWeightSync } from "@/lib/printer-sync-helpers";

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

describe("rfidReactivation() — confirmed readings", () => {
  it("ignores a transient 0 % reading", () => {
    expect(rfidReactivation({ status: "empty", initialWeight: 1000, remain: 0, previousRemain: 0 })).toBeNull();
  });
  it("waits until the previous sync confirms the reading", () => {
    expect(rfidReactivation({ status: "empty", initialWeight: 1000, remain: 97, previousRemain: 100 })).toBeNull();
    expect(rfidReactivation({ status: "empty", initialWeight: 1000, remain: 97, previousRemain: 97 })?.remainingWeight).toBe(970);
  });
});

describe("calculateWeightSync() — confirmed readings", () => {
  const base = { initialWeight: 1000, currentWeight: 1000, tagUid: "B676E2C900000100", isIdle: true };
  it("rejects a reading that differs from the previous sync (printer boot 100 → 0)", () => {
    const r = calculateWeightSync({ ...base, remain: 0, previousRemain: 100 });
    expect(r.shouldUpdate).toBe(false);
    expect(r.reason).toBe("unconfirmed");
  });
  it("accepts a reading confirmed by the previous sync", () => {
    const r = calculateWeightSync({ ...base, remain: 80, previousRemain: 80 });
    expect(r).toEqual({ shouldUpdate: true, newWeight: 800, reason: "synced" });
  });
  it("treats a missing previous reading (null) as unconfirmed", () => {
    expect(calculateWeightSync({ ...base, remain: 80, previousRemain: null }).reason).toBe("unconfirmed");
  });
});

function fz(id: string, over: Partial<Omit<FuzzyScored, "candidate">>): FuzzyScored {
  return {
    de: 1,
    materialMatch: true,
    inRack: false,
    ...over,
    candidate: {
      spool_id: id,
      filament_name: "f",
      vendor_name: "v",
      material: "PLA",
      color_hex: null,
      remaining_weight: 1000,
      confidence: 0.5,
      match_method: "fuzzy",
      match_reasons: [],
    },
  };
}
const ids = (xs: FuzzyScored[]) => xs.map((x) => x.candidate.spool_id);

describe("isRackLocation()", () => {
  it("detects rack locations", () => {
    expect(isRackLocation("rack:abc:2-5")).toBe(true);
    expect(isRackLocation("workbench")).toBe(false);
    expect(isRackLocation(null)).toBe(false);
  });
});

describe("applyFuzzyGuards()", () => {
  it("drops material-only matches (live 2026-10-26: grey tray took Pink PLA from the rack)", () => {
    expect(ids(applyFuzzyGuards([fz("pink", { de: 60, inRack: true }), fz("nocolor", { de: null })]))).toEqual([]);
  });
  it("keeps off-rack candidates with colour evidence (ΔE < 10)", () => {
    expect(ids(applyFuzzyGuards([fz("bench", { de: 8 })]))).toEqual(["bench"]);
  });
  it("takes a rack spool only on material + ΔE < 5", () => {
    expect(ids(applyFuzzyGuards([fz("r", { de: 7, inRack: true })]))).toEqual([]);
    expect(ids(applyFuzzyGuards([fz("r", { de: 3, inRack: true, materialMatch: false })]))).toEqual([]);
    expect(ids(applyFuzzyGuards([fz("r", { de: 3, inRack: true })]))).toEqual(["r"]);
  });
  it("drops all rack spools when more than one qualifies", () => {
    const out = applyFuzzyGuards([fz("r1", { de: 1, inRack: true }), fz("r2", { de: 2, inRack: true }), fz("b", { de: 6 })]);
    expect(ids(out)).toEqual(["b"]);
  });
});
