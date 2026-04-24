ARG BUILD_FROM=ghcr.io/home-assistant/aarch64-base:latest
FROM ${BUILD_FROM}

# HA base is Alpine — install Node.js 22 + npm + jq + nginx + wget + full ICU (de-DE locale)
RUN apk add --no-cache nodejs npm jq nginx wget icu-data-full

WORKDIR /app

# Copy the pre-built Next.js standalone output (staged by build-addon.sh).
# Use ADD with a tarball instead of COPY on a directory tree: HA's BuildKit
# hits a path-checksum bug on the large recursive app/ dir, yielding
# `"/app": not found` during the COPY step. Shipping as a single .tar.gz
# avoids the directory traversal entirely; ADD auto-extracts.
ADD app.tar.gz ./

# Next.js standalone stripped better-sqlite3 down to its .node binary
# (built for the dev host's arch). Install a fresh copy so prebuild-install
# fetches the prebuilt binary for the container's arch, then swap it in.
RUN mkdir -p /tmp/bs && cd /tmp/bs \
    && echo '{"name":"bs","version":"0.0.0"}' > package.json \
    && npm install better-sqlite3@12.8.0 --no-audit --no-fund --loglevel=error \
    && rm -rf /app/node_modules/better-sqlite3 \
    && cp -R node_modules/better-sqlite3 /app/node_modules/better-sqlite3 \
    && cd / && rm -rf /tmp/bs

ENV NODE_ENV=production
ENV SQLITE_PATH=/config/haspoolmanager.db
ENV HA_ADDON=true
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

EXPOSE 3000

COPY nginx.conf /etc/nginx/nginx.conf
COPY run.sh /run.sh
RUN chmod +x /run.sh

CMD ["/run.sh"]
