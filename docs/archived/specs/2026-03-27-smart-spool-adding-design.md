# Smart Spool Adding — Design Spec

## Goal

Enable adding spools with minimal manual input. Paste an order email or product URL → app auto-fills everything → confirm → spools created. When the order arrives, guided placement into rack or surplus storage.

## Flows

### Flow 1: Add Order (Paste & Parse)

1. "+ Add Order" button (dashboard + orders page)
2. Full-screen dialog with large text area: "Paste order confirmation email, product URL, or product name"
3. App detects input type and parses:
   - **URL** → fetch page HTML, extract product data via AI
   - **Email text** → extract order data via AI (shop, order#, items, prices)
   - **Plain text** → fuzzy search existing filaments DB
4. Show parsed results as editable pre-filled order form:
   - Shop name + order number + date
   - Line items: vendor, filament name, material, color (dot), weight, qty, unit price
   - Each item matched against existing filaments (green checkmark = known, yellow = new)
5. User confirms → order created with status "ordered"
6. For each line item: if filament exists → reuse. If new → create vendor (if needed) + filament + spool(s)

### Flow 2: Order Received → Guided Placement

1. Orders page shows pending orders with "Received" button
2. Tap "Received" → guided spool-by-spool placement:
   - Shows: "Place **{filament name}** — Spool 1 of {qty}"
   - Shows rack grid with empty slots highlighted in teal
   - User taps empty slot → spool placed at `rack:R-C`
   - If rack full → "Store in Surplus" button → `location: surplus`
3. Repeat for each spool in the order
4. After all placed → order status = "delivered", toast confirmation

### Flow 3: Surplus Storage

- `location: surplus` — no grid position, just a list
- Shown on Storage page below the rack grid
- Section: "Surplus · {count} spools" with list cards (same style as AMS slots)
- When rack slot empties → optional suggestion: "Move {name} from surplus?"

## AI Parsing

### API Route: `POST /api/v1/orders/parse`

Input: `{ text: string }` — raw pasted content

Detection logic (no AI needed):
- Starts with `http` → treat as URL
- Contains `@` or `Order` or `Bestellung` → treat as email
- Otherwise → treat as product search

### URL Parsing

1. Fetch the URL via server-side fetch
2. Pass HTML (truncated to ~4000 chars of product-relevant content) to AI
3. AI returns structured data

### Email Parsing

1. Pass full email text to AI
2. AI returns structured order data

### AI Prompt (both cases)

System prompt for the AI:
```
Extract 3D printing filament order data from the following text.
Return JSON with this structure:
{
  "shop": "store name",
  "orderNumber": "order ID or null",
  "orderDate": "YYYY-MM-DD or null",
  "items": [{
    "name": "filament product name",
    "vendor": "manufacturer name (e.g., Bambu Lab, Polymaker)",
    "material": "PLA|PETG|ABS|ABS-GF|TPU|ASA|PC|PA",
    "colorName": "color name",
    "colorHex": "6-char hex without # or null",
    "weight": 1000,
    "quantity": 1,
    "price": 19.99,
    "currency": "EUR",
    "url": "product URL or null"
  }]
}
Only return valid JSON. If you can't extract a field, use null.
```

### Filament Matching

After AI extraction, match each item against existing filaments:
1. Exact match: vendor name + filament name → reuse filament
2. Fuzzy match: vendor name + material + color → suggest with confidence
3. No match → flag as "new filament" for user to confirm

## UI Components

### AddOrderDialog
- Triggered by "+ Add Order" button
- Step 1: Paste area (large textarea + "Parse" button)
- Step 2: Review parsed order (editable table of line items)
- Step 3: Confirm → creates order + filaments + spools

### OrderReceiveWizard
- Triggered by "Received" button on order card
- Step-by-step: one spool at a time
- Shows rack grid with interactive slot selection
- "Surplus" button as alternative
- Progress indicator: "Spool 2 of 4"

### SurplusSection (on Storage page)
- Below the rack grid
- List of surplus spools using existing list card style
- Each card clickable → spool detail sheet

## API Endpoints

### `POST /api/v1/orders/parse`
- Input: `{ text: string }`
- Output: `{ type: "url"|"email"|"search", parsed: { shop, orderNumber, items[] } }`
- Uses AI Gateway with Claude for extraction

### `POST /api/v1/orders/receive`
- Input: `{ orderId: string, placements: [{ orderItemId, spoolId, location }] }`
- Updates order status, creates spools, sets locations

## Dependencies

- `ai` + `@ai-sdk/gateway` — for AI text extraction (via Vercel AI Gateway)
- Existing orders/order_items schema — already in DB
- Existing rack grid — already built

## Not in Scope

- Email forwarding (paste only)
- Screenshot/image upload (text/URL only for v1)
- Auto-reorder suggestions
- Price tracking / price history
