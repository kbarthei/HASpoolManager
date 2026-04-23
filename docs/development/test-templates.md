# Test Templates — HASpoolManager

Copy-paste templates for each test type. Follow these patterns for consistency.

## Unit Test Template

File: `tests/unit/<module>.test.ts`

```typescript
import { describe, it, expect } from "vitest";
// Import the REAL production function — never re-implement
import { num, bool, str, classifyState, buildEventId } from "@/lib/printer-sync-helpers";

describe("num()", () => {
  it("parses valid integer", () => {
    expect(num("42")).toBe(42);
  });

  it("parses valid float", () => {
    expect(num("15.5")).toBe(15.5);
  });

  it("returns default for null", () => {
    expect(num(null)).toBe(0);
  });

  it("returns default for undefined", () => {
    expect(num(undefined)).toBe(0);
  });

  it("returns default for empty string", () => {
    expect(num("")).toBe(0);
  });

  // HA-specific sentinel values
  it("returns default for 'None'", () => {
    expect(num("None")).toBe(0);
  });

  it("returns default for 'unknown'", () => {
    expect(num("unknown")).toBe(0);
  });

  it("returns default for 'unavailable'", () => {
    expect(num("unavailable")).toBe(0);
  });

  it("accepts custom default", () => {
    expect(num("None", -1)).toBe(-1);
  });

  it("handles boolean input", () => {
    expect(num(true)).toBe(1);
  });
});

describe("classifyState()", () => {
  // Group by category
  describe("active states", () => {
    it.each(["PRINTING", "RUNNING", "PAUSE", "PREPARE", "SLICING"])
      ("classifies %s as active", (state) => {
        expect(classifyState(state)).toBe("active");
      });

    it.each(["CALIBRATING_EXTRUSION", "CLEANING_NOZZLE_TIP", "SWEEPING_XY_MECH_MODE"])
      ("classifies calibration state %s as active", (state) => {
        expect(classifyState(state)).toBe("active");
      });
  });

  describe("finish states", () => {
    it.each(["FINISH", "FINISHED", "COMPLETE"])
      ("classifies %s as finished", (state) => {
        expect(classifyState(state)).toBe("finished");
      });
  });

  describe("failed states", () => {
    it.each(["FAILED", "CANCELED", "CANCELLED"])
      ("classifies %s as failed", (state) => {
        expect(classifyState(state)).toBe("failed");
      });
  });

  describe("idle states", () => {
    it.each(["IDLE", "", "OFFLINE", "UNKNOWN"])
      ("classifies '%s' as idle", (state) => {
        expect(classifyState(state)).toBe("idle");
      });
  });

  it("classifies unknown string as idle", () => {
    expect(classifyState("FOOBAR")).toBe("idle");
  });

  it("handles lowercase input", () => {
    expect(classifyState("printing")).toBe("active");
  });
});
```

## Integration Test Template

File: `tests/integration/<endpoint>.test.ts`

