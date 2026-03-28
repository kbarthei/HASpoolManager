# Frontend Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the 4 core pages (Dashboard, Spools, AMS, Storage) with Apple Health-inspired design, light+dark theme, teal accent, dense layout.

**Architecture:** Next.js 16 Server Components for pages + React Query for live AMS/dashboard refresh. shadcn/ui for primitives. Apple system colors via CSS custom properties. No client state libraries.

**Tech Stack:** Next.js 16, shadcn/ui, Tailwind CSS v4, @tanstack/react-query, Geist fonts, Lucide icons

---

### Task 1: Theme System — Apple System Colors + Light/Dark Toggle

**Files:**
- Modify: `app/globals.css`
- Modify: `app/layout.tsx`
- Create: `components/layout/theme-provider.tsx`
- Create: `lib/theme.ts`

- [ ] **Step 1: Install next-themes for theme switching**

```bash
npm install next-themes
```

- [ ] **Step 2: Create theme utility**

Create `lib/theme.ts`:
```typescript
export function getStockLevelColor(percent: number): string {
  if (percent <= 0) return "text-gray-400 line-through";
  if (percent < 10) return "text-red-500";
  if (percent < 30) return "text-amber-500";
  return "text-emerald-500";
}

export function getStockLevelBg(percent: number): string {
  if (percent <= 0) return "bg-gray-400";
  if (percent < 10) return "bg-red-500";
  if (percent < 30) return "bg-amber-500";
  return "bg-emerald-500";
}

export function getMaterialColor(material: string): string {
  const map: Record<string, string> = {
    PLA: "bg-teal-500/15 text-teal-700 dark:text-teal-400",
    PETG: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
    ABS: "bg-red-500/15 text-red-700 dark:text-red-400",
    "ABS-GF": "bg-orange-500/15 text-orange-700 dark:text-orange-400",
    "TPU-90A": "bg-purple-500/15 text-purple-700 dark:text-purple-400",
    TPU: "bg-purple-500/15 text-purple-700 dark:text-purple-400",
  };
  return map[material] || "bg-gray-500/15 text-gray-700 dark:text-gray-400";
}

/** Returns true if hex color is too dark and needs a visibility ring */
export function needsRing(hex: string): boolean {
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance < 0.15 || luminance > 0.9;
}
```

- [ ] **Step 3: Replace globals.css with Apple system colors**

Replace `app/globals.css` with CSS custom properties for light/dark modes. Use shadcn's CSS variable system but with Apple system color values. Set teal as the primary/accent color. Set dense spacing defaults.

Key variables to set:
- `--background`: `#F2F2F7` light / `#000000` dark
- `--card`: `#FFFFFF` light / `#1C1C1E` dark
- `--primary`: `#30B0C7` light / `#40C8E0` dark (teal)
- `--muted`: `#F2F2F7` light / `#2C2C2E` dark
- `--border`: `#C6C6C8` light / `#38383A` dark
- `--radius`: `0.75rem` (12px)

- [ ] **Step 4: Create ThemeProvider component**

Create `components/layout/theme-provider.tsx`:
```typescript
"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  );
}
```

- [ ] **Step 5: Update root layout**

Modify `app/layout.tsx`:
- Remove hardcoded `dark` class from `<html>`
- Wrap `{children}` in `<ThemeProvider>`
- Keep `suppressHydrationWarning` on `<html>` for next-themes

- [ ] **Step 6: Verify theme switching works**

```bash
npm run dev
```
Open browser, toggle system dark mode — app should switch between light and dark. Verify background colors change.

- [ ] **Step 7: Commit**

```bash
git add app/globals.css app/layout.tsx components/layout/theme-provider.tsx lib/theme.ts package.json package-lock.json
git commit -m "feat: Apple system color theme with light/dark toggle"
```

---

### Task 2: Install shadcn/ui Components + React Query

