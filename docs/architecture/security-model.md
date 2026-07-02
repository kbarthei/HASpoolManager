# Security Model

Single-user LAN app, not a multi-tenant cloud service — so "security"
here means:
1. Nobody on the LAN can break or poison the data without auth
2. External input (order parser, price crawler) can't SSRF us
3. Bearer-token uses are audited and revocable
4. Ad-hoc SQL access is sandboxed (readonly by default, write endpoint
   blocks DDL)
5. Sensitive error messages never leak internal details

---

## 1. Auth tiers

Every `/api/v1/*` route picks one of three modes from `lib/auth.ts`:

### `requireAuth(request)` — Bearer token required

Used by all write endpoints (POST/PATCH/DELETE) and sensitive reads
(admin SQL).

```ts
const auth = await requireAuth(request);
if (!auth.authenticated) return auth.response;
```

Two token sources, checked in order:
1. **Env-based** — `process.env.API_SECRET_KEY` (exact match)
   - Fast path for HA integration and the sync worker
   - Configured per install via the addon options (`api_key`)
2. **DB-backed** — `api_keys` table, bcrypt-hashed, with `name` +
   `last_used_at`
   - For multiple clients or rotation
   - Keys start with `hspm_` prefix

On successful auth, `authenticated: true, keyId, name` is returned; on
failure, a 401 response is emitted via `NextResponse.json`.

### `optionalAuth(request)` — auth if present, else web-UI mode

Used by read endpoints that the browser calls without a token (via HA
ingress). If the browser provides no `Authorization` header, the
request is treated as web-UI (authenticated as "web-ui" pseudo-user).
If a header is provided, it's validated the same way as `requireAuth`.

### No auth (public)

Only `/api/v1/health` (status ping for monitors + HA probes).

---

## 2. The two port model

The addon exposes **two HTTP entry points** via `ha-addon/.../nginx.conf`:

| Port | Purpose | Auth assumption |
|---|---|---|
| **3000** | HA ingress — all access via HA's reverse-proxy | HA already authenticated the user; request comes through `/ingress/` prefix |
| **3001** | Direct LAN — "PWA access without HA login" | Assumed LAN-only (not exposed on the public internet). Sensitive endpoints MUST use `requireAuth` |

### Why port 3001 exists

