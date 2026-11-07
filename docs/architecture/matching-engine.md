# Matching Engine

When an AMS slot reports what's loaded in it (via the printer-sync payload),
the matching engine figures out **which of your existing spools** that is —
or creates a new spool row if nothing matches.

Source: `lib/matching.ts`, plus auto-creation logic in
`app/api/v1/events/printer-sync/route.ts` (`autoCreateBambuSpool`,
`autoCreateDraftSpool`).

---

## 1. Inputs

Per AMS slot, the sync payload carries:

| Field | Source | Shape |
|---|---|---|
| `tag_uid` | Bambu RFID tag (if present) | 16-hex-char UUID, or `"0000000000000000"` if absent |
| `tray_info_idx` | Bambu filament code | e.g. `"GFA00"` (PLA Basic), `"GFB50"` (ABS-GF) |
| `tray_type` | Material string | e.g. `"PLA"`, `"ABS-GF"`, `"PETG"` |
| `tray_color` | Hex color | `"RRGGBBAA"` (alpha always `FF` for Bambu) or `"RRGGBB"` |
| `tray_sub_brands` | Product sub-brand (rare) | e.g. `"Matte"`, `"Silk"` |
| `printer_id`, `ams_index`, `tray_index` | From the route context | Slot exclusivity + "bound to this slot" tie-break |
| `remain` | Printer's remaining-% estimate | Weight check when learning a tag (required) |

## 2. Tiers, in order

A **real RFID tag** (anything but `"0000000000000000"`) takes the RFID path
only: 1a → 1c → (no match → auto-create). Trays **without** a tag take
1b → 2. A tagged tray never reaches slot-binding or fuzzy scoring.

### Tier 1a — RFID exact match

1. Look up `tag_mappings` by `tag_uid`
2. If a mapping exists → return its `spool_id` with `confidence = 1.0`,
   `match_method = "rfid_exact"`
3. Else → Tier 1c

RFID is authoritative for Bambu spools. If the mapped spool is `archived` or
`empty`, the sync route reactivates it (`rfidReactivation()`: status
`active`, weight = `initial_weight × remain%`) — the tag read proves the
spool is physically loaded, and the regular weight sync never raises weight.

### Tier 1c — Learn an unknown tag

The tag is a specific physical spool the DB hasn't seen. Learning it onto an
existing spool relocates that spool — usually out of a rack the user manages
by hand — so it must be unambiguous (`pickLearnCandidate()`):

- spool is `active` and has **no** tag mapping
- `filament.bambu_idx === tray_info_idx` and material equal
- ΔE(tray colour, filament colour) `< LEARN_MAX_DELTA_E` (15). Bambu reports
  Matte Charcoal as `000000` while users often store `1C1C1C` (ΔE≈10);
  Bone White vs Ivory White is ΔE≈21 and is rejected.
- `|remaining_weight − initial_weight × remain%| ≤ 10 %` of initial weight
  (`LEARN_MAX_WEIGHT_GAP`). A full 1000 g rack spool never matches a tray at
  55 %. Unknown `remain` (−1) → no learn.
- not bound to another slot — unless also bound to this slot (duplicate
  binding; all its bindings are suspect)
- **exactly one** spool passes. Two identical full rack spools → no learn;
  we never guess which rack slot was emptied.

The current slot binding is **not** evidence: it may come from an earlier bad
match (live 2026-11-07: old fuzzy code bound a full rack spool to a 55 % tray,
weight-synced it to 550 g, and a slot-preferring learn would have cemented
it). Returns `match_method = "rfid_learn"`, `confidence = 0.9`; the sync route
inserts the tag mapping so the next sync is a Tier 1a hit. This is how
order-imported spools (created without a tag) pick up their RFID on first
load.

No candidate → `null`, and the sync route auto-creates (Tier 3a).

**Why no fuzzy fallback for tagged trays:** fuzzy scoring clears its 0.20 bar
on product line + material + location alone. In production a red Silk+
(GFA06) scored 0.37 against a black Matte (GFA01) spool, and Tier 1b then
re-confirmed the wrong binding on every sync — one spool ended up bound to
three trays.

### Tier 1b — Bambu-idx + AMS slot (untagged trays only)

If `tray_info_idx` is present and we know the exact slot:
1. Look up the current occupant of `(printer_id, ams_index, tray_index)` in
   `ams_slots`
2. If the linked spool's `filament.bambu_idx` matches → return with
   `confidence = 0.95`
3. Else → fall through

This catches the case where the spool was loaded manually (no RFID scan)
but we can infer it from the slot's previous state plus an index match.

### Tier 2 — Fuzzy match (untagged trays only)

Scores every active spool against the request and returns the top candidate
(or candidates, for UI review). Spools bound to another slot are excluded
(slot exclusivity).

Scoring weights:

| Factor | Max points | Behavior |
|---|---:|---|
| Bambu idx match | 40 | Exact → 40; prefix match on first 3 chars (same product line) → 12 |
| Material | 20 | Case-insensitive string equality on `filament.material` vs `tray_type` |
| Color | 25 | CIE ΔE distance: <2.3 → 25; <5 → 20; <10 → 10; <20 → 2.5; else 0 |
| Vendor | 10 | `tray_sub_brands` contains the vendor name (case-insensitive) |
| Location | 5 | Spool is currently in an AMS slot (`location = "ams"` / `"ams-ht"`) |
| **Max** | **100** | |

Confidence = `score / maxScore`. Candidates below `MIN_CONFIDENCE_THRESHOLD = 0.20`
are dropped; the rest are sorted by confidence descending.

