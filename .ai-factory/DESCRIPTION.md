# Project: NBC Bible Plan

## Overview

Web application for the New Baptist Church (NBC) community — a structured Bible reading plan with progress tracking, daily navigation, and AI-powered chat assistant ("Chat with Pastor"). The app supports Telegram authentication, enables tracking reading progress per chapter and per day, and delivers a verse of the day and weekly reading plans.

## Core Features

- **Bible Reading Plan** — structured daily/weekly reading assignments from Directus CMS
- **Progress Tracking** — per-chapter and per-day completion tracking stored in SQLite
- **Bible Reader** — in-app chapter reader with navigation, font settings, and completion flow
- **Daily Navigation** — swipeable day navigation bar with completion status indicators
- **Calendar View** — monthly calendar for reviewing past/future reading days
- **Verse of the Day** — daily scripture from Directus
- **AI Chat** ("Chat with Pastor") — AI assistant via n8n + Directus Flow
- **Songs (ChordPro)** — каталог песен community: список + нечёткий поиск (fuse.js) + просмотр (ChordPro→HTML, аккорды над текстом, одноколоночный фокус-режим). Data source — Directus `songs` (сырой ChordPro в `content`); наполнение через `songs:bootstrap`/`songs:import` из `data/songs/*.chordpro`
- **Invite + Password Auth** — псевдонимный вход (логин→`{login}@local.baptistnn.ru` + пароль). Аккаунты заводятся через invite-ссылку (stateful токен `auth_invites`); та же ссылка = сброс пароля
- **Self-registration по коду церкви** — `/register` (login + password + churchCode). Общий секрет `REGISTER_CHURCH_CODE` (timing-safe, rate-limit 5/час); включается флагами `REGISTER_CHURCH_CODE` (runtime) + `NEXT_PUBLIC_REGISTER_ENABLED` (build-time UI). Без секрета роут `/api/auth/register` → 503. Параллельна invite-модели
- **Telegram Auth (вторично)** — mini-app для VPN; initData верифицируется, аккаунты НЕ создаются — только привязка tg_id к существующему аккаунту
- **PWA** — устанавливаемое приложение вне Telegram (manifest + service worker, basePath-aware)
- **Sessions** — iron-session: зашифрованный+подписанный httpOnly cookie (без Directus access_token; доступ к данным через admin-client + directus_id)
- **User Settings** — reading font size, theme preferences

## Tech Stack

- **Language:** TypeScript (strict)
- **Framework:** Next.js 16 (App Router) + React 19
- **Styling:** Tailwind CSS v4 + custom CSS variables
- **Animation:** Framer Motion (`motion` package)
- **Icons:** Lucide React
- **UI Components:** shadcn/ui (components.json configured)
- **Markdown:** react-markdown + remark-gfm + rehype-raw
- **Search:** fuse.js (клиентский нечёткий поиск по каталогу песен)
- **Auth:** iron-session (sealed cookie) + Directus password auth + Telegram link; validation via `zod`
- **Tests:** Vitest (auth lib/API unit tests, node env); component tests via @testing-library/react + jsdom (per-file `// @vitest-environment jsdom`)
- **CMS / Data:** Directus CMS with `@directus/sdk` v20
- **AI Workflow:** n8n workflows triggered via Directus Flows
- **GraphQL:** Custom GraphQL API route (Apollo or fetch-based)
- **Deployment:** Standalone Next.js + nginx reverse proxy, deployed via `copy-prod.sh`

## Architecture

Feature-Sliced Design (FSD):

```
src/
├── app/                      # Next.js App Router (pages, layouts, API routes)
│   ├── api/                  # API routes (auth, bible, plan, user, directus proxy, ai, graphql)
│   └── dashboard/            # Authenticated pages (main, read, calendar, settings)
├── features/
│   ├── plan/                 # Reading plan feature (PlanView, DayNav, hooks, context)
│   └── reading/              # Bible reader feature (ReadingView, ChapterPicker, hooks)
└── shared/
    ├── components/           # Shared UI (layout, animations, bible display, skeletons, ui)
    ├── hooks/                # Shared hooks
    ├── services/             # API client + endpoints + GraphQL
    ├── types/                # Shared types
    └── utils/                # date, bible, cn, api, theme, constants
```

## Non-Functional Requirements

- **Language:** UI is Russian; code and comments in English
- **Deployment:** Standalone mode, deployed behind nginx with `NEXT_PUBLIC_BASE_PATH=/app`
- **Auth:** Псевдонимная модель (логин+пароль, без email/телефона/ФИО → минимум ФЗ-152; сервер в РФ). iron-session sealed httpOnly cookie. Telegram initData verified server-side. Invite/reset токены — stateful записи в Directus `auth_invites`. Self-registration по коду церкви (`REGISTER_CHURCH_CODE`, timing-safe + rate-limit). Требуются env `SESSION_SECRET`, `INVITE_ADMIN_SECRET`; опц. `REGISTER_CHURCH_CODE` + `NEXT_PUBLIC_REGISTER_ENABLED` для регистрации
- **PWA:** Установка вне Telegram; SW отдаётся из-под basePath (`/app/sw.js`) для совместимости с nginx-деплоем
- **AI:** Feature-flagged via `NEXT_PUBLIC_AI_ENABLE`; disabled by default
- **Performance:** React Compiler enabled (`babel-plugin-react-compiler`)
- **Security:** Auth token stored in httpOnly cookies; Directus admin token server-only
