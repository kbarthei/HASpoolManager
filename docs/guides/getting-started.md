# Getting Started

Get HASpoolManager running locally in 5 minutes.

## Prerequisites

- **Node.js 22+** — [Download](https://nodejs.org)
- **Neon Postgres** — [Free account](https://neon.tech)
- **Git** — for cloning

## Setup

### 1. Clone and Install

```bash
git clone https://github.com/kbarthei/HASpoolManager.git
cd HASpoolManager
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env.local
```

Edit `.env.local`:
```env
# Required
DATABASE_URL=postgresql://user:pass@host/dbname?sslmode=require
API_SECRET_KEY=your-secret-key-for-ha-webhooks

# Optional
ANTHROPIC_API_KEY=sk-ant-...  # For AI order parsing
NEXT_PUBLIC_SENTRY_DSN=       # For error monitoring
```

### 3. Initialize Database

```bash
npm run db:migrate    # Apply schema migrations
```

### 4. Start Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## First Steps

1. **Dashboard** — empty but functional
2. **Orders** → **"+ Add Order"** — paste an order email to add your first spools
3. **Storage** — see your spool rack
4. **AMS** — view (empty until connected to Home Assistant)

## Available Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Production build |
| `npm run test` | Run all unit tests |
| `npm run test:unit` | Run unit tests only |
| `npm run test:e2e` | Run Playwright e2e tests |
| `npm run test:smoke` | Run smoke tests against a URL |
| `npm run lint` | Run ESLint |
| `npm run db:generate` | Generate migration from schema changes |
| `npm run db:migrate` | Apply pending migrations |
| `npm run db:studio` | Open Drizzle Studio (DB browser) |

## Next Steps

- [Configuration Guide](configuration.md) — customize rack size, printer setup
- [Deployment Guide](deployment.md) — deploy to Vercel
- [User Stories](../user-stories/procurement.md) — learn the workflows
