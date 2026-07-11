# Project: NBC Bible Plan

## Overview

Web application for the New Baptist Church (NBC) community — a structured Bible reading plan with progress tracking, daily navigation, and AI-powered chat assistant ("Chat with Pastor"). The app supports Telegram authentication, enables tracking reading progress per chapter and per day, and delivers a verse of the day and weekly reading plans.

## Core Features

- **Bible Reading Plan** — structured daily/weekly reading assignments from Directus CMS
- **Progress Tracking** — per-chapter and per-day completion tracking stored in Directus (`reading` collection, admin-client + `directus_user_id` filter)
- **Bible Reader** — in-app chapter reader with navigation, font settings, and completion flow
- **Daily Navigation** — swipeable day navigation bar with completion status indicators
- **Calendar View** — monthly calendar for reviewing past/future reading days
- **Verse of the Day** — daily scripture from Directus
- **AI Chat** ("Chat with Pastor") — AI assistant via n8n + Directus Flow
- **Songs (ChordPro)** — каталог песен community: список + нечёткий поиск (fuse.js) + просмотр (ChordPro→HTML, аккорды над текстом, одноколоночный фокус-режим). Data source — Directus `songs` (сырой ChordPro в `content`); наполнение через `songs:bootstrap`/`songs:import` из `data/songs/*.chordpro`
- **Invite + Password Auth** — псевдонимный вход (логин→`{login}@local.baptistnn.ru` + пароль). Аккаунты заводятся через invite-ссылку (stateful токен `auth_invites`); та же ссылка = сброс пароля
- **Self-registration (код церкви опционален)** — `/register` (login + password, код церкви — по флагу). Расцеплены «регистрация открыта» и «нужен ли код»: секрет `REGISTER_CHURCH_CODE` задан ⇒ код обязателен (timing-safe, rate-limit 5/час); секрет пуст + `REGISTER_OPEN_NO_CODE`=true ⇒ открыто без кода; ни того, ни другого ⇒ роут `/api/auth/register` → 503. UI-флаги build-time: `NEXT_PUBLIC_REGISTER_ENABLED` (форма vs заглушка) + `NEXT_PUBLIC_REGISTER_REQUIRE_CODE` (default true; прячет поле кода). Параллельна invite-модели
- **Telegram Auth (вторично)** — mini-app для VPN; initData верифицируется, аккаунты НЕ создаются — только привязка tg_id к существующему аккаунту
- **PWA** — устанавливаемое приложение вне Telegram (manifest + service worker, basePath-aware)
- **Offline-first PWA** — build-time Serwist precache SW (атомарный снимок ВСЕХ статических файлов `out/` на install, cache-first навигации по любому маршруту, kill switch); Писание/песни/план читаются офлайн через IndexedDB read-through слой (network-first + IDB fallback); базовый набор (план/песни/дефолтный перевод) докачивается автоматически после логина (iOS partition fix); опциональная загрузка остальных переводов «на устройство» с `navigator.storage.persist()`; прогресс отмечается офлайн через write-ahead outbox с LWW-синком при восстановлении сети; офлайн-вход по last-known-user. Секция «Оффлайн-данные» в настройках (скачать/обновить/очистить)
- **Sessions** — iron-session: зашифрованный+подписанный httpOnly cookie (без Directus access_token; доступ к данным через admin-client + directus_id)
- **User Settings** — reading font size, theme preferences

## Tech Stack

