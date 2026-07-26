[← Быстрый старт](getting-started.md) · [Back to README](../README.md) · [Дизайн-система →](design-system.md)

# Архитектура

Обзор архитектурных решений, слоёв и паттернов NBC Bible Plan.

## Методология: Feature-Sliced Design (FSD)

Проект использует FSD с иерархией слоёв `app → features → shared`. С миграции на
static export + Hono BFF (`.ai-factory/plans/feature-static-export-hono-bff.md`) весь
API живёт ОТДЕЛЬНО от `src/app` — в `server/`, вне Next.js рантайма.

```
├── src/
│   ├── app/            # Next.js App Router: страницы/layouts, static export (output: 'export')
│   │   └── dashboard/  # Authenticated pages (client-side auth-guard, см. DashboardAuthGate)
│   ├── features/       # Изолированные функциональные домены
│   │   ├── plan/       # Фича: план чтения
│   │   └── reading/    # Фича: читалка
│   ├── shared/         # Общий код без зависимостей от фич
│   │   ├── components/
│   │   ├── hooks/
│   │   ├── services/
│   │   ├── types/
│   │   └── offline/    # SW-регистрация, IndexedDB, outbox/sync, автозагрузка
│   ├── sw/              # Service Worker (src/sw/sw.ts, бандлится esbuild'ом отдельно)
│   └── lib/             # Бизнес-логика, НЕ зависящая от Next.js (переиспользуется server/)
├── server/               # Hono BFF — весь бывший src/app/api/**, отдельный процесс/контейнер
│   └── src/
│       ├── routes/       # auth, bible, plan, songs, user, chat, graphql, directus-proxy, ai
│       └── session.ts    # Hono-адаптер над session-core (src/lib/session-core.ts)
└── scripts/
    ├── build-manifest.ts # генерирует public/manifest.webmanifest
    ├── build-sw.ts        # esbuild + @serwist/build injectManifest → out/sw.js
    └── static-serve.ts    # локальный сервер для e2e (аналог nginx static+proxy)
```

`src/lib/` — общая граница: логика, которую импортируют И клиентские компоненты
(там, где это уместно), И `server/` (Hono-роуты). `server/` НИЧЕГО не импортирует из
`src/app`/`src/components` (клиентский код) — граница в одну сторону.

**Правила импортов:**

| Из / В | app | features | shared |
|--------|-----|----------|--------|
| `app/` | ✅ | ✅ | ✅ |
| `features/` | ❌ | ❌ (между фичами) | ✅ |
| `shared/` | ❌ | ❌ | ✅ (только внутри) |

Используйте `@/` alias для cross-layer импортов, относительные пути — внутри одной фичи.

## Слои подробнее

### app/ — Next.js App Router (только UI, static export)

`output: 'export'` — никакого сервера Next.js в рантайме, только пререндеренный
статический HTML/JS. Нет dynamic segments в путях (страницы — `?query=`-driven, не
`[param]`), нет `app/api/**`, нет `middleware.ts`.

| Путь | Назначение |
|------|-----------|
| `app/dashboard/page.tsx` | Главная страница — рендерит `PlanView` |
| `app/dashboard/read/page.tsx` | Читалка (`?book=&chapter=`, было `[book]/[chapter]/`) |
| `app/dashboard/calendar/` | Календарь |
| `app/dashboard/settings/` | Настройки пользователя |
| `app/dashboard/layout.tsx` | `DashboardAuthGate` — клиентский auth-guard (замена `middleware.ts`) |
| `app/global-error.tsx`, `app/not-found.tsx` | Собственные root-error/404 boundary — обязательны при `output: 'export'` (авто-генерируемые Next.js версии падают на пререндере в некоторых сборках, см. T13) |

### server/ — Hono BFF

Весь бывший `src/app/api/**` — теперь отдельный Node-процесс (`tsx server/src/index.ts`
локально, отдельный Docker-контейнер в проде). Роуты монтируются под тем же basePath,
что и раньше (`/app/api/...`) — клиентский URL-контракт (`getApiPath()`) не менялся,
поменялся только исполнитель.