**Files:**
- Modify: `package.json`
- Create: multiple files in `components/ui/`
- Create: `components/providers.tsx`

- [ ] **Step 1: Install shadcn/ui components**

```bash
npx shadcn@latest add card badge table tabs sheet command progress tooltip dropdown-menu select input label dialog sonner separator --yes
```

- [ ] **Step 2: Install React Query**

```bash
npm install @tanstack/react-query
```

- [ ] **Step 3: Create providers wrapper**

Create `components/providers.tsx`:
```typescript
"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { ThemeProvider } from "@/components/layout/theme-provider";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 30 * 1000, refetchOnWindowFocus: false },
        },
      })
  );

  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </ThemeProvider>
  );
}
```

- [ ] **Step 4: Update root layout to use Providers**

Modify `app/layout.tsx`: replace `<ThemeProvider>` with `<Providers>` wrapper.

- [ ] **Step 5: Build and verify**

```bash
npm run build
```

- [ ] **Step 6: Commit**

```bash
git add components/ app/layout.tsx package.json package-lock.json
git commit -m "feat: install shadcn components and React Query"
```

---

### Task 3: Navigation — Top Tabs + Bottom Nav

**Files:**
- Create: `components/layout/top-tabs.tsx`
- Create: `components/layout/bottom-nav.tsx`
- Modify: `app/(app)/layout.tsx`

- [ ] **Step 1: Create top tabs component**

Create `components/layout/top-tabs.tsx` — a client component (`"use client"`) that:
- Uses `usePathname()` from `next/navigation` to detect active tab
- Renders horizontal nav with: app title (left), 4 tab links (Dashboard `/`, Spools `/spools`, AMS `/ams`, Storage `/storage`), search placeholder (right)
- Active tab has teal bottom border (`border-b-2 border-primary`) + primary text
- Inactive tabs use secondary text color
- Hidden on mobile (`hidden md:flex`)
- Height: 48px, background: card color, bottom border

- [ ] **Step 2: Create bottom nav component**

Create `components/layout/bottom-nav.tsx` — a client component that:
- Same `usePathname()` logic for active detection
- 4 icons + labels: LayoutDashboard, Circle (spools), Cpu (AMS), Grid3X3 (storage) from lucide-react
- Active: teal icon + label. Inactive: gray icon only
- Fixed bottom, 56px height, `pb-[env(safe-area-inset-bottom)]`
- Visible only on mobile (`md:hidden`)
- Background: card color, top border

- [ ] **Step 3: Update app layout**

Modify `app/(app)/layout.tsx`:
- Import and render `<TopTabs />` and `<BottomNav />`
- Remove the existing placeholder sidebar and bottom nav
- Main content area: `<main className="flex-1 overflow-auto p-3 md:p-4">`
- Structure: TopTabs (top) → main content → BottomNav (bottom, mobile only)

- [ ] **Step 4: Verify navigation works**

```bash
npm run dev
```
Check: tabs render, active state highlights on correct page, mobile bottom nav shows, desktop top tabs show. Click between tabs.

- [ ] **Step 5: Commit**

```bash
git add components/layout/ app/\(app\)/layout.tsx
git commit -m "feat: top tab bar + mobile bottom nav"
```

---

### Task 4: Shared Spool Components

**Files:**
- Create: `components/spool/spool-color-dot.tsx`
- Create: `components/spool/spool-progress-bar.tsx`
- Create: `components/spool/spool-material-badge.tsx`
- Create: `components/shared/empty-state.tsx`

- [ ] **Step 1: Create SpoolColorDot**

Create `components/spool/spool-color-dot.tsx` — renders a colored circle:
- Props: `hex: string`, `size?: "sm" | "md" | "lg"` (default "md")
- Sizes: sm=16px, md=20px, lg=80px
- Background color set via inline style `backgroundColor: #${hex}`
- Ring for visibility: call `needsRing(hex)` from `lib/theme.ts`, if true add `ring-1 ring-gray-400 dark:ring-gray-600`
- Rounded full, flex-shrink-0

