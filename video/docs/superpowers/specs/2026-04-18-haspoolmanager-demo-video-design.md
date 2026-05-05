# HASpoolManager 60-Second Demo Video — Design Spec

**Date:** 2026-04-18
**Target project:** `my-video` (Remotion 4.0.448, React 19, Tailwind v4)
**Subject project:** HASpoolManager — 3D Printing Filament Lifecycle Manager (Home Assistant addon)
**Duration:** 60s
**Format:** 1920×1080, 30 fps, MP4 (H.264), no audio required (optional music track added later)
**Distribution:** GitHub README + Home Assistant community forum

---

## Goal

Produce a polished 60-second product demo that walks a viewer through the full filament lifecycle HASpoolManager manages. The video must be readable without sound, feel on-brand with the app's Apple Health-inspired dark UI, and anchor each beat on a real feature (not generic marketing fluff). The output is a single MP4 committed to the project repo and embeddable in the HASpoolManager README.

## Audience

Technical homelabbers and Bambu Lab printer owners who already use Home Assistant. They scan fast, care about real capabilities, and will install the addon from the badge if the video convinces them the tool is real and solves a concrete pain.

## Narrative — Lifecycle Story

Seven beats mapped to the product lifecycle stated in the HASpoolManager README: *Purchase → Inventory → Storage → AMS Loading → Print Tracking → Usage Deduction → Cost Analytics*.

| # | Beat | Range (frames @30fps) | Range (sec) | Purpose |
|---|---|---|---|---|
| 1 | Hook | 0–180 | 0–6s | Brand identity + tagline |
| 2 | Order → AI parse | 180–480 | 6–16s | Show AI order parsing capability |
| 3 | Digital Rack Twin | 480–780 | 16–26s | Show inventory grid filling |
| 4 | AMS sync + matching | 780–1080 | 26–36s | Show RFID exact + CIE Delta-E fuzzy match |
| 5 | Print + weight deduction | 1080–1380 | 36–46s | Show per-tray weight tracking |
| 6 | Cost analytics chart | 1380–1680 | 46–56s | Animated charts (user-requested) |
| 7 | Install CTA | 1680–1800 | 56–60s | Conversion moment |

**Total:** 1800 frames.

### Beat 1 — Hook (0–6s)
- Dark background `#0B0D0E`, subtle animated filament strand traversing bottom edge.
- "HASpoolManager" wordmark fades + slightly scales in using Geist Sans.
- Tagline beneath: "Every gram tracked." in teal `#14B8A6`, animated letter-by-letter reveal via Remotion spring.

### Beat 2 — Order → AI parse (6–16s)
- Left panel: mock order-confirmation email body types/fades in.
- Right panel: animated extraction — highlighted tokens from the email fly across as rows in an inventory table: filament name, quantity, unit price, shop.
- Small "Claude" pill bottom-right with a pulse to credit the AI parsing feature.
- Ends with 4 rows settled in the table.

### Beat 3 — Digital Rack Twin (16–26s)
- Center stage: 4×8 grid of slot cells (32 cells).
- Cells fill position-by-position with colored spool tiles (stagger ~80ms per tile, grouped by column) — each tile shows filament color + brand abbrev.
- Caption ticker top-right: "30+ spools tracked."

### Beat 4 — AMS sync + matching (26–36s)
- AMS 4-slot UI centered. One empty slot highlighted.
- Spool tile slides into the slot from left.
- RFID pulse ring emits, then a match-confidence bar fills to 100% with label "RFID exact match · Bambu PLA Basic #10101."
- Second slot demonstrates a fuzzy match: confidence bar fills to 94%, label "ΔE fuzzy match · PolyTerra Charcoal Black."
- AMS HT single slot below, also confirming a spool.

