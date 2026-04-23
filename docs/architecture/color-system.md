# Color System

Three separate but related subsystems:
1. **Perceptual color distance** (`lib/color.ts`) — CIE ΔE for matching
2. **Vendor color resolution** (`lib/color-lookup.ts`, `lib/vendor-colors.ts`) — filament name → hex via SpoolmanDB
3. **UI material pills** (`lib/material-colors.ts`) — polymer family → background/foreground pair

---

## 1. Perceptual distance — CIE ΔE

**Why:** hex equality is too strict (alpha rounding, color-profile drift)
and HSL diff is perceptually uneven (blue differences look bigger than red
differences at the same numerical distance). CIE Lab separates lightness
from chroma, and Euclidean distance in Lab space roughly matches how
people see color difference.

### Pipeline

```
"FFB030" (RRGGBB hex)
    ↓  hexToRgb
{r: 255, g: 176, b: 48}
    ↓  linearize (sRGB gamma 2.4)
{r: 1.0, g: 0.429, b: 0.030}
    ↓  rgbToXyz (D65 illuminant matrix)
{x: 0.490, y: 0.420, z: 0.068}
    ↓  xyzToLab (CIE 1976, D65 reference white)
{l: 71, a: 21, b: 52}
```

CIE76 Delta-E is simple Euclidean distance in Lab:

```
ΔE = √((L₁-L₂)² + (a₁-a₂)² + (b₁-b₂)²)
```

Newer CIEDE2000 gives better results but we use CIE76 for simplicity —
it's sufficient for the matching thresholds (see below).

### Thresholds (used in matching)

| ΔE | Category | Fuzzy-match points (weight = 25) |
|---|---|---:|
| < 2.3 | imperceptible (JND) | 25 |
| < 5 | very close | 20 |
| < 10 | perceptible but close | 10 |
| < 20 | clearly different | 2.5 |
| ≥ 20 | totally different | 0 |

Used in:
- `lib/matching.ts` fuzzy score (color factor)
- `app/api/v1/events/printer-sync/route.ts` swap detection (`SWAP_DELTA_E_THRESHOLD = 10`)

---

## 2. Vendor color resolution

When a new filament is created (via SpoolmanDB import or manual add),
we want to auto-fill the official brand color — far more reliable than
asking the user to pick from a color picker.

### `lib/vendor-colors.ts`

Static data table, ~810 lines, keyed as `"<Vendor>|<Filament Name>"`:

```ts
export const VENDOR_COLORS: Record<string, string> = {
  "Bambu Lab|PLA Basic Black": "000000",
  "Bambu Lab|PLA Matte Charcoal": "1C1C1C",
  "Bambu Lab|PLA Basic Jade White": "F8F8F8",
  "Polymaker|PolyTerra PLA Army Beige": "B2A176",
  // ... ~250 entries across 8 vendors
};
```

Source: scraped/curated from SpoolmanDB (donkie.github.io/SpoolmanDB) —
a community-maintained JSON catalogue. Updating the table:

```bash
npx tsx scripts/preview-color-corrections.ts          # preview from upstream
npx tsx scripts/preview-color-corrections.ts --apply  # write
```

### `lib/color-lookup.ts:lookupVendorColor(vendor, filamentName)`

Fallback chain:
1. **Exact key lookup** — `"Bambu Lab|PLA Matte Charcoal"` → `"1C1C1C"`
2. **Strip material prefix** — `"PLA Matte Charcoal"` → try `"Matte Charcoal"` as fallback
3. **Partial match** — substring search across the vendor's entries
4. Return `null` if none match

**Guard against bare material names:** the `BARE_MATERIAL_NAMES` set
prevents `"PLA"` (the bare material) from matching the first
`"Bambu Lab|PLA *"` entry in iteration order, which would produce
arbitrary colors. If the user entered just a material, we return null
and let them pick a color in the UI.

### When it's called

- Inside `autoCreateBambuSpool` — fallback when Bambu sends an ambiguous
  color or tray_color is zeroed
- Import-script flows (order parse, manual add dialog) — populate the
  `color_hex` field before inserting the filament row

---

## 3. UI material pills

Material badges on spool cards need distinct background/foreground pairs
that work in both light and dark mode. Returned as inline `style` object
because the material list grows; no Tailwind safelisting.

`lib/material-colors.ts` exports `getMaterialPillColors(material)`:

```ts
{ bg: "rgba(220,110,60,0.25)", fg: "#b85a28" }  // PLA — orange
{ bg: "rgba(60,170,120,0.20)", fg: "#2e8a5c" }  // PETG — green
{ bg: "rgba(220,60,60,0.22)", fg: "#b83030" }   // ABS — red
// ...
```

Background is always `rgba(…, 0.20-0.25)` so it sits over any surface
color; foreground is a solid hex that meets WCAG AA contrast against
both light and dark surfaces. Unknown materials fall back to neutral grey.

### Pills vs. spool color

Note the intentional split:
- **Spool color** = the actual filament color (e.g. `#FFB030` Bambu Orange) → shown as a color dot
- **Material pill** = the polymer family tint (e.g. PLA orange) → shown as a pill

They look similar because PLA happens to be "orangey" in the color
scheme. That's coincidence; TPU PLA-Silver would have a silvery spool
dot but a blue TPU pill.

---

## 4. Where colors surface in the UI

| Component | What | Source |
|---|---|---|
| `SpoolColorDot` | The round color swatch | `filament.colorHex` (via `deltaEHex` for close-match grouping) |
| `SpoolMaterialBadge` | Material pill | `getMaterialPillColors` from `lib/material-colors.ts` |
| `RackSpoolCard` | Both | Combines dot + pill + material name |
| Admin color corrections | Delta preview | `deltaEHex` shown next to "old → new" swap suggestions |

---

## 5. Testing

| File | Covers |
|---|---|
| `tests/unit/color.test.ts` | hex → Lab conversion, `deltaEHex` calculation, known pair values |
| `tests/unit/color-lookup.test.ts` | Exact / partial / strip-material fallback, bare-material guard |

Unit tests include known pairs (e.g. pure red vs pure blue → ΔE ≈ 170)
as sanity checks on the math.

---

## 6. Design limits / future work

- **CIE76 not CIEDE2000.** Accurate enough for matching; could upgrade if we ever want perceptually-calibrated "find similar colors" UI.
- **D65 hardcoded.** No sRGB-vs-Adobe-RGB handling; Bambu + third-party filament colors are all assumed sRGB (accurate in practice).
- **VENDOR_COLORS is static.** A regular sync script against upstream SpoolmanDB would auto-refresh; currently manual.
- **Material pills hardcoded.** Growing this table requires a redeploy; acceptable given rate of new polymer families.
