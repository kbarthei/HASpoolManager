# Supply Engine

Answers "am I about to run out of this filament?" and "what should I buy?"

Analyses past consumption, projects when stock will hit zero, compares
against user-defined rules, and emits alerts or optimized shopping
recommendations. **Suggests, never auto-orders** — every purchase goes
through user confirmation.

Source: `lib/supply-engine.ts` (pure math, 282 LOC), `lib/supply-engine-db.ts`
(DB glue, 320 LOC), `lib/order-optimizer.ts`, `lib/budget.ts`.

---

## 1. Data flow

```
Every finished print
  ↓
createPrintUsage (printer-sync route)
  ↓
recordConsumption(filamentId, grams)
  ↓
consumption_stats (daily bucket per filament)
  ↓
runSupplyAnalysis (on-demand + daily)
  ↓
supply_alerts (active state per filament)
  ↓
UI (/orders page + dashboard widget) + Optimized Cart
```

Users create **supply_rules** ("keep at least 2 spools of PETG") via
`/orders`; the engine runs rules against current stock + consumption
history and raises alerts.

---

## 2. Pure math layer (`lib/supply-engine.ts`)

No DB access. Every function is pure and unit-testable.

### `calculateConsumptionRate(dailyStats, windowDays = 56)`

Input: daily consumption per filament (from `consumption_stats`).

Two signals:
1. **EMA (Exponential Moving Average)** with α = 0.1 — current average
   grams/day, biased toward recent days
2. **Weekly linear regression** over the last ≤8 weeks — slope → "rising",
   "falling", or "stable"

Output:
```ts
{
  avgGramsPerDay: number,
  trend: "rising" | "falling" | "stable",
  trendSlope: number,         // grams/day change per week
  weeklyConsumption: number[], // per-week totals, oldest first
  confidence: number,         // 0..1, based on data density
}
```

Confidence scales with `daysWithData / windowDays`. Below ~0.3 confidence,
downstream code should treat the rate as a very rough estimate.

### `daysUntilEmpty(currentWeightGrams, avgGramsPerDay)`

Obvious division with sanity caps: returns `Infinity` for zero
consumption, `0` for zero stock.

### `calculateReorderPoint(rule, rate)`

Given a supply rule (`min_spools`, `max_stock_spools`, etc.) and a rate,
decides how many spools to suggest ordering and when. Respects the rule's
`max_price_per_spool` cap and `preferred_shop_id`.

### `classifyFilament(stats, rule)`

Tags each filament as `"core"`, `"regular"`, `"project"`, or `"occasional"`
based on how consistently it's consumed. Drives UI prioritization —
"core" filaments surface first in shortage alerts.

### `determineUrgency(daysRemaining, trendSlope)`

Returns `"critical"` / `"warning"` / `"info"` / `"ok"` based on
days-until-empty + whether the trend is rising.

### `recommendOrderQty(rule, currentSpools, rate)`

Suggest N spools to order. Rules:
- Never below `min_spools`
- Never above `max_stock_spools`
- If rate is "rising" trend, order one extra
- Clamps to whole spools

---

## 3. DB glue (`lib/supply-engine-db.ts`)

### `recordConsumption(filamentId, grams)`

Called inside `createPrintUsage`. Upserts today's row in
`consumption_stats`:

```
PRIMARY KEY (filament_id, date)
```

So the row gets `weight_grams += grams` and `print_count += 1`, or is
inserted with `(grams, 1)`.

### `getConsumptionHistory(filamentId, days=56)`

Range query returning `DailyConsumption[]` for the pure layer.

### `analyzeFilamentSupply(filamentId)`

The main orchestrator. For one filament:

1. Load active spools → count, sum remaining weight
2. Load supply rule (if any)
3. `getConsumptionHistory` → 56 days of daily totals
4. `calculateConsumptionRate` → EMA + trend
5. `daysUntilEmpty(totalRemaining, avgGramsPerDay)`
6. `determineUrgency(days, trend)`
7. Return a full `SupplyStatus` object

### `runSupplyAnalysis()`

Iterates all active filaments, calls `analyzeFilamentSupply` for each,
returns `SupplyStatus[]`. This is what the `/api/v1/supply/status`
endpoint and the `/supply` page use.

### `updateSupplyAlerts(statuses)`

Reconciles the `supply_alerts` table with the latest analysis:
- Closes alerts whose urgency dropped to `"ok"` (status → `"resolved"`)
- Opens new alerts where urgency first hits `"warning"` or `"critical"`
- Updates existing active alerts' severity/message

Called after each print finishes (inside the printer-sync route) so
alerts update in near real-time.

---

## 4. Order optimization (`lib/order-optimizer.ts`)

Takes a list of spools-to-order and:
- Groups them by preferred shop (per `supply_rules.preferred_shop_id`)
- Finds the best-price shop per filament from `shop_listings`
- Rebalances across shops to minimize (shipping + bulk-discount boundaries +
  per-shop thresholds like "free shipping over 50 EUR")
- Respects `settings.monthly_filament_budget` — if the projected spend
  exceeds the remaining monthly budget, flags the excess items

Output feeds the **Optimized Cart** UI on `/orders`.

---

## 5. API surface

| Endpoint | Method | Shape | Purpose |
|---|---|---|---|
| `/api/v1/supply/status` | GET | `SupplyStatus[]` | On-demand snapshot |
| `/api/v1/supply/alerts` | GET | `SupplyAlert[]` | Active alerts + filament details |
| `/api/v1/supply/alerts/[id]` | PUT | — | Dismiss an alert |
| `/api/v1/supply/rules` | GET / POST | `SupplyRule[]` / created rule | List + create rules |
| `/api/v1/supply/rules/[id]` | PATCH / DELETE | `{ok:true}` | Edit + remove |
| `/api/v1/supply/analyze` | POST | trigger | Force an analysis run |
| `/api/v1/supply/optimize` | POST | `{orders: ShopOrder[]}` | Compute the Optimized Cart for given items |

All GETs are flat (no `{data:}` wrapper since the legacy cleanup).
Mutations use `requireAuth`; reads use `optionalAuth`.

---

## 6. UI touchpoints

- `/orders` page — left column: Budget card, Supply Alerts, Optimized
  Cart, Shopping List, Supply Rules, Monthly Budget settings, Shop
  Configuration
- `/` (dashboard) — Supply Widget showing the top-3 most-urgent filaments
- `/supply` — full-page drill-down per filament: consumption chart, trend,
  rule, projected out-of-stock date

---

## 7. Rule-matching precedence

A supply rule can be scoped by `filament_id` (most specific), by
`material` (broader), or by `vendor_id` (broadest). When multiple rules
could apply:

1. filament_id match wins
2. material match next
3. vendor_id match last

Only one rule per filament is active per analysis cycle.

---

## 8. Test coverage

| File | Scope |
|---|---|
| `tests/unit/supply-engine.test.ts` | Pure math layer — EMA, trend, urgency, reorder qty |
| Integration | Supply endpoints are under-tested (flagged in the audit). See `development/testing.md` for the gap list. |

---

## 9. Related

- [`../reference/api.md#supply`](../reference/api.md) — endpoint request/response details
- [`state-machine.md`](state-machine.md) — where `recordConsumption` fires in the print lifecycle
- `/admin/diagnostics` → "Supply Rules" card surfaces broken rules (no shop, no filament, etc.)