### Beat 5 — Print + weight deduction (36–46s)
- Print progress bar fills 0 → 100% over the beat.
- Weight counter animates downward per slot: e.g., Slot 1 `982g → 847g`, Slot 3 `1021g → 978g`.
- Small corner ticker: "Per-tray weight · 3MF parsed."
- Subtle AMS drying status pill appears/disappears.

### Beat 6 — Cost analytics chart (46–56s)
- Animated vertical bar chart: "Last 7 prints — filament cost (€)". Bars grow in sequentially using spring animation, values labeled above.
- Cross-fade to a line chart: "€/kg — 90 days." Line path draws left-to-right via SVG `stroke-dasharray` animation.
- Summary tile bottom-right: "Total filament cost: €124.50" with count-up animation.

### Beat 7 — Install CTA (56–60s)
- Logo re-appears center.
- "Add to Home Assistant" badge (the same blue pill as the README).
- GitHub URL beneath in Geist Mono: `github.com/kbarthei/HASpoolManager`.
- Subtle teal glow pulse behind the badge.

---

## Visual System

- **Background:** `#0B0D0E` (near-black, matches app dark mode).
- **Accent:** `#14B8A6` (teal — app brand accent).
- **Secondary text:** `#9CA3AF`.
- **Card surfaces:** `#111315` with 1px border `#1F2328`, radius `1rem` (matches `rounded-2xl`).
- **Typography:** Geist Sans for UI text, Geist Mono for values/code (loaded via `@remotion/google-fonts/Geist` and `GeistMono`).
- **Motion language:**
  - Entries: spring `{ damping: 18, mass: 0.8 }`.
  - Value counters: `interpolate` with ease-out cubic.
  - Chart bars/lines: spring for bars, `stroke-dashoffset` animation for lines.
- **Transitions between beats:** use `@remotion/transitions`:
  - Beat 1 → 2: `slide` (from right).
  - Beat 2 → 3: `slide` (from right).
  - Beat 3 → 4: `fade`.
  - Beat 4 → 5: `wipe`.
  - Beat 5 → 6: `wipe`.
  - Beat 6 → 7: `fade`.

---

## Architecture (Remotion project)

```
src/
├── Root.tsx                        # Registers single composition "HASpoolManagerDemo"
├── index.ts                        # Remotion entrypoint (existing)
├── index.css                       # Tailwind v4 (existing)
├── Demo.tsx                        # Top-level composition, sequences all beats
├── theme.ts                        # Color tokens + font constants
├── components/
│   ├── BrandLogo.tsx               # Wordmark used in beats 1 & 7
│   ├── Card.tsx                    # Shared card surface with rounded-2xl
│   ├── SpoolTile.tsx               # Colored spool tile for rack + AMS
│   ├── ConfidenceBar.tsx           # Animated fill bar with label
│   ├── CountUp.tsx                 # Count-up/down numeric animation
│   ├── BarChart.tsx                # Animated bar chart (beat 6)
│   ├── LineChart.tsx               # Animated SVG line chart (beat 6)
│   └── HomeAssistantBadge.tsx      # Blue "Add to Home Assistant" pill
├── beats/
│   ├── Beat1Hook.tsx
│   ├── Beat2OrderParse.tsx
│   ├── Beat3RackTwin.tsx
│   ├── Beat4AmsMatch.tsx
│   ├── Beat5PrintWeight.tsx
│   ├── Beat6CostAnalytics.tsx
│   └── Beat7InstallCta.tsx
└── data/
    └── mockData.ts                 # Filament rows, print history, € values
public/
└── images/                         # Optional copies of dashboard.png etc. if referenced
```

### Component contracts

