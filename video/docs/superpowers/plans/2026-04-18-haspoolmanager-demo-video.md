# HASpoolManager Demo Video Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a 60-second 1920×1080 30fps Remotion video that walks through the full HASpoolManager filament lifecycle in 7 beats with animated charts and between-beat transitions.

**Architecture:** A single Remotion composition `HASpoolManagerDemo` (1800 frames @ 30fps) wraps a `TransitionSeries` that plays 7 self-contained beat components back-to-back. Shared primitives (`Card`, `SpoolTile`, `BarChart`, etc.) live in `src/components/`. Mock data is centralized in `src/data/mockData.ts` so nothing depends on a live HASpoolManager instance. Styling uses Tailwind v4 utility classes with an explicit theme token file for colors + fonts.

**Tech Stack:** Remotion 4.0.448, React 19.2.3, TypeScript 5.9.3, Tailwind v4, `@remotion/transitions`, `@remotion/google-fonts` (Geist + Geist Mono).

**Spec:** [`docs/superpowers/specs/2026-04-18-haspoolmanager-demo-video-design.md`](../specs/2026-04-18-haspoolmanager-demo-video-design.md)

**Repo:** `/Users/kbarthei/Documents/privat/smartHome/my-video`

---

## Pre-flight

All commands in this plan assume you `cd` to the repo root first:

```bash
cd "/Users/kbarthei/Documents/privat/smartHome/my-video"
```

Verification convention in this plan: since Remotion renders pixels, "tests" are (a) TypeScript/ESLint passing via `npm run lint` and (b) a single-frame still render for the beat you just built. That's enough to catch missing assets, wrong types, and broken spring easings. Full MP4 render only runs once at the end.

---

### Task 1: Install additional dependencies

**Files:**
- Modify: `package.json` (via npm install)

- [ ] **Step 1: Install `@remotion/transitions` and `@remotion/google-fonts`**

Run:
```bash
npm install @remotion/transitions@4.0.448 @remotion/google-fonts
```

Expected: both packages added to `dependencies` in `package.json`. No errors.

- [ ] **Step 2: Verify install**

Run:
```bash
npm list --depth=0 | grep -E "@remotion/(transitions|google-fonts)"
```

Expected output includes both packages.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "feat(deps): add @remotion/transitions and @remotion/google-fonts"
```

Note: if there is no prior commit, `git` will succeed creating the first commit on this branch.

---

### Task 2: Create theme tokens

**Files:**
- Create: `src/theme.ts`

- [ ] **Step 1: Write `src/theme.ts`**

```ts
export const colors = {
  bg: "#0B0D0E",
  surface: "#111315",
  border: "#1F2328",
  accent: "#14B8A6",
  accentSoft: "#14B8A633",
  text: "#F5F7FA",
  textMuted: "#9CA3AF",
  success: "#22C55E",
  warning: "#F59E0B",
  danger: "#EF4444",
  haBlue: "#41BDF5",
} as const;

export const fonts = {
  sans: '"Geist", system-ui, sans-serif',
  mono: '"Geist Mono", ui-monospace, monospace',
} as const;

export const radii = {
  card: 16,
  pill: 999,
} as const;
```

- [ ] **Step 2: Typecheck**

Run: `npm run lint`
Expected: pass.

- [ ] **Step 3: Commit**

```bash
git add src/theme.ts
git commit -m "feat: add theme tokens"
```

---

### Task 3: Create mock data

**Files:**
- Create: `src/data/mockData.ts`

- [ ] **Step 1: Write `src/data/mockData.ts`**

```ts
export type OrderRow = {
  id: string;
  name: string;
  quantity: number;
  unitPriceEur: number;
  shop: string;
  color: string;
};

export const orderRows: OrderRow[] = [
  { id: "o1", name: "Bambu PLA Matte Ivory", quantity: 2, unitPriceEur: 21.99, shop: "bambulab.com", color: "#F4E9D8" },
  { id: "o2", name: "PolyTerra Charcoal Black", quantity: 3, unitPriceEur: 16.5, shop: "polymaker.com", color: "#1F1F1F" },
  { id: "o3", name: "eSun PETG-HF Black", quantity: 4, unitPriceEur: 19.0, shop: "esun3d.com", color: "#0A0A0A" },
  { id: "o4", name: "Bambu Support-for-PLA", quantity: 1, unitPriceEur: 27.99, shop: "bambulab.com", color: "#E6E6E6" },
];

export type RackTile = {
  id: string;
  color: string;
  brand: string;
  material: string;
  empty?: boolean;
};

const brands = ["BL", "PT", "eS", "ST"] as const;
const materials = ["PLA", "PETG", "ABS", "ASA"] as const;
const palette = [
  "#F4E9D8", "#1F1F1F", "#0A0A0A", "#E6E6E6", "#14B8A6", "#EF4444", "#F59E0B", "#3B82F6",
  "#22C55E", "#A855F7", "#EC4899", "#06B6D4", "#84CC16", "#F97316", "#64748B", "#475569",
  "#FACC15", "#10B981", "#6366F1", "#D946EF", "#0EA5E9", "#DC2626", "#CA8A04", "#0F766E",
  "#1E40AF", "#9333EA", "#BE185D", "#047857", "#B91C1C", "#92400E",
];

export const rackTiles: RackTile[] = Array.from({ length: 32 }, (_, i): RackTile => {
  if (i === 30 || i === 31) {
    return { id: `r${i}`, color: "transparent", brand: "", material: "", empty: true };
  }
  return {
    id: `r${i}`,
    color: palette[i % palette.length],
    brand: brands[i % brands.length],
    material: materials[i % materials.length],
  };
});

export type AmsSlot = {
  id: string;
  tile?: RackTile;
  match: "rfid" | "fuzzy" | "empty";
  confidence: number;
  label: string;
};

export const amsSlots: AmsSlot[] = [
  {
    id: "s1",
    tile: { id: "ams1", color: "#F4E9D8", brand: "BL", material: "PLA" },
    match: "rfid",
    confidence: 100,
    label: "RFID exact · Bambu PLA Basic #10101",
  },
  {
    id: "s2",
    tile: { id: "ams2", color: "#1F1F1F", brand: "PT", material: "PLA" },
    match: "fuzzy",
    confidence: 94,
    label: "ΔE fuzzy · PolyTerra Charcoal Black",
  },
  {
    id: "s3",
    tile: { id: "ams3", color: "#14B8A6", brand: "BL", material: "PETG" },
    match: "rfid",
    confidence: 100,
    label: "RFID exact · Bambu PETG Mint",
  },
  { id: "s4", match: "empty", confidence: 0, label: "Slot empty" },
];

