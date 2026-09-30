# syntax=docker/dockerfile:1

# ---- dependencies (compilers only needed if a native module has no prebuilt binary)
FROM node:22-bookworm-slim AS deps
WORKDIR /app
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# ---- build
FROM node:22-bookworm-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ---- runtime: Next's standalone server plus the files it reads at run time
FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=8421 \
    HOSTNAME=0.0.0.0 \
    DATABASE_PATH=/data/places.db \
    BACKUP_DIR=/backups \
    TZ=Europe/London

# tzdata so TZ=Europe/London gives the right "today", weekends and 03:00 backups.
RUN apt-get update \
 && apt-get install -y --no-install-recommends tzdata \
 && rm -rf /var/lib/apt/lists/*

COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
COPY --from=build /app/drizzle ./drizzle

# Git commit the image was built from, shown by /api/health (set by CI; "dev" locally).
ARG GIT_SHA=dev
ENV APP_VERSION=$GIT_SHA

# Non-root by default; docker-compose overrides the uid/gid with PUID/PGID.
RUN mkdir -p /data /backups /app/.next/cache && chown 1000:1000 /data /backups /app/.next/cache
USER 1000

EXPOSE 8421
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:8421/api/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]

CMD ["node", "server.js"]
