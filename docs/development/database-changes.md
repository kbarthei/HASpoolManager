# Database Changes

Schema changes in HASpoolManager go through a **three-step dance**.
Every schema change follows it; no exceptions.

---

## 1. The three steps

```
1. Edit lib/db/schema.ts        (source of truth)
       ↓
2. npx drizzle-kit generate    (→ new lib/db/migrations/NNNN_*.sql)
       ↓
3. Add an idempotent entry to   scripts/migrate-db.js
```

**Why both** a Drizzle migration file **and** an inline entry in `migrate-db.js`?
They serve different purposes:

| | Drizzle `.sql` in `lib/db/migrations/` | Entry in `scripts/migrate-db.js` |
|---|---|---|
| **Who reads** | Test harness (`tests/harness/sqlite-db.ts:setupTestDb`) for fresh test DBs | The running addon on startup (`run.sh` → `node /app/migrate-db.js`) |
| **When** | Every test run | Every addon startup |
| **Fresh install behavior** | Applies all migrations 0000→latest in sequence | Applies entries that find their target state missing (via `check()`) |
| **Upgrade behavior** | N/A (test harness is always fresh) | Applies only the entries whose `check()` returns false |
| **Data backfill** | Limited (only SQL) | Can run arbitrary JS (loops, regex, computed values) |

Both must be kept in sync. The Drizzle file is generated automatically,
the `migrate-db.js` entry is manual.

---

## 2. Worked example — adding a column

Suppose you want to add `spools.barcode` to store an optional barcode
scan.

### Step 1 — Edit the schema

`lib/db/schema.ts`, in the `spools` table definition:

```ts
export const spools = sqliteTable("spools", {
  // ... existing columns ...
  notes: text("notes"),
  barcode: text("barcode"),   // new
  createdAt: tsCol("created_at").notNull().default(sql`(datetime('now'))`),
  // ...
});
```

### Step 2 — Generate the Drizzle migration

```bash
npx drizzle-kit generate
```

This creates `lib/db/migrations/NNNN_random_name.sql` with an
`ALTER TABLE spools ADD COLUMN barcode TEXT` or, for complex changes,
a full table rebuild.

Rename the file to something descriptive and update the journal:

```bash
mv lib/db/migrations/NNNN_random_name.sql lib/db/migrations/NNNN_add_spools_barcode.sql
# edit lib/db/migrations/meta/_journal.json, change the "tag" for the
# latest entry from "NNNN_random_name" to "NNNN_add_spools_barcode"
```

### Step 3 — Add an idempotent entry to `migrate-db.js`

```js
const migrations = [
  // ... existing entries ...
  {
    name: "spools.barcode column",
    check: () => {
      const cols = db.pragma("table_info(spools)");
      return cols.some((c) => c.name === "barcode");
    },
    apply: () => {
      db.prepare("ALTER TABLE spools ADD COLUMN barcode TEXT").run();
    },
  },
];
```

**Pattern rules:**
- `check()` returns `true` when the change is already applied
- `apply()` performs the mutation; should be idempotent (e.g.
  `CREATE TABLE IF NOT EXISTS`)
- `check()` must not throw on a fresh DB; wrap in `try/catch` if you
  query a table that might not exist yet

### Step 4 — Run tests

```bash
npm run test:unit
npm run test:integration
```

All integration tests build a fresh SQLite via the Drizzle migrator, so
they catch broken migration SQL immediately.

### Step 5 — Pre-deploy dry-run (if the change touches existing data)

For schema changes that backfill or drop columns, use the admin SQL
endpoint's `dryRun` mode against the **live** DB to preview the effect:

```bash
curl -s -X POST http://homeassistant:3001/api/v1/admin/sql/execute \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"sql":"UPDATE spools SET barcode = NULL WHERE 1=1","dryRun":true}'
```

The response tells you how many rows the statement would affect,
without committing.

### Step 6 — Commit + deploy

```bash
git add lib/db/schema.ts lib/db/migrations/ scripts/migrate-db.js
git commit -m "feat(schema): add spools.barcode column"
./ha-addon/deploy.sh
```

`deploy.sh` bumps the addon patch version, builds, ships, and the
container's `run.sh` runs `migrate-db.js` at startup. Check the logs
afterwards:

```bash
ssh root@homeassistant "ha addons logs local_haspoolmanager 2>&1 | grep migrate | tail"
```

Expected: `[migrate] Applying: spools.barcode column` → `[migrate] Applied 1 migration(s)`.

---

## 3. Worked example — dropping a column (destructive)

Tougher because you need a **backfill step before the drop** if any
existing data references the column.

### Step 1 — Remove from schema

`lib/db/schema.ts`: delete the column line.

### Step 2 — Generate migration

```bash
npx drizzle-kit generate
```

SQLite doesn't support native `DROP COLUMN` on older versions, so
Drizzle emits a table-rebuild: create `__new_table`, `INSERT SELECT`,
`DROP` old, rename new. That's fine for the test harness.

### Step 3 — Decide on data backfill

Run a query against the live DB first to see if data will be lost:

```bash
curl -s -X POST http://homeassistant:3001/api/v1/admin/query \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"sql":"SELECT COUNT(*) c FROM spools WHERE barcode IS NOT NULL"}'
```

If the count is >0 and the data should move somewhere:

