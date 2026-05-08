# User Guide

Day-to-day workflows with HASpoolManager. If you've just installed the
addon, start with [`installation.md`](installation.md); if you want to
understand how things work under the hood, jump to
[`../architecture/overview.md`](../architecture/overview.md).

The **Dashboard** is the daily landing page — printer status, monthly
spend, prints, low-stock alerts, recent prints, and analytics charts
all on one screen:

![Dashboard](../../screenshots/light/desktop/01-dashboard.png)

The printer hero (top of the dashboard) shows live AMS slot state at
a glance — material per slot, remaining %, idle vs. printing badge:

![Printer hero](../../screenshots/light/desktop/sections/01-dashboard--printer-live.png)

---

## 1. The location system

Every spool is in exactly one place. The locations form a lifecycle:

```
Purchased → Rack → AMS → Workbench → Rack → … → Empty → Archive
                ↓↑
            Surplus (overflow when rack is full)
```

| Location | Meaning |
|---|---|
| `ordered` | Purchased, not yet received |
| `rack:<id>:R-C` | Slotted into a physical rack position (row R, column C of rack `<id>`) |
| `ams` | Loaded in the main AMS unit |
| `ams-ht` | Loaded in the AMS HT |
| `external` | On the external spool holder |
| `surplus` | Overflow storage (when the rack is full) |
| `workbench` | Temporarily out of rack — actively in use or being prepped |
| `storage` | Sentinel for "needs a home" (auto-moves to workbench on next page load) |
| `archive` | Empty / returned / permanently retired |

The **Inventory** page is the cockpit: AMS section on top, rack grid(s)
below, then Workbench + Surplus as flat lists.

![Inventory](../../screenshots/light/desktop/02-inventory.png)

The AMS section close-up — Bambu H2S with its 4-slot AMS plus the AMS HT
external spool, each tile showing material, vendor, and remaining %:

![AMS section](../../screenshots/light/desktop/sections/02-inventory--ams-section.png)

---

## 2. Buying filament → receiving an order

### A. Place the order

Three paths in the app:

1. **`/orders` → "+ New Order"** — pick shop, add line-items (filament
   + quantity), save. Status starts at `ordered`.
2. **Paste email** — `/orders` → "Paste Email" bubble. Drop a plaintext
   or HTML order confirmation, Claude parses vendor + items + prices if
   `ANTHROPIC_API_KEY` is configured.
3. **CSV import** — `/admin` → "Import Orders" card. Batch import from
   a CSV matching the template.

A placeholder `spool` row gets created for every item, `location: "ordered"`.

![Orders](../../screenshots/light/desktop/07-orders.png)

### B. Receive the order

When the package arrives, `/orders` → the order → **Receive** button
opens the Receive Wizard:

1. One spool at a time
2. Pick a rack slot (or multiple racks if you have more than one
   configured) — or click **Store in Surplus**
3. Repeat until every spool has a home

Under the hood: each placement sets `spools.location` to the chosen
value and bumps the printer's cost ledger.

### C. Edge cases

- **Rack full?** → Surplus fits unlimited spools
- **Wrong vendor/name?** → Edit the spool after receiving (Inventory →
  click spool → edit)
- **Missing items?** → Still mark received; the missing spool rows stay
  at `ordered` and show as "awaiting"

---

## 3. Printing — what happens automatically

When the printer starts a job, the sync worker writes to DB **without
any manual action from you**:

1. **Print starts** — `prints` row created with `status = "running"`,
   the current AMS slot contents captured as `remain_snapshot`. Energy
   meter (kWh) is read for later cost computation.
2. **Cover image captured** — Bambu's slicer preview lands on the
   `cover_image` HA entity 30 s–15 min after the start event; the sync
   worker watches for that `state_changed` and saves it to
   `/config/haspoolmanager/photos/<printId>/cover.jpg`. Race-resistant
   and idempotent (re-firing the manual capture replaces, the auto
   path is append-skip).
3. **Active spool identified** — via RFID tag on the AMS tray, or
   Bambu filament-idx + slot memory, or color/material fuzzy match.
   Every spool seen during the print accumulates in `activeSpoolIds`.
4. **Watchdog poll** — every 30 s the worker pulls fresh
   `print_progress` and `print_remaining_time` from HA so the dashboard
   never goes stale (Bambu's HA integration reports remaining time in
   hours with minute-precision; we convert at the UI boundary).
