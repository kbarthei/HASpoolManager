# Test Strategy — HASpoolManager

> Living document. Update when architecture changes or new patterns emerge.

## 1. Test Architecture

```
         E2e (Playwright)      ~20 tests   — user flows only
        Integration (Vitest+DB) ~50 tests   — API endpoints, DB mutations
       Unit (Vitest, no DB)     ~220 tests  — pure functions, scoring, parsing
      Smoke (bash)               11 checks  — production health
```

### What each layer tests

| Layer | Tests | Does NOT test |
|-------|-------|---------------|
| **Unit** | Pure functions: `num()`, `str()`, `bool()`, `buildEventId()`, state classification, `bambuFilamentName()`, `deltaEHex()`, fuzzy scoring, Zod schemas, theme utilities | DB queries, HTTP, React rendering |
| **Integration** | Full API round-trips with DB: printer-sync lifecycle, AMS slot matching, spool auto-creation, print usage/cost, CRUD, auth | UI, CSS, layout |
| **E2e** | User journeys: dashboard loads, navigation, spool detail, order creation, rack interaction | Edge cases covered by unit/integration |
| **Smoke** | Production health: HTTP status, key content presence | Detailed functionality |

## 2. Current State (as of 2026-03-31)

| Layer | Files | Tests | Quality |
|-------|-------|-------|---------|
| Unit | 7 | ~154 | 5/7 files are "conceptual" — re-implement logic inline instead of importing production code. Only `color.test.ts` and `theme.test.ts` test real modules. |
| Integration | 4 | ~12 | Test deprecated endpoints (`print-started`, `print-finished`), NOT the current `printer-sync`. Never run in CI. |
| E2e | 8 | ~25 | Fragile text selectors, break on copy changes. No `data-testid`. |
| Smoke | 1 | 11 | Solid. Works. |

### Critical gaps

| Flow | Coverage | Risk |
|------|----------|------|
| HA sync → print detection → usage → cost | **NONE** | Critical — the entire HA integration |
| Spool RFID auto-creation | **NONE** | Creates vendors, filaments, spools, tag mappings |
| Draft spool workflow | **NONE** | Third-party filament handling |
| AI label scanning | **NONE** | External API dependency |
| Print lifecycle via printer-sync | **NONE** | Replaces deprecated endpoints |
| `num()/bool()/str()` helpers | **NONE** | Every sync payload depends on these |

## 3. Code to Extract for Testability

These functions are trapped inside `printer-sync/route.ts` (645 lines) and must be extracted to `lib/printer-sync-helpers.ts`:

| Function | Purpose | Priority |
|----------|---------|----------|
| `num(val, def)` | Parse HA sensor values to numbers | HIGH |
| `bool(val)` | Parse HA booleans ("on", "True", "1") | HIGH |
| `str(val, def)` | Clean "None", "unknown", "unavailable" | HIGH |
| `classifyState(raw)` | Map raw state → active/finished/failed/idle | HIGH |
| `buildEventId(name, id)` | Deterministic event IDs | MEDIUM |
| `bambuFilamentName(type, idx)` | Derive product name from Bambu codes | MEDIUM |
| `bambuColorName(hex)` | Map hex → human color name | LOW |

From `lib/matching.ts`:
- Export `normalizeColor()` for direct unit testing
- Extract fuzzy scoring weights as constants

## 4. CI Pipeline Design

```
PR opened / push:
  ┌─────────────────┐
  │ lint-typecheck   │  <30s — fast gate
  │ lint + tsc       │
  └────────┬────────┘
           │
  ┌────────┴────────┐
  │ unit-tests       │  <60s — no DB
  │ vitest tests/unit│
  └────────┬────────┘
           │
  ┌────────┴─────────────┐
  │ integration-tests     │  <3min — needs DATABASE_URL
  │ vitest tests/integration │
  └────────┬─────────────┘

Push to main only:
           │
  ┌────────┴────────┐
  │ e2e-tests        │  <5min — browser + dev server
  │ playwright       │
  └────────┬────────┘
           │
  ┌────────┴────────┐
  │ smoke-test       │  <2min — production URL
  │ curl checks      │
  └─────────────────┘
```

