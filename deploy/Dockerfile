# syntax=docker/dockerfile:1
# Multi-stage build for Next.js 16 standalone (NBC Bible Plan)

FROM node:22-slim AS base
WORKDIR /app
# better-sqlite3 native build deps
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 make g++ ca-certificates \
    && rm -rf /var/lib/apt/lists/*
RUN corepack enable

FROM base AS deps
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# NEXT_PUBLIC_* are inlined into the client bundle at build time
ARG NEXT_PUBLIC_BASE_PATH=/app
ARG NEXT_PUBLIC_DIRECTUS_URL
ARG NEXT_PUBLIC_AI_ENABLE
ENV NEXT_PUBLIC_BASE_PATH=$NEXT_PUBLIC_BASE_PATH
ENV NEXT_PUBLIC_DIRECTUS_URL=$NEXT_PUBLIC_DIRECTUS_URL
ENV NEXT_PUBLIC_AI_ENABLE=$NEXT_PUBLIC_AI_ENABLE
RUN yarn build

FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
RUN groupadd -g 1001 nodejs && useradd -u 1001 -g nodejs -m nextjs

# Self-hosted Bible text is read at runtime from process.cwd()/data
COPY --from=build /app/public ./public
COPY --from=build /app/data ./data
# Next.js standalone output (includes traced node_modules incl. better-sqlite3)
COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static

# Writable dir for Lucia SQLite (auth/sessions) — mounted as a volume in compose
RUN mkdir -p /app/database && chown -R nextjs:nodejs /app/database /app/data

USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
