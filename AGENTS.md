# AGENTS.md

> Project map for AI agents. Keep this file up-to-date as the project evolves.

## Project Overview

NBC Bible Plan — web application for a church community providing a structured Bible reading plan with progress tracking, daily navigation, Bible reader, and AI assistant ("Chat with Pastor"). Authentication via Telegram Bot and iron-session sessions. Content managed in Directus CMS.

Frontend is a Next.js **static export** (`output: 'export'`, no server-side Next.js at
runtime); all API is served by a separate **Hono BFF** (`server/`) as its own process/
container. See `.ai-factory/plans/feature-static-export-hono-bff.md` for the migration
rationale.

## Tech Stack

- **Language:** TypeScript (strict)
- **Frontend:** Next.js 16 (App Router, static export) + React 19
- **API:** Hono (`server/`) — separate Node process, `tsx` (no build step)
- **Service Worker:** `@serwist/build` — build-time precache manifest injection
- **Styling:** Tailwind CSS v4
- **Auth:** iron-session (`src/lib/session-core.ts`) + Telegram Bot
- **CMS:** Directus CMS (`@directus/sdk` v20)
- **AI:** n8n workflows via Directus Flows
- **Animation:** Framer Motion (`motion`)
- **UI:** shadcn/ui + Lucide React icons

## Project Structure