export type PrintCost = { label: string; value: number };

export const printHistory: PrintCost[] = [
  { label: "Mon", value: 1.2 },
  { label: "Tue", value: 2.75 },
  { label: "Wed", value: 4.1 },
  { label: "Thu", value: 1.9 },
  { label: "Fri", value: 3.2 },
  { label: "Sat", value: 4.8 },
  { label: "Sun", value: 2.4 },
];

export const pricePerKg: { x: number; y: number }[] = Array.from({ length: 90 }, (_, i) => {
  const trend = 32 - (i / 89) * 5;
  const noise = Math.sin(i * 0.6) * 0.6 + Math.cos(i * 0.23) * 0.4;
  return { x: i, y: trend + noise };
});

export const totalFilamentCostEur = 124.5;

export const slotWeights = [
  { slot: 1, from: 982, to: 847 },
  { slot: 2, from: 1021, to: 978 },
  { slot: 3, from: 540, to: 502 },
  { slot: 4, from: 788, to: 741 },
];
```

- [ ] **Step 2: Typecheck**

Run: `npm run lint`
Expected: pass.

- [ ] **Step 3: Commit**

```bash
git add src/data/mockData.ts
git commit -m "feat: add mock data for demo video"
```

---

### Task 4: Card primitive

**Files:**
- Create: `src/components/Card.tsx`

- [ ] **Step 1: Write `src/components/Card.tsx`**

```tsx
import React from "react";
import { colors, radii } from "../theme";

type CardProps = {
  children: React.ReactNode;
  style?: React.CSSProperties;
  className?: string;
};

export const Card: React.FC<CardProps> = ({ children, style, className }) => {
  return (
    <div
      className={className}
      style={{
        background: colors.surface,
        border: `1px solid ${colors.border}`,
        borderRadius: radii.card,
        padding: 24,
        color: colors.text,
        ...style,
      }}
    >
      {children}
    </div>
  );
};
```

- [ ] **Step 2: Typecheck**

Run: `npm run lint`
Expected: pass.

- [ ] **Step 3: Commit**

```bash
git add src/components/Card.tsx
git commit -m "feat: add Card primitive"
```

---

### Task 5: BrandLogo component

**Files:**
- Create: `src/components/BrandLogo.tsx`

- [ ] **Step 1: Write `src/components/BrandLogo.tsx`**

```tsx
import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { colors, fonts } from "../theme";

type BrandLogoProps = {
  size?: number;
  tagline?: string;
  animate?: boolean;
};

export const BrandLogo: React.FC<BrandLogoProps> = ({
  size = 72,
  tagline = "Every gram tracked.",
  animate = true,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const wordmarkScale = animate
    ? spring({ frame, fps, config: { damping: 18, mass: 0.8 } })
    : 1;
  const wordmarkOpacity = animate
    ? interpolate(frame, [0, 20], [0, 1], { extrapolateRight: "clamp" })
    : 1;

  const tagFrames = tagline.split("");
  const perChar = 2;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 16,
      }}
    >
      <div
        style={{
          fontFamily: fonts.sans,
          fontWeight: 700,
          fontSize: size,
          color: colors.text,
          transform: `scale(${wordmarkScale})`,
          opacity: wordmarkOpacity,
          letterSpacing: -1,
        }}
      >
        HASpool<span style={{ color: colors.accent }}>Manager</span>
      </div>
      <div
        style={{
          fontFamily: fonts.sans,
          fontSize: size * 0.28,
          color: colors.accent,
          display: "flex",
        }}
      >
        {tagFrames.map((ch, i) => {
          const charOpacity = animate
            ? interpolate(frame, [30 + i * perChar, 30 + i * perChar + 6], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              })
            : 1;
          return (
            <span key={i} style={{ opacity: charOpacity, whiteSpace: "pre" }}>
              {ch}
            </span>
          );
        })}
      </div>
    </div>
  );
};
```

- [ ] **Step 2: Typecheck**

Run: `npm run lint`
Expected: pass.

- [ ] **Step 3: Commit**

```bash
git add src/components/BrandLogo.tsx
git commit -m "feat: add BrandLogo with animated wordmark + tagline"
```

---

### Task 6: SpoolTile component

**Files:**
- Create: `src/components/SpoolTile.tsx`

- [ ] **Step 1: Write `src/components/SpoolTile.tsx`**

```tsx
import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { colors, fonts } from "../theme";

type SpoolTileProps = {
  color: string;
  brand: string;
  material: string;
  size?: number;
  delayFrames?: number;
  empty?: boolean;
};

export const SpoolTile: React.FC<SpoolTileProps> = ({
  color,
  brand,
  material,
  size = 96,
  delayFrames = 0,
  empty = false,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const s = spring({
    frame: frame - delayFrames,
    fps,
    config: { damping: 18, mass: 0.8 },
  });
  const opacity = interpolate(frame - delayFrames, [0, 8], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  if (empty) {
    return (
      <div
        style={{
          width: size,
          height: size,
          borderRadius: 14,
          border: `1.5px dashed ${colors.border}`,
          opacity: 0.6,
        }}
      />
    );
  }

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: 14,
        background: color,
        border: `1px solid ${colors.border}`,
        display: "flex",
        flexDirection: "column",
        justifyContent: "flex-end",
        padding: 8,
        transform: `scale(${s})`,
        opacity,
        boxShadow: `0 4px 16px rgba(0,0,0,0.3)`,
      }}
    >
      <div
        style={{
          fontFamily: fonts.mono,
          fontSize: size * 0.14,
          color: isLight(color) ? "#000" : "#fff",
          fontWeight: 600,
          opacity: 0.85,
        }}
      >
        {brand} · {material}
      </div>
    </div>
  );
};

