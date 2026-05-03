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

`/api/v1/admin/query` and `/api/v1/admin/sql/execute` are the most
sensitive endpoints. They exist because the diagnostics page needs
ad-hoc DB access, but they're wrapped in layers:

### `/admin/query` (readonly)

- `requireAuth` — Bearer token
- Opens DB in `readonly` mode via better-sqlite3
- **Rejects writes** at the SQL parser level: any `UPDATE`, `INSERT`,
  `DELETE`, `CREATE`, `DROP`, `ALTER`, `PRAGMA`, `VACUUM` → 400
- Blocks semicolons and multi-statements
- Caps SQL at 10KB
- Sanitizes SQLite error messages — no table/column names leaked in the
  error response

### `/admin/sql/execute` (write)

- `requireAuth` — Bearer token
- Accepts only `UPDATE`, `INSERT`, `DELETE` with positional parameter
  binding (SQL injection hardened)
- Blocks all DDL (CREATE / DROP / ALTER / PRAGMA / VACUUM / REINDEX /
  ATTACH / DETACH)
- Rejects semicolons and multi-statements
- Caps SQL at 10KB
- `dryRun: true` wraps the statement in a transaction that always rolls
  back; reports `changes` and `lastInsertRowid` without committing
- Logs every call to `sync_log` (audit trail)

### Why not expose via UI

Both endpoints require the API key, so they're not discoverable from
the web UI. The diagnostics page's SQL runner is a UI wrapper that uses
the user's bearer token, but never types raw SQL into the prod DB
without a `dryRun: true` preview first.

---

## 4. External-input hardening

Two external-fetch paths carry SSRF risk:

### `lib/order-parser` / `/api/v1/orders/parse`

User pastes an order confirmation (HTML or URL). If a URL is provided,
we fetch it server-side. Mitigations:

- URL scheme must be `http:` / `https:` — no `file:`, `ftp:`, etc.
- Hostname must resolve to a public IP (not `127.0.0.1`, `::1`, private
  RFC1918 ranges, or link-local)
- Request timeout (10s) + size cap (1 MB)
- Response content-type must be `text/html` or `text/plain`
- Claude (if `ANTHROPIC_API_KEY` set) parses the content — Claude
  itself won't execute external links

### `lib/price-crawler` / `/api/v1/prices/refresh`

Scrapes per-shop filament listing pages. Same SSRF controls apply.
Additionally:
- Each shop URL is stored in `shops.listing_url_pattern` (admin-configured)
- Crawler runs on a rate limit (max 1 req/sec per shop)
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
