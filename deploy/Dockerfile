# syntax=docker/dockerfile:1
# Multi-stage build for NBC Bible Plan: static export (Next.js `output: 'export'`)
# + Hono BFF, replacing the old single Next.js standalone server (see
# .ai-factory/plans/feature-static-export-hono-bff.md, T6/T12). No native build
# deps needed anymore — better-sqlite3/lucia (SQLite auth) are gone (T6).

FROM node:22-slim AS base
WORKDIR /app
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
ARG NEXT_PUBLIC_REGISTER_ENABLED
ARG NEXT_PUBLIC_REGISTER_REQUIRE_CODE
ENV NEXT_PUBLIC_BASE_PATH=$NEXT_PUBLIC_BASE_PATH
ENV NEXT_PUBLIC_DIRECTUS_URL=$NEXT_PUBLIC_DIRECTUS_URL
ENV NEXT_PUBLIC_AI_ENABLE=$NEXT_PUBLIC_AI_ENABLE
ENV NEXT_PUBLIC_REGISTER_ENABLED=$NEXT_PUBLIC_REGISTER_ENABLED
ENV NEXT_PUBLIC_REGISTER_REQUIRE_CODE=$NEXT_PUBLIC_REGISTER_REQUIRE_CODE
# next build && build-manifest && build-sw (see package.json "build") -> out/ + out/sw.js
RUN yarn build

# ---------------------------------------------------------------------------
# bff: Hono API server. Runs TS directly via tsx (no separate build step for
# the BFF, see T1 — keeps this small/volunteer-maintainable), so the runtime
# image needs the full node_modules (tsx is a devDependency), not a pruned one.
# ---------------------------------------------------------------------------
FROM node:22-slim AS bff
WORKDIR /app
ENV NODE_ENV=production
RUN groupadd -g 1001 nodejs && useradd -u 1001 -g nodejs -m bff

COPY --from=deps /app/node_modules ./node_modules
COPY package.json yarn.lock tsconfig.json ./
COPY server ./server
# Runtime dependency closure of server/src (see .ai-factory/plans/feature-static-export-hono-bff.md T12):
# src/lib, src/features/*/services, src/types, src/shared/utils. No src/app, no src/components —
# those are client-only and belong to the static export.
# Инвариант проверяется тестом server/src/runtime-closure.test.ts: любой новый
# `../../../src/...` импорт из server/src обязан быть покрыт COPY-строкой ниже.
COPY src/lib ./src/lib
COPY src/features/songs/services ./src/features/songs/services
COPY src/features/setlists/services ./src/features/setlists/services
COPY src/types ./src/types
COPY src/shared/utils ./src/shared/utils
# Self-hosted Bible text (src/lib/bible-data.ts reads from process.cwd()/data at runtime)
COPY --from=build /app/data ./data

RUN chown -R bff:nodejs /app
USER bff
EXPOSE 3001
CMD ["node_modules/.bin/tsx", "server/src/index.ts"]

# ---------------------------------------------------------------------------
# static: nginx serving the exported app shell (out/) under /app. Replaces the
# stock nginx:alpine image used directly in compose.yml — this bakes the build
# artifact in so nginx has no bind-mounted app content.
# ---------------------------------------------------------------------------
FROM nginx:alpine AS static
COPY --from=build /app/out /usr/share/nginx/html/app
