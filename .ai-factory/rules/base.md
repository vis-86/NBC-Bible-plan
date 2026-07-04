# Project Base Rules

> Auto-detected conventions from codebase analysis. Edit as needed.

## Naming Conventions

- **Files:** PascalCase for components (`PlanView.tsx`, `DayNavigationBar.tsx`), camelCase for hooks/utils (`usePlan.ts`, `date.ts`)
- **Components:** Named exports with explicit React.FC typing (`export const PlanView: React.FC<PlanViewProps> = ...`)
- **Hooks:** prefix `use` (`usePlan`, `useDayCompletion`, `useReadingSettings`)
- **Types/Interfaces:** PascalCase, defined in `src/types/index.ts` or `types.ts` within feature
- **API routes:** kebab-case directories (`app/api/user/reading-settings/route.ts`)
- **Variables:** camelCase
- **CSS classes:** Tailwind utilities, custom tokens via CSS variables

## Module Structure (FSD)

- `src/app/` — Next.js App Router pages, layouts, API routes only
- `src/features/<name>/` — self-contained feature slices:
  - `components/` — React components for this feature
  - `hooks/` — React hooks
  - `contexts/` — React contexts
  - `types.ts` — feature-local types
- `src/shared/` — cross-feature shared code:
  - `components/layout/`, `animations/`, `ui/`, `bible/`, `skeletons/`
  - `hooks/` — generic shared hooks
  - `services/api/` — API client, endpoints, graphql
  - `utils/` — pure utility functions
  - `types/` — global type definitions

## Component Patterns

- Always use `'use client'` directive for client components
- Props interface named `<ComponentName>Props` inline in file
- Import order: React → Next.js → external libs → internal features → shared → local
- Use `cn()` utility (from `@/shared/utils/cn`) for conditional class merging
- Prefer named exports over default exports

## DOM data attributes (стабильные хуки для тестов / аналитики)

- **Не использовать** `data-component="PascalCase"`.
- **Использовать** kebab-case, производное от имени компонента, по образцу `TodayReadingCard`:
  - корень: `data-today-reading-card`;
  - вложенные зоны: суффикс через дефис — `data-today-reading-card-header`, `data-today-reading-card-day-counter`, `data-today-reading-card-start-btn`.
- **Правило имени:** `PascalCase` → слова в lower case и через дефис: `BottomSheet` → `data-bottom-sheet`, `ReadingSettingsForm` → `data-reading-settings-form`, `DashboardReadingSettingsSection` → `data-dashboard-reading-settings-section`.
- **Вложенные части общего UI:** префикс совпадает с корневым компонентом, дальше роль: `data-bottom-sheet-overlay`, `data-bottom-sheet-panel`, `data-bottom-sheet-handle`, `data-bottom-sheet-body`.
- Динамические маркеры (строка/id) — как в карточке: `data-today-reading-card-item={id}`.

## Error Handling

- API routes: return `NextResponse.json({ error: ... }, { status: ... })`
- Client fetch: use `ApiClientError` from `@/shared/services/api/client`
- Async state: explicit loading/error states in component (`useState`)

## Path Aliases

- `@/` maps to `src/` (configured in `tsconfig.json`)
- Use `@/` for cross-feature imports, relative for within-feature

## Styling

- Tailwind CSS v4 (CSS-first config in `globals.css`)
- Custom CSS variables for design tokens (colors, spacing)
- `tailwind-merge` for dynamic class composition via `cn()`
- Framer Motion (`motion`) for animations

## Directus Integration

- Directus SDK: `@directus/sdk` v20
- Server-side only: `DIRECTUS_ADMIN_TOKEN` via env vars
- Client proxy: `/api/directus/[...path]/route.ts` — all client Directus calls go through this proxy
- Never expose admin token to client

## Authentication