5. **Mid-print swap detected** — if the AMS slot's last-observed
   bambu-color changes by more than the ΔE threshold OR an RFID-runout
   event fires, the swap is recorded and the old spool moves to
   workbench. Non-RFID color drift (where the user-entered filament
   colour diverges from Bambu's camera reading) no longer spawns
   duplicate drafts thanks to the identity-dedup guard in
   `autoCreateDraftSpool`.
6. **Print finishes** — final weight deducted from the spool's
   `remainingWeight`. Multi-spool prints distribute weight by AMS
   remain-delta or 3MF per-tray weights when available. A camera
   snapshot is saved alongside the cover image.
7. **Cost computed** — filament cost (price-per-spool × grams used) +
   energy cost (kWh × price) → `prints.totalCost`.
8. **Sync log entry** — `sync_log` table records the event for the
   `/admin/diagnostics` dashboard.

**You do nothing.** The Inventory page auto-refreshes, the Prints page
shows the new record, the Dashboard widgets update.

![Prints](../../screenshots/light/desktop/05-prints.png)

### When things go wrong

- **Print shows "running" for too long** → `/admin/diagnostics` flags it
  as stuck after 24h; auto-closed on the next sync
- **Wrong spool attributed** → Prints detail → edit the active spool
  list
- **Weight doesn't match reality** → Spool detail → "Sync from RFID"
  (pulls AMS remain%) or manual override

---

## 4. Reorder alerts

The Supply Engine watches consumption and warns before you run out:

1. **Set rules** on `/orders` → Supply Rules card: "keep at least 2
   spools of PETG Bambu Black"
2. **Alerts appear** when a rule would be violated by projected
   consumption (EMA × days-until-empty + trend)
3. **Optimized Cart** groups suggested purchases by shop, respecting
   free-shipping thresholds and bulk discounts
4. **You confirm** — one click adds the suggested order to the
   shopping list, or jumps straight to the "+ New Order" dialog
   pre-populated

The engine **never places an order automatically**. You're always in
the loop.

![Supply Rules](../../screenshots/light/desktop/sections/07-orders--supply-rules.png)

---

## 5. Everyday management

### Browsing all spools

`/spools` shows the flat catalogue with material, vendor, color, and
status filters. The grid view is best for at-a-glance browsing; the
list view (toggle top-right) makes bulk-edit work easier.

![Spools list](../../screenshots/light/desktop/03-spools.png)

Each spool card surfaces the essential info at a glance — colour dot,
material badge, vendor + name, remaining %, location, price:

![Spool card](../../screenshots/light/desktop/sections/03-spools--spool-card.png)

### Adding a spool manually

Inventory → "+ Add Spool" → pick filament from dropdown (or create new
filament + vendor on the fly) → enter initial weight + optional lot
number + position.

### Adding many spools at once

Same dialog, Library tab — two extra fields:

- **Anzahl** (1–100): how many identical spools to create in one go
- **Lot-Nummer** (optional): a base string like `B2026Q2`

When count > 1, the lot-number gets a zero-padded sequence suffix:
`B2026Q2-001`, `B2026Q2-002`, … `B2026Q2-100`. When count = 1, the
lot-number is used as-is. Values are clamped: below 1 → 1, above 100
→ 100. All spools land in `location = workbench` with the chosen
initial weight; position them afterwards by drag-drop.

### Identifying a spool physically

Inventory → click any spool → opens the Spool Inspector with weight,
location, cost-per-gram, identification table, and print history.

![Spool Inspector](../../screenshots/light/desktop/04-spool-inspector.png)

### Moving spools

Drag-and-drop on the rack grid. Cross-rack drag works (if you have
multiple racks). Swap: drop on an occupied cell → the two spools
exchange positions.

### Archiving

Use up a spool → `remainingWeight = 0` → it auto-moves to Archive on
next sync. You can also manually archive a spool from its detail view.

### AMS rename + disable

`/admin` → AMS Units card. Rename an AMS unit (e.g. "AMS 1" → "AMS
Werkstatt"). Disable an unused AMS — its loaded spools move to storage
and stop syncing.

---

## 6. Diagnostics

`/admin/diagnostics` surfaces nine live health checks plus storage cleanup:

| Detector | Trigger |
|---|---|
| Spool drift | DB vs RFID remain differ by >10pp |
| Stale spools | Not used in 90+ days |
| Zero-active | Spool shows "active" but 0 g remaining |
| Stuck prints | `running` for >24h |
| No-weight | Finished print with 0 g recorded |
| No-usage | Finished print without a `print_usage` row |
| Stuck orders | `ordered` status for >30 days |
| Recent sync errors | Last N entries from `sync_log` with level `error` |
| Orphan photos | Files no print references, dead `photo_urls` entries, legacy `/config/snapshots/` dump — single "Cleanup now" button |

![Diagnostics](../../screenshots/light/desktop/11-admin-diagnostics.png)

Each card deep-links to the affected records with an `?issue=<id>`
query param and banner. Below that, the Health-Check section shows
per-rule results from the overnight `health-check.js` run.

For the gory details see
[`operations-runbook.md`](operations-runbook.md).

---

## 7. iOS home-screen PWA

Port 3001 has no HA-auth hop, so the PWA loads fast and works offline
for view-only actions. Add to home screen via Safari — see
[`ios-pwa-setup.md`](ios-pwa-setup.md).

An optional iOS Shortcut pre-fills NFC tag IDs into the `/scan` page so
you can tap a spool sticker and jump straight to its detail view.

---

## 8. Where to find everything in the UI

| I want to… | Go to |
|---|---|
| See what's in my printer right now | Inventory → AMS section |
| See what's on the rack | Inventory → rack grid(s) |
| Look up a specific spool | Spools → filter/search |
| See recent prints | Prints (or Dashboard "Recent Prints") |
| Track costs | Dashboard, or Prints (each row) |
| Manage orders | Orders |
| Check reorder alerts | Orders → Supply Alerts card, or Dashboard widget |
| Investigate data weirdness | Admin → Diagnostics |
| Change AMS unit names | Admin → AMS Units card |
| Add / rename / archive a rack | Admin → Racks card |
| Configure energy tracking | Admin → Energy Tracking card |
| Manage shops + price lookup | Orders → Shop Configuration |
| Tweak supply rules | Orders → Supply Rules card |
| Set monthly budget | Orders → Monthly Budget card |
| Import orders from CSV/email | Admin → Import Orders, or Orders → Paste Email |
| Scan an NFC/RFID tag manually | Scan |
| Upload a 3MF for compatibility check | Models → drag-drop |

---

## 9. Models (3MF metadata)

The **Models** tab parses Bambu Studio / OrcaSlicer 3MF exports and tells you,
before you start a print, **which spools you have available** for it.

### Workflow

1. **Drag-drop** a `.3mf` onto the Models page (or click "Datei wählen").
2. The parser extracts cover image + filaments + plate-info. **No raw `.3mf` is stored** — only the cover PNG and metadata.
3. Open the model card. You see one row per filament needed, with a list of currently-active spools that match (RFID exact match preferred, otherwise material+color).
4. When the actual print starts, the sync worker auto-links the print row to the 3MF (token-overlap on `print_name` against cached filenames, with a "newest-recent-upload" fallback for unnamed prints). The link appears under "Drucke mit diesem Modell" on the model detail page.

### Navigating between prints and models

- **From a print to its model:** every print card in `/prints` shows a small `📁 Model` link when a 3MF is attached. The print title itself opens the print detail page, which shows the linked model with cover thumbnail.
- **From a model to its prints:** the model detail page lists every print that used this 3MF — click any row to jump to the print detail.
- **Wrong file linked?** Open the print detail page and click **Re-pull 3MF**. If the auto-match keeps picking wrong, expand "Override match" and paste the project filename you want to match against (token-overlap will then score it directly).

### What you get per format

3MFs come in three flavours; the format-badge on each card tells you which:

- **Full** (FW ≤ 01.10 Bambu Studio export): Cover + filaments + **Druckzeit + Gewicht + Kosten**. Best detail.
- **Material-Plan** (FW ≥ 02.06 default project export): Cover + filaments only. **No time / weight** — that data is in the embedded G-code, which Bambu Studio's modern default doesn't include.
- **Geometry-Only**: Raw mesh, no slicer info. "Bitte erst slicen" banner.

> To force Full mode in modern Bambu Studio: **File → Export → Export Sliced 3MF**. That includes G-code with `;TIME:` and `;Filament used (g):` headers. The default "Save Project" doesn't.

### Limits

- 150 MB per upload.
- Same file (sha256-identical) re-uploaded just returns the existing entry (deduped).
- **No archive of old uploads** — the original `.3mf` is your responsibility (Bambu Studio workspace, MakerWorld, Git, etc.).

### Auto-pull from printer (FTPS, optional)

The seamless path: enter your printer's **Access Code** once on `/admin`, then the addon fetches the 3MF directly from the printer's cache every time you click "Send to Printer" in Bambu Studio. Cover, filament list, and (for sliced exports) print-time + weight + cost appear automatically on the running print's row — no manual upload step.

**Setup (once):**

1. On the printer's touchscreen: **Settings → WLAN → Access Code** (8-digit number)
2. In the addon: **Admin → Bambu Access Code (3MF Auto-Pull)** card
3. Enter the code, click **Save**, then **Test connection** → green "✓ verbunden, N 3MF-Files"
4. Done — next print fires the auto-pull 30 seconds after start

**Important:** The access code does **not** disable Bambu Cloud, MakerWorld, or the mobile app. Those keep working. Only the separate "LAN Only Mode" toggle (which we don't touch) would do that.

**What happens under the hood:**

| When | What |
|---|---|
| Print starts | Sync-worker schedules a 30s-delayed FTP-pull |
| 30s later | List `cache/` (P1S/X1C/A1) **and** `/` root (H2S) on printer (FTPS port 990, user `bblp`, pass = access code) |
| | Token-overlap match `print_name` ↔ cached filenames |
| | If no token signal AND a `.3mf` was uploaded < 5 min ago → fall back to that file (Bambu Studio uploads right before "Print") |
| | Otherwise leave `prints.model_file_id` null — never link a wrong file |
| | Download into memory, parse, dedup by sha256, persist metadata + cover |
| | Link 3MF to the running print → app shows compatibility card |

If the access code is wrong, missing, or the printer is unreachable, the pull is silently skipped — your print isn't blocked, you just don't get the auto-link.

If the auto-pull picked a wrong file or didn't fire at all (e.g. the print started from the printer's LCD history, not from Studio), open the print detail page and click **Re-pull 3MF**.

**Debugging an unexpected miss:** every step of the pull is logged to
the **Sync Log** (Admin tab) with `transition = ftp-pull`. Filter on it
to see exactly which path fired (token-match, fallback, give-up) and
why — no need to read addon container logs.

### Local validation (no real printer needed)

To validate the FTP-pull code path on a Mac/Laptop without the printer in reach, the repo ships a mock Bambu printer that speaks the same FTPS protocol on a high port:

```bash
# Terminal 1: start the mock (uses tests/fixtures/3mf/ as cache contents)
npx tsx scripts/mock-bambu-printer.ts

# Terminal 2: probe + download via the addon's lib code
PRINTER_IP=127.0.0.1 PRINTER_PORT=9990 PRINTER_ACCESS_CODE=12345678 \
  npx tsx scripts/test-printer-ftp.ts
```

The mock uses a self-signed cert (just like real printers), implicit TLS, and the `bblp` username — same protocol surface. If the local round-trip is green, the addon will work against a real printer too.

---

## 9. Admin Operations

### SQL Query Runner

The admin panel includes a SQL Query Runner for ad-hoc database operations:

**Location:** Admin page → Operations section → SQL Query Runner card

**Read Mode (SELECT):**
1. Enter your SELECT query
2. Click "Run Query"
3. View results in formatted table
4. All queries logged to audit log

**Example queries:**
- `SELECT COUNT(*) FROM spools WHERE status = 'active'`
- `SELECT vendor, COUNT(*) as count FROM filaments f JOIN vendors v ON f.vendor_id = v.id GROUP BY vendor ORDER BY count DESC LIMIT 5`
- `SELECT name, status, started_at FROM prints WHERE status = 'running' ORDER BY started_at DESC LIMIT 10`

**Write Mode (INSERT/UPDATE/DELETE):**
1. Enter your SQL statement with `?` placeholders
2. Add parameters as JSON array (e.g., `["value1", "value2"]`)
3. Enable "Dry run" to preview changes without committing
4. Click "Preview Changes" or "Execute"
5. View operation summary (rows affected, execution time)

**Example operations:**
- `UPDATE spools SET notes = ? WHERE id = ?` with params `["Updated note", "spool-id-123"]`
- `INSERT INTO tags (uid, spool_id) VALUES (?, ?)` with params `["tag-uid", "spool-id"]`
- `DELETE FROM tags WHERE uid = ?` with params `["tag-uid-to-remove"]`

**Security:**
- All operations logged with user, IP, timestamp
- Parameter binding prevents SQL injection
- DDL operations (CREATE, DROP, ALTER) blocked
- Dry-run mode for safe testing
- Read mode uses readonly database connection

**Audit Trail:**
All SQL operations are visible in the Audit Logs tab with:
- SQL statement and parameters
- Execution time and row count
- Success/failure status
- User and IP address
- Timestamp


---

## 10. When something is wrong

- **Data looks weird?** → Diagnostics first, then
  [`operations-runbook.md`](operations-runbook.md)
- **Addon won't start / sync worker offline?** →
  [`troubleshooting.md`](troubleshooting.md)
- **Need to roll back a deploy?** →
  [`../development/release-process.md`](../development/release-process.md)
