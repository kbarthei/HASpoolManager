# Screenshots

Single source of truth for all UI screenshots used in the project — README,
docs, social posts, walkthrough videos. Captured against the **live HA addon**
on the maintainer's LAN by `scripts/capture-screenshots.ts` and committed to
git after **redaction** of sensitive values (IPs, Amazon order numbers,
Bambu device IDs + serials).

## Quick start

```bash
# Refresh everything (Mac on the same LAN as Home Assistant required)
npm run screenshots

# Only the still images, skip the video
npm run screenshots -- --no-video

# Only the 30s walkthrough video
npm run screenshots -- --video-only
```

## Schedule it nightly

```bash
bash scripts/launchagent/install.sh
```

Runs every day at 03:00 local time. Logs end up in
`screenshots/launchagent.{stdout,stderr}.log`. Uninstall with
`bash scripts/launchagent/uninstall.sh`.

## Layout

```
screenshots/
├── light/
│   ├── desktop/              # 1440×900 @2x
│   │   ├── 01-dashboard.png
│   │   ├── …
│   │   └── sections/         # card-level clips for embedding
│   │       ├── 01-dashboard--printer-live.png
│   │       └── …
│   ├── mobile/               # 390×844 @2x (iPhone 14)
│   └── social-square/        # 1080×1080 @1x
├── dark/                     # same as light
└── walkthrough.webm          # 30s nav-through clip (1920×1080, dark)
```

Each rerun **overwrites** the existing PNGs in place — no archive, no
timeline. The current files are always the latest.

## Redaction layers

`scripts/capture-screenshots.ts` runs two passes before every shot:

1. **Regex** on every text node:
   - private IPv4 (192.168 / 10.x / 172.16-31) → `192.168.x.x` etc.
   - Amazon order numbers (`NNN-NNNNNNN-NNNNNNN`) → `XXX-XXXXXXX-XXXXXXX`

2. **Selector-targeted** on admin label/value pairs:
   `Device ID`, `IP Address`, `Serial`, `HA URL`, `Websocket URL` → `••••`

If you spot a leak, add the new pattern/label to the `REDACTION_SCRIPT`
constant in the capture script and re-run.

## Trim mode

Some pages (e.g. `/admin`) grow tall as the sync log + HMS log accumulate
events. Per-page `hide` selectors in the capture script remove those
debug-y tables before the screenshot, keeping the marketing-friendly
shots compact and readable. The live page is unaffected.

## Override the addon URL

Defaults to `http://homeassistant.local:3001`. Override with
`HASPOOLMANAGER_URL`:

```bash
HASPOOLMANAGER_URL=http://10.10.20.5:3001 npm run screenshots
```