- [ ] **Step 2: Create SpoolProgressBar**

Create `components/spool/spool-progress-bar.tsx`:
- Props: `remaining: number`, `initial: number`
- Calculate percent: `Math.round((remaining / initial) * 100)`
- Use shadcn `<Progress>` component with custom indicator color via `getStockLevelBg(percent)` from `lib/theme.ts`
- Height: 4px, border-radius full

- [ ] **Step 3: Create SpoolMaterialBadge**

Create `components/spool/spool-material-badge.tsx`:
- Props: `material: string`
- Uses shadcn `<Badge variant="secondary">` with custom className from `getMaterialColor(material)`
- Text: material name (e.g., "PLA", "PETG")
- Dense: text-xs, px-1.5, py-0

- [ ] **Step 4: Create EmptyState**

Create `components/shared/empty-state.tsx`:
- Props: `icon?: LucideIcon`, `title: string`, `description?: string`, `action?: ReactNode`
- Centered layout with icon (48px, muted color), title, description, optional action button

- [ ] **Step 5: Build and verify components compile**

```bash
npm run build
```

- [ ] **Step 6: Commit**

```bash
git add components/spool/ components/shared/
git commit -m "feat: shared spool components (color dot, progress, badge)"
```

---

### Task 5: Dashboard Page

**Files:**
- Create: `components/dashboard/stat-card.tsx`
- Create: `components/dashboard/ams-mini-view.tsx`
- Create: `components/dashboard/low-stock-list.tsx`
- Create: `components/dashboard/recent-prints.tsx`
- Modify: `app/(app)/page.tsx`
- Create: `lib/queries.ts`

- [ ] **Step 1: Create data query helpers**

Create `lib/queries.ts` with async functions that query the DB directly (Server Component compatible):
- `getDashboardStats()` — returns `{ activeSpools, totalValue, monthPrints, monthCost, monthWeight, lowStockCount }`
- `getAmsSlots(printerId)` — returns AMS slots with spool + filament + vendor relations
- `getLowStockSpools(threshold)` — returns spools below threshold % with filament + vendor
- `getRecentPrints(limit)` — returns last N prints with usage + spool relations

Each function uses `db.query` or `db.select` with the appropriate joins and aggregations.

- [ ] **Step 2: Create StatCard component**

Create `components/dashboard/stat-card.tsx`:
- Props: `label: string`, `value: string | number`, `valueClassName?: string`
- shadcn `<Card>` with compact padding (p-3)
- Value in Geist Mono, large (text-2xl font-bold)
- Label below in text-xs text-muted-foreground
- Apple-style card (rounded-xl, shadow-sm in light mode)

- [ ] **Step 3: Create AMS mini view**

Create `components/dashboard/ams-mini-view.tsx`:
- Props: `slots: AmsSlotWithSpool[]`
- List of loaded slots: SpoolColorDot (10px) + filament name + tiny progress bar (30px) + percentage
- Uses Link to `/ams`
- Compact: gap-1, text-xs

- [ ] **Step 4: Create Low Stock list**

Create `components/dashboard/low-stock-list.tsx`:
- Props: `spools: SpoolWithFilament[]`
- List: SpoolColorDot + filament name + remaining weight in amber/red
- Each item links to `/spools/[id]`
- Compact: gap-1, text-xs

- [ ] **Step 5: Create Recent Prints component**

Create `components/dashboard/recent-prints.tsx`:
- Props: `prints: PrintWithUsage[]`
- Compact list: status icon (✓ green / ✗ red), print name, weight + cost
- Failed prints: text-muted-foreground, line-through on cost
- text-xs throughout

- [ ] **Step 6: Build dashboard page**

