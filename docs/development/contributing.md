# Contributing

This is a single-user project. "Contributing" mostly means *you in a
year* working on *you now's* code. These guidelines exist to make that
handoff painless.

---

## 1. Commit style — Conventional Commits

Every commit message follows the pattern:

```
<type>(<scope>): <short description>

<optional body>

<optional footer>
```

Recognised types (enforced by the auto-changelog workflow):

| Type | When |
|---|---|
| `feat` | New user-visible capability |
| `fix` | Bug fix (behavior was wrong, now correct) |
| `refactor` | Code restructure with no behavior change |
| `perf` | Performance improvement |
| `test` | Test-only change |
| `docs` | Documentation-only change |
| `chore` | Build config, dependencies, tooling |
| `ci` | CI pipeline changes |
| `style` | Formatting only (rare — Prettier handles most) |

Scope is optional but encouraged: `feat(ams)`, `fix(sync)`, `refactor(db)`.

### Examples (good)

```
feat(supply): optimize cart grouping by free-shipping threshold
fix(sync): handle gcode_state=PAUSE without print_error as cancel intent
refactor(schema): drop unused spools.external_id column
docs(architecture): expand state-machine doc with runout scenarios
```

### Examples (bad)

```
Update stuff                      # no type, no info
fix: fix bug                      # what bug?
feat: added a really nice feature # no scope, vague
WIP                               # never commit WIP to main
```

---

## 2. Branch + PR workflow

### Branches

- `main` — always deployable. CI must be green.
- `feat/<short-name>` — new features
- `fix/<short-name>` — bug fixes
- `refactor/<short-name>` — cleanup

Short-lived. Merge to `main` within days, not weeks.

### Opening a PR

```bash
gh pr create --title "<type>(<scope>): <description>" --body "<see template>"
```

PR body should cover:
- **Summary** (1-3 bullets) — what this does, why
- **Test plan** — how you verified it
- **Screenshots** — for UI changes
- **Breaking changes** — flag explicitly (rare, but sometimes schema)

### Before merging

- [ ] CI green (`gh pr checks <pr-number>`)
- [ ] Self-review done (look at the diff fresh, not just the one you wrote)
- [ ] Tests cover the change (unit for lib, integration for API, e2e for new UI)
- [ ] Docs updated if behavior changes affect users/operators/contributors

### After merging

- [ ] Delete the branch (`gh pr merge --delete-branch` or manually)
- [ ] Check CI on `main` (e2e runs only on main)
- [ ] If the change affects the addon: `./ha-addon/deploy.sh` — see [`release-process.md`](release-process.md)

---

## 3. The test pyramid — what goes where

