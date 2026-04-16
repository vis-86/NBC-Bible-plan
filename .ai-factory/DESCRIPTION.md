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
- **Telegram Auth** — authentication via Telegram Bot (initData verification)
- **Lucia Auth** — session management on top of SQLite
- **User Settings** — reading font size, theme preferences

## Tech Stack

- **Language:** TypeScript (strict)
- **Framework:** Next.js 16 (App Router) + React 19
- **Styling:** Tailwind CSS v4 + custom CSS variables
- **Animation:** Framer Motion (`motion` package)
- **Icons:** Lucide React
- **UI Components:** shadcn/ui (components.json configured)
- **Markdown:** react-markdown + remark-gfm + rehype-raw
- **Auth:** Lucia v3 + `better-sqlite3` (SQLite) + Telegram Bot
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
- **Auth:** Cookie-based sessions via Lucia; Telegram initData verified server-side
- **AI:** Feature-flagged via `NEXT_PUBLIC_AI_ENABLE`; disabled by default
- **Performance:** React Compiler enabled (`babel-plugin-react-compiler`)
- **Security:** Auth token stored in httpOnly cookies; Directus admin token server-only
