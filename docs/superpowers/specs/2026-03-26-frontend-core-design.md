# Frontend Core Design — Phase 4

## Scope

Build the core frontend for HASpoolManager: 4 pages covering the daily workflow of managing 3D printing filament. Orders, analytics, and settings are deferred to Phase 5.

**Pages:** Dashboard, Spools, AMS, Storage

## Architecture

### Rendering Strategy
- **Server Components** for all pages (SSR, data fetched at request time)
- **React Query** (`@tanstack/react-query`) for client-side live refresh on:
  - AMS slot status (poll every 30s)
  - Dashboard stats and alerts (poll every 60s)
- **Server Actions** for mutations (move spool, update weight, etc.)
- No Zustand, no global client state — URL params for filters, server for data

### Tech Stack
- Next.js 16 App Router (already configured)
- shadcn/ui components (already initialized)
- Tailwind CSS v4 (already configured)
- Geist Sans + Geist Mono fonts (already configured)
- Dark mode primary (already set via `className="dark"` on `<html>`)

## Design System

### Colors
- Background: `zinc-950` (#09090b)
- Surface: `zinc-900` (#18181b) — cards, panels
- Surface elevated: `zinc-800` (#27272a) — hover, modals
- Border: `zinc-700/50`
- Text primary: `zinc-50`
- Text secondary: `zinc-400`
- Accent: `blue-500` — active tab, links, interactive

### Stock Level Indicators
- OK (>30%): `emerald-500` (#10b981)
- Warning (10-30%): `amber-500` (#f59e0b)
- Critical (<10%): `red-500` (#ef4444)
- Empty (0%): `zinc-600` with strikethrough

### Filament Color Display
- Filled circle with actual filament hex color
- Dark filaments (luminance < 0.15): 1px `zinc-600` ring for visibility
- Sizes: sm=16px, md=20px, lg=80px

### Material Badges
Muted tint backgrounds: PLA=`sky-900/40`, PETG=`emerald-900/40`, ABS=`rose-900/40`, ABS-GF=`orange-900/40`, TPU=`violet-900/40`

### Typography
- Geist Sans for UI text
- Geist Mono for numbers, weights, percentages, costs, IDs
- Touch targets: minimum 44×44px on mobile

### Breakpoints
- Mobile (<640px): single column, bottom nav
- Tablet (640-1024px): two columns, top tabs
- Desktop (>1024px): three+ columns, top tabs

## Navigation

### Desktop (≥768px)
Top tab bar with horizontal tabs:
- **HASpoolManager** (logo/title, left)
- **Dashboard** | **Spools** | **AMS** | **Storage** (center tabs)
- **⌘K** search trigger (right)

Active tab: `blue-500` bottom border + `zinc-50` text. Inactive: `zinc-400`.

### Mobile (<768px)
- Top bar: app title + search icon
- Bottom tab bar (4 tabs): Dashboard, Spools, AMS, Storage
- 56px height, safe-area-inset-bottom
- Active: `blue-500` icon + label. Inactive: `zinc-500` icon only.

### HA Integration Modes
- `?mode=panel`: full app, top tabs only (no sidebar), matches HA panel iframe
- `?mode=compact`: single column, no nav, shows AMS mini + low stock + recent prints

## Page Designs

### 1. Dashboard (`/`)

**Purpose:** At-a-glance health of inventory and printing activity.

**Layout (desktop, 3 sections stacked):**

**Row 1 — Stats bar (4 cards, equal width):**
- Active Spools (count)
- Printer Status (Idle/Printing, green/blue)
- Month Spend (EUR total)
- Low Stock (count, amber if >0)

Each stat: large number in Geist Mono, label below in `zinc-400`.

**Row 2 — Two columns:**
- Left: **AMS Status mini** — compact list of loaded slots (color dot + name + tiny progress bar + percentage). Click navigates to AMS page.
- Right: **Low Stock Alerts** — list of spools below 50% with color dot, name, remaining weight in amber/red. Click navigates to spool detail.

**Row 3 — Full width:**
- **Recent Prints** — table/list of last 5-10 prints. Columns: status icon (✓/✗), name, filament used, weight, cost, time ago. Failed prints dimmed with strikethrough.

**Mobile:** Stats become 2×2 grid, everything stacks vertically.

**Data source:** Server Component, fetches from DB at request time. React Query wraps the AMS mini view for 30s refresh.

### 2. Spools Inventory (`/spools`)

**Purpose:** Browse, search, filter, and manage all spools.

**Header bar:**
- Search input (left)
- Filter dropdowns: Material, Vendor, Location, Status
- Grid/List toggle (right)
- "+ Add Spool" button (right)

Filters persist in URL search params (`?material=PLA&vendor=bambu-lab&view=grid`).

**Grid View (default):**
Cards in responsive grid (4 cols desktop, 2 cols tablet, 1 col mobile).

Each `SpoolCard`:
- Color circle (20px) + material badge (top row)
- Filament name (bold) + vendor (zinc-400)
- Progress bar colored by stock level
- Remaining weight (Geist Mono) + "/ initial" in zinc-500
- Location tag (AMS Slot N / Storage R1-S3)
- Price per spool

**List View:**
Sortable data table (shadcn DataTable). Columns:
- Color (dot)
- Name
- Material
- Vendor
- Remaining (progress bar + grams)
- Location
- Last Used
- Price

Sort by any column. Default: name ascending.

**Spool Detail** (`/spools/[id]`):
- Hero: large color circle (80px) + filament name, vendor, material, color hex
- Stats row (3 cards): Remaining weight, Total used, Cost per gram
- Location card: current location (AMS/Storage with position), "Move" button
- Tag info: RFID tag UID if mapped
- Usage history: table of prints that used this spool (date, print name, weight, cost)
- Actions: Edit, Manual deduct, Mark empty, Archive, Delete

### 3. AMS Status (`/ams`)

**Purpose:** Live view of what's loaded in the printer.

**Layout:** Sections for each slot type, using list card style (Option C from brainstorming).

**Section: AMS (4 slots)**
Label: "AMS · 4 Slots"

Each slot as horizontal card:
- Color dot (24px) + left border accent in filament color
- Filament name + vendor
- "Slot N" label
- Progress bar (40px wide) + percentage (Geist Mono)
- Click → opens spool detail sheet (Sheet component, right side on desktop, bottom on mobile)

Empty slot: dashed border, "Empty" text, "+ Load" action button (opens spool picker).

**Section: AMS HT (1 slot)**
Same card style, labeled "AMS HT · 1 Slot".

**Section: External Spool Holder (1 slot)**
Same card style, labeled "External". No RFID capability noted. Manual assignment via spool picker.

**Interactions:**
- Click loaded slot → spool detail sheet
- Click "Load" on empty → spool picker (searchable Command component, lists storage spools)
- "Unload" action on loaded slot → moves spool back to storage (previous rack position if known, else unassigned)

**Live refresh:** React Query polls `/api/v1/printers/[id]` with AMS slot relations every 30s.

### 4. Storage Rack (`/storage`)

**Purpose:** Digital twin of the physical spool rack.

**Header:**
- Title: "Spool Rack" + dimensions label (e.g., "4 × 8")
- "Configure" link → settings (change rows × columns)

**Grid:**
Configurable grid (default 4 rows × 8 columns). Row headers (R1-R4) on left, column headers (S1-S8) on top.

Each cell (aspect-ratio: 1):
- **Occupied:** `zinc-900` background, filament color circle (20px), material abbreviation (2 lines, 7px), stock level dot (top-right corner, green/amber/red)
- **Empty:** dashed `zinc-700` border, "+" icon, click to assign spool

**Cell interactions:**
- Click occupied cell → spool detail sheet (same Sheet component as AMS page)
- Click empty cell → spool picker to assign
- Drag & drop between cells (desktop only, future enhancement)

**Mobile:** Grid scrolls horizontally if columns exceed viewport. Minimum cell size 48px.

**Schema addition needed:** The `spools.location` field currently stores text like "storage". For the rack digital twin, we need structured position data:

Option: Extend location to store `rack:R1-S3` format (simple, no schema change) — parse row/column from the string. This avoids a new table and keeps spool positions in one field.

Format: `rack:{row}-{col}` (e.g., `rack:1-3` = Row 1, Column 3). AMS spools keep `ams`, `ams-ht`, `external`. Unassigned storage spools have `storage`.

## Component Hierarchy

```
components/
  layout/
    top-tabs.tsx          # Desktop horizontal tab navigation
    bottom-nav.tsx        # Mobile bottom tab bar
    mode-detector.tsx     # Detects ?mode=panel|compact

  spool/
    spool-card.tsx        # Grid view card
    spool-list-item.tsx   # Table row (for DataTable)
    spool-color-dot.tsx   # Colored circle with luminance detection
    spool-progress-bar.tsx # Remaining % bar with stock level colors
    spool-material-badge.tsx # PLA/PETG/ABS badge
    spool-detail-sheet.tsx # Side/bottom sheet with full spool info
    spool-picker.tsx      # Searchable spool selector (Command)
    spool-filters.tsx     # Material/Vendor/Location/Status filters

  ams/
    ams-slot-card.tsx     # Horizontal list card for one slot
    ams-section.tsx       # Group of slots with label (AMS/HT/External)

  storage/
    storage-grid.tsx      # Configurable rack grid
    storage-cell.tsx      # Single rack cell (occupied/empty)

  dashboard/
    stat-card.tsx         # Large number + label
    ams-mini-view.tsx     # Compact AMS status for dashboard
    low-stock-list.tsx    # Low stock alert list
    recent-prints.tsx     # Recent prints table

  shared/
    search-input.tsx      # Global search (Cmd+K trigger)
    empty-state.tsx       # "No results" / "No spools" placeholder
    view-toggle.tsx       # Grid/List toggle button
```

## shadcn/ui Components to Install

```bash
npx shadcn@latest add card badge table tabs sheet command
npx shadcn@latest add progress tooltip dropdown-menu select
npx shadcn@latest add input label dialog sonner separator
```

## Data Flow

### Server Components (request-time)
- Dashboard stats: aggregate query on spools, prints
- Spool list: query with filters from URL params
- Spool detail: query by ID with relations
- Storage grid: query all spools with `location LIKE 'rack:%'`

### React Query (client-side polling)
- AMS status: `GET /api/v1/printers/[id]` with slots → 30s interval
- Dashboard AMS mini: same query, 60s interval

### Server Actions
- Move spool (change location)
- Assign spool to rack position
- Load spool into AMS slot
- Unload spool from AMS slot
- Quick deduct filament weight

## Mobile Considerations

- Bottom nav with 4 tabs (Dashboard, Spools, AMS, Storage)
- All sheets open from bottom (not right side)
- Storage grid: horizontal scroll for columns beyond viewport
- Spool cards: 1 column on small phones, 2 columns on larger phones
- Touch targets ≥ 44px everywhere
- No drag & drop on mobile (tap to assign instead)

## Performance

- Server Components for initial render (no client JS for static pages)
- React Query only where live refresh is needed (AMS, dashboard)
- Route-based code splitting (each page is its own chunk)
- Spool inventory with 30+ spools: virtualization not needed yet (< 100 items)
- Geist fonts loaded via `next/font` (already configured, no layout shift)

## Not in Scope (Phase 5+)

- Orders/procurement page
- Analytics page with charts
- Settings page
- PWA manifest + service worker
- Print history page
- HA panel/iframe modes
- Global search (Cmd+K)
- Drag & drop in storage grid
- Swipe gestures on mobile