```typescript
import { describe, it, expect, beforeAll, afterAll } from "vitest";

// Skip if no SQLite DB path set (CI without DB)
const skip = !process.env.SQLITE_PATH;

const BASE = "http://localhost:3000";
const AUTH = { Authorization: "Bearer test-dev-key-2026" };

// Test data IDs for cleanup
const testIds: string[] = [];

describe.skipIf(skip)("POST /api/v1/events/printer-sync", () => {
  let printerId: string;

  beforeAll(async () => {
    // Fetch a real printer ID
    const res = await fetch(`${BASE}/api/v1/printers`);
    const printers = await res.json();
    printerId = printers[0]?.id;
  });

  afterAll(async () => {
    // Clean up test-created records
    for (const id of testIds) {
      await fetch(`${BASE}/api/v1/prints/${id}`, {
        method: "DELETE",
        headers: AUTH,
      }).catch(() => {});
    }
  });

  async function sync(payload: Record<string, unknown>) {
    const res = await fetch(`${BASE}/api/v1/events/printer-sync`, {
      method: "POST",
      headers: { ...AUTH, "Content-Type": "application/json" },
      body: JSON.stringify({ printer_id: printerId, ...payload }),
    });
    return { status: res.status, body: await res.json() };
  }

  describe("Print lifecycle", () => {
    it("IDLE with no running print → no transition", async () => {
      const { body } = await sync({ print_state: "idle" });
      expect(body.synced).toBe(true);
      expect(body.print_transition).toBe("none");
    });

    it("PRINTING creates a new print", async () => {
      const { body } = await sync({
        print_state: "printing",
        print_name: "integration-test-print",
        print_weight: "15.5",
      });
      expect(body.print_transition).toBe("started");
      expect(body.print_id).toBeTruthy();
      testIds.push(body.print_id);
    });

    it("PRINTING again does not create duplicate", async () => {
      const { body } = await sync({
        print_state: "printing",
        print_name: "integration-test-print",
        print_weight: "18.0",
      });
      expect(body.print_transition).toBe("none");
    });

    it("IDLE after printing → marks finished", async () => {
      const { body } = await sync({
        print_state: "idle",
        print_weight: "20.0",
      });
      expect(body.print_transition).toBe("finished");
    });
  });

  describe("Edge cases", () => {
    it("missing auth → 401", async () => {
      const res = await fetch(`${BASE}/api/v1/events/printer-sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ printer_id: printerId, print_state: "idle" }),
      });
      expect(res.status).toBe(401);
    });

    it("missing printer_id → 400", async () => {
      const { status } = await sync({ print_state: "idle" });
      // Note: printer_id is added by sync() helper, so test without it
      const res = await fetch(`${BASE}/api/v1/events/printer-sync`, {
        method: "POST",
        headers: { ...AUTH, "Content-Type": "application/json" },
        body: JSON.stringify({ print_state: "idle" }),
      });
      expect(res.status).toBe(400);
    });

    it("handles None/unavailable values gracefully", async () => {
      const { body } = await sync({
        print_state: "idle",
        print_weight: "None",
        print_name: "unavailable",
        print_progress: "unknown",
      });
      expect(body.synced).toBe(true);
    });
  });
});
```

## E2e Test Template

File: `tests/e2e/<feature>.spec.ts`

```typescript
import { test, expect } from "@playwright/test";

test.describe("Inventory Page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/inventory");
    // Wait for the page to be interactive (auto-waits for DOM)
    await expect(page.getByText("Spool Rack")).toBeVisible({ timeout: 10000 });
  });

  test("shows printer slots section", async ({ page }) => {
    // Use getByText with regex for flexible matching
    await expect(page.getByText(/Printer/).first()).toBeVisible();
    await expect(page.getByText(/AMS · \d+ Slot/).first()).toBeVisible();
  });

  test("shows rack grid with configurable dimensions", async ({ page }) => {
    await expect(page.getByText(/\d+ × \d+/).first()).toBeVisible();
    // Row and column headers
    await expect(page.getByText("R1").first()).toBeVisible();
    await expect(page.getByText("S1").first()).toBeVisible();
  });

  test("shows surplus and workbench sections", async ({ page }) => {
    await expect(page.getByText("Surplus").first()).toBeVisible();
    await expect(page.getByText("Workbench").first()).toBeVisible();
  });

  // Future: use data-testid for stability
  // test("shows stat cards", async ({ page }) => {
  //   await expect(page.getByTestId("stat-active-spools")).toBeVisible();
  // });
});
```

## Smoke Test Template

File: `scripts/smoke-test.sh` (already exists, extend as needed)

```bash
# Add a new check:
check "New Page" "$BASE/new-route" "Expected Content"
```

## Adding Tests for a New Feature

When you add a new feature, follow this order:

### 1. Extract pure functions → unit test

```bash
# Create the helper module
touch lib/my-feature-helpers.ts

# Create the test
touch tests/unit/my-feature-helpers.test.ts
```

### 2. API endpoint → integration test

```bash
# Add scenarios to an existing integration file or create new
touch tests/integration/my-feature.test.ts
```

### 3. UI flow → e2e test (if user-facing)

```bash
# Add to an existing spec or create new
touch tests/e2e/my-feature.spec.ts
```

### 4. New route → update smoke test

```bash
# Add line to scripts/smoke-test.sh
check "My Feature" "$BASE/my-feature" "Expected text"
```
