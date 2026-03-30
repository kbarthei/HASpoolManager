# Test Strategy — HASpoolManager

## Test Pyramid

```
              /  E2e: 8 specs (critical user flows)      \
             /   Integration: 35+ scenarios (printer-sync) \
            /    Unit tests: 185+ (from current 154)        \
           /     Smoke: 11 endpoint checks (existing)        \
```

## Current State Assessment

| Layer | Count | Quality |
|-------|-------|---------|
| Unit (Vitest) | 154 | Many are "conceptual" — re-implement logic inline instead of importing production code. Only `color.test.ts` and `theme.test.ts` test real modules. |
| Integration | 12 | Test **deprecated** endpoints (print-started, print-finished), NOT the current `printer-sync` endpoint. |
| E2e (Playwright) | ~25 | Fragile text-content selectors (`text=AMS Status`), break on any copy change. No `data-testid`. |
| Smoke | 11 | Solid bash script, works well. |

## Priority Implementation Order

### Phase 1: Extract + unit-test printer-sync helpers (HIGH VALUE)

Extract `num()`, `bool()`, `str()`, `buildEventId()`, and state classification from `route.ts` into `lib/printer-sync-helpers.ts`. Write ~25 tests covering all HA sensor value edge cases.

**Why first:** These helpers process every sync payload. A wrong `num("None")` or misclassified state breaks the entire integration. Currently zero test coverage.

**Test file:** `tests/unit/printer-sync-helpers.test.ts`

```typescript
describe("num()", () => {
  it("parses valid numbers", () => expect(num("15.5")).toBe(15.5));
  it("returns default for None", () => expect(num("None")).toBe(0));
  it("returns default for unavailable", () => expect(num("unavailable")).toBe(0));
  it("returns default for empty string", () => expect(num("")).toBe(0));
  it("returns default for null", () => expect(num(null)).toBe(0));
  it("returns custom default", () => expect(num("None", -1)).toBe(-1));
});

describe("State classification", () => {
  it("PRINTING is active", () => expect(ACTIVE_STATES.has("PRINTING")).toBe(true));
  it("CALIBRATING_EXTRUSION is active", () => expect(ACTIVE_STATES.has("CALIBRATING_EXTRUSION")).toBe(true));
  it("FINISHED is finish", () => expect(FINISH_STATES.has("FINISHED")).toBe(true));
  it("CANCELED is failed", () => expect(FAILED_STATES.has("CANCELED")).toBe(true));
  it("unknown string is idle", () => /* test classification logic */);
});
```

### Phase 2: Integration tests for printer-sync endpoint (35 scenarios)

**Test file:** `tests/integration/printer-sync.test.ts`

**Scenario categories:**

| Category | Tests | What it covers |
|----------|-------|---------------|
| A. Normal lifecycle | 5 | idle → printing → finished |
| B. Print failure | 2 | printing → failed/cancelled |
| C. Calibration states | 3 | CALIBRATING_EXTRUSION, HEATBED_PREHEATING, etc. |
| D. Filament error | 2 | IDLE + print_error keeps running |
| E. Repeated prints | 2 | Same name twice → unique event IDs |
| F. AMS slot updates | 6 | RFID match, fuzzy match, spool swap, empty |
| G. Print usage + cost | 4 | Weight deduction, cost calc, empty spool |
| H. Idempotency | 2 | Same payload 10x → same result |
| I. Edge cases | 7 | Unknown states, missing fields, None values, auth |

### Phase 3: E2e stabilization

1. Add `data-testid` attributes to key components
2. Rewrite specs to use `data-testid` instead of text content
3. Replace `waitForTimeout` with explicit waits
4. Consolidate to 8 focused spec files

### Phase 4: Unit test gap closure

- `tests/unit/validations.test.ts` — Zod schemas
- `tests/unit/matching.test.ts` — fuzzy scoring algorithm
- Refactor conceptual tests to import real production code

### Phase 5: CI pipeline improvements

Split `lint-and-test` into separate jobs, add integration test job, enable e2e on PRs.

## Target Test Counts

| Layer | Current | Target | Delta |
|-------|---------|--------|-------|
| Unit | 154 | 185+ | +31 |
| Integration | ~12 | 50+ | +38 |
| E2e | ~25 | ~20 (fewer but robust) | -5 |
| Smoke | 11 | 11 | 0 |
| **Total** | **~202** | **~266+** | **+64** |

## Key Architectural Changes Needed

1. **Extract helpers** from `printer-sync/route.ts` (390 lines) into `lib/printer-sync-helpers.ts` — makes them unit-testable
2. **Extract fuzzy scoring** from `lib/matching.ts` inner function into a testable export
3. **Add `data-testid`** attributes to ~20 key components
4. **Restructure CI** to run integration tests with DB access