```
bible-plan/
├── src/
│   ├── app/                          # Next.js App Router — static export (output: 'export'), no server runtime
│   │   ├── dashboard/
│   │   │   ├── page.tsx              # Main dashboard (PlanView)
│   │   │   ├── layout.tsx            # Dashboard layout + DashboardAuthGate (client auth guard)
│   │   │   ├── read/page.tsx         # Bible reader page (?book=&chapter=, no dynamic segments)
│   │   │   ├── calendar/             # Calendar view
│   │   │   └── settings/             # User settings
│   │   ├── login/                    # Login page
│   │   ├── activate/                 # Invite activation + password reset (invite model)
│   │   ├── register/                 # Self-registration по коду церкви (gated by NEXT_PUBLIC_REGISTER_ENABLED)
│   │   ├── page.tsx                  # Landing page
│   │   ├── layout.tsx                # Root layout
│   │   ├── global-error.tsx          # Root error boundary — required for output: 'export'
│   │   ├── not-found.tsx             # Root 404 boundary — required for output: 'export'
│   │   └── globals.css               # Global styles + Tailwind v4 config
│   ├── features/
│   │   ├── plan/                     # Reading plan feature slice
│   │   │   ├── components/           # PlanView, DayNavigationBar, TodayReadingCard, VerseOfTheDay, etc.
│   │   │   ├── hooks/                # usePlan, useProgress, useDayCompletion
│   │   │   └── contexts/             # PlanContext
│   │   ├── reading/                  # Bible reader feature slice
│   │   │   ├── components/           # ReadingView, ReadingHeader, BookPicker, ChapterPicker, etc.
│   │   │   ├── hooks/                # useBibleText, useChapterNavigation, useReadingSettings
│   │   │   ├── types.ts              # Reading-specific types
│   │   │   └── bible-text-cache.ts   # Client-side cache for bible text
│   │   ├── songs/                    # Songs (ChordPro) feature slice
│   │   │   ├── components/           # SongList, SongCard, SongView, SearchBar, render/*
│   │   │   ├── hooks/                # useSongs, useSong, useSongSearch, useScrollRestore
│   │   │   ├── lib/                  # ChordPro parser, offlineSongs (read-through)
│   │   │   └── types.ts              # Song-specific types
│   │   └── landing/                  # Public landing slice (orchestrated by app/page.tsx)
│   │       ├── components/           # Header, Hero, About, HowToStart, InstallGuide, FinalCta, Footer, Atmosphere, PhoneMockup, cta
│   │       ├── components/anim.ts    # Shared motion reveal variants
│   │       └── index.ts              # Barrel of section components
│   │   └── offline/                  # Offline data settings UI
│   │       ├── components/           # OfflineDataSection
│   │       └── hooks/                # useOfflineData
│   ├── sw/
│   │   └── sw.ts                     # Build-time SW (esbuild + @serwist/build injectManifest → out/sw.js)
│   ├── components/
│   │   ├── AuthProvider.tsx          # Session state (checkSession/refreshAuth), last-known-user fallback
│   │   ├── DashboardAuthGate.tsx     # (in app/dashboard/layout.tsx) client route guard — replaces middleware.ts
│   │   ├── ServiceWorkerRegistrar.tsx # SW registration + waiting/update detection
│   │   └── ChunkGuard.tsx            # Global ChunkLoadError guard (auto-reload-once + cooldown)
│   ├── shared/
│   │   ├── components/
│   │   │   ├── layout/               # DashboardLayout, navigation
│   │   │   ├── animations/           # Shared animation components
│   │   │   ├── bible/                # Bible-specific UI components
│   │   │   ├── skeletons/            # Loading skeleton components
│   │   │   └── ui/                   # Generic UI primitives (shadcn/ui) + UpdateToast.tsx
│   │   ├── config/
│   │   │   └── design-tokens.ts      # TS design token constants (maps to CSS vars)
│   │   ├── hooks/                    # Shared React hooks + useSwUpdate (registration.waiting → toast), useAutoHideOnScroll (hide-on-scroll обёртка над useScrollDirection)
│   │   ├── offline/                  # IndexedDB layer (idb), read-through, write-ahead outbox, sync, downloadManager, autoDownload (T11), chunkGuard, networkTimeout
│   │   ├── services/
│   │   │   └── api/
│   │   │       ├── client.ts         # Fetch wrapper + ApiClientError
│   │   │       ├── endpoints.ts      # All typed API endpoint functions
│   │   │       └── graphql.ts        # GraphQL client
│   │   ├── types/                    # Global TypeScript types
│   │   └── utils/
│   │       ├── api.ts                # getBasePath(), getApiPath()
│   │       ├── bible.ts              # Bible book/chapter utilities
│   │       ├── cn.ts                 # Class merging utility
│   │       ├── constants.ts          # App-wide constants
│   │       ├── date.ts               # Date formatting helpers
│   │       └── theme.ts              # Theme utilities
│   ├── lib/                          # Business logic shared by client AND server/ (session-core, bible-data, directus-*, invite, register-access, telegram-server, rate-limiter)
│   └── types/
│       └── index.ts                  # Root-level type exports
├── server/                           # Hono BFF — separate process/container, replaces the old src/app/api/**
│   └── src/
│       ├── index.ts                  # @hono/node-server entrypoint (BFF_PORT, default 3001)
│       ├── app.ts                    # createApp() factory (Hono instance, testable via app.request())
│       ├── session.ts                # Hono adapter over src/lib/session-core.ts
│       ├── env.ts                    # zod-validated env (lazy-throw on missing secrets)
│       └── routes/                   # auth, bible, plan, songs, user, chat, graphql, directus-proxy, ai
├── docs/                             # Project documentation
│   ├── AI_INTEGRATION_GUIDE.md
│   ├── DIRECTUS_SETUP_GUIDE.md
│   ├── GRAPHQL_API.md
│   ├── database-schema.md
│   └── nginx.md                      # Reverse proxy + PWA cache headers (static + bff proxy)
├── e2e/offline/                      # Playwright offline regression suite (npm run e2e:offline)
├── playwright.config.ts              # Playwright config — отдельный контур от vitest (src/**)
├── scripts/
│   ├── build-manifest.ts             # Generates public/manifest.webmanifest (build-time)
│   ├── build-sw.ts                   # esbuild + @serwist/build injectManifest → out/sw.js
│   └── static-serve.ts               # Local static+bff-proxy server for e2e (mimics nginx)
├── deploy/                           # Dockerfile (build/bff/static stages), compose.yml, nginx/, deploy.sh
├── .ai-factory/                      # AI Factory context
│   ├── DESCRIPTION.md                # Project specification
│   ├── ARCHITECTURE.md               # Architecture decisions
│   ├── config.yaml                   # AI Factory config
│   └── rules/base.md                 # Coding conventions
├── .agents/skills/                   # Project-level agent skills
│   ├── directus-backend-architecture/
│   └── directus-development-workflow/
├── next.config.ts                    # Next.js config (output: 'export', basePath=/app)
├── components.json                   # shadcn/ui config
└── ENV_SETUP.md                      # Environment variables guide
```

## Key Entry Points

