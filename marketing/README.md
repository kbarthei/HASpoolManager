# Marketing assets

Live screenshots and walkthrough videos for the README, social posts, and intro
videos. **Captured against the running HA addon** so they show real spools,
real prints, real data — not the synthetic e2e fixtures.

These files are **gitignored** (see `.gitignore`). For canonical, committed UI
screenshots used in PR review and docs, see [`../docs/screenshots/`](../docs/screenshots/).

## Quick start

```bash
# One-off run (Mac on the same LAN as Home Assistant required)
npm run screenshots:marketing

# Skip the 30-second walkthrough video
npm run screenshots:marketing -- --no-video

# Only the walkthrough video
npm run screenshots:marketing -- --video-only
```

## Schedule it nightly

```bash
bash scripts/launchagent/install.sh
```

Runs every day at 03:00 local time. Logs end up in
`marketing/launchagent.{stdout,stderr}.log`. Uninstall with
`bash scripts/launchagent/uninstall.sh`.

## Output layout

```
marketing/
├── screenshots/            # latest (refreshed every run)
│   ├── dark/
│   │   ├── desktop/
│   │   ├── mobile/
│   │   └── social-square/
│   └── light/
│       └── ...
├── archive/<YYYY-MM-DD>/   # dated copy for video timelines
└── walkthrough.webm        # 30s nav-through clip (1920×1080, dark theme)
```

## Override the addon URL

Defaults to `http://homeassistant.local:3001`. Override with
`HASPOOLMANAGER_URL`:

```bash
HASPOOLMANAGER_URL=http://10.10.20.5:3001 npm run screenshots:marketing
```