| Путь | Назначение |
|------|-----------|
| `server/src/routes/auth.ts` | Login/logout/session, регистрация, Telegram-линк, rate limiter |
| `server/src/routes/bible.ts` | Текст Библии по книге/главе, bulk-скачивание перевода |
| `server/src/routes/plan.ts`, `songs.ts` | План чтения, песни |
| `server/src/routes/user.ts` | Прогресс, настройки, app-settings |
| `server/src/routes/chat.ts` | История AI-чата |
| `server/src/routes/graphql.ts` | Regex-диспетчер (НЕ настоящий GraphQL) поверх Directus SDK — `updateProgress`/`updateProgressBatch`/`getDayProgress` |
| `server/src/routes/directus-proxy.ts` | Catch-all proxy к Directus (server-side, admin token) |
| `server/src/routes/ai.ts` | Proxy к AI Directus Flow |

### features/plan/ — Фича: план чтения

- **PlanView** — основной UI: неделя, выбор дня, статус выполнения
- **DayNavigationBar** — свайпабл навигация по дням
- **TodayReadingCard** — карточка дня с главами для чтения
- **VerseOfTheDay** — стих дня
- **Хуки:** `usePlan`, `useProgress`, `useDayCompletion`
- **Контекст:** `PlanContext` — shared state для фичи

### features/reading/ — Фича: читалка

- **ReadingView** — основной UI читалки
- **ReadingHeader** — шапка с навигацией и настройками
- **BookPicker / ChapterPicker** — выбор книги и главы
- **Хуки:** `useBibleText`, `useChapterNavigation`, `useReadingSettings`
- **Кэш:** `bible-text-cache.ts` — client-side кэш текста глав

### features/setlists/ — Фича: сетлисты

- **Экраны:** `/dashboard/setlists` (список: Ближайшие/Без даты/Архив; карточка
  показывает состав сразу и ведёт на первую песню сета), `/dashboard/setlist?id=`
  (read-only просмотр — fallback для пустого сета, экрана после создания и прямой
  ссылки), `/dashboard/setlist-edit` (билдер создания)
- **Правка состава — только в `SetlistManageSheet`** (порядок, добавление, удаление
  сета). Открывается кнопкой-счётчиком «n/m» в шапке просмотра песни и кнопкой
  «Изменить сет» на странице сета; сами экраны read-only. Мутации — `useSetlistEditor`
  (оптимистичное применение + откат при провале PATCH)
- **Билдер:** `SetlistBuilder` (мобильный multi-select + FAB + `NameSetlistSheet`,
  либо планшетный master-detail при `min-width: 768px`), `SelectedChipsRow`,
  `SetlistSongPickRow`, `SetlistItemRow` (переупорядочивание кнопками Вверх/Вниз)
- **Playback-режим в просмотре песни:** `useSetlistPlayback` + свайп
  (`useHorizontalSwipe`, `shared/hooks/`) + `SetlistManageSheet` — навигация между
  песнями сета и правка состава прямо из `/dashboard/song?id=&setlistId=`
- **Хуки:** `useSetlists`, `useSetlist(id)`, `useSetlistDraft` (черновик билдера
  в `sessionStorage`)
- **Офлайн:** `lib/offlineSetlists.ts` (read-through) + `lib/archive.ts`
  (`partitionSetlists`) — чтение офлайн, запись online-only (см. `docs/offline-pwa.md`)
- **Роль:** `src/lib/app-roles.ts` + `shared/hooks/useAppRole.ts` — гейт кнопок
  создания/редактирования/удаления (реальный гейт — BFF, см. `CLAUDE.md`)

### shared/ — Общий код

```
shared/
├── components/
│   ├── layout/      # DashboardLayout, навигация
│   ├── animations/  # Shared animation components (Framer Motion)
│   ├── bible/       # Bible-specific UI
│   ├── skeletons/   # Loading skeleton components
│   └── ui/          # shadcn/ui примитивы
├── services/api/
│   ├── client.ts    # Typed fetch wrapper + ApiClientError
│   ├── endpoints.ts # Typed functions для каждого endpoint
│   └── graphql.ts   # GraphQL query helpers
└── utils/
    ├── api.ts        # getBasePath(), getApiPath()
    ├── bible.ts      # Нормализация книг/глав
    ├── cn.ts         # Tailwind class merging
    ├── date.ts       # Форматирование дат
    └── constants.ts  # App-wide константы
```

#### Общие layout-компоненты

- **PageHeader** (`shared/components/layout/PageHeader.tsx`) — единая шапка внутренних
  страниц-«просмотров»: стрелка «назад» + заголовок + опциональный правый слот.
  Презентационная (не знает про `next/navigation`), навигацию задаёт вызывающий через
  `onBack`. Используется на `/dashboard/calendar` и `/dashboard/songs/[id]`.
  **Правило:** любой новый детальный/просмотровый экран с кнопкой возврата использует
  `PageHeader`, а не собирает шапку вручную.
  - **Когда НЕ использовать:** `ReadingHeader` (читалка) — специализированная шапка с
    настройками шрифта и пикером глав/книг, остаётся отдельной; top-level табы нижней
    навигации (напр. `/dashboard/settings`) — там нет кнопки «назад».