```js
{
  name: "backfill spools.barcode into notes, then drop column",
  check: () => {
    const cols = db.pragma("table_info(spools)");
    return !cols.some((c) => c.name === "barcode");
  },
  apply: () => {
    // Backfill first
    const result = db.prepare(`
      UPDATE spools
      SET notes = coalesce(notes || ' ', '') || 'barcode:' || barcode
      WHERE barcode IS NOT NULL
    `).run();
    if (result.changes > 0) {
      console.log(`[migrate]   → Backfilled ${result.changes} barcode(s) into notes`);
    }
    // Drop (SQLite 3.35+; better-sqlite3 bundles 3.40+)
    db.prepare("ALTER TABLE spools DROP COLUMN barcode").run();
  },
},
```

### Step 4 — Pre-deploy snapshot (MANDATORY for destructive changes)

```bash
cp /Volumes/config/haspoolmanager.db  testdata/db-snapshots/prod-$(date +%Y-%m-%d)-pre-barcode-drop.db
cp /Volumes/config/haspoolmanager.db-wal testdata/db-snapshots/prod-$(date +%Y-%m-%d)-pre-barcode-drop.db-wal 2>/dev/null
cp /Volumes/config/haspoolmanager.db-shm testdata/db-snapshots/prod-$(date +%Y-%m-%d)-pre-barcode-drop.db-shm 2>/dev/null
```

### Step 5 — Deploy + verify

After deploy, verify the column is gone:

```bash
curl -s -X POST http://homeassistant:3001/api/v1/admin/query \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"sql":"SELECT sql FROM sqlite_master WHERE name='"'"'spools'"'"'"}' | jq -r '.rows[0].sql' | grep -i barcode
# Should output nothing
```

### Step 6 — Rollback plan

If the deploy goes sideways:

```bash
ssh root@homeassistant "ha addons stop local_haspoolmanager"

# Restore snapshot
cp testdata/db-snapshots/prod-YYYY-MM-DD-pre-barcode-drop.db /Volumes/config/haspoolmanager.db
cp testdata/db-snapshots/prod-YYYY-MM-DD-pre-barcode-drop.db-wal /Volumes/config/haspoolmanager.db-wal 2>/dev/null
cp testdata/db-snapshots/prod-YYYY-MM-DD-pre-barcode-drop.db-shm /Volumes/config/haspoolmanager.db-shm 2>/dev/null

# Reinstall previous addon version
scp ha-addon/dist/haspoolmanager-vPREV.tar.gz root@homeassistant:/addons/haspoolmanager-addon.tar.gz
ssh root@homeassistant "rm -rf /addons/haspoolmanager && \
  tar -xzf /addons/haspoolmanager-addon.tar.gz -C /addons/ && \
  ha addons reload && ha addons start local_haspoolmanager"
```

---

## 4. Adding a new table

Same three steps. Example for a new `photos` table:

### Schema

```ts
export const photos = sqliteTable("photos", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  spoolId: text("spool_id").notNull().references(() => spools.id, { onDelete: "cascade" }),
  path: text("path").notNull(),
  takenAt: tsCol("taken_at").notNull().default(sql`(datetime('now'))`),
});
```

### migrate-db.js entry

```js
{
  name: "photos table",
  check: () => {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='photos'").all();
    return tables.length > 0;
  },
  apply: () => {
    db.prepare(`
      CREATE TABLE photos (
        id TEXT PRIMARY KEY NOT NULL,
        spool_id TEXT NOT NULL REFERENCES spools(id) ON DELETE CASCADE,
        path TEXT NOT NULL,
        taken_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `).run();
    db.prepare("CREATE INDEX idx_photos_spool ON photos(spool_id)").run();
  },
},
```

Don't forget: Drizzle relations go in the relations block below the
table (see existing tables for the pattern).

---

## 5. Indexes

Add them to the schema as usual:

```ts
(table) => [
  index("idx_photos_spool").on(table.spoolId),
  uniqueIndex("uq_photos_path").on(table.path),
],
```

And mirror them in the `migrate-db.js` `apply()` block (Drizzle will
create them in fresh test DBs; migrate-db.js creates them on existing
prod DBs).

---

## 6. Foreign keys

- Use `.references(() => targetTable.id, { onDelete: "cascade" | "set null" | "restrict" })`
- `cascade` for parent→child (e.g. printer → ams_slots)
- `set null` for soft links (e.g. print_usage → ams_slot — slot can be deleted without destroying usage history)
- `restrict` for invariants you never want violated (e.g. spool → filament)

---

## 7. Migration anti-patterns to avoid

- **Non-idempotent `apply()`** — e.g. `INSERT` without `ON CONFLICT` or a guard. The migration will double-insert on redeployment.
- **`check()` that throws** on a fresh DB — always wrap queries that touch potentially-missing tables in `try/catch`.
- **Skipping the Drizzle generate** — the test harness won't match production, and fresh-install tests will silently fail.
- **Data-backfill that depends on app-level helpers** — migrations run before Next.js boots. Stick to raw SQL.
- **Deploying without a snapshot** for destructive changes. You'll regret it.

---

## 8. Where to look in the code

| What | File |
|---|---|
| Schema source of truth | `lib/db/schema.ts` |
| Drizzle config (migration output path) | `drizzle.config.ts` |
| Generated migrations | `lib/db/migrations/*.sql` |
| Migration journal (Drizzle ordering) | `lib/db/migrations/meta/_journal.json` |
| Test harness migrator | `tests/harness/sqlite-db.ts:setupTestDb` |
| Production migrator | `scripts/migrate-db.js` |
| Startup entry point | `ha-addon/haspoolmanager/run.sh` |

---

## 9. Related

- [`release-process.md`](release-process.md) — full deploy flow including snapshot discipline
- [`../architecture/data-model.md`](../architecture/data-model.md) — the current schema
- [`../operator/operations-runbook.md`](../operator/operations-runbook.md) — rollback recipes
