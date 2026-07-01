[← Быстрый старт](getting-started.md) · [Back to README](../README.md) · [Конфигурация →](configuration.md)

# Архитектура

Обзор архитектурных решений, слоёв и паттернов NBC Bible Plan.

## Методология: Feature-Sliced Design (FSD)

Проект использует FSD с иерархией слоёв `app → features → shared`.

```
src/
├── app/            # Next.js App Router: страницы, layouts, API routes
│   ├── api/        # REST API endpoints
│   └── dashboard/  # Authenticated pages
├── features/       # Изолированные функциональные домены
│   ├── plan/       # Фича: план чтения
│   └── reading/    # Фича: читалка
└── shared/         # Общий код без зависимостей от фич
    ├── components/
    ├── hooks/
    ├── services/
    ├── types/
    └── utils/
```

**Правила импортов:**

| Из / В | app | features | shared |
|--------|-----|----------|--------|
| `app/` | ✅ | ✅ | ✅ |
| `features/` | ❌ | ❌ (между фичами) | ✅ |
| `shared/` | ❌ | ❌ | ✅ (только внутри) |

Используйте `@/` alias для cross-layer импортов, относительные пути — внутри одной фичи.

## Слои подробнее

### app/ — Next.js App Router

| Путь | Назначение |
|------|-----------|
| `app/dashboard/page.tsx` | Главная страница — рендерит `PlanView` |
| `app/dashboard/read/[book]/[chapter]/` | Читалка |
| `app/dashboard/calendar/` | Календарь |
| `app/dashboard/settings/` | Настройки пользователя |
| `app/api/auth/` | Telegram OAuth, сессии |
| `app/api/bible/` | Текст Библии по книге/главе |
| `app/api/plan/` | Данные плана чтения |
| `app/api/user/` | Прогресс, настройки |
| `app/api/directus/[...path]/` | Proxy к Directus (server-side) |
| `app/api/ai/[...path]/` | Proxy к AI сервису |

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

- По умолчанию все компоненты — Server Components
- `'use client'` только там, где нужны: state, effects, browser API, анимации
- Данные fetching — в API routes или server actions, не в клиентских компонентах

### Proxy к Directus

Все Directus-запросы с клиента идут через `/api/directus/[...path]`:

```
Client → /api/directus/... → Next.js proxy → Directus (с admin token)
```

- **Причина:** `DIRECTUS_ADMIN_TOKEN` не должен попадать в браузер
- **Server-to-server:** прямые вызовы `@directus/sdk` с токеном
- **Client-to-Directus:** `fetch('/api/directus/...')` через proxy

### Typed API Client

```typescript
// shared/services/api/client.ts
apiClient.get('/api/plan')       // → typed response
apiClient.post('/api/user/progress', body)

// shared/services/api/endpoints.ts
export async function getPlan(day: number): Promise<PlanDay[]> { ... }
```

### Auth: Lucia + SQLite + Telegram

```
1. Telegram WebApp → inject initData
2. Client → POST /api/auth/telegram с initData
3. Server → верификация HMAC-SHA256 с TELEGRAM_BOT_TOKEN
4. Server → findOrCreateUser() в Directus
5. Lucia → создаёт сессию → httpOnly cookie
6. middleware.ts → guard /dashboard/* routes
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
❌ Хранение session data в localStorage (только Lucia cookies)  
❌ Fetch в клиентских компонентах без loading/error состояний  

## Tech Stack

| Технология | Версия | Назначение |
|-----------|--------|-----------|
| Next.js | 16 | App Router, SSR, API routes |
| React | 19 | UI, React Compiler |
| TypeScript | strict | Типизация |
| Tailwind CSS | v4 | Стилизация |
| Framer Motion | latest | Анимации |
| Lucia | v3 | Session management |
| better-sqlite3 | latest | SQLite driver |
| @directus/sdk | v20 | Directus API client |
| shadcn/ui | latest | UI компоненты |

## See Also

- [Быстрый старт](getting-started.md) — установка и запуск
- [Конфигурация](configuration.md) — переменные окружения
- [Схема БД](database-schema.md) — структура таблиц SQLite