Modify `app/(app)/page.tsx`:
- Server Component (no "use client")
- Call query functions from `lib/queries.ts`
- Get printer ID from first printer in DB
- Layout: stats grid (4 cols desktop, 2 cols mobile) → two-column (AMS mini + low stock) → recent prints
- All sections wrapped in Cards

- [ ] **Step 7: Verify with dev server**

```bash
npm run dev
```
Open `/` — should show dashboard with real seed data: 30 spools, 47 prints, AMS slots with filament data.

- [ ] **Step 8: Commit**

```bash
git add components/dashboard/ app/\(app\)/page.tsx lib/queries.ts
git commit -m "feat: dashboard page with stats, AMS mini, alerts, recent prints"
```

---

### Task 6: Spools Inventory Page — Grid + List Views

**Files:**
- Create: `components/spool/spool-card.tsx`
- Create: `components/spool/spool-filters.tsx`
- Create: `components/shared/view-toggle.tsx`
- Modify: `app/(app)/spools/page.tsx`

- [ ] **Step 1: Create ViewToggle component**

Create `components/shared/view-toggle.tsx` — client component:
- Props: `view: "grid" | "list"`, `onChange: (view) => void`
- Two icon buttons: Grid2X2 and List from lucide-react
- Active button uses primary/teal background
- Uses `useRouter` + `useSearchParams` to persist view in URL

- [ ] **Step 2: Create SpoolFilters component**

Create `components/spool/spool-filters.tsx` — client component:
- Props: `materials: string[]`, `vendors: string[]` (available options)
- Search input + Material select + Vendor select + Status select
- Uses `useRouter` + `useSearchParams` to push filter changes to URL
- Compact: all in one row on desktop, wraps on mobile

- [ ] **Step 3: Create SpoolCard component**

Create `components/spool/spool-card.tsx`:
- Props: spool with filament + vendor relations
- Card layout: SpoolColorDot + SpoolMaterialBadge (top row), filament name + vendor, SpoolProgressBar, remaining/initial weight (Geist Mono), location tag, price
- Links to `/spools/[id]`
- Apple-style card with hover state

- [ ] **Step 4: Build spools page**

Create `app/(app)/spools/page.tsx`:
- Server Component, reads `searchParams` (async in Next.js 16)
- Queries spools with filters from URL params (material, vendor, status, search)
- Passes data to client wrapper that handles view toggle
- Grid view: responsive grid of SpoolCards
- List view: shadcn Table with sortable columns (Color dot, Name, Material, Vendor, Remaining bar + grams, Location, Price)
- "+ Add Spool" button in header (links to future add page, placeholder for now)

- [ ] **Step 5: Verify with dev server**

```bash
npm run dev
```
Open `/spools` — should show all 30 spools. Test: switch grid/list, filter by material, search by name.

- [ ] **Step 6: Commit**

```bash
git add components/spool/ components/shared/ app/\(app\)/spools/
git commit -m "feat: spool inventory with grid/list toggle and filters"
```

---

### Task 7: Spool Detail Page

**Files:**
- Create: `app/(app)/spools/[id]/page.tsx`
- Create: `components/spool/spool-detail-sheet.tsx`

- [ ] **Step 1: Build spool detail page**

Create `app/(app)/spools/[id]/page.tsx`:
- Server Component, async params (Next.js 16)
- Query spool by ID with: filament (+ vendor), tagMappings, printUsage (+ print)
- Hero section: large SpoolColorDot (80px) + filament name, vendor, material badge, color hex
- Stats row (3 cards): Remaining weight (with progress bar), Total used (initial - remaining), Cost per gram
- Location card: current location, RFID tag UID if present
- Usage history: table of prints (date, print name, weight used, cost) — sorted by date desc
- 404 page if spool not found

- [ ] **Step 2: Create spool detail sheet**