HA ingress is great for browser, but:
- Slow first paint (HA auth hop adds latency)
- No offline PWA (browser can't reach HA if HA is down)
- Awkward for automation scripts

Port 3001 bypasses HA and exposes the same app directly. Auth happens
at the API layer, not the gateway layer. This is safe **because** it's
LAN-only and sensitive endpoints require Bearer tokens.

### Implications for developers

There are two valid auth tiers for browser-callable routes:

- **`optionalAuth`** — accepts no-Bearer requests. Required for any
  endpoint the web UI calls, because `fetch("/api/v1/...")` from
  React components never sends an Authorization header (HA ingress
  authenticates the user but does not inject a Bearer token; LAN port
  3001 is implicitly trusted as LAN-only).
- **`requireAuth`** — Bearer token required. Used for endpoints called
  exclusively by external integrations (HA scripts, sync-worker via
  `printer-sync`, etc.) and never from the browser.

If you add a new browser fetch, use `optionalAuth` AND add the route
to `tests/integration/browser-auth-contract.test.ts`. That single
meta-test asserts every browser-callable route accepts no-auth
requests — drift back to `requireAuth` is caught immediately.

When in doubt about a route only HA scripts call: `requireAuth`.
When in doubt about a route the UI calls: `optionalAuth`.

---

## 3. Raw-SQL endpoint guardrails

`/api/v1/admin/query` and `/api/v1/admin/sql/execute` provide ad-hoc database access for the admin SQL Query Runner UI. Both use `optionalAuth` (browser-callable) with multiple security layers:

### `/admin/query` (readonly)

- `optionalAuth` — browser-callable from /admin page
- Opens DB in `readonly` mode via better-sqlite3
- **Rejects writes** at the SQL parser level: any `UPDATE`, `INSERT`,
  `DELETE`, `CREATE`, `DROP`, `ALTER`, `PRAGMA`, `VACUUM` → 403
- Blocks semicolons and multi-statements
- Caps SQL at 10KB
- Sanitizes SQLite error messages — no table/column names leaked
- All queries logged to audit_logs table

### `/admin/sql/execute` (write)

- `optionalAuth` — browser-callable from /admin page
- Accepts only `UPDATE`, `INSERT`, `DELETE` with positional parameter
  binding (SQL injection hardened)
- Blocks all DDL (CREATE / DROP / ALTER / PRAGMA / VACUUM / REINDEX /
  ATTACH / DETACH)
- Rejects semicolons and multi-statements
- Caps SQL at 10KB
- `dryRun: true` wraps the statement in a transaction that always rolls
  back; reports `changes` and `lastInsertRowid` without committing
- All operations logged to audit_logs table with user, IP, timestamp, execution time

### SQL Query Runner UI

The `/admin` page includes a SQL Query Runner card with:
- **Read Mode**: SELECT queries with results table
- **Write Mode**: INSERT/UPDATE/DELETE with parameter binding and dry-run preview
- **Example Queries**: Quick-load buttons for common operations
- **Real-time Feedback**: Execution time, row counts, success/error status
- **Audit Trail**: All operations visible in Audit Logs tab

Security is enforced at multiple layers:
1. HA Ingress authentication (port 3000)
2. LAN-only access (port 3001)
3. SQL parser guards (operation whitelist/blacklist)
4. Parameter binding (prevents SQL injection)
5. Readonly mode for SELECT queries
6. Comprehensive audit logging

---

## 4. External-input hardening

Two external-fetch paths carry SSRF risk:

Both external-fetch paths route through the **same** `validateURL()` in
`lib/url-validator.ts` — a single choke point so the rules can't drift
between call sites.

`validateURL()` enforces, in order:

- Scheme must be `http:` / `https:` — no `file:`, `ftp:`, etc.
- Hostname is not `localhost`, `0.0.0.0`, or a cloud-metadata endpoint
  (`169.254.169.254`, `metadata.google.internal`)
- Hostname is not a private / loopback / link-local IP (RFC1918,
  `127.0.0.0/8`, `169.254.0.0/16`, IPv6 `::1`/`fe80:`/`fc00:`/`fd00:`)
- **Hostname is on the domain allowlist** (`ALLOWED_DOMAINS`: the known
  filament shops — bambulab, 3djake, amazon, prusa, polymaker, …).
  This is stricter than "any public IP" — an unknown public domain is
  rejected.
- Non-standard ports (anything but 80/443) are blocked
- Embedded credentials (`user:pass@host`) are stripped

### `lib/order-parser` / `/api/v1/orders/parse`

User pastes an order confirmation (HTML or URL). If a URL is provided,
we `validateURL()` it first; on failure we do NOT fetch — we fall back
to letting Claude parse the raw URL string. On success we fetch the
sanitized URL with a 10s timeout, strip tags, and cap at 4000 chars.

> **History:** until 2026-07 this endpoint fetched the user URL WITHOUT
> validation — a real SSRF hole (an attacker could hit the internal HA
> instance or cloud metadata and exfiltrate via the AI summary). Fixed
> by routing through `validateURL()`; regression-tested in
> `tests/integration/orders-parse.test.ts` ("SSRF protection on URL input").

### `lib/price-crawler` / `/api/v1/prices/refresh`

Scrapes per-shop filament listing pages via the same `validateURL()`.
Additionally:
- Each shop URL is admin-configured
- Response parsed via regex (no JS execution, no innerHTML injection)

---

## 5. Error messages

Every route's `catch` logs the full error server-side and returns a
generic response:

```ts
} catch (error) {
  console.error("POST /api/v1/... error:", error);
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}
```

Never return `error: err.message` — the message may contain SQL,
filesystem paths, or stack info. Integration tests cover the "generic
message" guarantee for each sensitive endpoint.

---

## 6. DB trust boundary

- `better-sqlite3` in **default** mode for reads + writes the app makes
  itself — safe (Drizzle-parameterized queries)
- `better-sqlite3` in **readonly** mode for `/admin/query` — hardens
  against any bypass of the SQL parser guard
- Writable DB access for `/admin/sql/execute` only via whitelisted
  statement types

---

## 7. What's NOT protected

Intentional non-goals for a single-user LAN app:

- **No rate limiting** — you're the only user
- **No CSRF tokens** — Bearer auth makes CSRF less relevant; UI calls
  go through HA ingress which has its own session
- **No HTTPS on port 3001** — LAN only, HA provides TLS to external
  clients
- **No audit log on every read** — writes go to `sync_log`, but reads
  (SELECT via /admin/query) are not logged beyond server console

If the app ever becomes multi-user or cloud-hosted, all of the above
need revisiting.

---

## 8. Related

- [`../reference/api.md`](../reference/api.md) — every endpoint's auth annotation
- `lib/auth.ts` — `requireAuth`, `optionalAuth`, `generateApiKey`
- `app/api/v1/admin/query/route.ts` — readonly SQL
- `app/api/v1/admin/sql/execute/route.ts` — write SQL with guardrails
