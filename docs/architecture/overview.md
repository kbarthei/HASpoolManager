# Architecture Overview

## System Design

HASpoolManager is a Next.js 16 application using the App Router with Server Components for data-heavy pages and React Query for live-updating views.

### Request Flow

```mermaid
sequenceDiagram
    participant User as Browser
    participant SC as Server Component
    participant API as API Route
    participant SA as Server Action
    participant DB as SQLite
    participant HA as Home Assistant

    Note over User,DB: Page Load (SSR)
    User->>SC: GET /spools
    SC->>DB: Drizzle query
    DB-->>SC: Spool data
    SC-->>User: Rendered HTML

    Note over User,DB: Mutation (Server Action)
    User->>SA: archiveSpool(id)
    SA->>DB: UPDATE spools SET status='archived'
    SA-->>User: revalidatePath('/spools')

    Note over HA,DB: Webhook Event
    HA->>API: POST /api/v1/events/print-started
    API->>DB: INSERT print record
    API-->>HA: { print_id, status: "created" }

    Note over User,DB: Live Refresh (React Query)
    User->>API: GET /api/v1/printers/:id (every 30s)
    API->>DB: Query AMS slots
    DB-->>API: Slot data
    API-->>User: JSON response
```

### Component Architecture

```mermaid
graph TD
    subgraph "App Shell"
        Layout["(app)/layout.tsx<br/>Providers, Theme"]
        TopTabs["TopTabs (desktop)"]
        BottomNav["BottomNav (mobile)"]
    end

    subgraph "Pages (Server Components)"
        Dashboard["/ Dashboard"]
        Spools["/spools Inventory"]
        SpoolDetail["/spools/[id] Detail"]
        AMS["/ams AMS Status"]
        Storage["/storage Rack Grid"]
        Orders["/orders Orders + Shopping"]
        Prints["/prints Print History"]
        History["/history Spool History"]
        Scan["/scan NFC Lookup"]
    end

    subgraph "Client Components"
        AmsClient["AmsClient<br/>React Query polling"]
        StorageClient["StorageClient<br/>Drag & drop, context menu"]
        OrdersClient["OrdersClient<br/>Shopping list, receive wizard"]
        SpoolsClient["SpoolsClient<br/>Grid/list toggle, filters"]
    end

    subgraph "Shared Components"
        SpoolColorDot["SpoolColorDot"]
        SpoolProgressBar["SpoolProgressBar"]
        SpoolMaterialBadge["SpoolMaterialBadge"]
        SpoolDetailSheet["SpoolDetailSheet"]
        WeightAdjuster["WeightAdjuster"]
    end

    Layout --> TopTabs
    Layout --> BottomNav
    Dashboard --> Layout
    Spools --> SpoolsClient
    AMS --> AmsClient
    Storage --> StorageClient
    Orders --> OrdersClient
```

### Rendering Strategy

| Page | Rendering | Why |
|------|-----------|-----|
| Dashboard | Server Component | Aggregates from multiple tables, no interactivity needed for initial render |
| Spools | Server Component + Client wrapper | Server fetches + filters, client handles view toggle and URL state |
| Spool Detail | Server Component | Static data display, no live updates needed |
| AMS Status | Server Component + React Query | Initial SSR, then polls every 30s for live slot updates |
| Storage | Server Component + Client wrapper | Server fetches rack data, client handles drag & drop |
| Orders | Server Component + Client wrapper | Server fetches orders, client handles shopping list, dialogs |

### Data Mutation Pattern

All mutations use Next.js Server Actions (`"use server"`):
- `lib/actions.ts` — all mutation functions
- Each action updates the DB via Drizzle ORM
- Each action calls `revalidatePath()` to refresh affected pages
- Client components call actions directly (no API routes for mutations)

API Routes (`/api/v1/*`) are used for:
- Home Assistant webhook integration
- React Query polling (GET endpoints)
- AI order parsing
- Price crawling

### Security Layers

| Layer | Implementation |
|-------|---------------|
| HTTP Headers | X-Frame-Options, HSTS, nosniff, Referrer-Policy, Permissions-Policy |
| API Auth | Bearer token for HA webhooks (`requireAuth`) |
| Web UI Read | `optionalAuth` — no token needed for GET |
| Input Validation | Zod schemas on all POST routes |
| SQL Injection | Drizzle ORM parameterized queries |
| Error Monitoring | Sentry (when DSN configured) |

### Spool Matching Engine

Three-tier matching system for identifying spools:

```mermaid
flowchart TD
    Input["Tray Data from AMS/HA"] --> T1A{"RFID Tag UID?"}
    T1A -->|"Valid tag"| RFID["Tier 1a: RFID Exact Match<br/>Confidence: 1.0"]
    T1A -->|"No tag / zeros"| T1B{"Bambu Idx + AMS Slot?"}
    T1B -->|"Match"| IDX["Tier 1b: Bambu Index Match<br/>Confidence: 0.95"]
    T1B -->|"No match"| FUZZY["Tier 2: Fuzzy Scoring"]

    FUZZY --> S1["Bambu Index: 40 pts"]
    FUZZY --> S2["Material: 20 pts"]
    FUZZY --> S3["Color ΔE: 25 pts"]
    FUZZY --> S4["Vendor: 10 pts"]
    FUZZY --> S5["Location: 5 pts"]

    S1 & S2 & S3 & S4 & S5 --> Score["Total Score / 100<br/>= Confidence"]

    RFID --> Result["Match Result"]
    IDX --> Result
    Score --> Result
```