Create `components/spool/spool-detail-sheet.tsx` — client component:
- Props: `spoolId: string`, `open: boolean`, `onClose: () => void`
- Uses shadcn Sheet (side="right" on desktop via media query, side="bottom" on mobile)
- Fetches spool data via React Query when opened
- Same layout as detail page but in a sheet (no hero, more compact)
- Used by AMS page and Storage page when clicking a spool

- [ ] **Step 3: Verify**

```bash
npm run dev
```
Navigate to `/spools`, click a spool → detail page shows. Check usage history table.

- [ ] **Step 4: Commit**

```bash
git add app/\(app\)/spools/\[id\]/ components/spool/spool-detail-sheet.tsx
git commit -m "feat: spool detail page and reusable detail sheet"
```

---

### Task 8: AMS Status Page

**Files:**
- Create: `components/ams/ams-slot-card.tsx`
- Create: `components/ams/ams-section.tsx`
- Create: `components/spool/spool-picker.tsx`
- Create: `app/(app)/ams/page.tsx`
- Create: `app/(app)/ams/ams-client.tsx`
- Create: `lib/actions.ts`

- [ ] **Step 1: Create Server Actions for spool operations**

Create `lib/actions.ts`:
- `loadSpoolToSlot(slotId: string, spoolId: string)` — updates ams_slots.spool_id, sets spool.location to "ams"/"ams-ht"/"external" based on slot_type
- `unloadSlotSpool(slotId: string)` — sets ams_slots.spool_id to null, sets spool.location back to "storage"
- Each action uses `"use server"` directive, revalidates the AMS page path

- [ ] **Step 2: Create AmsSlotCard component**

Create `components/ams/ams-slot-card.tsx`:
- Props: slot with spool + filament + vendor relations, `onClickSpool`, `onClickLoad`, `onClickUnload`
- Horizontal card: left border accent in filament color, SpoolColorDot (24px), filament name + vendor, "Slot N" label, progress bar (40px) + percentage
- Empty state: dashed border, "Empty" text, "+ Load" button
- Client component (needs onClick handlers)

- [ ] **Step 3: Create AmsSection component**

Create `components/ams/ams-section.tsx`:
- Props: `label: string` (e.g., "AMS · 4 Slots"), `slots: SlotData[]`, event handlers
- Label header + list of AmsSlotCard components
- Compact gap (gap-1.5)

- [ ] **Step 4: Create SpoolPicker component**

Create `components/spool/spool-picker.tsx` — client component:
- Props: `open: boolean`, `onSelect: (spoolId: string) => void`, `onClose: () => void`
- Uses shadcn Command (Command + CommandInput + CommandList + CommandItem) inside a Dialog
- Fetches available spools (status=active, not in AMS) via fetch call
- Shows: SpoolColorDot + filament name + material + remaining weight
- Searchable by name/material/vendor

- [ ] **Step 5: Create AMS client wrapper**

Create `app/(app)/ams/ams-client.tsx` — client component:
- Props: `initialSlots`, `printerId`
- Uses React Query to poll AMS slots every 30s (`refetchInterval: 30000`)
- Manages sheet state (which spool detail is open)
- Manages spool picker state (which slot is being loaded)
- Calls server actions for load/unload
- Renders AmsSection components for each slot type (ams, ams_ht, external)

- [ ] **Step 6: Build AMS page**

Create `app/(app)/ams/page.tsx`:
- Server Component
- Query printer + AMS slots with relations
- Pass to `<AmsClient initialSlots={slots} printerId={printer.id} />`
- Import SpoolDetailSheet for viewing spool details

- [ ] **Step 7: Verify**

```bash
npm run dev
```
Open `/ams` — should show 6 slots (4 AMS loaded, AMS HT empty, External empty). Click spool → detail sheet opens. Click "Load" on empty → picker opens.

- [ ] **Step 8: Commit**

```bash
git add components/ams/ components/spool/spool-picker.tsx app/\(app\)/ams/ lib/actions.ts
git commit -m "feat: AMS status page with live refresh and spool picker"
```