- **Sessions:** `iron-session` — зашифрованный+подписанный httpOnly cookie `bible-plan-session` (`src/lib/session.ts`). `SESSION_SECRET` валидируется лениво (не на этапе `next build`). Сессия хранит `directus_id` + имя, **без** Directus access_token. (Lucia/`better-sqlite3` — vestigial, не используется.)
- **Аккаунты создаются ТОЛЬКО через invite на вебе** (`/api/auth/invite/create` → `/api/auth/activate`). Логин — псевдоним, маппится в `{login}@local.baptistnn.ru` (синтетический email ОБЯЗАН иметь реальный TLD — Directus отклоняет single-label `@local`). Без email/телефона/ФИО (ФЗ-152).
- **Invite/reset токены:** stateful записи в коллекции Directus `auth_invites` (`src/lib/invite.ts`: `findValidInvite`/`consumeInvite`/`createInvite`). Одноразовость = поле `used_at`, TTL = `expires_at`; `kind`/`user` берутся из записи, НЕ из URL `mode`. Та же ссылка = активация (`mode=activate`) и сброс пароля (`mode=reset`). HMAC/`INVITE_SECRET` не используются.
- **Telegram (вторично):** mini-app только привязывает `tg_id` к существующему аккаунту (`/api/auth/telegram/link`); `/api/auth/telegram` НЕ создаёт аккаунты. Клиент ветвится по `data.linked`, не по `res.ok` (иначе redirect-loop).
- **Доступ к данным:** admin-client + фильтр по `directus_id` из сессии (без user access_token Directus).
- **Валидация:** zod-схемы (`src/lib/validators/auth.schemas.ts`) + rate-limit (`src/lib/rate-limiter.ts`) на всех auth-эндпоинтах.
- Middleware (`src/middleware.ts`, async) защищает `/dashboard`.

## Deployment

- Next.js `output: 'standalone'`
- `NEXT_PUBLIC_BASE_PATH=/app` — all paths prefixed with `/app`
- Use `getApiPath()` from `@/shared/utils/api` for constructing API URLs client-side
- Deploy via `./copy-prod.sh` to production server

## Offline-first (PWA) — read-path parity

> Инвариант: если ресурс объявлен «читается офлайн» (Писание, песни, план — см. DESCRIPTION),
> то **каждый** read-путь к нему обязан идти через network-first + IDB-фолбэк. Нельзя,
> чтобы список фичи работал офлайн, а деталь падала (или наоборот).

- **Никакого голого `apiClient.get` / `fetch` для офлайн-ресурса.** Любое клиентское
  чтение такого ресурса оборачивается в read-through слой:
  - общий кэш ответов → `readThrough(key, fetcher)` из `@/shared/offline/readThrough`
    (пишет/читает store `apiCache`); подходит для план/недельный план/книги/настройки/список песен;
  - выделенный store (контент качается массово, не через `apiCache`) → фиче-локальный
    read-through, читающий именно этот store: `bibleChapters` (`getPersistedText` в
    `features/reading/bible-text-cache`), `songs` (`readSongThrough` в
    `features/songs/lib/offlineSongs`).
- **List↔detail parity.** Добавляя офлайн-фолбэк к списочному хуку, сразу проверь парный
  detail-хук (и наоборот): оба идут через один и тот же network-first+IDB слой. Именно
  рассинхрон списка (`useSongs` через `readThrough`) и детали (`useSong` без фолбэка)
  давал баг «офлайн: невозможно открыть песню».
- **Фолбэк читает тот же store, куда пишет download.** Если `downloadManager` кладёт
  данные в store X (`songs`, `bibleChapters`), read-through этого ресурса обязан читать
  store X, а не `apiCache`. Ключ фолбэка = ключ записи download (сверяй тип/коэрсию:
  route-params приходят строкой — `String(id)`).
- **Слои (FSD).** Доменный read-through живёт в `features/<name>`, а не в `shared/offline`
  (shared не должен тянуть доменные типы фичи). `shared/offline` держит только
  дженерик-примитивы (`getDB`, `readThrough`/`apiCache`, outbox, sync).
- **Тесты.** Офлайн-фича обязана покрывать кейс «fetcher rejects + запись уже лежит в IDB»
  (сеть упала, но данные скачаны) — именно он выявляет отсутствие фолбэка.
- **Writes** офлайн-ресурсов идут через write-ahead outbox (`@/shared/offline/outbox` +
  LWW-sync), не прямым POST.