The top candidate is returned as `match`; up to 5 runner-ups go in
`candidates` for the UI to surface.

### Color matching details

`tray_color` is `"RRGGBBAA"` — we strip alpha and use the first 6 hex chars.
`deltaEHex(a, b)` from `lib/color.ts` converts both to CIE Lab and returns
a perceptual distance. Thresholds:

- `<2.3` — imperceptible (JND)
- `<5` — very close
- `<10` — perceptible but close
- `<20` — clearly different, tiny credit
- `≥20` — totally different color

See [`color-system.md`](color-system.md) for the full color model.

---

## 3. Auto-creation (in the sync route)

When the match tier returns `null`, the printer-sync route decides
whether to **create a new spool automatically** based on the RFID
presence:

### Tier 3a — Auto-create Bambu spool (RFID present)

Function: `autoCreateBambuSpool(tagUid, bambuIdx, trayType, trayColor, slotDef)`

Triggers when the RFID tag is non-zero AND >8 chars (real Bambu UUID) AND
neither Tier 1a nor Tier 1c matched.

Steps:
1. Find-or-create `vendor` "Bambu Lab"
2. Find-or-create `filament` by `(vendor_id, name, color_hex)`
    - Name from the HA tray name via `bambuProductName()` (`"Bambu PLA
      Silk+"` → `"PLA Silk+"`); falls back to `bambuFilamentName(trayType,
      bambuIdx)` (static prefix table, e.g. `"PLA Basic"`) when the name is
      missing — the prefix alone can't tell Basic, Matte and Silk+ apart
    - Color from the tray payload
    - `bambu_idx` field populated
3. Create `spool` with `initialWeight = 1000`, `location = "ams"` (or
   `"ams-ht"` / `"external"` based on slot type)
4. Create `tag_mapping` linking the RFID UID to the new spool

Result: every unseen Bambu RFID becomes a trackable spool on first sight,
with sane defaults. The user can then rename/adjust weights in the UI.

### Tier 3b — Auto-create draft spool (no RFID)

Function: `autoCreateDraftSpool(trayType, trayColor, slotDef)`

Triggers for third-party filament without RFID: `trayType` present but
`tagUid` is `"0000000000000000"` (or empty). Creates a minimal spool with
`status = "draft"` so it's visibly marked as "needs your attention" in the
UI.

The draft status prompts the user to fill in vendor, exact filament name,
and weight — they're matched by the regular fuzzy logic on subsequent prints.

---

## 4. Swap detection

Before matching, the printer-sync route checks whether the tray content
has physically changed:

```ts
const linked = await db.query.spools.findFirst({ where: eq(spools.id, existingSlot.spoolId) });
const de = deltaEHex(linkedColor6, newColor6);
if (de > SWAP_DELTA_E_THRESHOLD) {  // 10
  filamentSwapped = true;
}
```

If a swap is detected without an RFID reading the NEW spool, matchSpool's
location bonus would re-bind the OLD spool (still at `location = "ams"`
in the DB). To prevent that, the route clears the old spool off the slot
first (moves it to `workbench`) and uses `skipMatchAfterSwap` to bypass
fuzzy matching on the new tray. Auto-create path (Tier 3a or 3b) then runs.

**Slot exclusivity on unbind.** When a slot drops its old spool (swap,
rebind, or empty), the old spool is moved to `workbench` / `surplus` only if
no other slot still holds it. This keeps a duplicate binding from relocating
a spool that is physically still in the AMS while it heals.

---

## 5. Wish list / gotchas

- **`fuzzyMatch` reads ALL active spools** (no pagination, no pre-filter).
  Fine for hundreds of spools; would need indexing if this ever scales to
  thousands.
- **Color thresholds are hardcoded.** Possibly expose in config for users
  with calibrated monitors who want stricter matching.
- **No material-family fallback.** PLA vs. PLA+ = no material match despite
  being near-identical. Could add a substitution table.
- **Weights are centrally defined.** The `MatchWeights` interface accepts
  per-call overrides, but no UI exposes this; the default weights are baked in.

---

## 6. Test coverage

| Test | Layer | Scope |
|---|---|---|
| `tests/unit/matching-scoring.test.ts` | unit | ΔE thresholds + `normalizeColor()` |
| `tests/unit/rfid-identity.test.ts` | unit | `isRealTag()`, `pickLearnCandidate()` (Tier 1c rules: weight, uniqueness, slot binding not evidence), `rfidReactivation()`, `bambuProductName()` |
| `tests/integration/printer-sync-rfid-identity.test.ts` | integration | K1–K8: duplicate-binding heal, full rack spool not learned onto a partial tray, never bind a differently-tagged spool, learn onto rack spool, auto-create on colour mismatch, reactivate archived/empty, fuzzy slot exclusivity, auto-created filament named from HA tray name |
| `tests/integration/api-match.test.ts` | integration | End-to-end POST `/api/v1/match` with real DB; covers Tier 1a + a few fuzzy cases |
| `tests/integration/printer-sync.test.ts` sections F–H | integration | Active-slot matching, tag-mapping, auto-creation branches |

## 7. Related

- [`state-machine.md`](state-machine.md) — full match-decision flowchart
- [`color-system.md`](color-system.md) — how ΔE is computed
- [`sync-worker.md`](sync-worker.md) — what feeds the payload
- [`../reference/api.md#match`](../reference/api.md) — the standalone `/api/v1/match` endpoint
