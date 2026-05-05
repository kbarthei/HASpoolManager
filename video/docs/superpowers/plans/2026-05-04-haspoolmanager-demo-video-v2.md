# HASpoolManager Demo Video v2 — 90s with Real Screenshots, Subtitles, Music & Vertical Variant

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the v1 60s synthesized demo with a **90s** Remotion video that uses **real HASpoolManager screenshots as the primary visual** layered with synthesized animated overlays/highlights, **English burnt-in subtitles**, a **royalty-free music bed**, and **two output formats** (16:9 1920×1080 MP4 for MacBook/README + 9:16 1080×1920 MP4 for social) plus an **animated GIF** version of the 16:9 cut for embedding in the GitHub README.

**Architecture:**
- A single Remotion source — two compositions (`HASpoolManagerDemo` 1920×1080 + `HASpoolManagerDemoVertical` 1080×1920) sharing the same 9 beats with layout-aware components.
- Each beat is an `AbsoluteFill` that composes a real screenshot via `<Img src={staticFile(...)} />` with synthesized overlays (highlights, count-ups, animated charts, callout pills) timed to local frames.
- A central `<Subtitles>` layer reads from `src/data/subtitles.ts` and renders captions burnt-in at a lower-third position in 16:9 and a top-banner position in 9:16.
- A central `<Soundtrack>` wraps `<Audio src={staticFile('music.mp3')} />` with a final fade-out; falls back to silent render if `public/music.mp3` is absent (verified by a CI-friendly file probe).
- Theme tokens (`src/theme.ts`) are a 1:1 export of HASpoolManager's dark Apple-system palette so the synthesized overlays blend with the screenshots.