| File | Purpose |
|------|---------|
| `src/app/layout.tsx` | Root layout — fonts, theme, global providers |
| `src/app/dashboard/page.tsx` | Main app page — renders PlanView |
| `src/app/dashboard/layout.tsx` (`DashboardAuthGate`) | Client auth guard — redirects unauthenticated users (replaces `src/middleware.ts`, removed T6, incompatible with `output: 'export'`) |
| `src/components/AuthProvider.tsx` | Session state — `checkSession()`/`refreshAuth()` MUST `setLoading(true)` on every call, not just initial mount, or `DashboardAuthGate` can redirect on stale state during client-side post-login navigation (race fixed in T13) |
| `server/src/routes/auth.ts` | Login/logout/session/register/telegram/telegram-link routes (Hono, was `src/app/api/auth/*/route.ts`) |
| `src/lib/register-access.ts` | `isRegistrationOpen()` / `verifyChurchCode()` — контроль доступа к регистрации |
| `src/features/plan/components/PlanView.tsx` | Core plan UI — week view, day selection |
| `src/shared/services/api/endpoints.ts` | All API calls with TypeScript types |
| `src/shared/offline/db.ts` | IndexedDB schema (idb) — bibleChapters/songs/apiCache/outbox/meta/manifest |
| `src/shared/offline/outbox.ts` + `sync.ts` | Write-ahead outbox для прогресса + replay-движок (LWW) |
| `src/shared/offline/downloadManager.ts` | Опциональная офлайн-загрузка Писания/песен/плана + очистка |
| `src/shared/offline/autoDownload.ts` | Автозагрузка базового набора после логина (iOS partition fix, T11) |
| `src/sw/sw.ts` + `scripts/build-sw.ts` | Build-time precache service worker (Serwist `injectManifest` → `out/sw.js`) |
| `src/shared/hooks/useSwUpdate.ts` + `src/shared/components/ui/UpdateToast.tsx` | Update flow: `registration.waiting` → тост «Обновить» → `SKIP_WAITING` → reload |
| `src/shared/hooks/useAutoHideOnScroll.ts` | Hide-on-scroll обёртка над `useScrollDirection` для не-ридер страниц (список/деталь песен) |
| `src/features/songs/hooks/useScrollRestore.ts` | Восстановление позиции скролла + поискового запроса списка песен (`sessionStorage`) |
| `src/shared/offline/chunkGuard.ts` + `src/components/ChunkGuard.tsx` | ChunkLoadError guard — auto-reload-once с cooldown |
| `server/src/routes/*` (health route) | 204 no-store ping — гейт online-триггера outbox-синка (`isServerReachable`) |
| `e2e/offline/` + `playwright.config.ts` | Офлайн E2E-регрессия (`npm run e2e:offline`) — cold start, cold-start-any-route (precache), навигация, outbox sync, update-flow |
| `scripts/static-serve.ts` | Локальный static+bff-proxy сервер для e2e (аналог nginx) |
| `next.config.ts` | Next.js config — basePath, `output: 'export'` |

## Environment Variables