---

### Task 9: Storage Rack Page

**Files:**
- Create: `components/storage/storage-grid.tsx`
- Create: `components/storage/storage-cell.tsx`
- Create: `app/(app)/storage/page.tsx`
- Create: `app/(app)/storage/storage-client.tsx`
- Modify: `lib/actions.ts`

- [ ] **Step 1: Add storage server actions**

Add to `lib/actions.ts`:
- `assignSpoolToRack(spoolId: string, row: number, col: number)` — sets spool.location to `rack:${row}-${col}`
- `removeSpoolFromRack(spoolId: string)` — sets spool.location to `storage`
- Revalidate storage page path

- [ ] **Step 2: Create StorageCell component**

Create `components/storage/storage-cell.tsx` — client component:
- Props: `spool?: SpoolWithFilament | null`, `row: number`, `col: number`, `onClick: () => void`
- Occupied: card background, SpoolColorDot (20px), material abbreviation (2 lines, text-[7px]), stock dot (top-right, 6px)
- Empty: dashed border, "+" icon centered
- Aspect ratio 1:1, cursor-pointer, hover state

- [ ] **Step 3: Create StorageGrid component**

Create `components/storage/storage-grid.tsx` — client component:
- Props: `spools: SpoolWithFilament[]`, `rows: number`, `cols: number`, event handlers
- Build a `Map<string, Spool>` from spools where location matches `rack:{row}-{col}`
- Render CSS grid: `grid-template-columns: 32px repeat(cols, 1fr)`
- Row headers (R1, R2...) on left, column headers (S1, S2...) on top
- Render StorageCell for each position
- Mobile: `overflow-x-auto` with `min-w-[48px]` per cell

- [ ] **Step 4: Create storage client wrapper**

Create `app/(app)/storage/storage-client.tsx` — client component:
- Props: `initialSpools`, `rows`, `cols`
- Manages: SpoolDetailSheet (click occupied cell), SpoolPicker (click empty cell)
- On spool picker select: call `assignSpoolToRack` server action
- On detail sheet: show spool info, "Remove from rack" action

- [ ] **Step 5: Build storage page**

Create `app/(app)/storage/page.tsx`:
- Server Component
- Query all spools with location starting with `rack:` OR `storage` (unassigned)
- Default rack dimensions: 4 rows × 8 columns (hardcoded for now, settings page later)
- Pass to `<StorageClient>`

- [ ] **Step 6: Update seed data locations to rack format**

Update the existing spools in DB: change `location: "storage"` to `rack:1-1`, `rack:1-2`, etc. for the 26 storage spools. Use a quick script:

```bash
npx tsx -e "
// Quick script to assign rack positions to storage spools
import { config } from 'dotenv';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { eq } from 'drizzle-orm';
import * as schema from './lib/db/schema';
config({ path: '.env.local' });
const sql = neon(process.env.DATABASE_URL!);
const db = drizzle(sql, { schema });

async function assignRackPositions() {
  const storageSpools = await db.query.spools.findMany({
    where: eq(schema.spools.location, 'storage'),
    with: { filament: true },
  });
  let row = 1, col = 1;
  for (const spool of storageSpools) {
    await db.update(schema.spools)
      .set({ location: \`rack:\${row}-\${col}\` })
      .where(eq(schema.spools.id, spool.id));
    col++;
    if (col > 8) { col = 1; row++; }
  }
  console.log(\`Assigned \${storageSpools.length} spools to rack positions\`);
}
assignRackPositions();
"
```

- [ ] **Step 7: Verify**

```bash
npm run dev
```
Open `/storage` — should show 4×8 grid with spools in their positions. Click occupied cell → detail sheet. Click empty cell → spool picker.

- [ ] **Step 8: Commit**

```bash
git add components/storage/ app/\(app\)/storage/ lib/actions.ts
git commit -m "feat: storage rack page with configurable grid"
```