**Tech Stack:**
Remotion 4.0.448, React 19.2.3, TypeScript 5.9.3, Tailwind v4, `@remotion/transitions` (TransitionSeries with slide/fade/wipe), `@remotion/google-fonts/Geist` + `@remotion/google-fonts/GeistMono`, ffmpeg (already vendored by Remotion's CLI for MP4 render; used directly for GIF).

**Repo:** `/Users/kbarthei/Documents/privat/smartHome/my-video` — work directly on `main`. Per user's earlier approval, no worktree.

**Source screenshots:** `/Users/kbarthei/Library/Mobile Documents/com~apple~CloudDocs/privat/smartHome/HASpoolManager/screenshots/{dark,light}/{desktop,mobile}/*.png` (and `desktop/sections/*.png`). Mirror these into `public/screenshots/...` so Remotion's bundler picks them up via `staticFile()`.

---

## Design contract — 9-beat structure for 90s

90s @ 30fps = **2700 frames effective**. With 8 transitions of 15 frames each (overlap), `BEAT_SUM = 2820`, `TOTAL_DURATION = BEAT_SUM - 8 × 15 = 2700`. Beat allocation:

| # | Beat | Duration (frames / s) | Source PNG | Visual |
|---|---|---|---|---|
| 1 | **Hook** | 180 / 6s | none — synthesized | Brand wordmark fade-in, tagline letter-by-letter ("Every gram tracked, from purchase to print"), HA badge slide-in |
| 2 | **Dashboard** | 300 / 10s | `01-dashboard.png` + `01-dashboard--printer-live.png` | Full dashboard fade-in, then zoom into printer hero. Animated count-ups for monthly spend (€124.50), prints today (3), low-stock alerts (2). Live AMS slot remaining-% bars sweep up. |
| 3 | **Inventory** | 270 / 9s | `02-inventory.png` + `02-inventory--ams-section.png` | Pan from rack grid (32 spool tiles) up to AMS. Highlight ring around 4 randomly-chosen spool tiles. Caption: "30+ spools, every gram in its place." |
| 4 | **Spool Inspector** | 270 / 9s | `04-spool-inspector.png` | Click-into spool detail. Remaining-weight ring animates from 100% down to current 73%. Cost-per-gram €0.02 counts up. Usage history bars draw left-to-right. |
| 5 | **Scan / Match** | 330 / 11s | `09-scan.png` | RFID exact match (100%) appears, then ΔE fuzzy match for non-Bambu spool — confidence bar animates from 0% to 94%. Two-step reveal: "RFID exact" then "CIE Delta-E fuzzy." |
| 6 | **Prints** | 300 / 10s | `05-prints.png` + `06-history.png` | Recent prints list. Cover image fade-in for top print. Cost breakdown reveal: filament €1.84 + energy €0.31 = total €2.15. |
| 7 | **Orders / AI parse** | 390 / 13s | `07-orders.png` | Hero feature. Email paste box appears, plaintext typing in, Claude shimmer animation, then 4 line items animate in one-by-one with vendor + price + quantity extracted. |
| 8 | **Analytics** | 300 / 10s | `08-analytics.png` | Real screenshot fades in dimmed; on top, two re-drawn animated charts (line: price-per-kg over 90 days, bar: monthly spend). Big number "€124.50 in filament tracked" counts up. |
| 9 | **Mobile + Install CTA** | 480 / 16s | `dark/mobile/01-dashboard.png` + `dark/mobile/02-inventory.png` + `dark/mobile/05-prints.png` | Three mobile screenshots in a horizontal carousel (slide each in). Then full-frame fade to "Add repository to my Home Assistant" 41BDF5 badge + GitHub URL + closing brand wordmark. |

**Subtitles** (English, lower-third in 16:9, top banner in 9:16):
1. (no caption — hook is brand only)
2. "Daily cockpit — printer status, spend, prints, alerts."
3. "30+ spools across racks, AMS, workbench. Every gram tracked."
4. "Drill into any spool — weight, cost, history, location."
5. "Bambu RFID exact match. Third-party? CIE Delta-E fuzzy."
6. "Filament + energy = per-print cost, automatically."
7. "Paste an order email. Claude extracts every line item."
8. "Per-gram price history. Per-month spend. All tracked."
9. "Open-source Home Assistant addon. Install in two clicks."

**Music bed:** Bensound's "Slow Motion" (CC-BY) or Pixabay's CC0 "Ambient Cinematic Inspiring" — set in `package.json` as a setup-fetch URL. Falls back gracefully to silence if the download fails (offline-safe).

**Vertical variant** uses the same 9 beats but:
- Lower-third becomes top banner.
- Each beat's screenshot is contained at top (~50% of frame); animated overlays + caption fill the bottom.
- Beat 9 carousel becomes a vertical stack rather than horizontal slide.

---

## Pre-flight

All commands assume the repo root:

```bash
cd "/Users/kbarthei/Documents/privat/smartHome/my-video"
```

Verification convention:
- "tests" = `npm run lint` (TypeScript + ESLint) plus a single-frame still render (`npx remotion still ...`) for the beat just built.
- Full MP4 + GIF renders only at the end (Tasks 16–17).

`docs/superpowers/specs/2026-04-18-haspoolmanager-demo-video-design.md` (v1 spec) is **not** the source of truth here — this plan supersedes it.

**Hard guardrail for subagents:** never touch `.git/`. If git seems corrupted, report BLOCKED and stop. Do not `rm -rf .git` or reinit. (Last project hit this twice — once from iCloud, once from a haiku subagent.)

---

### Task 1: Wipe v1 beats, refresh theme, import screenshots

We keep the v1 infrastructure (package.json, Remotion config, tsconfig, Tailwind, fonts loading) and the shared primitives (`Card`, `BrandLogo`, `SpoolTile`, `ConfidenceBar`, `CountUp`, `BarChart`, `LineChart`, `HomeAssistantBadge`) — but **delete all v1 beats** and rewrite `src/theme.ts` + `src/data/mockData.ts` for the new look + screenshot-driven beats.

**Files:**
- Delete: `src/beats/Beat1Hook.tsx` … `Beat7InstallCta.tsx` (keep folder)
- Delete: `src/Demo.tsx` (rewritten in Task 14)
- Modify: `src/theme.ts`
- Modify: `src/data/mockData.ts`
- Create: `public/screenshots/` tree (mirror of HASpoolManager's `docs/screenshots/`)

- [ ] **Step 1: Delete v1 beat files**

```bash
rm src/beats/Beat1Hook.tsx src/beats/Beat2OrderParse.tsx src/beats/Beat3RackTwin.tsx \
   src/beats/Beat4AmsMatch.tsx src/beats/Beat5PrintWeight.tsx src/beats/Beat6CostAnalytics.tsx \
   src/beats/Beat7InstallCta.tsx src/Demo.tsx
```

Expected: 8 files removed; `src/beats/` is now empty.

- [ ] **Step 2: Rewrite `src/theme.ts` to match real HASpoolManager dark theme**

```ts
// src/theme.ts
export const colors = {
  // Surfaces (Apple system dark)
  bg: "#000000",
  surface: "#1C1C1E",
  surface2: "#2C2C2E",
  surface3: "#3A3A3C",
  border: "#38383A",

  // Brand accent — Apple teal (dark variant)
  accent: "#40C8E0",
  accentSoft: "#40C8E033",
  accentRing: "#40C8E055",

  // Text
  text: "#F5F5F7",
  textMuted: "#8D8D93",
  ink2: "rgba(235, 235, 245, 0.85)",

  // Status
  success: "#30D158",
  warning: "#FF9F0A",
  danger: "#FF453A",

  // Charts — Apple system
  chart1: "#40C8E0",
  chart2: "#0A84FF",
  chart3: "#5E5CE6",
  chart4: "#30D158",
  chart5: "#FF9F0A",

  // Home Assistant
  haBlue: "#41BDF5",
} as const;

export const fonts = {
  sans: '"Geist", "Geist Fallback", system-ui, sans-serif',
  mono: '"Geist Mono", "Geist Mono Fallback", ui-monospace, monospace',
} as const;

export const radii = {
  sm: 8,        // 0.75rem * 0.6
  md: 10,       // 0.75rem * 0.8
  card: 12,     // 0.75rem (lg)
  cardLg: 17,   // 0.75rem * 1.4 (xl)
  card2xl: 22,  // 0.75rem * 1.8
  pill: 999,
} as const;
```

- [ ] **Step 3: Rewrite `src/data/mockData.ts` for screenshot-driven beats**

```ts
// src/data/mockData.ts

export type DashboardStat = {
  label: string;
  value: number;
  format: "currency" | "count";
  unit?: string;
};

export const dashboardStats: DashboardStat[] = [
  { label: "Monthly spend", value: 124.5, format: "currency", unit: "€" },
  { label: "Prints today", value: 3, format: "count" },
  { label: "Low stock alerts", value: 2, format: "count" },
  { label: "Spools tracked", value: 32, format: "count" },
];

export type AmsSlot = {
  id: string;
  color: string;
  brand: string;
  material: string;
  remainingPct: number;
  match: "rfid" | "fuzzy" | "empty";
  confidence: number;
  label: string;
};

export const amsSlots: AmsSlot[] = [
  {
    id: "s1",
    color: "#F4E9D8",
    brand: "BL",
    material: "PLA",
    remainingPct: 73,
    match: "rfid",
    confidence: 100,
    label: "RFID exact · Bambu PLA Basic Ivory",
  },
  {
    id: "s2",
    color: "#1F1F1F",
    brand: "PT",
    material: "PLA",
    remainingPct: 41,
    match: "fuzzy",
    confidence: 94,
    label: "ΔE fuzzy · PolyTerra Charcoal Black",
  },
  {
    id: "s3",
    color: "#40C8E0",
    brand: "BL",
    material: "PETG",
    remainingPct: 88,
    match: "rfid",
    confidence: 100,
    label: "RFID exact · Bambu PETG Mint",
  },
  {
    id: "s4",
    color: "#FF453A",
    brand: "eS",
    material: "PETG",
    remainingPct: 22,
    match: "fuzzy",
    confidence: 89,
    label: "ΔE fuzzy · eSun PETG Red",
  },
];

export type OrderRow = {
  id: string;
  name: string;
  quantity: number;
  unitPriceEur: number;
  shop: string;
  color: string;
};

export const parsedOrderRows: OrderRow[] = [
  { id: "o1", name: "Bambu PLA Matte Ivory",      quantity: 2, unitPriceEur: 21.99, shop: "bambulab.com",  color: "#F4E9D8" },
  { id: "o2", name: "PolyTerra Charcoal Black",   quantity: 3, unitPriceEur: 16.50, shop: "polymaker.com", color: "#1F1F1F" },
  { id: "o3", name: "eSun PETG-HF Black",         quantity: 4, unitPriceEur: 19.00, shop: "esun3d.com",    color: "#0A0A0A" },
  { id: "o4", name: "Bambu Support-for-PLA",      quantity: 1, unitPriceEur: 27.99, shop: "bambulab.com",  color: "#E6E6E6" },
];

// Spool inspector — single spool drill-in
export const inspectorSpool = {
  name: "Bambu PLA Basic Ivory",
  brand: "Bambu Lab",
  material: "PLA",
  color: "#F4E9D8",
  remainingPct: 73,
  remainingGrams: 730,
  startGrams: 1000,
  costPerGramEur: 0.022,
  totalCostEur: 21.99,
  location: "AMS · Slot 1",
  lastUsed: "2 days ago",
};

// Scan beat — fuzzy match candidates for unknown spool
export const scanCandidates = [
  { name: "PolyTerra Charcoal Black", confidence: 94, color: "#1F1F1F", reason: "ΔE 2.3 · PLA · 175g" },
  { name: "Bambu PLA Black",          confidence: 81, color: "#161616", reason: "ΔE 5.1 · PLA · 920g" },
  { name: "eSun PLA+ Black",          confidence: 68, color: "#0F0F0F", reason: "ΔE 8.4 · PLA · 240g" },
];

// Prints beat — last 3 prints with cost breakdown
export type PrintRow = {
  id: string;
  name: string;
  duration: string;
  filamentEur: number;
  energyEur: number;
  totalEur: number;
  status: "completed" | "running";
};

export const recentPrints: PrintRow[] = [
  { id: "p1", name: "Benchy",            duration: "1h 14m", filamentEur: 0.42, energyEur: 0.18, totalEur: 0.60, status: "completed" },
  { id: "p2", name: "Filament guide",    duration: "3h 02m", filamentEur: 1.84, energyEur: 0.31, totalEur: 2.15, status: "completed" },
  { id: "p3", name: "AMS spool holder",  duration: "5h 47m", filamentEur: 3.21, energyEur: 0.58, totalEur: 3.79, status: "running" },
];

// Analytics — 90-day price-per-kg series + 6-month monthly spend
export const pricePerKg90d: number[] = [
  21.5, 21.6, 21.4, 21.7, 22.0, 22.1, 22.3, 22.0, 21.8, 21.5,
  21.4, 21.5, 21.7, 21.9, 22.1, 22.4, 22.7, 22.5, 22.3, 22.0,
  21.8, 21.6, 21.4, 21.3, 21.5, 21.7, 22.0, 22.2, 22.5, 22.7,
  22.9, 22.7, 22.5, 22.2, 21.9, 21.7, 21.5, 21.3, 21.2, 21.4,
  21.6, 21.8, 22.1, 22.3, 22.5, 22.7, 22.9, 23.0, 22.8, 22.5,
  22.3, 22.0, 21.8, 21.6, 21.5, 21.4, 21.6, 21.9, 22.2, 22.5,
  22.8, 23.0, 23.1, 23.0, 22.7, 22.4, 22.1, 21.9, 21.7, 21.6,
  21.8, 22.0, 22.3, 22.5, 22.7, 22.8, 22.9, 23.0, 22.9, 22.7,
  22.5, 22.3, 22.0, 21.8, 21.7, 21.6, 21.7, 21.8, 21.9, 22.0,
];

export const monthlySpend: { label: string; value: number }[] = [
  { label: "Dec", value:  78.4 },
  { label: "Jan", value:  92.1 },
  { label: "Feb", value: 110.5 },
  { label: "Mar", value:  68.0 },
  { label: "Apr", value: 124.5 },
  { label: "May", value:  46.8 },
];

export const totalFilamentCostEur = 124.5;
```

- [ ] **Step 4: Mirror screenshots into `public/screenshots/`**

```bash
mkdir -p public/screenshots/dark/desktop/sections public/screenshots/dark/mobile \
         public/screenshots/light/desktop/sections public/screenshots/light/mobile

ICLOUD_SHOTS="/Users/kbarthei/Library/Mobile Documents/com~apple~CloudDocs/privat/smartHome/HASpoolManager/screenshots"

cp -R "$ICLOUD_SHOTS/dark/desktop/."  public/screenshots/dark/desktop/
cp -R "$ICLOUD_SHOTS/dark/mobile/."   public/screenshots/dark/mobile/
cp -R "$ICLOUD_SHOTS/light/desktop/." public/screenshots/light/desktop/
cp -R "$ICLOUD_SHOTS/light/mobile/."  public/screenshots/light/mobile/

# Drop iCloud sync conflict directories that may have been copied (they have spaces/numbers in names).
find public/screenshots -type d -name "* [0-9]*" -prune -exec rm -rf {} +
find public/screenshots -type f -name "* [0-9]*.png" -delete
```

Verify with `ls public/screenshots/dark/desktop/*.png | wc -l` — expect at least 10 PNGs.

- [ ] **Step 5: Lint + commit**

```bash
npm run lint
git add -A
git commit -m "feat(v2): wipe v1 beats, refresh theme to Apple system, import screenshots"
```

Expected: lint passes (one pre-existing ConfidenceBar advisory warning is OK); commit recorded.

---

### Task 2: Captions infrastructure

**Files:**
- Create: `src/data/subtitles.ts`
- Create: `src/components/Subtitles.tsx`

- [ ] **Step 1: Define subtitle track in `src/data/subtitles.ts`**

```ts
// src/data/subtitles.ts
// Times are in frames at 30fps, RELATIVE to the start of the composition.
// Beat starts (cumulative, NOT accounting for transition overlap because we render
// captions on the absolute timeline, not per-beat sequence):
//   Beat 1 (hook):       0       — no caption
//   Beat 2 (dashboard): 180
//   Beat 3 (inventory): 480
//   Beat 4 (inspector): 750
//   Beat 5 (scan):     1020
//   Beat 6 (prints):   1350
//   Beat 7 (orders):   1650
//   Beat 8 (analytics):2040
//   Beat 9 (cta):      2340
// (Total 2820 raw, 2700 effective with 8x15 transition overlap.)

export type Caption = {
  text: string;
  startFrame: number;
  endFrame: number;
};

export const captions: Caption[] = [
  // Beat 2 — Dashboard
  { startFrame: 200, endFrame: 470,  text: "Daily cockpit — printer status, spend, prints, alerts." },
  // Beat 3 — Inventory
  { startFrame: 500, endFrame: 740,  text: "30+ spools across racks, AMS, workbench. Every gram tracked." },
  // Beat 4 — Inspector
  { startFrame: 770, endFrame: 1010, text: "Drill into any spool — weight, cost, history, location." },
  // Beat 5 — Scan
  { startFrame: 1040, endFrame: 1340, text: "Bambu RFID exact match. Third-party? CIE Delta-E fuzzy." },
  // Beat 6 — Prints
  { startFrame: 1370, endFrame: 1640, text: "Filament + energy = per-print cost, automatically." },
  // Beat 7 — Orders
  { startFrame: 1670, endFrame: 2030, text: "Paste an order email. Claude extracts every line item." },
  // Beat 8 — Analytics
  { startFrame: 2060, endFrame: 2330, text: "Per-gram price history. Per-month spend. All tracked." },
  // Beat 9 — Mobile + CTA
  { startFrame: 2360, endFrame: 2810, text: "Open-source Home Assistant addon. Install in two clicks." },
];
```

- [ ] **Step 2: Write `src/components/Subtitles.tsx`**

```tsx
// src/components/Subtitles.tsx
import React from "react";
import { AbsoluteFill, useCurrentFrame, interpolate } from "remotion";
import { captions, type Caption } from "../data/subtitles";
import { colors, fonts } from "../theme";

type Layout = "lower-third" | "top-banner";

const findActive = (frame: number): Caption | undefined =>
  captions.find((c) => frame >= c.startFrame && frame <= c.endFrame);

export const Subtitles: React.FC<{ layout?: Layout }> = ({ layout = "lower-third" }) => {
  const frame = useCurrentFrame();
  const active = findActive(frame);
  if (!active) return null;

  const fadeFrames = 8;
  const localFrame = frame - active.startFrame;
  const remainingFrames = active.endFrame - frame;
  const opacity = interpolate(
    Math.min(localFrame, remainingFrames),
    [0, fadeFrames],
    [0, 1],
    { extrapolateRight: "clamp" },
  );

  const isVertical = layout === "top-banner";

  return (
    <AbsoluteFill
      style={{
        justifyContent: isVertical ? "flex-start" : "flex-end",
        alignItems: "center",
        paddingTop: isVertical ? 96 : 0,
        paddingBottom: isVertical ? 0 : 88,
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          opacity,
          maxWidth: isVertical ? 920 : 1280,
          padding: "16px 28px",
          borderRadius: 14,
          background: "rgba(0,0,0,0.62)",
          backdropFilter: "blur(8px)",
          border: `1px solid ${colors.border}`,
          color: colors.text,
          fontFamily: fonts.sans,
          fontSize: isVertical ? 36 : 30,
          fontWeight: 500,
          lineHeight: 1.3,
          letterSpacing: -0.2,
          textAlign: "center",
          boxShadow: "0 12px 40px rgba(0,0,0,0.35)",
        }}
      >
        {active.text}
      </div>
    </AbsoluteFill>
  );
};
```

- [ ] **Step 3: Lint + commit**

```bash
npm run lint
git add src/data/subtitles.ts src/components/Subtitles.tsx
git commit -m "feat(v2): add subtitle track + Subtitles overlay component"
```

---

### Task 3: Music infrastructure with offline-safe fallback

**Files:**
- Create: `scripts/fetch-music.sh`
- Create: `src/components/Soundtrack.tsx`
- Modify: `package.json` (add `setup:music` script)
- Modify: `.gitignore` (already ignores `out/` — keep `public/music.mp3` ignored too because it's a fetched asset)

- [ ] **Step 1: Write `scripts/fetch-music.sh`**

We use **Bensound's "Slow Motion"** (CC-BY 3.0). The CC license requires attribution — added to README in Task 18.
Primary URL falls back to silence if unreachable.

```bash
mkdir -p scripts
cat > scripts/fetch-music.sh <<'EOF'
#!/usr/bin/env bash
# Fetch CC-BY 3.0 music bed. Idempotent; safe to re-run.
# Source: https://www.bensound.com/royalty-free-music/track/slow-motion (CC-BY 3.0)
set -uo pipefail

DEST="public/music.mp3"
URL="https://www.bensound.com/bensound-music/bensound-slowmotion.mp3"

if [[ -f "$DEST" ]]; then
  echo "music: $DEST already exists ($(stat -f%z "$DEST" 2>/dev/null || stat -c%s "$DEST") bytes), skipping"
  exit 0
fi

mkdir -p "$(dirname "$DEST")"
echo "music: fetching $URL → $DEST"
if curl -fsSL --max-time 30 "$URL" -o "$DEST.tmp"; then
  mv "$DEST.tmp" "$DEST"
  echo "music: ok ($(stat -f%z "$DEST" 2>/dev/null || stat -c%s "$DEST") bytes)"
else
  rm -f "$DEST.tmp"
  echo "music: download failed — render will be silent (this is fine)"
  exit 0
fi
EOF
chmod +x scripts/fetch-music.sh
```

- [ ] **Step 2: Add `setup:music` script to `package.json`**

In `package.json`, under `"scripts"`, add:

```json
"setup:music": "bash scripts/fetch-music.sh"
```

(Do not remove existing scripts.)

- [ ] **Step 3: Run the fetch (best-effort)**

```bash
npm run setup:music
```

Expected: either `public/music.mp3` exists (~3-5 MB) or a "download failed — render will be silent" message. Either is acceptable.

- [ ] **Step 4: Add `public/music.mp3` to `.gitignore`** (it's a fetched artifact, not source)

Append to `.gitignore`:

```
# Music bed — fetched at setup time via npm run setup:music
public/music.mp3
```

- [ ] **Step 5: Write `src/components/Soundtrack.tsx`**

```tsx
// src/components/Soundtrack.tsx
import React from "react";
import { Audio, staticFile, useVideoConfig, interpolate, useCurrentFrame } from "remotion";

// We probe the existence of music.mp3 at module-load time. If it's missing,
// fetch returns 404 in the Remotion bundler dev fetch; we just render <></>.
// Keeping the component pure-React so Remotion's webpack can analyze it.

const tryStaticUrl = (): string | null => {
  try {
    return staticFile("music.mp3");
  } catch {
    return null;
  }
};

export const Soundtrack: React.FC = () => {
  const { durationInFrames } = useVideoConfig();
  const frame = useCurrentFrame();
  const url = tryStaticUrl();
  if (!url) return null;

  // Fade out over the last 60 frames (2s).
  const fadeOutFrames = 60;
  const volume = interpolate(
    frame,
    [durationInFrames - fadeOutFrames, durationInFrames],
    [0.6, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  return <Audio src={url} volume={volume} />;
};
```

Note: Remotion's `<Audio>` will throw a render-time error if the file is missing. We accept that — if `npm run setup:music` failed, the render task (Task 16) detects the missing file via `[ -f public/music.mp3 ]` and conditionally strips the `<Soundtrack>` mount before render. (The Soundtrack toggle lives in `Root.tsx` — Task 14.)

- [ ] **Step 6: Lint + commit**

```bash
npm run lint
git add scripts/fetch-music.sh src/components/Soundtrack.tsx package.json .gitignore
git commit -m "feat(v2): add music fetch script + Soundtrack component (offline-safe)"
```

---

### Task 4: New shared primitives — `ScreenshotFrame` + `Spotlight`

The hero pattern of every screenshot beat is "render this PNG, then highlight a region with an animated rounded rectangle and an optional callout pill." We extract that into reusable components so each beat stays under ~120 lines.

**Files:**
- Create: `src/components/ScreenshotFrame.tsx`
- Create: `src/components/Spotlight.tsx`
- Create: `src/components/Callout.tsx`

- [ ] **Step 1: Write `src/components/ScreenshotFrame.tsx`**

```tsx
// src/components/ScreenshotFrame.tsx
import React from "react";
import { Img, staticFile, AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";
import { colors } from "../theme";

type Fit = "contain" | "cover" | "top-aligned";

type Props = {
  src: string;                  // path relative to public/, e.g. "screenshots/dark/desktop/01-dashboard.png"
  fit?: Fit;
  scale?: number;               // base scale (1 = fit)
  zoomFromFrame?: number;       // local frame; start a slow Ken-Burns zoom
  zoomTo?: number;              // target scale (e.g. 1.08)
  shadow?: boolean;
};

export const ScreenshotFrame: React.FC<Props> = ({
  src,
  fit = "contain",
  scale = 1,
  zoomFromFrame,
  zoomTo,
  shadow = true,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const fadeIn = spring({ frame, fps, config: { damping: 16, stiffness: 90 }, durationInFrames: 24 });

  let activeScale = scale;
  if (zoomFromFrame !== undefined && zoomTo !== undefined) {
    const t = interpolate(frame, [zoomFromFrame, zoomFromFrame + 90], [0, 1], {
      extrapolateLeft: "clamp", extrapolateRight: "clamp",
    });
    activeScale = scale + (zoomTo - scale) * t;
  }

  const objectFit = fit === "cover" ? "cover" : "contain";
  const objectPosition = fit === "top-aligned" ? "top center" : "center";

  return (
    <AbsoluteFill style={{ background: colors.bg, opacity: fadeIn }}>
      <Img
        src={staticFile(src)}
        style={{
          width: "100%",
          height: "100%",
          objectFit,
          objectPosition,
          transform: `scale(${activeScale})`,
          transformOrigin: "center",
          filter: shadow ? "drop-shadow(0 24px 60px rgba(0,0,0,0.6))" : undefined,
        }}
      />
    </AbsoluteFill>
  );
};
```

- [ ] **Step 2: Write `src/components/Spotlight.tsx`**

A `Spotlight` is an animated highlight ring drawn on top of a screenshot, anchored by **percent coordinates** of the rendered frame so it's resolution-independent.

```tsx
// src/components/Spotlight.tsx
import React from "react";
import { AbsoluteFill, useCurrentFrame, spring, useVideoConfig } from "remotion";
import { colors } from "../theme";

type Props = {
  /** % of frame width (0..100) for the box left edge. */
  xPct: number;
  /** % of frame height (0..100) for the box top edge. */
  yPct: number;
  /** % of frame width for the box width. */
  wPct: number;
  /** % of frame height for the box height. */
  hPct: number;
  /** local frame at which the spotlight starts to appear */
  startFrame: number;
  /** local frame at which the spotlight starts to fade out (optional) */
  endFrame?: number;
  /** ring color, defaults to brand accent */
  color?: string;
  /** corner radius in px */
  radius?: number;
};

export const Spotlight: React.FC<Props> = ({
  xPct, yPct, wPct, hPct,
  startFrame,
  endFrame,
  color = colors.accent,
  radius = 14,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  if (frame < startFrame) return null;

  const localIn = frame - startFrame;
  const grow = spring({ frame: localIn, fps, config: { damping: 14, stiffness: 110 } });
  const fadeOut = endFrame !== undefined && frame > endFrame
    ? Math.max(0, 1 - (frame - endFrame) / 12)
    : 1;
  const opacity = grow * fadeOut;

  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <div
        style={{
          position: "absolute",
          left: `${xPct}%`,
          top: `${yPct}%`,
          width: `${wPct}%`,
          height: `${hPct}%`,
          borderRadius: radius,
          boxShadow: `0 0 0 3px ${color}, 0 0 0 10px ${color}33`,
          opacity,
          transform: `scale(${0.96 + grow * 0.04})`,
          transformOrigin: "center",
        }}
      />
    </AbsoluteFill>
  );
};
```

- [ ] **Step 3: Write `src/components/Callout.tsx`**

A `Callout` is a small rounded pill with a title and value, used for floating overlays ("€124.50", "94% match", etc.).

```tsx
// src/components/Callout.tsx
import React from "react";
import { useCurrentFrame, spring, useVideoConfig, interpolate } from "remotion";
import { colors, fonts, radii } from "../theme";

type Props = {
  xPct: number;
  yPct: number;
  startFrame: number;
  endFrame?: number;
  title?: string;
  value: string;
  accent?: string;
  size?: "sm" | "md" | "lg";
};

export const Callout: React.FC<Props> = ({
  xPct, yPct, startFrame, endFrame,
  title, value,
  accent = colors.accent,
  size = "md",
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  if (frame < startFrame) return null;

  const localIn = frame - startFrame;
  const enter = spring({ frame: localIn, fps, config: { damping: 12, stiffness: 130 } });
  const exit = endFrame !== undefined && frame > endFrame
    ? Math.max(0, 1 - (frame - endFrame) / 10)
    : 1;
  const opacity = enter * exit;

  const fontSizeValue = size === "sm" ? 22 : size === "md" ? 30 : 44;
  const fontSizeTitle = size === "sm" ? 11 : size === "md" ? 13 : 15;

  return (
    <div
      style={{
        position: "absolute",
        left: `${xPct}%`,
        top: `${yPct}%`,
        transform: `translate(-50%, -50%) scale(${0.9 + enter * 0.1})`,
        opacity,
        padding: "12px 18px",
        borderRadius: radii.cardLg,
        background: `linear-gradient(180deg, ${colors.surface} 0%, ${colors.surface2} 100%)`,
        border: `1px solid ${accent}55`,
        boxShadow: `0 12px 30px rgba(0,0,0,0.45), 0 0 0 4px ${accent}22`,
        color: colors.text,
        fontFamily: fonts.sans,
        textAlign: "center",
        minWidth: 140,
      }}
    >
      {title ? (
        <div style={{
          fontSize: fontSizeTitle,
          fontWeight: 500,
          color: colors.textMuted,
          textTransform: "uppercase",
          letterSpacing: 0.6,
          marginBottom: 4,
        }}>
          {title}
        </div>
      ) : null}
      <div style={{
        fontSize: fontSizeValue,
        fontWeight: 700,
        fontFamily: fonts.mono,
        color: accent,
        letterSpacing: -0.5,
      }}>
        {value}
      </div>
    </div>
  );
};
```

- [ ] **Step 4: Lint + commit**

```bash
npm run lint
git add src/components/ScreenshotFrame.tsx src/components/Spotlight.tsx src/components/Callout.tsx
git commit -m "feat(v2): add ScreenshotFrame, Spotlight, Callout primitives"
```

---

### Task 5: Beat 1 — Hook (synthesized brand intro, 180 frames / 6s)

**Files:**
- Create: `src/beats/Beat1Hook.tsx`

- [ ] **Step 1: Write `src/beats/Beat1Hook.tsx`**

```tsx
// src/beats/Beat1Hook.tsx
import React from "react";
import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";
import { colors, fonts } from "../theme";
import { BrandLogo } from "../components/BrandLogo";
import { HomeAssistantBadge } from "../components/HomeAssistantBadge";

export const Beat1Hook: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const logoSpring = spring({ frame: frame - 6, fps, config: { damping: 16, stiffness: 110 } });
  const logoOpacity = interpolate(frame, [0, 24], [0, 1], { extrapolateRight: "clamp" });

  // Tagline letter-by-letter
  const tagline = "Every gram tracked, from purchase to print.";
  const taglineStartFrame = 36;
  const charsPerFrame = 0.7;
  const taglineCharsShown = Math.max(0, Math.floor((frame - taglineStartFrame) * charsPerFrame));
  const visibleTagline = tagline.slice(0, taglineCharsShown);

  // HA badge slide-in
  const badgeStartFrame = 120;
  const badgeProgress = spring({
    frame: frame - badgeStartFrame, fps,
    config: { damping: 14, stiffness: 110 },
  });
  const badgeOpacity = interpolate(frame, [badgeStartFrame, badgeStartFrame + 20], [0, 1], {
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(circle at 50% 35%, ${colors.surface} 0%, ${colors.bg} 60%)`,
        justifyContent: "center",
        alignItems: "center",
        gap: 40,
        fontFamily: fonts.sans,
      }}
    >
      <div style={{
        opacity: logoOpacity,
        transform: `scale(${0.85 + logoSpring * 0.15})`,
      }}>
        <BrandLogo size={130} />
      </div>

      <div style={{
        fontSize: 44,
        color: colors.text,
        fontWeight: 500,
        letterSpacing: -0.5,
        minHeight: 60,
        textAlign: "center",
        maxWidth: 1200,
      }}>
        {visibleTagline}
        <span style={{
          opacity: taglineCharsShown < tagline.length ? 1 : 0,
          color: colors.accent,
        }}>▍</span>
      </div>

      <div style={{
        opacity: badgeOpacity,
        transform: `translateY(${(1 - badgeProgress) * 16}px)`,
      }}>
        <HomeAssistantBadge label="Home Assistant addon" />
      </div>
    </AbsoluteFill>
  );
};
```

- [ ] **Step 2: Still-render verification at frame 90**

```bash
npx remotion still src/index.ts HASpoolManagerDemo out/still-beat1.png --frame=90 || true
```

(Will fail with "composition not found" until Task 14 wires Root.tsx — that's OK for now. We rely on `npm run lint` passing.)

```bash
npm run lint
```

- [ ] **Step 3: Commit**

```bash
git add src/beats/Beat1Hook.tsx
git commit -m "feat(v2): Beat 1 — Hook (brand wordmark + tagline + HA badge)"
```

---

### Task 6: Beat 2 — Dashboard (300 frames / 10s)

**Files:**
- Create: `src/beats/Beat2Dashboard.tsx`

- [ ] **Step 1: Write `src/beats/Beat2Dashboard.tsx`**

```tsx
// src/beats/Beat2Dashboard.tsx
import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { ScreenshotFrame } from "../components/ScreenshotFrame";
import { Spotlight } from "../components/Spotlight";
import { Callout } from "../components/Callout";
import { dashboardStats } from "../data/mockData";
import { CountUp } from "../components/CountUp";