See `ENV_SETUP.md` for full reference. Critical vars:

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_DIRECTUS_URL` | Directus server URL |
| `DIRECTUS_ADMIN_TOKEN` | Admin token (server-only!) |
| `TELEGRAM_BOT_TOKEN` | Telegram bot token for auth |
| `NEXT_PUBLIC_BASE_PATH` | Deployment base path (e.g. `/app`) |
| `NEXT_PUBLIC_AI_ENABLE` | Feature flag for AI chat |

## Documentation

| Document | Path | Description |
|----------|------|-------------|
| README | README.md | Project landing page |
| Getting Started | docs/getting-started.md | Installation, setup, first run |
| Architecture | docs/architecture.md | FSD structure, patterns, layers |
| Configuration | docs/configuration.md | Environment variables reference |
| Authentication | docs/authentication.md | Invite+password, church-code registration, Telegram link, sessions, PWA |
| Deployment | docs/deployment.md | Static export + Hono BFF, Docker Compose, deploy.sh |
| Directus Setup | docs/DIRECTUS_SETUP_GUIDE.md | Directus CMS configuration |
| DB Schema | docs/database-schema.md | PostgreSQL schema behind Directus |
| AI Integration | docs/AI_INTEGRATION_GUIDE.md | n8n + Directus AI setup |
| Chat History | docs/CHAT_HISTORY_SETUP.md | AI chat history storage |
| GraphQL API | docs/GRAPHQL_API.md | GraphQL schema and queries |
| Telegram Notifications | docs/TELEGRAM_DAILY_NOTIFICATION_FLOW.md | Daily reading broadcast |
| nginx | docs/nginx.md | Reverse proxy configuration |

## AI Context Files

| File | Purpose |
|------|---------|
| AGENTS.md | This file — project structure map |
| .ai-factory/DESCRIPTION.md | Full project specification |
| .ai-factory/ARCHITECTURE.md | Architecture decisions and patterns |
| .ai-factory/rules/base.md | Coding conventions and rules |

## DOM data attributes

Для разметки «якорей» в DOM (E2E, аналитика) используй **kebab-case** `data-{компонент-в-kebab}-{зона}`, не `data-component`. Пример: `TodayReadingCard` → `data-today-reading-card`, `data-today-reading-card-day-counter`. Подробнее — раздел **DOM data attributes** в `.ai-factory/rules/base.md`.

## MCP Servers (configured in `.cursor/mcp.json`)

| Server | Purpose |
|--------|---------|
| `github` | GitHub repo operations |
| `filesystem` | Advanced file operations |
| `chromeDevtools` | Browser debugging |
| `playwright` | Browser automation and testing |

## Design System

The app uses a **token-based design system** with CSS variables as the single source of truth.

### CSS Variables (defined in `src/app/globals.css`)

All semantic tokens are defined under `:root` (light) and `.dark` / `[data-theme="dark"]` (dark):

| Token group | Prefix | Examples |
|-------------|--------|---------|
| Backgrounds | `--app-bg`, `--app-surface*`, `--app-overlay*` | `--app-bg`, `--app-surface`, `--app-surface-elevated`, `--app-surface-muted` |
| Text | `--app-text*` | `--app-text`, `--app-text-secondary`, `--app-text-muted`, `--app-text-subtle`, `--app-text-inverse` |
| Primary (red) | `--app-primary*` | `--app-primary`, `--app-primary-light` |
| Accent (orange/amber) | `--app-accent*` | `--app-accent`, `--app-accent-light` |
| Success (green) | `--app-success*` | `--app-success`, `--app-success-text` |
| Missed (red bg) | `--app-missed*` | `--app-missed`, `--app-missed-text` |
| Borders | `--app-border*` | `--app-border`, `--app-border-strong` |
| Shadows | `--app-shadow*` | `--app-shadow-sm`, `--app-shadow-md`, `--app-shadow-card` |

### Tailwind Utilities (via `@theme inline` in `globals.css`)

CSS variables are mapped to Tailwind utilities, enabling usage like:

```
bg-app-bg          text-app-text         border-app-border
bg-app-surface     text-app-text-muted   shadow-app-sm
bg-app-primary     text-app-primary      shadow-app-card
bg-app-success     text-app-success
bg-app-missed      text-app-accent
```

### TypeScript Token Constants

Programmatic token names are available in `src/shared/config/design-tokens.ts`:

```ts
import { tokens } from '@/shared/config/design-tokens';

// tokens.bg.base        → 'bg-app-bg'
// tokens.text.primary   → 'text-app-text'
// tokens.primary.base   → 'bg-app-primary'
// tokens.success.base   → 'bg-app-success'
```

### Rules for agents

- **Never use hardcoded Tailwind color shades** (`stone-`, `zinc-`, `red-`, `green-`, etc.) in UI components
- **Always use design tokens** — `bg-app-*`, `text-app-*`, `border-app-*`, `shadow-app-*`
- Exception: Reading view theme classes (`theme-light`, `theme-dark`, `theme-sepia`) are intentional — they represent user-chosen reading experience, not app UI theme
- Dark mode is handled automatically via CSS variables — no `dark:` variants needed in components

## Agent Rules

- Never combine shell commands with `&&`, `||`, or `;` — execute each command as a separate tool call.
  - ❌ Wrong: `git checkout main && git pull`
  - ✅ Right: two separate calls — first `git checkout main`, then `git pull origin main`
- Directus admin token (`DIRECTUS_ADMIN_TOKEN`) is server-side only — never include in client code
- All API/auth logic lives in `server/` (Hono BFF) now, not `src/app/api/**` — that directory no longer exists (`output: 'export'` has no server runtime)
- All client-side Directus calls must go through the `{basePath}/api/directus/*` proxy (`server/src/routes/directus-proxy.ts`)
- Use `getApiPath()` from `@/shared/utils/api` for all client-side API URL construction
- Feature-Sliced Design: cross-layer imports go top-down only (`app` → `features` → `shared`)
- Use `@/` path alias for cross-feature imports, relative paths for within-feature
