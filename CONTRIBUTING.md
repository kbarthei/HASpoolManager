# Contributing to HASpoolManager

## Development Setup

```bash
git clone https://github.com/kbarthei/HASpoolManager.git
cd HASpoolManager
npm install
cp .env.example .env.local
# Edit .env.local with your DATABASE_URL
npm run db:migrate
npm run dev
```

## Code Standards

- **TypeScript** — strict mode, no `any` types
- **Linting** — ESLint with Next.js + TypeScript rules
- **Formatting** — Prettier (via editor)
- **Components** — shadcn/ui (uses @base-ui/react, NOT Radix)
  - Use `onClick` for DropdownMenuItem (not `onSelect`)
- **Styling** — Tailwind CSS v4, Apple Health-inspired design
- **Database** — Drizzle ORM, Neon Postgres

## Important Conventions

### No `cd` in Bash Commands
Never prefix commands with `cd /path/to/project &&`. The working directory is always the project root.

### API Input Validation
All POST routes must use Zod schemas from `lib/validations.ts`.

### Server Actions
Use Server Actions for mutations from the web UI. API routes are for HA webhooks and external integrations.

## Testing

```bash
npm run test:unit     # 154 unit tests (Vitest)
npm run test:e2e      # Playwright browser tests
npm run test:smoke    # 11 endpoint smoke tests
npm run lint          # ESLint
```

### Adding Tests

- Unit tests: `tests/unit/*.test.ts`
- E2e tests: `tests/e2e/*.spec.ts`
- Integration tests: `tests/integration/*.test.ts`

## Database Changes

1. Edit `lib/db/schema.ts`
2. Run `npm run db:generate` — creates migration SQL
3. Review the generated SQL in `lib/db/migrations/`
4. Run `npm run db:migrate` — applies to database
5. Commit the migration file

**Never use `drizzle-kit push --force` in production.**

## Pull Request Process

1. Create a feature branch
2. Make changes with tests
3. Ensure `npm run lint && npm run test:unit` pass
4. Push and open PR
5. CI runs automatically (lint + tests + type check)
6. Merge after CI passes

## Project Structure

```
app/
├── (app)/           # App pages (dashboard, spools, AMS, storage, orders, etc.)
├── api/v1/          # API routes (22 endpoints)
└── global-error.tsx # Error boundary

components/
├── ams/             # AMS slot cards, sections
├── dashboard/       # Stat cards, mini views
├── layout/          # Top tabs, bottom nav, theme, printer selector
├── orders/          # Order dialog, receive wizard, shopping list
├── spool/           # Color dot, progress bar, material badge, detail sheet
├── storage/         # Rack grid, storage cell
├── shared/          # View toggle
└── ui/              # shadcn/ui components

lib/
├── db/
│   ├── schema.ts    # Database schema (20 tables)
│   ├── index.ts     # DB connection (lazy proxy)
│   └── migrations/  # SQL migration files
├── actions.ts       # Server Actions
├── auth.ts          # Authentication helpers
├── color.ts         # CIE Delta-E color distance
├── matching.ts      # 3-tier spool matching engine
├── price-crawler.ts # Shop price extraction
├── queries.ts       # Database query helpers
├── theme.ts         # Stock level colors, material badges
├── validations.ts   # Zod schemas for API validation
└── utils.ts         # Utility functions

tests/
├── unit/            # Vitest unit tests
├── integration/     # API integration tests
└── e2e/             # Playwright browser tests
```
