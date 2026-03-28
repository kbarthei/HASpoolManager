# Database Migrations

This directory contains Drizzle ORM migration files.

## Commands

```bash
npm run db:generate  # Generate new migration from schema changes
npm run db:migrate   # Apply pending migrations
npm run db:studio    # Open Drizzle Studio
```

## Workflow

1. Edit `lib/db/schema.ts`
2. Run `npm run db:generate` — creates a new SQL migration file
3. Review the generated SQL
4. Run `npm run db:migrate` — applies the migration to the database
5. Commit the migration file

**Never use `drizzle-kit push --force` in production.** It can destroy data.