## Ключевые паттерны

### Server / Client Component Split

`output: 'export'` полностью статичен — все страницы уже были `'use client'` ещё до
миграции (данные тянутся клиентски через `/api/*`, SSR/RSC не использовались), поэтому
пререндер не потерял функциональности. Fetching данных — во фронтенд-хуках через
typed API client, а не в API routes/server actions (их больше нет в `src/app`).

### Proxy к Directus

Все Directus-запросы с клиента идут через BFF, не напрямую:

```
Client → {basePath}/api/directus/... → Hono BFF (server/src/routes/directus-proxy.ts) → Directus (admin token)
```

- **Причина:** `DIRECTUS_ADMIN_TOKEN` не должен попадать в браузер.
- **Server-to-server:** прямые вызовы `@directus/sdk` с токеном — из `src/lib/`,
  импортируется `server/`-роутами (bible/plan/songs/user используют его напрямую, не
  через proxy).
- **Client-to-Directus:** `fetch('{basePath}/api/directus/...')` через catch-all proxy
  (используется точечно, где нет отдельного typed-роута).

### Typed API Client

```typescript
// shared/services/api/client.ts
apiClient.get('/api/plan')       // → typed response
apiClient.post('/api/user/progress', body)

// shared/services/api/endpoints.ts
export async function getPlan(day: number): Promise<PlanDay[]> { ... }
```

### Auth: iron-session (framework-agnostic) + клиентский guard

Lucia/SQLite полностью удалены миграцией (`better-sqlite3`, `@lucia-auth/adapter-sqlite`
были мёртвыми зависимостями — 0 импортов в `src/` уже на момент аудита) — сессия
всегда была на `iron-session`, не на Lucia. Подробнее — [Аутентификация](authentication.md).

```
1. Client → POST {basePath}/api/auth/login (или /auth/telegram с initData)
2. server/src/routes/auth.ts → верификация (Directus /auth/login, либо
   HMAC-SHA256 initData с TELEGRAM_BOT_TOKEN) → findOrCreateUser() в Directus
3. src/lib/session-core.ts (sealSession) → httpOnly cookie `bible-plan-session`,
   через server/src/session.ts (hono/cookie адаптер)
4. DashboardAuthGate (клиентский компонент в dashboard/layout.tsx) → guard
   /dashboard/* — замена удалённого middleware.ts (несовместим с output: 'export')
```

### URL Construction

Всегда используйте `getApiPath()` для формирования URL:

```typescript
import { getApiPath } from '@/shared/utils/api'

const url = getApiPath('/api/plan') // → /app/api/plan (с basePath)
```

## Анти-паттерны

❌ Прямые вызовы Directus из клиентских компонентов  
❌ Импорты между фичами (`features/plan` ↔ `features/reading`)  
❌ Бизнес-логика в page компонентах (выносите в хуки)  
❌ Хардкод URL без `getApiPath()`  
❌ Хранение session data в localStorage (только httpOnly `bible-plan-session` cookie)  
❌ Fetch в клиентских компонентах без loading/error состояний  

## Tech Stack

| Технология | Версия | Назначение |
|-----------|--------|-----------|
| Next.js | 16 | App Router, static export (`output: 'export'`) |
| Hono | latest | BFF (`server/`) — весь API, отдельный процесс |
| @serwist/build | latest | Build-time precache-манифест SW (`scripts/build-sw.ts`) |
| React | 19 | UI, React Compiler |
| TypeScript | strict | Типизация |
| Tailwind CSS | v4 | Стилизация |
| Framer Motion | latest | Анимации |
| iron-session | latest | Session sealing (`src/lib/session-core.ts`) |
| @directus/sdk | v20 | Directus API client |
| shadcn/ui | latest | UI компоненты |

## See Also

- [Быстрый старт](getting-started.md) — установка и запуск
- [Конфигурация](configuration.md) — переменные окружения
- [Аутентификация](authentication.md) — session-слой, guard
- [Деплой](deployment.md) — static+bff топология, Docker Compose
- [Offline PWA](offline-pwa.md) — precache SW, IndexedDB, автозагрузка
