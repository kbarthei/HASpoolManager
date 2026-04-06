# Stage 1: Build
FROM node:22-alpine AS builder
WORKDIR /app

# Install build tools for better-sqlite3 native compilation
RUN apk add --no-cache build-base python3

COPY package*.json ./
RUN npm ci

COPY . .

# Set environment for build
ENV DATABASE_PROVIDER=sqlite
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

RUN npm run build

# Stage 2: Runner
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV DATABASE_PROVIDER=sqlite
ENV SQLITE_PATH=/config/haspoolmanager.db
ENV HA_ADDON=true
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

# Copy standalone build
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

EXPOSE 3000

CMD ["node", "server.js"]