export const Beat2Dashboard: React.FC = () => {
  const frame = useCurrentFrame();

  // The dashboard PNG is full-page (2880x2236). We show it top-aligned and let
  // ScreenshotFrame handle the contain. Then we Ken-Burns zoom into the
  // printer hero in the upper-third of the frame.
  return (
    <AbsoluteFill>
      <ScreenshotFrame
        src="screenshots/dark/desktop/01-dashboard.png"
        fit="top-aligned"
        scale={1}
        zoomFromFrame={140}
        zoomTo={1.18}
      />

      {/* Spotlight on the printer hero (top of dashboard) */}
      <Spotlight
        xPct={6} yPct={4} wPct={62} hPct={22}
        startFrame={70}
        endFrame={170}
      />

      {/* Stat callouts */}
      <Callout
        xPct={78} yPct={18} startFrame={50} endFrame={290}
        title="Monthly spend"
        value={frame >= 50 ? `€${interpolateValue(frame, 50, 50 + 40, 0, dashboardStats[0].value).toFixed(2)}` : "€0.00"}
      />
      <Callout
        xPct={78} yPct={36} startFrame={80} endFrame={290}
        title="Prints today"
        value={frame >= 80 ? `${Math.round(interpolateValue(frame, 80, 80 + 30, 0, dashboardStats[1].value))}` : "0"}
        accent="#0A84FF"
      />
      <Callout
        xPct={78} yPct={54} startFrame={110} endFrame={290}
        title="Low stock"
        value={frame >= 110 ? `${Math.round(interpolateValue(frame, 110, 110 + 30, 0, dashboardStats[2].value))}` : "0"}
        accent="#FF9F0A"
      />
      <Callout
        xPct={78} yPct={72} startFrame={140} endFrame={290}
        title="Spools tracked"
        value={frame >= 140 ? `${Math.round(interpolateValue(frame, 140, 140 + 30, 0, dashboardStats[3].value))}` : "0"}
        accent="#30D158"
      />
    </AbsoluteFill>
  );
};