- **`Demo.tsx`** — sequences 7 `<Series.Sequence>` children with explicit `durationInFrames`. Each child renders one `BeatN*` component. Between-beat transitions handled via `TransitionSeries` from `@remotion/transitions`.
- **`BeatNXxx.tsx`** — each receives no props; is self-contained; uses `useCurrentFrame()` from its local start (frame 0).
- **`BarChart.tsx`** — props: `data: {label: string; value: number}[]`, `maxValue: number`, `staggerFrames: number`. Renders bars using spring-driven heights.
- **`LineChart.tsx`** — props: `points: {x: number; y: number}[]`, `width: number`, `height: number`, `strokeColor: string`. Animates `strokeDashoffset`.
- **`CountUp.tsx`** — props: `from: number`, `to: number`, `durationInFrames: number`, `format?: (n: number) => string`. Uses `interpolate` with ease-out.
- **`SpoolTile.tsx`** — props: `color: string`, `brand: string`, `material: string`. Visual-only; entry animation driven by parent via `delay` prop.

### Root composition registration

Replace the current `MyComp` registration with:

```tsx
<Composition
  id="HASpoolManagerDemo"
  component={Demo}
  durationInFrames={1800}
  fps={30}
  width={1920}
  height={1080}
/>
```

Keep `fps` at 30 for smaller file size and faster renders; motion is readable at 30fps for this style.

---

## Data

All screen-rendered data lives in `src/data/mockData.ts`. Not generated from HASpoolManager's actual DB — these are realistic but fabricated values so the video is reproducible and reviewable without a live addon.

Examples:
- **Order rows:** 4 items (Bambu PLA Matte Ivory, PolyTerra Charcoal, eSun PETG-HF Black, Bambu Support-for-PLA), with `quantity`, `unitPriceEur`, `shop`.
- **Rack tiles:** 30 colored tiles across a 4×8 grid; 2 overflow cells intentionally empty.
- **AMS matches:** 2 exact (RFID), 1 fuzzy at 94% ΔE, 1 empty at start.
- **Print history bars:** 7 prints, values €1.20–€4.80.
- **€/kg series:** 90 daily points, mildly downward trend from €32/kg to €27/kg with noise.

---

## Error handling & edge cases

- Fonts must be loaded before render — use `@remotion/google-fonts` `loadFont` in `Root.tsx` so Remotion awaits font readiness.
- Pure-component rendering only: no real HASpoolManager screenshots used. This keeps the video self-contained and reproducible. Real-screenshot integration is explicitly a future enhancement, not part of this spec.
- `durationInFrames` mismatches between `Demo.tsx` and registered composition are a common footgun. Single source of truth: a `BEAT_DURATIONS` const array in `Demo.tsx` summed into the composition `durationInFrames` via `calculateMetadata`.

---

## Testing / verification

Per Remotion best practices, verification is visual. Two checks before declaring done:

1. **Studio preview:** `npx remotion studio` → scrub the timeline, confirm each beat renders, transitions trigger cleanly, no missing-asset warnings in console.
2. **Single-frame render (sanity):** `npx remotion still HASpoolManagerDemo --scale=0.25 --frame=150` (sample each beat at a representative frame: 90, 360, 600, 900, 1200, 1500, 1740).
3. **Final render:** `npx remotion render HASpoolManagerDemo out/haspoolmanager-demo.mp4 --codec=h264 --crf=18`.

No automated test suite for the video itself. `npm run lint` (eslint + tsc) must pass.

---

## Out of scope

- Voiceover / narration — readable without sound by design.
- Music track — can be added later via a `<Audio>` tag; beyond this spec.
- Localization — English only.
- Live data from a real HA instance — mock data only.
- Alternate aspect ratios (vertical/square) — landscape 1920×1080 only.
- Automated diff / frame-hash testing — not warranted for this size of project.

---

## Success criteria

- A viewer who has never heard of HASpoolManager can watch once, on mute, and correctly describe: what kind of product it is, one specific concrete feature (AI order parsing, RFID match, or cost analytics), and where to install it.
- The MP4 is ≤ 20 MB so it renders inline in the GitHub README.
- Renders cleanly via `npx remotion render` with no console errors or missing assets.
- Visual style is recognizably aligned with the real HASpoolManager UI (dark bg + teal accent + Geist fonts + rounded cards).
