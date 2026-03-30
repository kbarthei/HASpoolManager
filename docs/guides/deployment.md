# Deployment Guide

Deploy HASpoolManager to Vercel for production use.

## Vercel Deployment

### 1. Create Vercel Project

```bash
npm install -g vercel
vercel link
```

### 2. Set Up Neon Database

1. Go to [neon.tech](https://neon.tech) → Create a project
2. Copy the connection string
3. Add to Vercel:
```bash
vercel env add DATABASE_URL production
# Paste the connection string
```

### 3. Configure Environment

```bash
# Required
vercel env add API_SECRET_KEY production

# Optional — for AI order parsing
vercel env add ANTHROPIC_API_KEY production

# Optional — for error monitoring
vercel env add NEXT_PUBLIC_SENTRY_DSN production
```

### 4. Deploy

```bash
vercel --prod
```

### 5. Initialize Database

The database schema is applied automatically on first access. To seed with sample data:
```bash
npm run db:migrate
```

## Region Configuration

By default, HASpoolManager deploys to Frankfurt (fra1) for EUR pricing from European shops:

```json
// vercel.json
{
  "regions": ["fra1"]
}
```

Change to another region if needed for latency.

## CI/CD Pipeline

GitHub Actions runs automatically on every push:

```
git push → GitHub Actions
  ├─ lint-and-test:
  │   ├─ npm audit (security)
  │   ├─ lint (ESLint)
  │   ├─ type check (tsc)
  │   └─ unit tests (154 Vitest)
  │
  ├─ e2e-tests:
  │   └─ Playwright (chromium)
  │
  └─ smoke-test:
      └─ 11 endpoint checks against production
```

## Security Headers

Automatically configured:
- `Strict-Transport-Security` (HSTS)
- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: camera=(), microphone=(), geolocation=()`

## Monitoring

- **Sentry** — Error tracking (set `NEXT_PUBLIC_SENTRY_DSN`)
- **Vercel Analytics** — Performance monitoring
- **Smoke tests** — Automated endpoint checks
