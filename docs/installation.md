# Installation and Setup Guide

HASpoolManager is a 3D printing filament lifecycle manager that runs as a Home Assistant addon. It can be deployed in three ways: as a Home Assistant addon (production), as an iOS PWA, or as a local development server.

---

## 1. Home Assistant Addon (Production)

This is the primary deployment mode. The addon runs inside a Docker container on your Home Assistant instance with nginx reverse-proxying requests to a Next.js standalone server.

### Prerequisites

- Home Assistant OS or Supervised installation with addon support
- SSH key authentication configured for `root@homeassistant`
- The HASpoolManager repository cloned locally

### Deployment

Run the deploy script from the project root:

```bash
./ha-addon/deploy.sh
```

This script:

1. Bumps the version in `ha-addon/haspoolmanager/config.yaml` automatically
2. Builds Next.js in standalone mode (`HA_ADDON=true`, `basePath=/ingress`)
3. Packs the addon into `haspoolmanager-<version>.tar.gz`
4. Copies the tar to Home Assistant via SCP (`root@homeassistant`)
5. Installs the addon on Home Assistant

### Addon Configuration

After installation, configure these options in the Home Assistant UI (Settings > Add-ons > Spool Manager > Configuration):

| Option | Description |
|--------|-------------|
| `log_level` | Logging verbosity (debug, info, warning, error) |
| `api_key` | Bearer token for API authentication |
| `anthropic_api_key` | Claude API key for AI-powered order email parsing (optional) |

### Storage

The addon maps `/config/` read-write. The SQLite database lives at `/config/haspoolmanager.db` and persists across addon restarts and updates.

### Access Methods

The addon exposes two ports with different access patterns:

**HA Ingress (port 3000)**
- Access via the Home Assistant sidebar: click "Spool Manager"
- Requires Home Assistant login
- Runs behind the HA ingress proxy with `/ingress` base path

**Direct Access (port 3001)**
- Access at `http://homeassistant:3001`
- No Home Assistant login required
- Can be installed as a PWA (see below)
- Works independently of the HA session

---

## 2. PWA Installation (iOS)

The direct access port (3001) supports installation as a standalone Progressive Web App on iOS devices. This is useful for managing filament at the printer without opening a browser.

### Steps

1. Open `http://homeassistant:3001` in Safari on your iPhone or iPad
2. Tap the Share button (square with arrow)
3. Tap "Add to Home Screen"
4. Confirm the name and tap "Add"

The app opens as a standalone application without the Safari navigation bar. It works permanently across Home Assistant restarts since it connects directly to port 3001.

---

## 3. Local Development

### Prerequisites

- Node.js (version matching the project's `.nvmrc` or `package.json` engines)
- npm

### Setup

```bash
git clone https://github.com/kbarthei/HASpoolManager.git
cd HASpoolManager
npm install
cp .env.example .env.local
# Edit .env.local — see environment variables below
npm run db:push      # Apply Drizzle schema to local SQLite
npm run dev          # Start dev server at http://localhost:3000
```

### Environment Variables

Configure these in `.env.local` for local development:

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SQLITE_PATH` | No | `./data/haspoolmanager.db` | Path to the SQLite database file |
| `API_SECRET_KEY` | Yes | -- | Bearer token used for API authentication |
| `ANTHROPIC_API_KEY` | No | -- | Claude API key for AI-powered order email parsing |
| `HA_ADDON` | No | `false` | Set to `true` only in the addon container build |

### Running Tests

```bash
npm run test:unit          # Unit tests (no database needed)
npm run test:integration   # Integration tests (per-worker SQLite harness)
npm run test:e2e           # E2e tests (requires Docker)
```

---

## First Steps After Install

1. Open the dashboard. It shows an empty state with no spools.
2. Go to **Orders** and click **"+ Add Order"**. Paste an order confirmation email and the AI parser extracts filament details automatically (requires `anthropic_api_key` / `ANTHROPIC_API_KEY`).
3. Alternatively, add data manually: create vendors, filaments, and spools through the UI.
4. Configure Home Assistant automations for printer sync. See `docs/03-ha-integration.md` for webhook contracts, automation YAML, and data flow details.