function isLight(hex: string): boolean {
  const h = hex.replace("#", "");
  if (h.length !== 6) return false;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6;
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run lint`
Expected: pass.

- [ ] **Step 3: Commit**

```bash
git add src/components/SpoolTile.tsx
git commit -m "feat: add SpoolTile with spring entry animation"
```

---

### Task 7: ConfidenceBar component

**Files:**
- Create: `src/components/ConfidenceBar.tsx`

- [ ] **Step 1: Write `src/components/ConfidenceBar.tsx`**

```tsx
import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { colors, fonts } from "../theme";

type ConfidenceBarProps = {
  target: number;
  label: string;
  startFrame: number;
  fillFrames: number;
  width?: number;
  kind?: "rfid" | "fuzzy";
};

export const ConfidenceBar: React.FC<ConfidenceBarProps> = ({
  target,
  label,
  startFrame,
  fillFrames,
  width = 360,
  kind = "rfid",
}) => {
  const frame = useCurrentFrame();
  const pct = interpolate(frame, [startFrame, startFrame + fillFrames], [0, target], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const fillColor = kind === "rfid" ? colors.accent : colors.warning;

  return (
    <div style={{ width, display: "flex", flexDirection: "column", gap: 6 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div
          style={{
            fontFamily: fonts.sans,
            fontSize: 14,
            color: colors.textMuted,
          }}
        >
          {label}
        </div>
        <div
          style={{
            fontFamily: fonts.mono,
            fontSize: 14,
            color: colors.text,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {Math.round(pct)}%
        </div>
      </div>
      <div
        style={{
          width: "100%",
          height: 6,
          borderRadius: 3,
          background: colors.border,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: "100%",
            background: fillColor,
            borderRadius: 3,
            transition: "none",
          }}
        />
      </div>
    </div>
  );
};
```

- [ ] **Step 2: Typecheck**

Run: `npm run lint`
Expected: pass.

- [ ] **Step 3: Commit**

```bash
git add src/components/ConfidenceBar.tsx
git commit -m "feat: add ConfidenceBar with animated fill"
```

---

### Task 8: CountUp component

**Files:**
- Create: `src/components/CountUp.tsx`

- [ ] **Step 1: Write `src/components/CountUp.tsx`**

```tsx
import React from "react";
import { Easing, interpolate, useCurrentFrame } from "remotion";
import { fonts } from "../theme";

type CountUpProps = {
  from: number;
  to: number;
  startFrame: number;
  durationInFrames: number;
  format?: (n: number) => string;
  style?: React.CSSProperties;
};

export const CountUp: React.FC<CountUpProps> = ({
  from,
  to,
  startFrame,
  durationInFrames,
  format = (n) => n.toFixed(0),
  style,
}) => {
  const frame = useCurrentFrame();
  const value = interpolate(
    frame,
    [startFrame, startFrame + durationInFrames],
    [from, to],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.out(Easing.cubic),
    },
  );

  return (
    <span
      style={{
        fontFamily: fonts.mono,
        fontVariantNumeric: "tabular-nums",
        ...style,
      }}
    >
      {format(value)}
    </span>
  );
};
```

- [ ] **Step 2: Typecheck**

Run: `npm run lint`
Expected: pass.

- [ ] **Step 3: Commit**

```bash
git add src/components/CountUp.tsx
git commit -m "feat: add CountUp numeric animator"
```

---

### Task 9: BarChart component

**Files:**
- Create: `src/components/BarChart.tsx`

- [ ] **Step 1: Write `src/components/BarChart.tsx`**

```tsx
import React from "react";
import { spring, useCurrentFrame, useVideoConfig } from "remotion";
import { colors, fonts } from "../theme";

type BarChartProps = {
  data: { label: string; value: number }[];
  maxValue: number;
  width: number;
  height: number;
  startFrame: number;
  staggerFrames: number;
  barColor?: string;
  currencyPrefix?: string;
};

export const BarChart: React.FC<BarChartProps> = ({
  data,
  maxValue,
  width,
  height,
  startFrame,
  staggerFrames,
  barColor = colors.accent,
  currencyPrefix = "€",
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const padding = 32;
  const chartHeight = height - padding - 28;
  const barAreaWidth = width - padding * 2;
  const barWidth = (barAreaWidth / data.length) * 0.6;
  const gap = (barAreaWidth / data.length) * 0.4;

  return (
    <svg width={width} height={height} style={{ overflow: "visible" }}>
      <line
        x1={padding}
        y1={chartHeight + padding / 2}
        x2={width - padding}
        y2={chartHeight + padding / 2}
        stroke={colors.border}
      />
      {data.map((d, i) => {
        const progress = spring({
          frame: frame - (startFrame + i * staggerFrames),
          fps,
          config: { damping: 14, mass: 0.8 },
        });
        const h = (d.value / maxValue) * chartHeight * progress;
        const x = padding + i * (barWidth + gap) + gap / 2;
        const y = chartHeight + padding / 2 - h;
        return (
          <g key={d.label}>
            <rect
              x={x}
              y={y}
              width={barWidth}
              height={h}
              rx={6}
              fill={barColor}
              opacity={0.9}
            />
            <text
              x={x + barWidth / 2}
              y={y - 8}
              textAnchor="middle"
              fill={colors.text}
              fontFamily={fonts.mono}
              fontSize={13}
              opacity={progress}
            >
              {currencyPrefix}
              {d.value.toFixed(2)}
            </text>
            <text
              x={x + barWidth / 2}
              y={chartHeight + padding / 2 + 18}
              textAnchor="middle"
              fill={colors.textMuted}
              fontFamily={fonts.sans}
              fontSize={12}
            >
              {d.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
};
```

- [ ] **Step 2: Typecheck**

Run: `npm run lint`
Expected: pass.

- [ ] **Step 3: Commit**

```bash
git add src/components/BarChart.tsx
git commit -m "feat: add animated BarChart"
```

---

### Task 10: LineChart component

**Files:**
- Create: `src/components/LineChart.tsx`

- [ ] **Step 1: Write `src/components/LineChart.tsx`**

```tsx
import React, { useMemo } from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { colors, fonts } from "../theme";

type LineChartProps = {
  points: { x: number; y: number }[];
  width: number;
  height: number;
  startFrame: number;
  drawFrames: number;
  strokeColor?: string;
  title?: string;
  yLabel?: string;
};

export const LineChart: React.FC<LineChartProps> = ({
  points,
  width,
  height,
  startFrame,
  drawFrames,
  strokeColor = colors.accent,
  title,
  yLabel,
}) => {
  const frame = useCurrentFrame();

  const padding = 32;
  const plotW = width - padding * 2;
  const plotH = height - padding * 2 - 20;

  const { pathD, totalLen } = useMemo(() => {
    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    const xMin = Math.min(...xs);
    const xMax = Math.max(...xs);
    const yMin = Math.min(...ys);
    const yMax = Math.max(...ys);

    const mapped = points.map((p) => ({
      x: padding + ((p.x - xMin) / (xMax - xMin)) * plotW,
      y: padding + 20 + plotH - ((p.y - yMin) / (yMax - yMin)) * plotH,
    }));

    let d = `M ${mapped[0].x} ${mapped[0].y}`;
    let len = 0;
    for (let i = 1; i < mapped.length; i++) {
      d += ` L ${mapped[i].x} ${mapped[i].y}`;
      const dx = mapped[i].x - mapped[i - 1].x;
      const dy = mapped[i].y - mapped[i - 1].y;
      len += Math.hypot(dx, dy);
    }
    return { pathD: d, totalLen: len };
  }, [points, padding, plotW, plotH]);

  const progress = interpolate(
    frame,
    [startFrame, startFrame + drawFrames],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  const dashOffset = totalLen * (1 - progress);

  return (
    <svg width={width} height={height} style={{ overflow: "visible" }}>
      {title && (
        <text
          x={padding}
          y={padding * 0.6}
          fill={colors.text}
          fontFamily={fonts.sans}
          fontSize={14}
        >
          {title}
        </text>
      )}
      {yLabel && (
        <text
          x={width - padding}
          y={padding * 0.6}
          fill={colors.textMuted}
          fontFamily={fonts.mono}
          fontSize={12}
          textAnchor="end"
        >
          {yLabel}
        </text>
      )}
      <path
        d={pathD}
        fill="none"
        stroke={strokeColor}
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeDasharray={totalLen}
        strokeDashoffset={dashOffset}
      />
    </svg>
  );
};
```

- [ ] **Step 2: Typecheck**

Run: `npm run lint`
Expected: pass.

- [ ] **Step 3: Commit**

```bash
git add src/components/LineChart.tsx
git commit -m "feat: add animated LineChart with stroke-dashoffset draw"
```

---

### Task 11: HomeAssistantBadge component

**Files:**
- Create: `src/components/HomeAssistantBadge.tsx`

- [ ] **Step 1: Write `src/components/HomeAssistantBadge.tsx`**

```tsx
import React from "react";
import { colors, fonts, radii } from "../theme";

type HomeAssistantBadgeProps = {
  label?: string;
};

export const HomeAssistantBadge: React.FC<HomeAssistantBadgeProps> = ({
  label = "Add repository to my Home Assistant",
}) => {
  return (
    <div
      style={{
        background: colors.haBlue,
        color: "#0B0D0E",
        fontFamily: fonts.sans,
        fontWeight: 700,
        fontSize: 18,
        letterSpacing: 0.5,
        textTransform: "uppercase",
        padding: "14px 22px",
        borderRadius: radii.pill,
        display: "inline-flex",
        alignItems: "center",
        gap: 10,
        boxShadow: `0 8px 32px ${colors.haBlue}55`,
      }}
    >
      <div
        style={{
          width: 24,
          height: 24,
          borderRadius: 6,
          background: "#0B0D0E",
          color: colors.haBlue,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontWeight: 900,
          fontSize: 14,
        }}
      >
        HA
      </div>
      {label}
    </div>
  );
};
```

- [ ] **Step 2: Typecheck**

Run: `npm run lint`
Expected: pass.

- [ ] **Step 3: Commit**

```bash
git add src/components/HomeAssistantBadge.tsx
git commit -m "feat: add HomeAssistantBadge"
```

---

### Task 12: Beat 1 — Hook

**Files:**
- Create: `src/beats/Beat1Hook.tsx`

Duration: 180 frames (6s).

- [ ] **Step 1: Write `src/beats/Beat1Hook.tsx`**

```tsx
import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { BrandLogo } from "../components/BrandLogo";
import { colors } from "../theme";

export const Beat1Hook: React.FC = () => {
  const frame = useCurrentFrame();
  const strandX = interpolate(frame, [0, 180], [-400, 1920 + 400]);
  const fadeOut = interpolate(frame, [150, 180], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        background: colors.bg,
        alignItems: "center",
        justifyContent: "center",
        opacity: fadeOut,
      }}
    >
      <div
        style={{
          position: "absolute",
          bottom: 120,
          left: strandX,
          width: 600,
          height: 2,
          background: `linear-gradient(90deg, transparent, ${colors.accent}, transparent)`,
          filter: "blur(1px)",
          opacity: 0.6,
        }}
      />
      <BrandLogo size={140} tagline="Every gram tracked." animate />
    </AbsoluteFill>
  );
};
```

- [ ] **Step 2: Typecheck + lint**

Run: `npm run lint`
Expected: pass.

- [ ] **Step 3: Commit**

```bash
git add src/beats/Beat1Hook.tsx
git commit -m "feat: add Beat 1 — Hook"
```

---

### Task 13: Beat 2 — Order → AI parse

**Files:**
- Create: `src/beats/Beat2OrderParse.tsx`

Duration: 300 frames (10s).

- [ ] **Step 1: Write `src/beats/Beat2OrderParse.tsx`**

```tsx
import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { Card } from "../components/Card";
import { orderRows } from "../data/mockData";
import { colors, fonts } from "../theme";

const EMAIL_LINES = [
  "Betreff: Bestellbestätigung #48231",
  "",
  "Vielen Dank für Ihre Bestellung!",
  "",
  "2x Bambu PLA Matte Ivory @ 21,99 €",
  "3x PolyTerra Charcoal Black @ 16,50 €",
  "4x eSun PETG-HF Black @ 19,00 €",
  "1x Bambu Support-for-PLA @ 27,99 €",
  "",
  "Versand: DHL – voraussichtlich 2 Werktage",
];

export const Beat2OrderParse: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill
      style={{
        background: colors.bg,
        padding: 80,
        display: "flex",
        flexDirection: "row",
        gap: 60,
        alignItems: "stretch",
      }}
    >
      <Card style={{ flex: 1, display: "flex", flexDirection: "column", gap: 12 }}>
        <div
          style={{
            fontFamily: fonts.sans,
            color: colors.textMuted,
            fontSize: 14,
          }}
        >
          Order confirmation email
        </div>
        {EMAIL_LINES.map((line, i) => {
          const visibleAt = 10 + i * 8;
          const opacity = interpolate(frame, [visibleAt, visibleAt + 10], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });
          return (
            <div
              key={i}
              style={{
                fontFamily: fonts.mono,
                color: colors.text,
                fontSize: 16,
                opacity,
                minHeight: 22,
              }}
            >
              {line}
            </div>
          );
        })}
      </Card>

      <Card style={{ flex: 1, display: "flex", flexDirection: "column", gap: 16 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div style={{ fontFamily: fonts.sans, fontSize: 20, fontWeight: 600 }}>
            Parsed inventory
          </div>
          <ClaudePill frame={frame} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {orderRows.map((row, i) => {
            const appearsAt = 130 + i * 28;
            const s = spring({
              frame: frame - appearsAt,
              fps,
              config: { damping: 16 },
            });
            const opacity = interpolate(frame, [appearsAt, appearsAt + 10], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            });
            return (
              <div
                key={row.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "28px 1fr auto auto",
                  gap: 14,
                  alignItems: "center",
                  padding: 12,
                  background: colors.bg,
                  borderRadius: 12,
                  border: `1px solid ${colors.border}`,
                  transform: `translateX(${(1 - s) * 40}px)`,
                  opacity,
                }}
              >
                <div
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: 6,
                    background: row.color,
                    border: `1px solid ${colors.border}`,
                  }}
                />
                <div style={{ fontFamily: fonts.sans, fontSize: 15 }}>{row.name}</div>
                <div
                  style={{
                    fontFamily: fonts.mono,
                    fontSize: 14,
                    color: colors.textMuted,
                  }}
                >
                  x{row.quantity}
                </div>
                <div
                  style={{
                    fontFamily: fonts.mono,
                    fontSize: 14,
                    color: colors.accent,
                  }}
                >
                  €{row.unitPriceEur.toFixed(2)}
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </AbsoluteFill>
  );
};

const ClaudePill: React.FC<{ frame: number }> = ({ frame }) => {
  const pulse = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(frame * 0.15));
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "6px 12px",
        borderRadius: 999,
        border: `1px solid ${colors.accent}`,
        color: colors.accent,
        fontFamily: fonts.sans,
        fontSize: 12,
        fontWeight: 600,
      }}
    >
      <div
        style={{
          width: 8,
          height: 8,
          borderRadius: 999,
          background: colors.accent,
          opacity: pulse,
        }}
      />
      Claude parsed
    </div>
  );
};
```

- [ ] **Step 2: Typecheck + lint**

Run: `npm run lint`
Expected: pass.

- [ ] **Step 3: Commit**

```bash
git add src/beats/Beat2OrderParse.tsx
git commit -m "feat: add Beat 2 — Order email → AI parse"
```

---

### Task 14: Beat 3 — Digital Rack Twin

**Files:**
- Create: `src/beats/Beat3RackTwin.tsx`

Duration: 300 frames (10s).

- [ ] **Step 1: Write `src/beats/Beat3RackTwin.tsx`**

```tsx
import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { SpoolTile } from "../components/SpoolTile";
import { rackTiles } from "../data/mockData";
import { colors, fonts } from "../theme";

export const Beat3RackTwin: React.FC = () => {
  const frame = useCurrentFrame();
  const headerOpacity = interpolate(frame, [0, 20], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        background: colors.bg,
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "column",
        gap: 40,
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 8,
          opacity: headerOpacity,
        }}
      >
        <div
          style={{
            fontFamily: fonts.sans,
            color: colors.textMuted,
            fontSize: 16,
            textTransform: "uppercase",
            letterSpacing: 2,
          }}
        >
          Digital Rack Twin
        </div>
        <div
          style={{
            fontFamily: fonts.sans,
            color: colors.text,
            fontSize: 36,
            fontWeight: 600,
          }}
        >
          30+ spools tracked, one grid.
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(8, 108px)",
          gridTemplateRows: "repeat(4, 108px)",
          gap: 14,
          padding: 24,
          background: colors.surface,
          borderRadius: 20,
          border: `1px solid ${colors.border}`,
        }}
      >
        {rackTiles.map((tile, i) => {
          const col = i % 8;
          const row = Math.floor(i / 8);
          const delay = 30 + (col * 4 + row * 2) * 2;
          return (
            <SpoolTile
              key={tile.id}
              color={tile.color}
              brand={tile.brand}
              material={tile.material}
              size={96}
              delayFrames={delay}
              empty={tile.empty}
            />
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
```

- [ ] **Step 2: Typecheck + lint**

Run: `npm run lint`
Expected: pass.

- [ ] **Step 3: Commit**

```bash
git add src/beats/Beat3RackTwin.tsx
git commit -m "feat: add Beat 3 — Digital Rack Twin grid"
```

---

### Task 15: Beat 4 — AMS sync + matching

**Files:**
- Create: `src/beats/Beat4AmsMatch.tsx`

Duration: 300 frames (10s).

- [ ] **Step 1: Write `src/beats/Beat4AmsMatch.tsx`**

```tsx
import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { Card } from "../components/Card";
import { ConfidenceBar } from "../components/ConfidenceBar";
import { SpoolTile } from "../components/SpoolTile";
import { amsSlots } from "../data/mockData";
import { colors, fonts } from "../theme";

export const Beat4AmsMatch: React.FC = () => {
  const frame = useCurrentFrame();
  const title = interpolate(frame, [0, 20], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        background: colors.bg,
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "column",
        gap: 40,
        padding: 80,
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 4,
          opacity: title,
        }}
      >
        <div
          style={{
            fontFamily: fonts.sans,
            color: colors.textMuted,
            fontSize: 16,
            textTransform: "uppercase",
            letterSpacing: 2,
          }}
        >
          AMS sync
        </div>
        <div
          style={{
            fontFamily: fonts.sans,
            color: colors.text,
            fontSize: 36,
            fontWeight: 600,
          }}
        >
          RFID exact + ΔE fuzzy match.
        </div>
      </div>

      <Card style={{ display: "flex", gap: 24, alignItems: "center" }}>
        {amsSlots.map((slot, i) => {
          const slotAppears = 30 + i * 20;
          const pulseStart = slotAppears + 20;
          const pulseT = interpolate(frame, [pulseStart, pulseStart + 30], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });
          return (
            <div
              key={slot.id}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 10,
                position: "relative",
              }}
            >
              <div
                style={{
                  position: "relative",
                  width: 120,
                  height: 120,
                  borderRadius: 14,
                  background: colors.bg,
                  border: `1px solid ${colors.border}`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {slot.tile ? (
                  <>
                    <SpoolTile
                      color={slot.tile.color}
                      brand={slot.tile.brand}
                      material={slot.tile.material}
                      size={104}
                      delayFrames={slotAppears}
                    />
                    {slot.match === "rfid" && (
                      <div
                        style={{
                          position: "absolute",
                          inset: 0,
                          borderRadius: 14,
                          border: `2px solid ${colors.accent}`,
                          opacity: 1 - pulseT,
                          transform: `scale(${1 + pulseT * 0.3})`,
                        }}
                      />
                    )}
                  </>
                ) : (
                  <div
                    style={{
                      fontFamily: fonts.sans,
                      fontSize: 12,
                      color: colors.textMuted,
                    }}
                  >
                    Empty
                  </div>
                )}
              </div>
              <div
                style={{
                  fontFamily: fonts.mono,
                  fontSize: 12,
                  color: colors.textMuted,
                }}
              >
                Slot {i + 1}
              </div>
            </div>
          );
        })}
      </Card>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 14,
          width: 640,
        }}
      >
        {amsSlots
          .filter((s) => s.match !== "empty")
          .map((slot, i) => (
            <ConfidenceBar
              key={slot.id}
              target={slot.confidence}
              label={slot.label}
              startFrame={120 + i * 40}
              fillFrames={45}
              width={640}
              kind={slot.match === "rfid" ? "rfid" : "fuzzy"}
            />
          ))}
      </div>
    </AbsoluteFill>
  );
};
```

- [ ] **Step 2: Typecheck + lint**

Run: `npm run lint`
Expected: pass.

- [ ] **Step 3: Commit**

```bash
git add src/beats/Beat4AmsMatch.tsx
git commit -m "feat: add Beat 4 — AMS RFID + fuzzy match"
```

---

### Task 16: Beat 5 — Print + weight deduction

**Files:**
- Create: `src/beats/Beat5PrintWeight.tsx`

Duration: 300 frames (10s).

- [ ] **Step 1: Write `src/beats/Beat5PrintWeight.tsx`**

```tsx
import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { Card } from "../components/Card";
import { CountUp } from "../components/CountUp";
import { slotWeights } from "../data/mockData";
import { colors, fonts } from "../theme";

export const Beat5PrintWeight: React.FC = () => {
  const frame = useCurrentFrame();
  const title = interpolate(frame, [0, 20], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const progress = interpolate(frame, [30, 270], [0, 100], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        background: colors.bg,
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "column",
        gap: 36,
        padding: 80,
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 4,
          opacity: title,
        }}
      >
        <div
          style={{
            fontFamily: fonts.sans,
            color: colors.textMuted,
            fontSize: 16,
            textTransform: "uppercase",
            letterSpacing: 2,
          }}
        >
          Live print tracking
        </div>
        <div
          style={{
            fontFamily: fonts.sans,
            color: colors.text,
            fontSize: 36,
            fontWeight: 600,
          }}
        >
          Per-tray weight — 3MF parsed.
        </div>
      </div>

      <Card
        style={{
          width: 900,
          display: "flex",
          flexDirection: "column",
          gap: 20,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontFamily: fonts.sans,
          }}
        >
          <div style={{ fontSize: 14, color: colors.textMuted }}>
            Print · benchy_hairy_edition.3mf
          </div>
          <div style={{ fontSize: 14, color: colors.text, fontFamily: fonts.mono }}>
            {progress.toFixed(1)}%
          </div>
        </div>
        <div
          style={{
            width: "100%",
            height: 8,
            background: colors.border,
            borderRadius: 4,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: `${progress}%`,
              height: "100%",
              background: colors.accent,
            }}
          />
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: 16,
            marginTop: 12,
          }}
        >
          {slotWeights.map((sw) => (
            <div
              key={sw.slot}
              style={{
                background: colors.bg,
                border: `1px solid ${colors.border}`,
                borderRadius: 12,
                padding: 16,
                display: "flex",
                flexDirection: "column",
                gap: 6,
              }}
            >
              <div
                style={{
                  fontFamily: fonts.sans,
                  fontSize: 12,
                  color: colors.textMuted,
                }}
              >
                Slot {sw.slot}
              </div>
              <CountUp
                from={sw.from}
                to={sw.to}
                startFrame={30}
                durationInFrames={240}
                format={(n) => `${n.toFixed(0)} g`}
                style={{ fontSize: 26, color: colors.text }}
              />
              <div
                style={{
                  fontFamily: fonts.mono,
                  fontSize: 11,
                  color: colors.accent,
                }}
              >
                -{(sw.from - sw.to)} g
              </div>
            </div>
          ))}
        </div>
      </Card>
    </AbsoluteFill>
  );
};
```

- [ ] **Step 2: Typecheck + lint**

Run: `npm run lint`
Expected: pass.

- [ ] **Step 3: Commit**

```bash
git add src/beats/Beat5PrintWeight.tsx
git commit -m "feat: add Beat 5 — live print progress + weight deduction"
```

---

### Task 17: Beat 6 — Cost analytics charts

**Files:**
- Create: `src/beats/Beat6CostAnalytics.tsx`

Duration: 300 frames (10s).

- [ ] **Step 1: Write `src/beats/Beat6CostAnalytics.tsx`**

```tsx
import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { BarChart } from "../components/BarChart";
import { Card } from "../components/Card";
import { CountUp } from "../components/CountUp";
import { LineChart } from "../components/LineChart";
import {
  pricePerKg,
  printHistory,
  totalFilamentCostEur,
} from "../data/mockData";
import { colors, fonts } from "../theme";