Key changes from current:
- Split `lint-and-test` into `lint-typecheck` + `unit-tests`
- Add `integration-tests` that actually runs (currently silently skipped)
- Integration tests use Neon branch database
- Run unit + integration on PRs (not just main)

## 5. Test Data Strategy

### Fixtures (`tests/fixtures/seed.ts`)

Factory functions that create minimal test data:

```typescript
export async function makeVendor(name = "Test Vendor")
export async function makeFilament(vendorId, overrides?)
export async function makeSpool(filamentId, overrides?)
export async function makePrinter(overrides?)
export async function makeAmsSlot(printerId, overrides?)
export async function makeTagMapping(spoolId, tagUid)
```

### Isolation

- Integration tests: `beforeAll` seeds, `afterAll` cleans up by known IDs
- Each test uses unique identifiers (UUID or timestamp-prefixed names)
- Consider Drizzle transactions with rollback for full isolation

### E2e tests

- Run against live database (production seed data)
- Use `data-testid` attributes for stable selectors

## 6. Coverage Goals

**Do NOT chase line coverage.** Focus on critical path coverage:

| Module | Target | Rationale |
|--------|--------|-----------|
| `lib/printer-sync-helpers.ts` | 95%+ | Every sync runs through these |
| `lib/matching.ts` | 85%+ | Core spool identification |
| `lib/color.ts` | 95%+ | Already well-tested |
| `lib/validations.ts` | 70%+ | Schema validation prevents bad data |
| `printer-sync/route.ts` | 80%+ via integration | Most critical endpoint |
| `lib/actions.ts` | 50%+ via integration | Server actions with DB |

## 7. Implementation Roadmap

### Phase 1: Extract + unit test helpers (1 session)

1. Extract helpers from `printer-sync/route.ts` → `lib/printer-sync-helpers.ts`
2. Write `tests/unit/printer-sync-helpers.test.ts` (~40 tests)
3. Export `normalizeColor()` from `matching.ts`, add tests

**Why first:** These helpers process every sync payload. A bug here breaks everything. Zero coverage today.

### Phase 2: Core integration tests (1 session)

1. Create `tests/fixtures/seed.ts`
2. Write `tests/integration/printer-sync.test.ts` (~35 scenarios):
   - Print lifecycle: idle → printing → finished (5)
   - Print failure/cancel (3)
   - Calibration sub-states (2)
   - AMS slot matching: RFID, fuzzy, auto-create (8)
   - Print usage + cost (4)
   - Idempotency (2)
   - Edge cases: None, missing fields, auth (7)
   - Filament error mid-print (2)
   - Repeated same-name prints (2)
3. Update CI to run integration tests

### Phase 3: E2e stabilization (1 session)

1. Add `data-testid` to ~20 key components
2. Rewrite specs to use `data-testid`
3. Remove `waitForTimeout`, use auto-waiting
4. Consolidate to 6 spec files

### Phase 4: Ongoing (with each feature)

Every new feature ships with:
- Unit tests for pure functions
- Integration test for API endpoint
- One e2e test for the user flow

### Refactor backlog

- Convert 5 "conceptual" unit tests to import real production code
- Add `tests/unit/validations.test.ts` for Zod schemas
- Add `tests/unit/matching.test.ts` for exported scoring logic

## 8. Feature Testing Checklist

When adding a new feature, follow this checklist:

```
□ Pure functions extracted to lib/ and unit-tested
□ API endpoint has integration test (happy + error paths)
□ Zod schema validated for the endpoint
□ Auth tested (missing token → 401, wrong token → 401)
□ E2e test for the primary user flow (if UI-facing)
□ Smoke test updated if new page/route added
□ CI passes on PR before merge
```

## 9. Anti-Patterns to Avoid

- **Conceptual tests**: Don't re-implement logic in tests. Import the real function.
- **Text selectors in e2e**: Use `data-testid`, not `text=...` which breaks on copy changes.
- **Testing implementation details**: Test behavior, not internal state.
- **Snapshot tests**: Don't use for components that change frequently.
- **Mocking everything**: Only mock external services (Anthropic API). Use real DB for integration.
- **Sleeping**: Use Playwright's auto-waiting, not `waitForTimeout`.
