# UI screenshots — synthetic captures

Canonical screenshots of every major page, captured automatically from the
**e2e addon stack** (Docker nginx + ingress simulator + Next.js standalone)
seeded with deterministic demo data. Refreshed by
[`.github/workflows/screenshots.yml`](../../.github/workflows/screenshots.yml)
on:

- Weekly cron (Mondays, 04:00 UTC)
- Manual trigger from the Actions tab
- Push to `main` that touches `app/` or `components/`

The bot commits new PNGs back as `docs: refresh UI screenshots [skip ci]`.

## Layout

```
docs/screenshots/
├── dark/
│   ├── desktop/        # 1440×900 @2x
│   │   ├── 01-dashboard.png
│   │   ├── 02-inventory.png
│   │   └── …
│   └── mobile/         # 390×844 @2x (iPhone 14)
└── light/
    └── (same)
```

## Run locally

```bash
npm run screenshots:docs
```

Requires Docker (OrbStack / Docker Desktop) running, since the script spins up
the full addon stack.

## Live-data captures

For marketing material with real spools and real prints, see
[`../../marketing/`](../../marketing/) — captured against the running HA
addon, gitignored (refreshed on the maintainer's Mac via LaunchAgent).
