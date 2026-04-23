# Environment Variables

Every environment variable the addon reads, where it's set, and what it does.

---

## 1. Runtime (set by HA supervisor + run.sh)

### `SUPERVISOR_TOKEN`

**Source:** injected by HA supervisor at container startup.
**Loaded from:** `/run/s6/container_environment/SUPERVISOR_TOKEN` by `run.sh`
(falls back to `HASSIO_TOKEN` if the former is missing).

Bearer token for the HA supervisor API. Used by the sync worker to:
- Open the websocket to HA core
- Fetch the entity + device registry
- Call `/api/states/*` during watchdog polls

**Dev mode:** not set → sync worker is skipped (app runs against local DB only).

**Never logged in full.** The addon prints `SUPERVISOR_TOKEN=set (N chars)` at startup.

### `HA_ADDON`

**Source:** set to `"true"` by `run.sh` inside the addon container.
**Default:** unset (dev mode).

Controls two behaviors:
- `basePath` in URLs: `"/ingress"` when `HA_ADDON=true`, `""` otherwise
- Build flag for Next.js standalone output (`next.config.ts` reads this)

---

## 2. Core config (addon options / `.env.local` in dev)

### `SQLITE_PATH`

**Source:** addon options via `/data/options.json` → `run.sh` exports it;
`.env.local` in dev.
**Default:** `./data/haspoolmanager.db` (dev) / `/config/haspoolmanager.db` (addon).

Path to the SQLite database file. The addon uses `/config/` (HA-persistent
volume); dev uses `./data/`.

**Safety guard:** tests refuse to run if `SQLITE_PATH` points outside
`tests/tmp/` — see `tests/harness/sqlite-db.ts`.

### `API_SECRET_KEY`

**Source:** addon option `api_key`; `.env.local` in dev.
**Default:** empty (disables bearer-auth fast path).

Shared secret for the `requireAuth` fast path — `/api/v1/*` routes
that check `Authorization: Bearer <API_SECRET_KEY>` exact match before
falling through to DB-backed API keys.

Used by:
- The sync worker when POSTing to the local printer-sync endpoint
- Curl / external automations against port 3001
- Admin SQL endpoints (`/admin/query`, `/admin/sql/execute`)

Leave empty in dev only if you're okay with all write endpoints
rejecting. Set to any opaque string (no specific format).

### `ANTHROPIC_API_KEY`

**Source:** addon option `anthropic_api_key`; `.env.local` in dev.
**Default:** empty (AI order parse is disabled).

Key for Claude used in `/api/v1/orders/parse` to parse pasted order
confirmations. Without it, users can still manually add orders — the
AI-paste affordance just shows "not configured".

Obtain at console.anthropic.com; free tier sufficient for occasional parses.

---

## 3. Port wiring

### `PORT` / `NEXT_PORT`

**Source:** set by `run.sh` for the standalone Next.js server.
**Defaults:**
- `PORT=3002` — Next.js listens on 127.0.0.1:3002 inside the container
- `NEXT_PORT=3002` — sync worker uses this to construct URLs when POSTing to itself

Nginx (inside the container) listens on 3000 (HA ingress) and 3001
(direct LAN) and forwards to `127.0.0.1:3002`.

**Dev mode:** Next.js dev server uses its own default (3000). No
separate nginx in dev.

---

## 4. Observability (build-time)

Stamped into the build at addon-package time; shown in the `/admin`
footer.

### `BUILD_TIMESTAMP`

ISO timestamp when `ha-addon/build-addon.sh` ran. Read in Server
Components for the "Deployed at X" chip in the header.

### `GIT_COMMIT_SHA`

Short SHA of HEAD at build time. Linked from the header to GitHub.

### `ADDON_VERSION`

Mirror of `config.yaml`'s `version:` field; used for the header badge.
Kept in sync with `package.json` version by `deploy.sh`.

---

## 5. Built-in Node.js

### `NODE_ENV`

Standard Node env. `production` for addon, `development` for local
dev. Mostly affects Next.js internal behavior; the app itself doesn't
branch on it much.

---

## 6. Quick reference — which layer reads what

| Var | run.sh | sync-worker | Next.js routes | UI components |
|---|:---:|:---:|:---:|:---:|
| `SUPERVISOR_TOKEN` | ✅ load | ✅ WS auth | — | — |
| `HA_ADDON` | ✅ set | ✅ basePath | ✅ basePath | — |
| `SQLITE_PATH` | ✅ log | — | ✅ DB | — |
| `API_SECRET_KEY` | — | ✅ Bearer | ✅ auth | — |
| `ANTHROPIC_API_KEY` | — | — | ✅ order-parse | — |
| `PORT` / `NEXT_PORT` | ✅ set | ✅ URL build | — | — |
| `BUILD_TIMESTAMP` | — | — | ✅ header | ✅ footer |
| `GIT_COMMIT_SHA` | — | — | ✅ header | ✅ footer |
| `ADDON_VERSION` | — | — | ✅ header | ✅ footer |
| `NODE_ENV` | — | — | internal | internal |

---

## 7. Setting vars in each environment

### Local dev (`.env.local`)

```bash
SQLITE_PATH=./data/haspoolmanager.db
API_SECRET_KEY=test-dev-key-2026
ANTHROPIC_API_KEY=
```

Never commit `.env.local`. Use `.env.example` as the template (`cp .env.example .env.local`).

### HA addon (configuration tab)

```yaml
log_level: info
api_key: "your-secret-token-here"
anthropic_api_key: "sk-ant-..."
```

Stored in `/data/options.json` inside the container; `run.sh` exports
them as env vars before starting processes.

### CI (`.github/workflows/ci.yml`)

Only `SQLITE_PATH` is needed (set via the test harness). No secrets
required — tests run against a per-worker SQLite file created from
`tests/harness/sqlite-db.ts`.

---

## 8. Gotchas

- **`SUPERVISOR_TOKEN` is NOT available as an env var** in the
  container — `run.sh` has to read it from the s6 filesystem and
  export it before starting Next.js and the sync worker. The HA team
  considers this a deliberate isolation barrier.
- **`API_SECRET_KEY` is plaintext in `/data/options.json`** on the HA
  host. If you worry about LAN compromise, rotate the token or use
  DB-backed API keys with bcrypt hashing (see
  `/admin/api-keys` page — TODO if it doesn't exist yet).
- **`HA_ADDON=true` changes URL construction.** Forgetting to set it
  in a staging non-addon environment would make the sync worker POST
  to `/ingress/api/...` which doesn't exist locally, and all state
  sync would fail silently.