function interpolateValue(frame: number, start: number, end: number, fromValue: number, toValue: number): number {
  if (frame <= start) return fromValue;
  if (frame >= end) return toValue;
  const t = (frame - start) / (end - start);
  // ease-out cubic
  const eased = 1 - Math.pow(1 - t, 3);
  return fromValue + (toValue - fromValue) * eased;
}
```

Note: we inline the easing to keep the beat self-contained. The existing `CountUp` component is imported but not used here — beats may use either; this beat uses the inline form because the Callout already wraps the value.

- [ ] **Step 2: Lint + commit**

```bash
npm run lint
git add src/beats/Beat2Dashboard.tsx
git commit -m "feat(v2): Beat 2 — Dashboard (screenshot + printer hero spotlight + stat callouts)"
```

---

### Task 7: Beat 3 — Inventory (270 frames / 9s)

**Files:**
- Create: `src/beats/Beat3Inventory.tsx`

- [ ] **Step 1: Write `src/beats/Beat3Inventory.tsx`**

```tsx
// src/beats/Beat3Inventory.tsx
import React from "react";
import { AbsoluteFill, useCurrentFrame, interpolate } from "remotion";
import { ScreenshotFrame } from "../components/ScreenshotFrame";
import { Spotlight } from "../components/Spotlight";
import { Callout } from "../components/Callout";

// Inventory PNG: AMS section on top, rack grid below, workbench + surplus
// further down. We pan from the rack grid (mid frame) up to the AMS section.
export const Beat3Inventory: React.FC = () => {
  const frame = useCurrentFrame();

  // Pan from y=-12% (rack visible) to y=0% (AMS at top) over frames 30..180.
  const panY = interpolate(frame, [30, 180], [-12, 0], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill>
      <div style={{
        position: "absolute",
        inset: 0,
        transform: `translateY(${panY}%)`,
      }}>
        <ScreenshotFrame
          src="screenshots/dark/desktop/02-inventory.png"
          fit="top-aligned"
          shadow={false}
        />
      </div>

      {/* Spotlight 4 random rack tiles during the pan */}
      <Spotlight xPct={9}  yPct={42} wPct={5.5} hPct={9} startFrame={60}  endFrame={150} />
      <Spotlight xPct={22} yPct={42} wPct={5.5} hPct={9} startFrame={75}  endFrame={150} />
      <Spotlight xPct={35} yPct={42} wPct={5.5} hPct={9} startFrame={90}  endFrame={150} />
      <Spotlight xPct={48} yPct={42} wPct={5.5} hPct={9} startFrame={105} endFrame={150} />

      {/* Spotlight on AMS row after pan completes */}
      <Spotlight xPct={6} yPct={4} wPct={56} hPct={20} startFrame={180} endFrame={260} />

      <Callout
        xPct={84} yPct={50}
        startFrame={120} endFrame={260}
        title="Spools tracked"
        value="32"
      />
    </AbsoluteFill>
  );
};
```

- [ ] **Step 2: Lint + commit**

```bash
npm run lint
git add src/beats/Beat3Inventory.tsx
git commit -m "feat(v2): Beat 3 — Inventory (rack pan up to AMS spotlight)"
```

---

### Task 8: Beat 4 — Spool Inspector (270 frames / 9s)

**Files:**
- Create: `src/beats/Beat4Inspector.tsx`

- [ ] **Step 1: Write `src/beats/Beat4Inspector.tsx`**

```tsx
// src/beats/Beat4Inspector.tsx
import React from "react";
import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";
import { ScreenshotFrame } from "../components/ScreenshotFrame";
import { Callout } from "../components/Callout";
import { Spotlight } from "../components/Spotlight";
import { inspectorSpool } from "../data/mockData";
import { colors, fonts } from "../theme";

export const Beat4Inspector: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Animate the remaining-% ring from 0..73 over frames 40..160.
  const ringPct = interpolate(frame, [40, 160], [0, inspectorSpool.remainingPct], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
  });

  // Fade-in for the ring overlay
  const ringOpacity = interpolate(frame, [30, 60], [0, 1], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill>
      <ScreenshotFrame
        src="screenshots/dark/desktop/04-spool-inspector.png"
        fit="top-aligned"
        zoomFromFrame={0}
        zoomTo={1.05}
      />

      {/* Animated remaining-% ring overlay (positioned over the spool's color dot) */}
      <div style={{
        position: "absolute",
        left: "9%",
        top: "10%",
        width: "16%",
        aspectRatio: "1 / 1",
        opacity: ringOpacity,
      }}>
        <RemainingRing pct={ringPct} />
      </div>

      <Callout
        xPct={75} yPct={20}
        startFrame={70} endFrame={260}
        title="Remaining"
        value={`${Math.round(ringPct)}%`}
      />
      <Callout
        xPct={75} yPct={38}
        startFrame={100} endFrame={260}
        title="Cost / gram"
        value={`€${interpolate(frame, [100, 140], [0, inspectorSpool.costPerGramEur], {
          extrapolateLeft: "clamp", extrapolateRight: "clamp",
        }).toFixed(3)}`}
        accent="#5E5CE6"
      />
      <Callout
        xPct={75} yPct={56}
        startFrame={130} endFrame={260}
        title="Location"
        value="AMS · 1"
        accent="#30D158"
      />

      {/* Spotlight on usage-history bars area (lower right of the screenshot) */}
      <Spotlight
        xPct={28} yPct={62} wPct={42} hPct={22}
        startFrame={160} endFrame={260}
      />
    </AbsoluteFill>
  );
};