- **Language:** TypeScript (strict)
- **Frontend:** Next.js 16 (App Router, `output: 'export'` — static, no server runtime) + React 19
- **API:** Hono BFF (`server/`) — separate Node process (`tsx`, no build step), was `src/app/api/**` before the static-export migration
- **Service Worker:** `@serwist/build` — build-time precache manifest (`scripts/build-sw.ts` → `out/sw.js`)
- **Styling:** Tailwind CSS v4 + custom CSS variables (design tokens — colors, radius scale, shadows; see `docs/design-system.md`)
- **Fonts:** Inter (UI) + Literata (long-form reading: Bible text, song lyrics) + Geist Mono (chords/numbers), self-hosted via `next/font/google`
- **Animation:** Framer Motion (`motion` package)
- **Icons:** Lucide React
- **UI Components:** shadcn/ui (components.json configured)
- **Markdown:** react-markdown + remark-gfm + rehype-raw
- **Search:** fuse.js (клиентский нечёткий поиск по каталогу песен)
- **Auth:** iron-session (sealed cookie, framework-agnostic core in `src/lib/session-core.ts`) + Directus password auth + Telegram link; validation via `zod`
- **Offline storage:** `idb` (typed IndexedDB wrapper) — bibleChapters/songs/apiCache/outbox/meta/manifest, schema-versioned
- **Tests:** Vitest (auth lib/API unit tests, node env); component tests via @testing-library/react + jsdom (per-file `// @vitest-environment jsdom`); IndexedDB-зависимые тесты через `fake-indexeddb/auto`; Playwright для офлайн E2E-регрессии (`e2e/offline/`, `npm run e2e:offline`)
- **CMS / Data:** Directus CMS with `@directus/sdk` v20
- **AI Workflow:** n8n workflows triggered via Directus Flows
- **GraphQL:** Custom regex-dispatcher route in the BFF (`server/src/routes/graphql.ts`), не настоящий GraphQL
- **Deployment:** Docker Compose (`postgres` + `directus` + `bff` + `nginx`); nginx отдаёт static export напрямую и проксирует `/app/api/*` на BFF; деплой через `deploy/deploy.sh` (rsync + build на сервере)

## Architecture

Feature-Sliced Design (FSD):

```
src/
├── app/                      # Next.js App Router — static export, UI only (no API routes)
│   └── dashboard/            # Authenticated pages (main, read, calendar, settings), client auth-guard
├── features/
│   ├── plan/                 # Reading plan feature (PlanView, DayNav, hooks, context)
│   ├── reading/               # Bible reader feature (ReadingView, ChapterPicker, hooks)
│   └── offline/               # Offline data settings UI (OfflineDataSection, useOfflineData)
├── sw/                        # Build-time service worker source (esbuild + @serwist/build)
├── lib/                       # Business logic shared by client AND server/ (session-core, bible-data, directus-*)
└── shared/
    ├── components/           # Shared UI (layout, animations, bible display, skeletons, ui)
    ├── hooks/                # Shared hooks
    ├── services/             # API client + endpoints + GraphQL client
    ├── offline/               # IndexedDB layer, read-through, write-ahead outbox, sync, download manager, autoDownload
    ├── types/                # Shared types
    └── utils/                # date, bible, cn, api, theme, constants

server/                        # Hono BFF — separate process/container
└── src/
    ├── index.ts               # @hono/node-server entrypoint
    └── routes/                # auth, bible (incl. bulk download), plan, songs, user, chat, graphql, directus-proxy, ai
```

## Non-Functional Requirements

- **Language:** UI is Russian; code and comments in English
- **Deployment:** Static export (`output: 'export'`) + Hono BFF, deployed behind nginx (Docker Compose) with `NEXT_PUBLIC_BASE_PATH=/app`
- **Auth:** Псевдонимная модель (логин+пароль, без email/телефона/ФИО → минимум ФЗ-152; сервер в РФ). iron-session sealed httpOnly cookie. Telegram initData verified server-side. Invite/reset токены — stateful записи в Directus `auth_invites`. Self-registration с опциональным кодом церкви (`REGISTER_CHURCH_CODE` задан ⇒ код обязателен, timing-safe + rate-limit; `REGISTER_OPEN_NO_CODE` ⇒ открыто без кода). Требуются env `SESSION_SECRET`, `INVITE_ADMIN_SECRET`; опц. `REGISTER_CHURCH_CODE`/`REGISTER_OPEN_NO_CODE` (runtime) + `NEXT_PUBLIC_REGISTER_ENABLED`/`NEXT_PUBLIC_REGISTER_REQUIRE_CODE` (build-time UI)
- **PWA:** Установка вне Telegram; SW отдаётся из-под basePath (`/app/sw.js`) для совместимости с nginx-деплоем
- **AI:** Feature-flagged via `NEXT_PUBLIC_AI_ENABLE`; disabled by default
- **Performance:** React Compiler enabled (`babel-plugin-react-compiler`)
- **Security:** Auth token stored in httpOnly cookies; Directus admin token server-only
