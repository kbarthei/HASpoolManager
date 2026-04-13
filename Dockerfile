# Multi-stage Dockerfile for CI builds.
# Builds Next.js from source, produces a standalone addon image.
#
# For HA addon: uses Alpine base with Node.js (same as ha-addon/haspoolmanager/Dockerfile)
# The target arch is handled by Docker buildx --platform flag.

# ── Stage 1: Build ─────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /build

# Install deps first (cached layer)
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

# Copy source
COPY . .

# Build Next.js standalone
ENV HA_ADDON=true
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# Bundle sync worker
RUN npx esbuild scripts/start-sync-worker.ts \
  --bundle --platform=node --target=node22 --format=esm \
  --external:better-sqlite3 --external:ws \
  --outfile=.next/standalone/sync-worker.js

# Copy extras into standalone
RUN cp scripts/migrate-db.js .next/standalone/migrate-db.js
RUN cp -R .next/static .next/standalone/.next/static
RUN mkdir -p .next/standalone/public && (cp -R public/. .next/standalone/public/ 2>/dev/null || true)

# ── Stage 2: Runtime ───────────────────────────────────────────────────────
FROM alpine:3.21

# Install Node.js + nginx + ICU (same packages as ha-addon Dockerfile)
RUN apk add --no-cache nodejs npm jq nginx wget icu-data-full

WORKDIR /app

# Copy standalone build from builder
COPY --from=builder /build/.next/standalone/ ./

# Install native modules for target arch
RUN mkdir -p /tmp/native && cd /tmp/native \
    && echo '{"name":"n","version":"0.0.0"}' > package.json \
    && npm install better-sqlite3@12.8.0 ws@8.18.0 --no-audit --no-fund --loglevel=error \
    && rm -rf /app/node_modules/better-sqlite3 \
    && cp -R node_modules/better-sqlite3 /app/node_modules/better-sqlite3 \
    && cp -R node_modules/ws /app/node_modules/ws \
    && cd / && rm -rf /tmp/native

ENV NODE_ENV=production
ENV SQLITE_PATH=/config/haspoolmanager.db
ENV HA_ADDON=true
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

EXPOSE 3000

# Copy addon config files
COPY ha-addon/haspoolmanager/nginx.conf /etc/nginx/nginx.conf
COPY ha-addon/haspoolmanager/run.sh /run.sh
RUN chmod +x /run.sh

CMD ["/run.sh"]