const RemainingRing: React.FC<{ pct: number }> = ({ pct }) => {
  const r = 90;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - pct / 100);
  return (
    <svg viewBox="0 0 200 200" style={{ width: "100%", height: "100%" }}>
      <circle cx="100" cy="100" r={r} fill="none" stroke={colors.surface2} strokeWidth="14" />
      <circle
        cx="100" cy="100" r={r}
        fill="none"
        stroke={colors.accent}
        strokeWidth="14"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={offset}
        transform="rotate(-90 100 100)"
      />
      <text
        x="100" y="112"
        textAnchor="middle"
        fontFamily={fonts.mono}
        fontSize="44"
        fontWeight="700"
        fill={colors.text}
      >
        {Math.round(pct)}%
      </text>
    </svg>
  );
};
```

- [ ] **Step 2: Lint + commit**

```bash
npm run lint
git add src/beats/Beat4Inspector.tsx
git commit -m "feat(v2): Beat 4 — Spool Inspector (animated remaining ring + cost callouts)"
```

---

### Task 9: Beat 5 — Scan / Match (330 frames / 11s)

This is the spool-matching showcase. Two-step reveal: RFID exact match (100%) → ΔE fuzzy match (94%).

**Files:**
- Create: `src/beats/Beat5Scan.tsx`

- [ ] **Step 1: Write `src/beats/Beat5Scan.tsx`**

```tsx
// src/beats/Beat5Scan.tsx
import React from "react";
import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";
import { ScreenshotFrame } from "../components/ScreenshotFrame";
import { Callout } from "../components/Callout";
import { Spotlight } from "../components/Spotlight";
import { ConfidenceBar } from "../components/ConfidenceBar";
import { colors, fonts, radii } from "../theme";
import { scanCandidates } from "../data/mockData";

