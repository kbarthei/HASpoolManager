import { describe, it, expect } from "vitest";
import { isEligibleForPicker, locationLabel } from "@/lib/spool-picker-filter";

const SOME_RACK = "rack:abc-123:2-5";

describe("isEligibleForPicker", () => {
  describe("common rules (both modes)", () => {
    it.each(["ams", "ams-ht", "external", "archive"] as const)(
      "rejects spool currently in %s",
      (loc) => {
        for (const mode of ["ams", "storage"] as const) {
          expect(
            isEligibleForPicker({ remainingWeight: 500, location: loc }, mode),
          ).toBe(false);
        }
      },
    );

    it("rejects empty spools regardless of location", () => {
      expect(
        isEligibleForPicker({ remainingWeight: 0, location: "workbench" }, "ams"),
      ).toBe(false);
      expect(
        isEligibleForPicker({ remainingWeight: -1, location: SOME_RACK }, "ams"),
      ).toBe(false);
    });

    it("accepts workbench/surplus/storage/null in either mode", () => {
      for (const mode of ["ams", "storage"] as const) {
        for (const loc of ["workbench", "surplus", "storage", null]) {
          expect(
            isEligibleForPicker({ remainingWeight: 500, location: loc }, mode),
          ).toBe(true);
        }
      }
    });
  });

  describe("ams mode (load into AMS slot)", () => {
    it("accepts spools currently in a rack cell — they're available to load", () => {
      expect(
        isEligibleForPicker({ remainingWeight: 800, location: SOME_RACK }, "ams"),
      ).toBe(true);
    });
  });

  describe("storage mode (place into rack cell)", () => {
    it("rejects spools already in a rack cell — moving uses move-dialog", () => {
      expect(
        isEligibleForPicker({ remainingWeight: 800, location: SOME_RACK }, "storage"),
      ).toBe(false);
    });

    it("still accepts workbench spools (they're waiting to be put away)", () => {
      expect(
        isEligibleForPicker({ remainingWeight: 800, location: "workbench" }, "storage"),
      ).toBe(true);
    });
  });
});

describe("locationLabel", () => {
  it("returns dash for null/empty", () => {
    expect(locationLabel(null)).toBe("—");
    expect(locationLabel("")).toBe("—");
  });

  it("formats rack location as R<row>·<col>", () => {
    expect(locationLabel("rack:rack-id:3-7")).toBe("R3·7");
    expect(locationLabel("rack:any-uuid:1-1")).toBe("R1·1");
  });

  it("renders well-known locations with friendly capitalization", () => {
    expect(locationLabel("workbench")).toBe("Workbench");
    expect(locationLabel("surplus")).toBe("Surplus");
    expect(locationLabel("storage")).toBe("Storage");
    expect(locationLabel("ams")).toBe("AMS");
    expect(locationLabel("ams-ht")).toBe("AMS HT");
    expect(locationLabel("external")).toBe("External");
  });

  it("falls back to the raw string for unknown locations", () => {
    expect(locationLabel("custom-location")).toBe("custom-location");
  });
});
