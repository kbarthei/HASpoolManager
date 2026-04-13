# Project Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Group related prints into projects with parts, iterations, and cost aggregation. Answer "how much did this entire build cost across all prints?"

**Architecture:** New `projects` and `project_parts` tables. A project has parts (e.g., "left bracket", "top plate"), each part links to multiple prints (iterations: v1 failed, v2 final). Prints get an optional `projectPartId` FK. New pages `/projects` and `/projects/[id]` for CRUD and detail views. Cost aggregation via SQL joins.

**Tech Stack:** Next.js 16 Server Components, SQLite/Drizzle ORM, shadcn/ui, Recharts for cost charts.

---

## File Structure

| File | Responsibility |
|------|---------------|
| `lib/db/schema.ts` | Add projects, projectParts tables + FK on prints |
| `lib/db/migrations/0003_*.sql` | Generated migration |
| `scripts/migrate-db.js` | Idempotent migration entries |
| `lib/actions.ts` | Server Actions: createProject, addPart, linkPrint, deleteProject |
| `lib/queries.ts` | Query helpers: getProjects, getProjectDetail, getProjectCost |
| `app/(app)/projects/page.tsx` | Project list page |
| `app/(app)/projects/[id]/page.tsx` | Project detail with parts + prints + cost |
| `app/(app)/projects/project-client.tsx` | Client component for add/edit dialogs |
| `components/projects/project-card.tsx` | Card component for project list |
| `components/projects/add-part-dialog.tsx` | Dialog to add a part to a project |
| `components/projects/link-print-dialog.tsx` | Dialog to link existing print to a part |
| `app/(app)/prints/page.tsx` | Add project badge to print entries |
| `tests/fixtures/seed.ts` | Add makeProject, makeProjectPart factories |
| `tests/integration/projects.test.ts` | CRUD + cost aggregation tests |
| `tests/e2e/14-projects-page.spec.ts` | E2e spec for projects page |

---

## Task Breakdown

### Task 1: Schema — projects + projectParts tables + prints FK

Add to schema.ts:

```typescript
export const projects = sqliteTable("projects", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  description: text("description"),
  status: text("status").notNull().default("active"), // active, completed, archived
  thumbnailPath: text("thumbnail_path"),
  createdAt: tsCol("created_at").notNull().default(sql`(datetime('now'))`),
  updatedAt: tsCol("updated_at").notNull().default(sql`(datetime('now'))`),
});

export const projectParts = sqliteTable("project_parts", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  name: text("name").notNull(), // e.g., "left bracket", "top plate"
  quantity: integer("quantity").notNull().default(1),
  material: text("material"), // preferred material
  colorHex: text("color_hex"), // preferred color
  estimatedWeight: real("estimated_weight"), // grams per unit
  notes: text("notes"),
  createdAt: tsCol("created_at").notNull().default(sql`(datetime('now'))`),
});
```

Add FK to prints: `projectPartId: text("project_part_id").references(() => projectParts.id, { onDelete: "set null" })`

Add relations, generate migration, add to migrate-db.js.

### Task 2: Seed factories + integration tests for CRUD

Add makeProject + makeProjectPart to seed.ts. Write integration tests for:
- Create project
- Add part to project
- Link print to part
- Get project with cost aggregation
- Delete project cascades parts (but not prints)

### Task 3: Server Actions + Query helpers

lib/actions.ts: createProject, updateProject, deleteProject, addProjectPart, removeProjectPart, linkPrintToProject, unlinkPrint.

lib/queries.ts: getProjects (with part count, print count, total cost), getProjectDetail (with parts, each part's prints, iteration history, cost breakdown).

### Task 4: Projects list page

`/projects` — grid of project cards showing: name, status badge, part count, print count, total cost, last activity date. "New Project" button.

### Task 5: Project detail page

`/projects/[id]` — shows:
- Project header (name, description, status, total cost)
- Parts table: name, qty needed, qty printed (successful), material, estimated weight
- Per part: linked prints with iteration number, status icon, weight, cost
- Cost summary card (total filament cost, cost per successful part, waste from failures)
- "Add Part" and "Link Print" dialogs

### Task 6: Link prints to projects from print history

On `/prints` page: add a small project badge/tag on prints that belong to a project. Add a "Link to Project" action on unlinked prints.

### Task 7: Navigation + E2e test

Add "Projects" tab to navigation (between Orders and Prints). Write e2e spec for projects page rendering.

### Task 8: Deploy + verify

Run full test suite, deploy, verify on HA.