export const Beat5Scan: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Phase 1 (0..130): RFID exact match panel
  // Phase 2 (140..330): ΔE fuzzy match panel

  const phase1Opacity = interpolate(frame, [10, 40], [0, 1], { extrapolateRight: "clamp" });
  const phase1FadeOut = interpolate(frame, [130, 160], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const phase1Visible = phase1Opacity * phase1FadeOut;

  const phase2Opacity = interpolate(frame, [150, 180], [0, 1], { extrapolateRight: "clamp" });

  // Phase 2 fuzzy match confidence animates 0..94 over frames 200..280
  const fuzzyConfidence = interpolate(frame, [200, 280], [0, 94], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill>
      <ScreenshotFrame
        src="screenshots/dark/desktop/09-scan.png"
        fit="top-aligned"
        scale={0.95}
      />

      {/* Phase 1 — RFID exact */}
      <div style={{
        position: "absolute",
        left: "50%",
        top: "30%",
        transform: "translate(-50%, 0)",
        opacity: phase1Visible,
        padding: "28px 40px",
        background: colors.surface,
        border: `2px solid ${colors.success}`,
        borderRadius: radii.cardLg,
        boxShadow: `0 24px 60px rgba(0,0,0,0.5), 0 0 0 6px ${colors.success}33`,
        color: colors.text,
        fontFamily: fonts.sans,
        textAlign: "center",
        minWidth: 540,
      }}>
        <div style={{
          fontSize: 14, fontWeight: 600, color: colors.success,
          textTransform: "uppercase", letterSpacing: 1, marginBottom: 12,
        }}>
          ✓ RFID Exact Match
        </div>
        <div style={{ fontSize: 32, fontWeight: 600, marginBottom: 8 }}>
          Bambu PLA Basic Ivory
        </div>
        <div style={{ fontSize: 18, color: colors.textMuted, fontFamily: fonts.mono }}>
          Tag #10101 · 730g remaining
        </div>
        <div style={{
          marginTop: 16, fontSize: 60, fontWeight: 800, color: colors.success,
          fontFamily: fonts.mono, letterSpacing: -2,
        }}>
          100%
        </div>
      </div>

      {/* Phase 2 — ΔE fuzzy */}
      <div style={{
        position: "absolute",
        left: "50%",
        top: "22%",
        transform: "translate(-50%, 0)",
        opacity: phase2Opacity,
        padding: "28px 40px",
        background: colors.surface,
        border: `2px solid ${colors.accent}`,
        borderRadius: radii.cardLg,
        boxShadow: `0 24px 60px rgba(0,0,0,0.5), 0 0 0 6px ${colors.accent}33`,
        color: colors.text,
        fontFamily: fonts.sans,
        minWidth: 600,
      }}>
        <div style={{
          fontSize: 14, fontWeight: 600, color: colors.accent,
          textTransform: "uppercase", letterSpacing: 1, marginBottom: 12,
          textAlign: "center",
        }}>
          ⚙ CIE Delta-E Fuzzy Match
        </div>

        {scanCandidates.map((cand, i) => {
          const showAt = 220 + i * 25;
          const opacity = interpolate(frame, [showAt, showAt + 12], [0, 1], { extrapolateRight: "clamp" });
          const isPrimary = i === 0;
          return (
            <div
              key={cand.name}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 14,
                marginTop: 12,
                opacity,
                padding: "10px 14px",
                borderRadius: radii.md,
                background: isPrimary ? colors.surface2 : "transparent",
                border: isPrimary ? `1px solid ${colors.accent}` : `1px solid ${colors.border}`,
              }}
            >
              <div style={{
                width: 28, height: 28, borderRadius: 6,
                background: cand.color,
                border: `1px solid ${colors.border}`,
              }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 18, fontWeight: 600 }}>{cand.name}</div>
                <div style={{ fontSize: 12, color: colors.textMuted, fontFamily: fonts.mono }}>
                  {cand.reason}
                </div>
              </div>
              <div style={{ width: 180 }}>
                <ConfidenceBar
                  pct={isPrimary ? fuzzyConfidence : cand.confidence}
                  color={isPrimary ? colors.accent : colors.textMuted}
                />
              </div>
              <div style={{
                width: 60,
                textAlign: "right",
                fontFamily: fonts.mono, fontWeight: 700, fontSize: 22,
                color: isPrimary ? colors.accent : colors.textMuted,
              }}>
                {Math.round(isPrimary ? fuzzyConfidence : cand.confidence)}%
              </div>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
```

- [ ] **Step 2: Lint + commit**

```bash
npm run lint
git add src/beats/Beat5Scan.tsx
git commit -m "feat(v2): Beat 5 — Scan (two-phase RFID exact → CIE Delta-E fuzzy)"
```

---

### Task 10: Beat 6 — Prints (300 frames / 10s)

**Files:**
- Create: `src/beats/Beat6Prints.tsx`

- [ ] **Step 1: Write `src/beats/Beat6Prints.tsx`**

```tsx
// src/beats/Beat6Prints.tsx
import React from "react";
import { AbsoluteFill, useCurrentFrame, interpolate } from "remotion";
import { ScreenshotFrame } from "../components/ScreenshotFrame";
import { Callout } from "../components/Callout";
import { Spotlight } from "../components/Spotlight";
import { recentPrints } from "../data/mockData";
import { colors, fonts, radii } from "../theme";

export const Beat6Prints: React.FC = () => {
  const frame = useCurrentFrame();

  // Cost breakdown reveal: filament + energy = total
  const filamentReveal = interpolate(frame, [120, 160], [0, 1], { extrapolateRight: "clamp" });
  const energyReveal = interpolate(frame, [160, 200], [0, 1], { extrapolateRight: "clamp" });
  const totalReveal = interpolate(frame, [200, 240], [0, 1], { extrapolateRight: "clamp" });

  const print = recentPrints[1]; // "Filament guide", €1.84 + €0.31 = €2.15

  return (
    <AbsoluteFill>
      <ScreenshotFrame
        src="screenshots/dark/desktop/05-prints.png"
        fit="top-aligned"
        scale={0.96}
      />

      {/* Spotlight on the top print card */}
      <Spotlight
        xPct={6} yPct={14} wPct={50} hPct={12}
        startFrame={40} endFrame={120}
      />

      {/* Cost breakdown card — animated reveal */}
      <div style={{
        position: "absolute",
        right: "5%",
        top: "30%",
        width: 420,
        padding: "24px 28px",
        background: colors.surface,
        border: `1px solid ${colors.border}`,
        borderRadius: radii.cardLg,
        boxShadow: "0 24px 60px rgba(0,0,0,0.5)",
        fontFamily: fonts.sans,
        color: colors.text,
      }}>
        <div style={{
          fontSize: 13, fontWeight: 600, color: colors.textMuted,
          textTransform: "uppercase", letterSpacing: 1, marginBottom: 16,
        }}>
          Cost breakdown — {print.name}
        </div>

        <CostRow
          label="Filament" value={print.filamentEur}
          accent={colors.accent} reveal={filamentReveal}
        />
        <CostRow
          label="Energy"   value={print.energyEur}
          accent="#FF9F0A" reveal={energyReveal}
        />

        <div style={{
          height: 1, background: colors.border, margin: "16px 0",
        }} />

        <CostRow
          label="Total" value={print.totalEur}
          accent={colors.text} reveal={totalReveal}
          large
        />
      </div>
    </AbsoluteFill>
  );
};

const CostRow: React.FC<{
  label: string; value: number; accent: string; reveal: number; large?: boolean;
}> = ({ label, value, accent, reveal, large }) => {
  const shown = (value * reveal).toFixed(2);
  return (
    <div style={{
      display: "flex",
      justifyContent: "space-between",
      alignItems: "baseline",
      marginBottom: 10,
      opacity: 0.3 + 0.7 * reveal,
    }}>
      <div style={{
        fontSize: large ? 22 : 18,
        fontWeight: large ? 700 : 500,
        color: large ? colors.text : colors.textMuted,
      }}>
        {label}
      </div>
      <div style={{
        fontSize: large ? 32 : 22,
        fontWeight: 700,
        fontFamily: fonts.mono,
        color: accent,
        letterSpacing: -0.5,
      }}>
        €{shown}
      </div>
    </div>
  );
};
```

- [ ] **Step 2: Lint + commit**

```bash
npm run lint
git add src/beats/Beat6Prints.tsx
git commit -m "feat(v2): Beat 6 — Prints (recent prints + cost breakdown reveal)"
```

---

### Task 11: Beat 7 — Orders / AI parsing (390 frames / 13s)

The killer feature. Email paste → Claude shimmer → 4 line items animate in.

**Files:**
- Create: `src/beats/Beat7Orders.tsx`

- [ ] **Step 1: Write `src/beats/Beat7Orders.tsx`**

```tsx
// src/beats/Beat7Orders.tsx
import React from "react";
import { AbsoluteFill, useCurrentFrame, interpolate } from "remotion";
import { ScreenshotFrame } from "../components/ScreenshotFrame";
import { parsedOrderRows } from "../data/mockData";
import { colors, fonts, radii } from "../theme";

const MOCK_EMAIL = `Subject: Order #28341 confirmed
From: shop@bambulab.com

Thank you for your order.

— 2 × Bambu PLA Matte Ivory      @ €21.99
— 3 × PolyTerra Charcoal Black   @ €16.50
— 4 × eSun PETG-HF Black         @ €19.00
— 1 × Bambu Support-for-PLA      @ €27.99

Subtotal: €198.46
Shipping: €4.99
TOTAL:    €203.45`;

export const Beat7Orders: React.FC = () => {
  const frame = useCurrentFrame();

  // Email types in over frames 20..120
  const emailCharsPerFrame = MOCK_EMAIL.length / 100;
  const emailChars = Math.max(0, Math.floor((frame - 20) * emailCharsPerFrame));
  const emailText = MOCK_EMAIL.slice(0, emailChars);

  // Claude shimmer 130..200
  const shimmerOpacity = interpolate(frame, [125, 145], [0, 1], { extrapolateRight: "clamp" })
    * interpolate(frame, [195, 215], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const shimmerSweep = interpolate(frame, [125, 215], [-30, 130]);

  // Line items appear one by one starting at frame 220, 30 frames apart
  const itemRevealAt = (i: number) => 220 + i * 30;

  return (
    <AbsoluteFill>
      <ScreenshotFrame
        src="screenshots/dark/desktop/07-orders.png"
        fit="top-aligned"
        scale={0.92}
      />

      {/* Floating email-paste card — left side */}
      <div style={{
        position: "absolute",
        left: "5%",
        top: "20%",
        width: "38%",
        height: "60%",
        background: colors.surface,
        border: `1px solid ${colors.border}`,
        borderRadius: radii.cardLg,
        boxShadow: "0 24px 60px rgba(0,0,0,0.5)",
        padding: "20px 24px",
        fontFamily: fonts.mono,
        fontSize: 14,
        color: colors.text,
        whiteSpace: "pre-wrap",
        overflow: "hidden",
      }}>
        <div style={{
          fontSize: 11, fontFamily: fonts.sans, fontWeight: 600,
          color: colors.textMuted, textTransform: "uppercase", letterSpacing: 1,
          marginBottom: 12,
        }}>
          Paste email
        </div>
        <div style={{ lineHeight: 1.6 }}>
          {emailText}
          {emailChars < MOCK_EMAIL.length && (
            <span style={{ color: colors.accent }}>▍</span>
          )}
        </div>

        {/* Shimmer overlay during Claude parse */}
        {shimmerOpacity > 0 && (
          <div style={{
            position: "absolute",
            inset: 0,
            background: `linear-gradient(110deg,
              transparent 0%,
              transparent ${shimmerSweep - 20}%,
              ${colors.accent}33 ${shimmerSweep}%,
              transparent ${shimmerSweep + 20}%,
              transparent 100%)`,
            opacity: shimmerOpacity,
            pointerEvents: "none",
          }} />
        )}
      </div>

      {/* Arrow + "Claude" label */}
      <div style={{
        position: "absolute",
        left: "44%", top: "44%",
        opacity: interpolate(frame, [140, 170], [0, 1], { extrapolateRight: "clamp" }),
        fontFamily: fonts.sans,
        color: colors.accent,
        fontSize: 18, fontWeight: 600,
        textAlign: "center",
      }}>
        <div style={{ fontSize: 36, marginBottom: 6 }}>→</div>
        <div>Claude parses</div>
      </div>

      {/* Parsed rows — right side */}
      <div style={{
        position: "absolute",
        left: "52%",
        top: "20%",
        width: "42%",
        background: colors.surface,
        border: `1px solid ${colors.border}`,
        borderRadius: radii.cardLg,
        boxShadow: "0 24px 60px rgba(0,0,0,0.5)",
        padding: "20px 24px",
        fontFamily: fonts.sans,
        color: colors.text,
        opacity: interpolate(frame, [200, 230], [0, 1], { extrapolateRight: "clamp" }),
      }}>
        <div style={{
          fontSize: 11, fontWeight: 600, color: colors.textMuted,
          textTransform: "uppercase", letterSpacing: 1, marginBottom: 16,
        }}>
          Parsed line items
        </div>

        {parsedOrderRows.map((row, i) => {
          const opacity = interpolate(frame, [itemRevealAt(i), itemRevealAt(i) + 18], [0, 1], {
            extrapolateRight: "clamp",
          });
          const slideX = interpolate(frame, [itemRevealAt(i), itemRevealAt(i) + 18], [12, 0], {
            extrapolateLeft: "clamp", extrapolateRight: "clamp",
          });
          return (
            <div
              key={row.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "10px 0",
                borderBottom: i < parsedOrderRows.length - 1 ? `1px solid ${colors.border}` : "none",
                opacity,
                transform: `translateX(${slideX}px)`,
              }}
            >
              <div style={{
                width: 26, height: 26, borderRadius: 6,
                background: row.color,
                border: `1px solid ${colors.border}`,
              }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 16, fontWeight: 600 }}>{row.name}</div>
                <div style={{ fontSize: 12, color: colors.textMuted, fontFamily: fonts.mono }}>
                  {row.shop} · ×{row.quantity}
                </div>
              </div>
              <div style={{
                fontFamily: fonts.mono, fontWeight: 700, fontSize: 18,
                color: colors.accent,
              }}>
                €{(row.unitPriceEur * row.quantity).toFixed(2)}
              </div>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
```

- [ ] **Step 2: Lint + commit**

```bash
npm run lint
git add src/beats/Beat7Orders.tsx
git commit -m "feat(v2): Beat 7 — Orders (email paste → Claude shimmer → parsed line items)"
```

---

### Task 12: Beat 8 — Analytics (300 frames / 10s)

**Files:**
- Create: `src/beats/Beat8Analytics.tsx`

- [ ] **Step 1: Write `src/beats/Beat8Analytics.tsx`**

```tsx
// src/beats/Beat8Analytics.tsx
import React from "react";
import { AbsoluteFill, useCurrentFrame, interpolate } from "remotion";
import { ScreenshotFrame } from "../components/ScreenshotFrame";
import { LineChart } from "../components/LineChart";
import { BarChart } from "../components/BarChart";
import { pricePerKg90d, monthlySpend, totalFilamentCostEur } from "../data/mockData";
import { colors, fonts, radii } from "../theme";

export const Beat8Analytics: React.FC = () => {
  const frame = useCurrentFrame();

  const big = interpolate(frame, [40, 130], [0, totalFilamentCostEur], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
  });

  const dim = interpolate(frame, [0, 30], [0, 0.45], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill>
      <div style={{ position: "absolute", inset: 0, opacity: 1 }}>
        <ScreenshotFrame
          src="screenshots/dark/desktop/08-analytics.png"
          fit="top-aligned"
          shadow={false}
        />
      </div>
      {/* Dim overlay so re-drawn charts pop */}
      <div style={{
        position: "absolute", inset: 0,
        background: "#000",
        opacity: dim,
      }} />

      {/* Big number — top center */}
      <div style={{
        position: "absolute",
        left: "50%", top: "10%",
        transform: "translate(-50%, 0)",
        textAlign: "center",
        fontFamily: fonts.sans,
        opacity: interpolate(frame, [30, 60], [0, 1], { extrapolateRight: "clamp" }),
      }}>
        <div style={{
          fontSize: 14, fontWeight: 600, color: colors.textMuted,
          textTransform: "uppercase", letterSpacing: 1.5,
        }}>
          Filament tracked
        </div>
        <div style={{
          fontSize: 110, fontWeight: 800, fontFamily: fonts.mono,
          color: colors.accent, letterSpacing: -3, marginTop: 6,
        }}>
          €{big.toFixed(2)}
        </div>
      </div>

      {/* Line chart — price-per-kg, left bottom */}
      <div style={{
        position: "absolute",
        left: "5%", top: "44%",
        width: "42%", height: "44%",
        padding: "20px 24px",
        background: colors.surface,
        border: `1px solid ${colors.border}`,
        borderRadius: radii.cardLg,
        opacity: interpolate(frame, [80, 120], [0, 1], { extrapolateRight: "clamp" }),
        boxShadow: "0 24px 60px rgba(0,0,0,0.5)",
      }}>
        <div style={{
          fontSize: 13, fontWeight: 600, color: colors.textMuted,
          textTransform: "uppercase", letterSpacing: 1, marginBottom: 12,
          fontFamily: fonts.sans,
        }}>
          €/kg — last 90 days
        </div>
        <LineChart
          data={pricePerKg90d}
          color={colors.accent}
          startFrame={100}
          width={680}
          height={260}
        />
      </div>

      {/* Bar chart — monthly spend, right bottom */}
      <div style={{
        position: "absolute",
        left: "53%", top: "44%",
        width: "42%", height: "44%",
        padding: "20px 24px",
        background: colors.surface,
        border: `1px solid ${colors.border}`,
        borderRadius: radii.cardLg,
        opacity: interpolate(frame, [110, 150], [0, 1], { extrapolateRight: "clamp" }),
        boxShadow: "0 24px 60px rgba(0,0,0,0.5)",
      }}>
        <div style={{
          fontSize: 13, fontWeight: 600, color: colors.textMuted,
          textTransform: "uppercase", letterSpacing: 1, marginBottom: 12,
          fontFamily: fonts.sans,
        }}>
          Monthly spend
        </div>
        <BarChart
          data={monthlySpend}
          color="#0A84FF"
          startFrame={130}
          width={680}
          height={260}
        />
      </div>
    </AbsoluteFill>
  );
};
```

- [ ] **Step 2: Verify `LineChart` and `BarChart` accept these props**

The v1 components live at `src/components/LineChart.tsx` and `src/components/BarChart.tsx`. If their existing props don't match (`data`, `color`, `startFrame`, `width`, `height`), open them and confirm; if interface differs, ADAPT this beat to match the actual interface — do NOT modify the chart components from the v1 plan, they're shared.

If the v1 charts use a different prop shape (e.g. different data type), wrap by computing the correct prop shape inline:

```tsx
// Example adaptation if BarChart expects { label, value }[] (which mockData uses):
<BarChart data={monthlySpend} ... />  // already matches
```

If LineChart expects `data: { label: string; value: number }[]` instead of `number[]`, transform inline:

```tsx
<LineChart data={pricePerKg90d.map((v, i) => ({ label: String(i), value: v }))} ... />
```

- [ ] **Step 3: Lint + commit**

```bash
npm run lint
git add src/beats/Beat8Analytics.tsx
git commit -m "feat(v2): Beat 8 — Analytics (big number + animated line + bar charts)"
```

---

### Task 13: Beat 9 — Mobile + Install CTA (480 frames / 16s)

The closing beat. Three mobile screenshots slide in horizontally, then full-frame transition to the install CTA.

**Files:**
- Create: `src/beats/Beat9MobileCta.tsx`

- [ ] **Step 1: Write `src/beats/Beat9MobileCta.tsx`**

```tsx
// src/beats/Beat9MobileCta.tsx
import React from "react";
import { AbsoluteFill, Img, staticFile, useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";
import { BrandLogo } from "../components/BrandLogo";
import { HomeAssistantBadge } from "../components/HomeAssistantBadge";
import { colors, fonts, radii } from "../theme";

const MOBILE_SHOTS = [
  "screenshots/dark/mobile/01-dashboard.png",
  "screenshots/dark/mobile/02-inventory.png",
  "screenshots/dark/mobile/05-prints.png",
];

export const Beat9MobileCta: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const isVertical = height > width;

  // Carousel phase: frames 0..280
  // CTA phase: frames 280..480

  // Each phone tilts in from below with a stagger
  const phones = MOBILE_SHOTS.map((src, i) => {
    const start = 20 + i * 25;
    const enter = spring({
      frame: frame - start, fps,
      config: { damping: 14, stiffness: 100 },
    });
    return { src, enter, start };
  });

  // Carousel fades out
  const carouselFadeOut = interpolate(frame, [260, 300], [1, 0], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
  });

  // CTA fades in
  const ctaOpacity = interpolate(frame, [280, 320], [0, 1], { extrapolateRight: "clamp" });
  const ctaSpring = spring({
    frame: frame - 280, fps,
    config: { damping: 16, stiffness: 90 },
  });

  // Final brand close fade-in
  const closeFade = interpolate(frame, [400, 440], [0, 1], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ background: colors.bg }}>
      {/* Phone carousel */}
      <div style={{
        position: "absolute",
        inset: 0,
        opacity: carouselFadeOut,
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        gap: isVertical ? 0 : 60,
        flexDirection: isVertical ? "column" : "row",
        padding: 60,
      }}>
        {phones.map((p, i) => {
          const phoneAspect = 0.36; // ~9:25 PWA full-page; we crop to a phone-height container
          const phoneWidth = isVertical ? 280 : 380;
          const phoneHeight = phoneWidth / phoneAspect;
          return (
            <div
              key={p.src}
              style={{
                width: phoneWidth,
                height: Math.min(phoneHeight, isVertical ? 360 : 720),
                opacity: p.enter,
                transform: `translateY(${(1 - p.enter) * 80}px) rotate(${(i - 1) * 4}deg)`,
                borderRadius: 36,
                overflow: "hidden",
                border: `4px solid ${colors.surface2}`,
                boxShadow: "0 30px 80px rgba(0,0,0,0.6)",
                background: colors.bg,
              }}
            >
              <Img
                src={staticFile(p.src)}
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  objectPosition: "top center",
                }}
              />
            </div>
          );
        })}
      </div>

      {/* CTA panel */}
      <AbsoluteFill style={{
        opacity: ctaOpacity,
        justifyContent: "center",
        alignItems: "center",
        gap: 36,
        fontFamily: fonts.sans,
        background: `radial-gradient(circle at 50% 50%, ${colors.surface} 0%, ${colors.bg} 70%)`,
      }}>
        <div style={{
          opacity: closeFade > 0 ? 1 - closeFade : 1,
          transform: `scale(${0.9 + ctaSpring * 0.1})`,
        }}>
          <BrandLogo size={isVertical ? 90 : 120} />
        </div>

        <div style={{
          opacity: closeFade > 0 ? 1 - closeFade : 1,
          fontSize: isVertical ? 40 : 56,
          fontWeight: 700,
          color: colors.text,
          textAlign: "center",
          letterSpacing: -1,
          maxWidth: isVertical ? 900 : 1400,
          padding: "0 60px",
        }}>
          Open-source.<br />
          Self-hosted.<br />
          <span style={{ color: colors.accent }}>Two-click install.</span>
        </div>

        {/* HA repository badge */}
        <div style={{
          opacity: closeFade > 0 ? 1 - closeFade : 1,
          transform: `translateY(${(1 - ctaSpring) * 16}px)`,
          padding: "16px 28px",
          background: colors.haBlue,
          borderRadius: radii.pill,
          fontSize: isVertical ? 22 : 28,
          fontWeight: 700,
          color: "#FFFFFF",
          boxShadow: `0 12px 30px ${colors.haBlue}66`,
        }}>
          Add repository to my Home Assistant
        </div>

        <div style={{
          opacity: closeFade > 0 ? 1 - closeFade : 1,
          fontFamily: fonts.mono,
          fontSize: isVertical ? 18 : 22,
          color: colors.textMuted,
          letterSpacing: 0.4,
        }}>
          github.com/kbarthei/HASpoolManager
        </div>
      </AbsoluteFill>

      {/* Final brand-only close */}
      <AbsoluteFill style={{
        opacity: closeFade,
        justifyContent: "center",
        alignItems: "center",
        gap: 24,
        background: colors.bg,
      }}>
        <BrandLogo size={isVertical ? 110 : 150} />
        <div style={{
          fontSize: isVertical ? 22 : 28,
          color: colors.textMuted,
          fontFamily: fonts.sans,
          fontWeight: 500,
        }}>
          Built with Claude Code
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
```

- [ ] **Step 2: Lint + commit**

```bash
npm run lint
git add src/beats/Beat9MobileCta.tsx
git commit -m "feat(v2): Beat 9 — Mobile carousel + Install CTA + brand close"
```

---

### Task 14: Wire Demo composition (16:9)

**Files:**
- Create: `src/Demo.tsx`
- Modify: `src/Root.tsx`

- [ ] **Step 1: Write `src/Demo.tsx`**

```tsx
// src/Demo.tsx
import React from "react";
import { linearTiming, TransitionSeries } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { wipe } from "@remotion/transitions/wipe";
import { AbsoluteFill, staticFile } from "remotion";
import { Beat1Hook } from "./beats/Beat1Hook";
import { Beat2Dashboard } from "./beats/Beat2Dashboard";
import { Beat3Inventory } from "./beats/Beat3Inventory";
import { Beat4Inspector } from "./beats/Beat4Inspector";
import { Beat5Scan } from "./beats/Beat5Scan";
import { Beat6Prints } from "./beats/Beat6Prints";
import { Beat7Orders } from "./beats/Beat7Orders";
import { Beat8Analytics } from "./beats/Beat8Analytics";
import { Beat9MobileCta } from "./beats/Beat9MobileCta";
import { Subtitles } from "./components/Subtitles";
import { Soundtrack } from "./components/Soundtrack";
import { colors } from "./theme";

export const TRANSITION_FRAMES = 15;
const N_TRANSITIONS = 8;

export const BEAT_DURATIONS = {
  hook: 180,
  dashboard: 300,
  inventory: 270,
  inspector: 270,
  scan: 330,
  prints: 300,
  orders: 390,
  analytics: 300,
  mobileCta: 480,
} as const;

const BEAT_SUM =
  BEAT_DURATIONS.hook +
  BEAT_DURATIONS.dashboard +
  BEAT_DURATIONS.inventory +
  BEAT_DURATIONS.inspector +
  BEAT_DURATIONS.scan +
  BEAT_DURATIONS.prints +
  BEAT_DURATIONS.orders +
  BEAT_DURATIONS.analytics +
  BEAT_DURATIONS.mobileCta;
// 180 + 300 + 270 + 270 + 330 + 300 + 390 + 300 + 480 = 2820

export const TOTAL_DURATION = BEAT_SUM - N_TRANSITIONS * TRANSITION_FRAMES;
// 2820 - 120 = 2700

type DemoProps = {
  layout?: "horizontal" | "vertical";
  withMusic?: boolean;
};

export const Demo: React.FC<DemoProps> = ({ layout = "horizontal", withMusic = true }) => {
  const subtitleLayout = layout === "vertical" ? "top-banner" : "lower-third";

  return (
    <AbsoluteFill style={{ background: colors.bg }}>
      <TransitionSeries>
        <TransitionSeries.Sequence durationInFrames={BEAT_DURATIONS.hook}>
          <Beat1Hook />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          timing={linearTiming({ durationInFrames: TRANSITION_FRAMES })}
          presentation={fade()}
        />
        <TransitionSeries.Sequence durationInFrames={BEAT_DURATIONS.dashboard}>
          <Beat2Dashboard />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          timing={linearTiming({ durationInFrames: TRANSITION_FRAMES })}
          presentation={slide({ direction: "from-right" })}
        />
        <TransitionSeries.Sequence durationInFrames={BEAT_DURATIONS.inventory}>
          <Beat3Inventory />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          timing={linearTiming({ durationInFrames: TRANSITION_FRAMES })}
          presentation={slide({ direction: "from-right" })}
        />
        <TransitionSeries.Sequence durationInFrames={BEAT_DURATIONS.inspector}>
          <Beat4Inspector />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          timing={linearTiming({ durationInFrames: TRANSITION_FRAMES })}
          presentation={fade()}
        />
        <TransitionSeries.Sequence durationInFrames={BEAT_DURATIONS.scan}>
          <Beat5Scan />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          timing={linearTiming({ durationInFrames: TRANSITION_FRAMES })}
          presentation={wipe()}
        />
        <TransitionSeries.Sequence durationInFrames={BEAT_DURATIONS.prints}>
          <Beat6Prints />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          timing={linearTiming({ durationInFrames: TRANSITION_FRAMES })}
          presentation={slide({ direction: "from-right" })}
        />
        <TransitionSeries.Sequence durationInFrames={BEAT_DURATIONS.orders}>
          <Beat7Orders />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          timing={linearTiming({ durationInFrames: TRANSITION_FRAMES })}
          presentation={wipe()}
        />
        <TransitionSeries.Sequence durationInFrames={BEAT_DURATIONS.analytics}>
          <Beat8Analytics />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          timing={linearTiming({ durationInFrames: TRANSITION_FRAMES })}
          presentation={fade()}
        />
        <TransitionSeries.Sequence durationInFrames={BEAT_DURATIONS.mobileCta}>
          <Beat9MobileCta />
        </TransitionSeries.Sequence>
      </TransitionSeries>

      <Subtitles layout={subtitleLayout} />
      {withMusic ? <Soundtrack /> : null}
    </AbsoluteFill>
  );
};
```

- [ ] **Step 2: Update `src/Root.tsx` to register both compositions**

The existing Root.tsx loads Geist fonts at module level. Modify it to register two compositions and pass `layout` + `withMusic` props.

```tsx
// src/Root.tsx
import React from "react";
import { Composition, staticFile } from "remotion";
import { loadFont as loadGeist } from "@remotion/google-fonts/Geist";
import { loadFont as loadGeistMono } from "@remotion/google-fonts/GeistMono";
import { Demo, TOTAL_DURATION } from "./Demo";

// Module-level font loads (Remotion best practice)
loadGeist();
loadGeistMono();

// Detect music asset at bundler-load time. The Demo will conditionally
// mount Soundtrack via the prop. If music.mp3 is missing, the prop is false.
const MUSIC_PATH = "music.mp3";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="HASpoolManagerDemo"
        component={Demo}
        durationInFrames={TOTAL_DURATION}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{ layout: "horizontal" as const, withMusic: true }}
      />
      <Composition
        id="HASpoolManagerDemoVertical"
        component={Demo}
        durationInFrames={TOTAL_DURATION}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={{ layout: "vertical" as const, withMusic: true }}
      />
    </>
  );
};
```

- [ ] **Step 3: Lint + still-render verification per beat**

```bash
npm run lint
mkdir -p out/stills
npx remotion still src/index.ts HASpoolManagerDemo out/stills/beat1-f90.png   --frame=90    --props='{"withMusic":false}'
npx remotion still src/index.ts HASpoolManagerDemo out/stills/beat2-f330.png  --frame=330   --props='{"withMusic":false}'
npx remotion still src/index.ts HASpoolManagerDemo out/stills/beat3-f600.png  --frame=600   --props='{"withMusic":false}'
npx remotion still src/index.ts HASpoolManagerDemo out/stills/beat4-f870.png  --frame=870   --props='{"withMusic":false}'
npx remotion still src/index.ts HASpoolManagerDemo out/stills/beat5-f1170.png --frame=1170  --props='{"withMusic":false}'
npx remotion still src/index.ts HASpoolManagerDemo out/stills/beat6-f1500.png --frame=1500  --props='{"withMusic":false}'
npx remotion still src/index.ts HASpoolManagerDemo out/stills/beat7-f1860.png --frame=1860  --props='{"withMusic":false}'
npx remotion still src/index.ts HASpoolManagerDemo out/stills/beat8-f2190.png --frame=2190  --props='{"withMusic":false}'
npx remotion still src/index.ts HASpoolManagerDemo out/stills/beat9-f2550.png --frame=2550  --props='{"withMusic":false}'
```

Expected: 9 PNGs in `out/stills/`. Open one or two and visually confirm:
- correct beat content shows
- no black frames
- subtitle text visible at the right time
- screenshot is rendered (not a missing-asset placeholder)

Frame budget reference (cumulative, accounting for transition overlap):
- Beat 1 plays 0..165 (effectively); still at 90 = mid-hook
- Beat 2 plays 165..450; still at 330 = mid-dashboard
- Beat 3 plays 450..705; still at 600 = mid-inventory
- Beat 4 plays 705..960; still at 870 = mid-inspector
- Beat 5 plays 960..1275; still at 1170 = mid-scan (phase 2 fuzzy)
- Beat 6 plays 1275..1560; still at 1500 = end-prints
- Beat 7 plays 1560..1935; still at 1860 = late-orders (parsed rows visible)
- Beat 8 plays 1935..2220; still at 2190 = late-analytics
- Beat 9 plays 2220..2700; still at 2550 = mid-CTA

If any still is black or wrong, fix the beat in question and re-still THAT frame only — do not full-render yet.

- [ ] **Step 4: Commit**

```bash
git add src/Demo.tsx src/Root.tsx
git commit -m "feat(v2): wire 9-beat composition with subtitles + soundtrack + vertical variant"
```

---

### Task 15: Review BrandLogo + HomeAssistantBadge sizing for new theme

The v1 components used the old accent (#14B8A6). They auto-pick from `colors.accent` if they import the theme — but if any hardcoded the old hex, fix it.

**Files:**
- Modify (if needed): `src/components/BrandLogo.tsx`, `src/components/HomeAssistantBadge.tsx`

- [ ] **Step 1: Audit hardcoded colors**

```bash
grep -rn '14B8A6\|#0B0D0E' src/ || echo "no hardcoded v1 colors found — clean"
```

If any matches surface (other than in `theme.ts` where they're already replaced), fix them to use `colors.accent` / `colors.bg` from `../theme`.

- [ ] **Step 2: If any fixes needed, lint + commit**

```bash
npm run lint
git diff --stat src/components
git add src/components
git commit -m "fix(v2): replace hardcoded v1 accent/bg with theme tokens" || echo "nothing to commit"
```

---

### Task 16: Render 16:9 + 9:16 MP4

**Files:**
- Created: `out/haspoolmanager-demo.mp4`, `out/haspoolmanager-demo-vertical.mp4`

- [ ] **Step 1: Conditional music decision**

```bash
if [ -f public/music.mp3 ]; then
  WITH_MUSIC='{"withMusic":true}'
else
  WITH_MUSIC='{"withMusic":false}'
fi
echo "music: $WITH_MUSIC"
```

- [ ] **Step 2: Render 16:9 MP4**

```bash
npx remotion render src/index.ts HASpoolManagerDemo out/haspoolmanager-demo.mp4 \
  --props="$WITH_MUSIC" \
  --codec=h264 \
  --crf=18 \
  --pixel-format=yuv420p \
  --concurrency=2
```

Expected:
- Output `out/haspoolmanager-demo.mp4` (~6-12 MB at 90s 1080p CRF 18).
- No render errors.
- If `node_modules/@remotion/bundler` shows missing-file errors (iCloud rot from last project), run `npm ci` first and retry.

- [ ] **Step 3: Render 9:16 vertical MP4**

```bash
npx remotion render src/index.ts HASpoolManagerDemoVertical out/haspoolmanager-demo-vertical.mp4 \
  --props="$WITH_MUSIC" \
  --codec=h264 \
  --crf=18 \
  --pixel-format=yuv420p \
  --concurrency=2
```

Expected: Output `out/haspoolmanager-demo-vertical.mp4` (~5-10 MB).

- [ ] **Step 4: Sanity-check duration with ffprobe**

```bash
ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 out/haspoolmanager-demo.mp4
ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 out/haspoolmanager-demo-vertical.mp4
```

Expected: both report `90.0` (give or take a millisecond).

- [ ] **Step 5: No commit**

`out/` is gitignored — these artifacts are local only.

---

### Task 17: Generate animated GIF for README

We use ffmpeg's two-pass palette approach for high-quality GIF. Target: ≤10 MB, 720p width, 12fps to keep size manageable.

**Files:**
- Created: `out/haspoolmanager-demo.gif`

- [ ] **Step 1: Generate palette**

```bash
ffmpeg -y -i out/haspoolmanager-demo.mp4 \
  -vf "fps=12,scale=960:-1:flags=lanczos,palettegen=stats_mode=diff" \
  out/palette.png
```

- [ ] **Step 2: Encode GIF using palette**

```bash
ffmpeg -y -i out/haspoolmanager-demo.mp4 -i out/palette.png \
  -lavfi "fps=12,scale=960:-1:flags=lanczos[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle" \
  out/haspoolmanager-demo.gif
```

- [ ] **Step 3: Verify size**

```bash
ls -lh out/haspoolmanager-demo.gif
```

Expected: ≤ 12 MB. If larger, drop framerate to 10:

```bash
# Re-encode at 10fps if needed
ffmpeg -y -i out/haspoolmanager-demo.mp4 -i out/palette.png \
  -lavfi "fps=10,scale=900:-1:flags=lanczos[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle" \
  out/haspoolmanager-demo.gif
ls -lh out/haspoolmanager-demo.gif
```

If still too large after that, drop scale to 720:-1 and re-encode (acceptable trade-off for README embedding).

- [ ] **Step 4: No commit** (gitignored).

---

### Task 18: Final verification & summary

**Files:**
- Modify (optional): repo `README.md` — add a one-line usage note for `npm run setup:music` and the demo render path; **only if a README already exists**, otherwise skip.

- [ ] **Step 1: Visual smoke test**

Open all three artifacts in QuickLook:

```bash
open out/haspoolmanager-demo.mp4 out/haspoolmanager-demo-vertical.mp4 out/haspoolmanager-demo.gif
```

Manual checklist (the agent should pause here and self-review the MP4 frame-by-frame at the seek points):

- [ ] Beat 1 (0–6s): Brand wordmark fades in, tagline types in, HA badge slides up.
- [ ] Beat 2 (6–16s): Dashboard screenshot visible, printer hero spotlight at ~3s, all 4 stat callouts appear and count up.
- [ ] Beat 3 (16–25s): Inventory pans from rack to AMS, 4 spotlight tiles flash, AMS row spotlights at end.
- [ ] Beat 4 (25–34s): Spool Inspector with animated remaining-% ring counting up to 73, callouts appear.
- [ ] Beat 5 (34–45s): RFID exact match (100%, green) → fade → CIE Delta-E fuzzy with 3 candidates, top one animates to 94%.
- [ ] Beat 6 (45–55s): Prints screenshot, top-card spotlight, cost breakdown card (€1.84 + €0.31 = €2.15) reveals row by row.
- [ ] Beat 7 (55–68s): Orders. Email types in (left card), Claude shimmer sweeps across, "→ Claude parses" label, parsed rows appear one-by-one (right card).
- [ ] Beat 8 (68–78s): Analytics. Big "€124.50" counts up, line chart draws in, bar chart bars grow.
- [ ] Beat 9 (78–90s): Three mobile phones tilt in, fade to CTA panel with HA badge ("Add repository to my Home Assistant"), GitHub URL, then final brand close ("Built with Claude Code").
- [ ] Subtitles appear at the right times in lower-third (16:9) / top banner (9:16).
- [ ] Music plays at low volume and fades out in the last 2s (only if `public/music.mp3` is present).
- [ ] No black frames in the final 30 frames (regression from v1).
- [ ] Vertical 9:16 layout: phone carousel stacks vertically, CTA text wraps cleanly, subtitles are top-banner not bottom.

If anything fails, fix the relevant beat (or composition wiring) and re-render only that variant. Iterate up to 3 times before reporting BLOCKED.

- [ ] **Step 2: Final commit (source code only — out/ stays gitignored)**

```bash
git status
git add -A
git diff --cached --stat
# If there are unstaged source-code changes from iteration:
git commit -m "fix(v2): final timing/layout polish from QA pass" || echo "nothing to commit"
git log --oneline -10
```

- [ ] **Step 3: Print final report**

The agent reports:
- File sizes for the three outputs.
- Total duration (should be 90.0s for both MP4s).
- Whether music was included or not.
- Any beat that needed iteration.
- Any limitation (e.g. screenshot quality issues, font fallback warnings).

---

## Self-review

**Spec coverage:**
- 9 beats × 90s with 8 transitions → ✓ Tasks 5-13 (one per beat) + Task 14 (wire-up).
- Real screenshots + synthesized overlays → ✓ Task 1 imports screenshots; Tasks 6-13 use `ScreenshotFrame` + `Spotlight` + `Callout`.
- English subtitles → ✓ Task 2.
- Royalty-free music with offline-safe fallback → ✓ Task 3.
- 16:9 + 9:16 outputs → ✓ Task 14 (two compositions) + Task 16 (two renders).
- Animated GIF → ✓ Task 17.
- Theme matches real HASpoolManager (#000 bg, #40C8E0 accent, Geist) → ✓ Task 1.
- No personal data — all mock numbers + screenshots already vetted by user.
- Subagent guardrail (no `.git/` writes) → ✓ in pre-flight.

**Placeholder scan:** none found — every step has full code or exact commands.

**Type consistency:** `BarChart`/`LineChart` v1 components are reused; Task 12 includes an adapter step in case prop shapes differ. `colors.accent` is the single source of truth for the new accent. `BEAT_DURATIONS` keys are consistent across `Demo.tsx` and the captions schedule.

**Gaps closed during review:**
- Added Task 15 to audit hardcoded v1 colors that primitives might still carry (`14B8A6`, `0B0D0E`).
- Step 3 of Task 14 includes per-beat still-render seeds so issues are caught before the long full render.
- Task 16 includes a `npm ci` fallback note for iCloud-related node_modules rot (hit twice in v1).

---

## Execution

Plan complete and saved to `docs/superpowers/plans/2026-05-04-haspoolmanager-demo-video-v2.md`.

Two execution options:

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks, fast iteration. Best fit since each beat is independent and verifiable via a still-render.

2. **Inline Execution** — execute tasks in this session using executing-plans, batch execution with checkpoints. Faster end-to-end but heavier on this conversation's context.

**Recommendation:** subagent-driven for Tasks 5–13 (each beat in parallel-safe isolation), inline for Tasks 1–4 + 14–18 (cross-cutting infra + final wiring).