See the table in [`../../CLAUDE.md`](../../CLAUDE.md#testing-convention)
for the canonical mapping. TL;DR:

| Change | Test |
|---|---|
| Pure function in `lib/` | Unit test |
| API route | Integration test |
| New UI page/route | E2E spec |
| Schema change | Migration entry + fresh-DB test via Drizzle migrator |

**Every code change must include appropriate tests.** No exceptions,
not even for "trivial" changes — the trivial ones are where the bugs
hide.

See [`testing.md`](testing.md) for the full test architecture,
[`test-templates.md`](test-templates.md) for boilerplate to copy.

---

## 4. Code style

### TypeScript

- **Strict mode on.** Never disable. No `// @ts-ignore` without an
  explanatory comment.
- **Prefer `interface`** over `type` for object shapes
- **Prefer `unknown`** over `any` — narrow explicitly
- **Discriminated unions** for state: `{ status: "ok"; data: T } | { status: "error"; message: string }`
- **Use `satisfies`** for type-safe config objects (e.g. `chartConfig satisfies ChartConfig`)
- Export types from the file that defines them; avoid barrel re-exports

### Formatting

- **ESLint + Prettier** — run `npm run lint` before committing
- Two-space indent, double quotes, trailing commas, semicolons
- Line length ~100 chars (not enforced strictly, but don't abuse it)

### Naming

- Files: `kebab-case.ts` (`sync-worker.ts`, `printer-sync-helpers.ts`)
- Types / components: `PascalCase` (`DiscoveredPrinter`, `InventoryGrid`)
- Functions / variables: `camelCase` (`parseHmsCode`, `remainingWeight`)
- Constants: `SCREAMING_SNAKE_CASE` (`HMS_MODULES`, `RUNOUT_ERROR_SUFFIX`)
- Booleans: `isX` / `hasX` / `shouldX` (`isActive`, `hasRfid`)

### Function size

- **Functions > 40 lines** — split. Exceptions: a single big switch or
  a data-lookup function.
- **Logic duplicated more than twice** — extract to `lib/`.
- **Inline comments only for non-obvious reasons** (hidden constraints,
  bug workarounds). The code should explain WHAT; comments explain WHY.

### React

- **Server Components by default.** Add `"use client"` only when you
  need state, effects, or event handlers.
- Keep data fetching on the server; hydrate the client with minimal JSON.
- `loading.tsx` or `<Suspense>` on every async Server Component.
- Server Actions for UI mutations, API Routes for external consumers.
- `revalidatePath()` after mutations; list all affected pages.

See [`../../CLAUDE.md`](../../CLAUDE.md#typescript--nextjs-best-practices)
for the full rule list.

---

## 5. Security expectations

Every new route:

- **Mutation endpoint?** → `requireAuth`
- **Read-only endpoint called by the browser?** → `optionalAuth`
- **Public probe?** → no auth (currently only `/api/v1/health`)

New external-fetch paths (URL parsers, crawlers) must go through the
SSRF guardrails in `lib/url-safety.ts`.

See [`../architecture/security-model.md`](../architecture/security-model.md)
for the full auth tier model.

---

## 6. Data integrity mindset

This app tracks physical objects (spools) connected to real hardware
(3D printer). Wrong data = wrong cost, missed prints, lost inventory.
Treat data bugs as critical.

Before any change to the sync worker, print-lifecycle code, or weight
deduction:

- Read [`../architecture/state-machine.md`](../architecture/state-machine.md)
- Read [`../architecture/sync-worker.md`](../architecture/sync-worker.md) §6 (edge cases)
- Think through: "What if this runs twice? What if the state is
  already what I'm trying to set it to? What if events arrive out of
  order after a restart?"

Parse HA values defensively — use `str()`, `num()`, `bool()` from
`lib/printer-sync-helpers.ts`, never raw `parseInt()` or `=== true`.
HA sends `"unavailable"`, `"unknown"`, `"None"`, `"on"/"off"` as strings.

---

## 7. UI conventions

- **Apple Health inspired.** Light + dark (system preference), teal accent (`#0d9488`).
- **Mobile-first.** The operator uses this at the printer.
- **Dense layout.** Compact padding, tight rows.
- **English only** in UI and code, even though the user is
  German-speaking. No hardcoded `"Deutsch"` strings.
- **`data-testid`** on every new page root (`page-<name>`) and
  interactive element. E2E selectors never match text.
- **Inline styles with DB values** (colors, widths): sanitize with a
  regex before interpolating. No raw user input into the DOM.
- **Touch targets ≥ 44×44 px** on mobile. A11y matters.

---

## 8. When to update which doc

| Change | Doc |
|---|---|
| New API endpoint | [`../reference/api.md`](../reference/api.md) |
| Changed API shape | [`../reference/api.md`](../reference/api.md) |
| New DB table / column | [`../architecture/data-model.md`](../architecture/data-model.md) |
| Sync-worker state transition added | [`../architecture/state-machine.md`](../architecture/state-machine.md) |
| New operator-facing UI | [`../operator/user-guide.md`](../operator/user-guide.md) |
| New break-fix recipe | [`../operator/operations-runbook.md`](../operator/operations-runbook.md) |
| New test added / count changed | [`testing.md`](testing.md) §4 (catalogue) |

**Docs are part of the change**, not an afterthought. A PR that adds a
route without updating `api.md` is incomplete.

---

## 9. Anti-patterns to avoid

- **Silent fallbacks.** If an input is malformed, log + fail loudly in
  dev, fall back gracefully in prod. Never mask errors.
- **Over-abstracted helpers** for one or two callers. Wait until you
  have three.
- **"Just in case" flags** / unused config options. YAGNI.
- **Comments that restate code** (`// increment i`). Delete them.
- **Commented-out code.** Use git history.
- **Legacy aliases + backward-compat shims.** This is a single-user
  app — rip them out when you rename something.
- **Large PRs that mix concerns.** One reason to merge = one PR.
- **`any` types** as an escape hatch. Use `unknown` and narrow.

---

## 10. Related

- [`getting-started.md`](getting-started.md) — dev setup, first change
- [`testing.md`](testing.md) — test architecture + rules
- [`database-changes.md`](database-changes.md) — schema-change protocol
- [`release-process.md`](release-process.md) — deploy + rollback
- [`../../CLAUDE.md`](../../CLAUDE.md) — project-level rules (this doc quotes from it)