export const Beat6CostAnalytics: React.FC = () => {
  const frame = useCurrentFrame();
  const title = interpolate(frame, [0, 20], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const barOpacity = interpolate(frame, [0, 20, 130, 160], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const lineOpacity = interpolate(frame, [140, 170], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const maxBar = Math.max(...printHistory.map((p) => p.value));

  return (
    <AbsoluteFill
      style={{
        background: colors.bg,
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "column",
        gap: 36,
        padding: 80,
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 4,
          opacity: title,
        }}
      >
        <div
          style={{
            fontFamily: fonts.sans,
            color: colors.textMuted,
            fontSize: 16,
            textTransform: "uppercase",
            letterSpacing: 2,
          }}
        >
          Cost analytics
        </div>
        <div
          style={{
            fontFamily: fonts.sans,
            color: colors.text,
            fontSize: 36,
            fontWeight: 600,
          }}
        >
          Every print, priced.
        </div>
      </div>

      <div
        style={{
          display: "flex",
          gap: 24,
          alignItems: "stretch",
          width: "100%",
          maxWidth: 1600,
        }}
      >
        <Card style={{ flex: 1, position: "relative", minHeight: 320 }}>
          <div
            style={{
              position: "absolute",
              inset: 0,
              padding: 24,
              opacity: barOpacity,
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            <div style={{ fontFamily: fonts.sans, fontSize: 16, color: colors.textMuted }}>
              Last 7 prints — filament cost
            </div>
            <BarChart
              data={printHistory}
              maxValue={maxBar * 1.2}
              width={640}
              height={260}
              startFrame={20}
              staggerFrames={10}
            />
          </div>
          <div
            style={{
              position: "absolute",
              inset: 0,
              padding: 24,
              opacity: lineOpacity,
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            <div style={{ fontFamily: fonts.sans, fontSize: 16, color: colors.textMuted }}>
              €/kg · 90 days
            </div>
            <LineChart
              points={pricePerKg}
              width={640}
              height={260}
              startFrame={160}
              drawFrames={90}
              title=""
              yLabel="EUR / kg"
            />
          </div>
        </Card>

        <Card
          style={{
            width: 420,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            gap: 12,
          }}
        >
          <div
            style={{
              fontFamily: fonts.sans,
              color: colors.textMuted,
              fontSize: 14,
            }}
          >
            Total filament cost · 2026
          </div>
          <CountUp
            from={0}
            to={totalFilamentCostEur}
            startFrame={30}
            durationInFrames={150}
            format={(n) => `€${n.toFixed(2)}`}
            style={{ fontSize: 72, fontWeight: 700, color: colors.accent }}
          />
          <div
            style={{
              fontFamily: fonts.sans,
              color: colors.textMuted,
              fontSize: 14,
            }}
          >
            across 42 prints, 7 filaments
          </div>
        </Card>
      </div>
    </AbsoluteFill>
  );
};
```

- [ ] **Step 2: Typecheck + lint**

Run: `npm run lint`
Expected: pass.

- [ ] **Step 3: Commit**

```bash
git add src/beats/Beat6CostAnalytics.tsx
git commit -m "feat: add Beat 6 — animated bar + line cost charts"
```

---

### Task 18: Beat 7 — Install CTA

**Files:**
- Create: `src/beats/Beat7InstallCta.tsx`

Duration: 120 frames (4s).

- [ ] **Step 1: Write `src/beats/Beat7InstallCta.tsx`**

```tsx
import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { BrandLogo } from "../components/BrandLogo";
import { HomeAssistantBadge } from "../components/HomeAssistantBadge";
import { colors, fonts } from "../theme";

export const Beat7InstallCta: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const badgeScale = spring({
    frame: frame - 30,
    fps,
    config: { damping: 14, mass: 0.9 },
  });
  const badgeOpacity = interpolate(frame, [30, 50], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const urlOpacity = interpolate(frame, [60, 80], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const glow = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(frame * 0.1));

  return (
    <AbsoluteFill
      style={{
        background: colors.bg,
        alignItems: "center",
        justifyContent: "center",
        gap: 40,
      }}
    >
      <BrandLogo size={96} tagline="" animate={false} />
      <div
        style={{
          position: "relative",
          transform: `scale(${badgeScale})`,
          opacity: badgeOpacity,
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: -20,
            borderRadius: 999,
            background: colors.haBlue,
            filter: "blur(32px)",
            opacity: 0.25 * glow,
            zIndex: 0,
          }}
        />
        <div style={{ position: "relative", zIndex: 1 }}>
          <HomeAssistantBadge />
        </div>
      </div>
      <div
        style={{
          fontFamily: fonts.mono,
          color: colors.textMuted,
          fontSize: 20,
          opacity: urlOpacity,
        }}
      >
        github.com/kbarthei/HASpoolManager
      </div>
    </AbsoluteFill>
  );
};
```

- [ ] **Step 2: Typecheck + lint**

Run: `npm run lint`
Expected: pass.

- [ ] **Step 3: Commit**

```bash
git add src/beats/Beat7InstallCta.tsx
git commit -m "feat: add Beat 7 — install CTA"
```

---

### Task 19: Demo composition (wires beats with transitions)

**Files:**
- Create: `src/Demo.tsx`

- [ ] **Step 1: Write `src/Demo.tsx`**

```tsx
import React from "react";
import { linearTiming, TransitionSeries } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { wipe } from "@remotion/transitions/wipe";
import { AbsoluteFill } from "remotion";
import { Beat1Hook } from "./beats/Beat1Hook";
import { Beat2OrderParse } from "./beats/Beat2OrderParse";
import { Beat3RackTwin } from "./beats/Beat3RackTwin";
import { Beat4AmsMatch } from "./beats/Beat4AmsMatch";
import { Beat5PrintWeight } from "./beats/Beat5PrintWeight";
import { Beat6CostAnalytics } from "./beats/Beat6CostAnalytics";
import { Beat7InstallCta } from "./beats/Beat7InstallCta";
import { colors } from "./theme";

export const BEAT_DURATIONS = {
  hook: 180,
  order: 300,
  rack: 300,
  ams: 300,
  print: 300,
  cost: 300,
  cta: 120,
} as const;

export const TOTAL_DURATION =
  BEAT_DURATIONS.hook +
  BEAT_DURATIONS.order +
  BEAT_DURATIONS.rack +
  BEAT_DURATIONS.ams +
  BEAT_DURATIONS.print +
  BEAT_DURATIONS.cost +
  BEAT_DURATIONS.cta;

export const Demo: React.FC = () => {
  return (
    <AbsoluteFill style={{ background: colors.bg }}>
      <TransitionSeries>
        <TransitionSeries.Sequence durationInFrames={BEAT_DURATIONS.hook}>
          <Beat1Hook />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          timing={linearTiming({ durationInFrames: 15 })}
          presentation={slide({ direction: "from-right" })}
        />
        <TransitionSeries.Sequence durationInFrames={BEAT_DURATIONS.order}>
          <Beat2OrderParse />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          timing={linearTiming({ durationInFrames: 15 })}
          presentation={slide({ direction: "from-right" })}
        />
        <TransitionSeries.Sequence durationInFrames={BEAT_DURATIONS.rack}>
          <Beat3RackTwin />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          timing={linearTiming({ durationInFrames: 15 })}
          presentation={fade()}
        />
        <TransitionSeries.Sequence durationInFrames={BEAT_DURATIONS.ams}>
          <Beat4AmsMatch />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          timing={linearTiming({ durationInFrames: 15 })}
          presentation={wipe()}
        />
        <TransitionSeries.Sequence durationInFrames={BEAT_DURATIONS.print}>
          <Beat5PrintWeight />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          timing={linearTiming({ durationInFrames: 15 })}
          presentation={wipe()}
        />
        <TransitionSeries.Sequence durationInFrames={BEAT_DURATIONS.cost}>
          <Beat6CostAnalytics />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          timing={linearTiming({ durationInFrames: 15 })}
          presentation={fade()}
        />
        <TransitionSeries.Sequence durationInFrames={BEAT_DURATIONS.cta}>
          <Beat7InstallCta />
        </TransitionSeries.Sequence>
      </TransitionSeries>
    </AbsoluteFill>
  );
};
```

Note on duration math: with 6 transitions of 15 frames each that overlap adjacent sequences, the effective video duration equals the sum of all sequence durations (transitions share frames). Sum = 180+300+300+300+300+300+120 = **1800 frames = 60s @ 30fps**, which is what the composition registers in the next task.

- [ ] **Step 2: Typecheck + lint**

Run: `npm run lint`
Expected: pass. If `@remotion/transitions` sub-module imports fail with "Cannot find module", verify the installed version matches Remotion core (4.0.448) — this should be ensured by Task 1.

- [ ] **Step 3: Commit**

```bash
git add src/Demo.tsx
git commit -m "feat: wire beats into TransitionSeries"
```

---

### Task 20: Register composition + load fonts; remove scaffold

**Files:**
- Modify: `src/Root.tsx`
- Delete: `src/Composition.tsx`

- [ ] **Step 1: Overwrite `src/Root.tsx`**

```tsx
import "./index.css";
import { loadFont as loadGeist } from "@remotion/google-fonts/Geist";
import { loadFont as loadGeistMono } from "@remotion/google-fonts/GeistMono";
import { Composition } from "remotion";
import { Demo, TOTAL_DURATION } from "./Demo";

loadGeist();
loadGeistMono();

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
      />
    </>
  );
};
```

- [ ] **Step 2: Delete the old scaffold component**

Run:
```bash
rm src/Composition.tsx
```

- [ ] **Step 3: Typecheck + lint**

Run: `npm run lint`
Expected: pass. If it flags `loadFont` import paths, double-check `@remotion/google-fonts` version — sub-path imports like `@remotion/google-fonts/Geist` are the documented API.

- [ ] **Step 4: Commit**

```bash
git add src/Root.tsx src/Composition.tsx
git commit -m "feat: register HASpoolManagerDemo composition and load Geist fonts"
```

---

### Task 21: Final verification — Studio, stills, full render

**Files:** none changed.

- [ ] **Step 1: Launch Studio and scrub the timeline**

Run (in a separate terminal, will keep running):
```bash
npx remotion studio
```

In the browser that opens, select `HASpoolManagerDemo` and scrub from frame 0 to 1800. Check for:
- No console errors.
- Each beat renders and transitions land cleanly.
- Text is readable; fonts loaded (Geist, not a fallback).
- Charts animate; numbers count up; grid fills.

Then close the Studio.

- [ ] **Step 2: One-frame stills at representative timestamps**

Run:
```bash
mkdir -p out/stills
npx remotion still HASpoolManagerDemo out/stills/beat1.png --scale=0.5 --frame=90
npx remotion still HASpoolManagerDemo out/stills/beat2.png --scale=0.5 --frame=360
npx remotion still HASpoolManagerDemo out/stills/beat3.png --scale=0.5 --frame=660
npx remotion still HASpoolManagerDemo out/stills/beat4.png --scale=0.5 --frame=960
npx remotion still HASpoolManagerDemo out/stills/beat5.png --scale=0.5 --frame=1260
npx remotion still HASpoolManagerDemo out/stills/beat6.png --scale=0.5 --frame=1560
npx remotion still HASpoolManagerDemo out/stills/beat7.png --scale=0.5 --frame=1740
```

Expected: 7 PNGs in `out/stills/`. Open each to confirm it looks right for the corresponding beat.

- [ ] **Step 3: Full render**

Run:
```bash
npx remotion render HASpoolManagerDemo out/haspoolmanager-demo.mp4 --codec=h264 --crf=20
```

Expected: `out/haspoolmanager-demo.mp4` exists, plays at 30fps, runs exactly 60s, file size reasonable (target ≤ 20 MB). If larger, bump `--crf` up toward 24 and re-render.

- [ ] **Step 4: Add `out/` to `.gitignore` (renders should not be tracked)**

Append `out/` to `.gitignore`:

```bash
grep -qxF 'out/' .gitignore || echo 'out/' >> .gitignore
```

- [ ] **Step 5: Commit**

```bash
git add .gitignore
git commit -m "chore: ignore render output directory"
```

---

## Done

You now have a 60s HASpoolManager demo video at `out/haspoolmanager-demo.mp4`. Hand it to the user for visual review; if they want tweaks (timings, colors, copy), they'll adjust the relevant beat file and re-render Task 21 Step 3.