---

### Task 10: Polish and Responsive Fixes

**Files:**
- Modify: various component files
- Modify: `app/(app)/layout.tsx`

- [ ] **Step 1: Test all pages on mobile viewport**

Open Chrome DevTools, test each page at 375px width (iPhone SE):
- Dashboard: stats 2×2 grid, sections stack
- Spools: cards 1-2 columns, filters wrap
- AMS: slot cards full width, sheet from bottom
- Storage: grid scrolls horizontally

Fix any overflow, touch target, or spacing issues found.

- [ ] **Step 2: Test dark mode on all pages**

Toggle system dark mode. Verify:
- All cards switch to dark surface
- Text colors adapt
- Teal accent visible in both modes
- Filament color dots have appropriate rings
- Progress bars readable

Fix any contrast or theme issues found.

- [ ] **Step 3: Add Sonner toast provider**

Add `<Toaster />` from sonner to `app/(app)/layout.tsx` for success/error notifications on actions (load spool, unload, assign to rack).

- [ ] **Step 4: Final build check**

```bash
npm run build
```
Ensure zero errors, all routes compile.

- [ ] **Step 5: Deploy to Vercel**

```bash
vercel --yes
```

- [ ] **Step 6: Commit and push**

```bash
git add .
git commit -m "feat: Phase 4 complete — responsive polish, dark mode, deploy"
git push
```

---

## File Summary

| Category | Files | Count |
|----------|-------|-------|
| Theme | `globals.css`, `theme-provider.tsx`, `lib/theme.ts`, `providers.tsx` | 4 |
| Navigation | `top-tabs.tsx`, `bottom-nav.tsx` | 2 |
| Shared | `spool-color-dot.tsx`, `spool-progress-bar.tsx`, `spool-material-badge.tsx`, `empty-state.tsx`, `view-toggle.tsx` | 5 |
| Dashboard | `stat-card.tsx`, `ams-mini-view.tsx`, `low-stock-list.tsx`, `recent-prints.tsx`, `page.tsx`, `lib/queries.ts` | 6 |
| Spools | `spool-card.tsx`, `spool-filters.tsx`, `spool-detail-sheet.tsx`, `spool-picker.tsx`, `page.tsx`, `[id]/page.tsx` | 6 |
| AMS | `ams-slot-card.tsx`, `ams-section.tsx`, `ams-client.tsx`, `page.tsx` | 4 |
| Storage | `storage-grid.tsx`, `storage-cell.tsx`, `storage-client.tsx`, `page.tsx` | 4 |
| Actions | `lib/actions.ts` | 1 |
| **Total** | | **32** |

## Spec Coverage Check

| Spec Requirement | Task |
|-----------------|------|
| Apple system colors light+dark | Task 1 |
| Teal accent | Task 1 |
| Dense layout | Task 1 (CSS), all components |
| Top tab nav (desktop) | Task 3 |
| Bottom tab nav (mobile) | Task 3 |
| Dashboard stats row | Task 5 |
| Dashboard AMS mini | Task 5 |
| Dashboard low stock | Task 5 |
| Dashboard recent prints | Task 5 |
| Spool inventory grid view | Task 6 |
| Spool inventory list view | Task 6 |
| Grid/List toggle | Task 6 |
| Spool filters (URL params) | Task 6 |
| Spool detail page | Task 7 |
| Spool detail sheet (reusable) | Task 7 |
| AMS slot list cards | Task 8 |
| AMS sections (AMS/HT/External) | Task 8 |
| AMS live refresh (React Query) | Task 8 |
| Spool picker (load into AMS) | Task 8 |
| Storage rack grid (4×8) | Task 9 |
| Storage cell interactions | Task 9 |
| Rack position format (rack:R-C) | Task 9 |
| Mobile responsive | Task 10 |
| Dark mode verification | Task 10 |
| Deploy to Vercel | Task 10 |
