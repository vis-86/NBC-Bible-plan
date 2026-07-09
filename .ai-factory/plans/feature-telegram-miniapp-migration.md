# Implementation Plan: Экран «Приложение переехало» для Telegram mini-app + PWA-инструкция в профиле

Branch: none (пользователь выбрал план без ветки; текущая ветка `main` содержит незакоммиченные изменения другой фичи)
Created: 2026-07-09

## Settings
- Testing: no
- Logging: verbose (console.debug с префиксом `[tg-migration]` / `[pwa]`, как в существующем коде)
- Docs: yes  # обязательный docs-чекпоинт в /aif-implement, через /aif-docs
- **Executor: Sonnet 5** — план написан максимально эксплицитно; не импровизировать, не добавлять scope сверх задач

## Инструкции для исполнителя (Sonnet 5)

**Перед каждой задачей:** прочитать указанные файлы-образцы целиком, затем править. Не создавать новые абстракции «по аналогии» — копировать существующие паттерны буквально.

**Импорты (единый стиль проекта):**
- Флаги: `import { isTelegramMiniAppEnabled } from '@/shared/utils/constants'`
- Telegram: `import { isTelegramWebApp } from '@/lib/telegram'`
- URL: `import { getBasePath } from '@/shared/utils/api'` (НЕ дублировать логику basePath)
- PWA: `import { usePWAInstall } from '@/hooks/usePWAInstall'`, `import { useIsStandalone } from '@/shared/hooks/useIsStandalone'`
- Лендинг-фон: `import { Atmosphere } from '@/features/landing'` (прецедент: `src/app/register/page.tsx:10`)

**Что НЕ трогать:**
- API-роуты (`/api/auth/telegram/*`), middleware, SW, AuthProvider (initTelegramWebApp под оверлеем — OK)
- Не добавлять тесты (Settings: Testing = no)
- Не использовать hardcoded Tailwind-цвета (`stone-`, `red-` и т.п.) — только `*-app-*` токены
- Не создавать `env.ts` / zod-схему env — только хелпер в `constants.ts`

**Проверка после каждой фазы:**
```bash
npm run build
```
Линтер: только на изменённых файлах. Ошибки сборки — исправить до следующей фазы.

**Локальный тест Telegram-auth (только если нужно проверить legacy mini-app):**
`.env.local`: `NEXT_PUBLIC_TELEGRAM_MINIAPP_ENABLED=true`
Без этой переменной (default) mini-app выключен → экран миграции.

## Roadmap Linkage
Milestone: "none"
Rationale: ROADMAP.md в проекте отсутствует.

## Research Context
Source: .ai-factory/RESEARCH.md (Active Summary)
Активная тема ресерча (static export + Hono BFF) к данной фиче не относится. Единственное пересечение: эта фича — чистый клиентский код без новых API-роутов, миграцию на static export переживёт без изменений.

## Постановка задачи

1. **Telegram mini-app по умолчанию выключен; env-флаг позволяет временно вернуть его.** Mini-app выведен из эксплуатации: деплой этой фичи без изменения окружения сразу показывает экран миграции (это и есть принятое решение «приложение переехало»). Когда флаг не включён и приложение открыто внутри Telegram (`isTelegramWebApp()`), вместо приложения показывается полноэкранное сообщение: «Приложение переехало на https://bible.baptistnn.ru/app и больше не работает как mini-app» + инструкция по установке PWA. Главный акцент: открыть сайт в Chrome (Android) или Safari (iOS) в зависимости от устройства. Стиль и дизайн — как на лендинге (Sacred Minimal: `Atmosphere`, serif-заголовки, карточки `rounded-2xl border-app-border bg-app-bg/60`).
2. **В профиле** (`/dashboard/settings` — в навигации это «Профиль») показать секцию с инструкцией по установке PWA, только если приложение ещё не запущено как PWA (`installed || isStandalone` → секция скрыта).

## Ключевые факты кодовой базы (для реализатора)

- Детекция Telegram: `isTelegramWebApp()` из `src/lib/telegram.ts:281` — `!!window.Telegram?.WebApp?.initData`. Клиентская, доступна только после hydration.
- Точки входа в Telegram: `/` (`src/app/page.tsx:34` — redirect на `/login?redirect=/dashboard`), `/login` (`src/app/login/page.tsx:27-83` — POST `/api/auth/telegram`), `/dashboard` напрямую при живой сессии. Единая точка перехвата — root layout (`src/app/layout.tsx`), по образцу `ChunkGuard`.
- Паттерн env-флагов: хелперы в `src/shared/utils/constants.ts` (`isRegisterEnabled()` и др.), `NEXT_PUBLIC_*`, build-time инлайнинг, без env.ts.
- Переиспользуемое из лендинга: `Atmosphere` (уже переиспользуется на `/register`), карточки `AndroidCard`/`IOSCard` внутри `src/features/landing/components/InstallGuide.tsx` (сейчас не экспортируются), хук `useIsIOSUserAgent` (локальный в InstallGuide).
- PWA-хуки: `usePWAInstall` (`src/hooks/usePWAInstall.ts` — beforeinstallprompt/appinstalled) и `useIsStandalone` (`src/shared/hooks/useIsStandalone.ts` — display-mode standalone + iOS navigator.standalone).
- Компактная PWA-подсказка уже есть: `src/shared/components/pwa/InstallAppHint.tsx` (login/register, скрывается в Telegram).
- Паттерн секции настроек: `<details className="group mt-8 rounded-xl border border-app-border bg-app-surface/40">` + `summary`, см. `OfflineDataSection` (`src/features/offline/components/`).
- Telegram WebApp API: `window.Telegram.WebApp.openLink(url)` открывает URL во внешнем браузере (не in-app webview) — это и есть механизм «откройте в Chrome/Safari».
- URL сайта: добавить `getPublicAppUrl()` в `src/shared/utils/api.ts` (Task 3a); использует `NEXT_PUBLIC_APP_URL` (см. `src/lib/invite.ts:90`), fallback — `window.location.origin + getBasePath()`.
- DOM-якоря: kebab-case `data-{компонент}-{зона}` (см. `.ai-factory/rules/base.md`).
- Cross-feature импорты разрешены через `@/` alias (правило AGENTS.md), т.е. `@/features/landing` можно импортировать из другого слайса.

## Commit Plan
- **Commit 1** (после задач 1–2): `feat(pwa): extract shared platform install cards + telegram miniapp flag`
- **Commit 2** (после задач 3–4): `feat(telegram): migration screen when mini-app is disabled`
- **Commit 3** (после задач 5–7): `feat(settings): PWA install section in profile + docs`

## Tasks

### Phase 1: Флаг и общие карточки установки

- [x] **Task 1: Env-флаг `NEXT_PUBLIC_TELEGRAM_MINIAPP_ENABLED`**
  - **Файл:** `src/shared/utils/constants.ts` — добавить в конец файла (после `isRegisterCodeRequired`).
  - **Точная реализация** (копировать структуру `isRegisterEnabled()`, инвертировать семантику — default false):
    ```ts
    /**
     * Включён ли Telegram mini-app (auth через initData).
     * Клиентский флаг (build-time инлайнинг). Default = false: mini-app выведен из эксплуатации,
     * в Telegram показывается экран миграции на сайт/PWA. Явные 'true'/'1' временно возвращают mini-app.
     * Переключение требует пересборки образа (как NEXT_PUBLIC_REGISTER_ENABLED).
     */
    export function isTelegramMiniAppEnabled(): boolean {
      const enabled = process.env.NEXT_PUBLIC_TELEGRAM_MINIAPP_ENABLED;
      return enabled === 'true' || enabled === '1';
    }
    ```
  - **Не делать:** не экспортировать через `src/lib/utils.ts` (другие флаги там не re-export'ятся, кроме `isAIEnabled`).
  - **Проверка:** `grep isTelegramMiniAppEnabled src/shared/utils/constants.ts` — функция на месте; `npm run build` зелёный.
  - Files: `src/shared/utils/constants.ts`.

- [x] **Task 2: Вынести карточки Android/iOS в shared**
  - **Создать:** `src/shared/components/pwa/PlatformInstallCards.tsx` (`'use client'`).
  - **Скопировать разметку 1:1** из `src/features/landing/components/InstallGuide.tsx` строки 11–65 (`useIsIOSUserAgent`, `AndroidCard`, `IOSCard`).
  - **Экспорты и сигнатуры:**
    ```ts
    export function useIsIOSUserAgent(): boolean  // логика без изменений
    export const AndroidInstallCard: React.FC<{
      description: string;
      action?: { label: string; onClick: () => void };
    }>
    export const IOSInstallCard: React.FC<{
      steps?: Array<{ icon: LucideIcon; text: React.ReactNode }>;
    }>
    ```
  - **Default steps для IOSInstallCard** (если `steps` не передан): 2 шага из InstallGuide — Share «Поделиться», SquarePlus «На экран „Домой"». Рендер через `.map()`.
  - **AndroidInstallCard:** `action` → кнопка `Button variant="inverse" size="lg"`; иначе → `<p className="mt-1.5 text-sm text-app-text-secondary">{description}</p>`.
  - **Рефакторинг `InstallGuide.tsx`:**
    - Удалить локальные `useIsIOSUserAgent`, `AndroidCard`, `IOSCard`.
    - Импорт из `@/shared/components/pwa/PlatformInstallCards`.
    - Лендинг: при `canInstall` — `action={{ label: 'Установить', onClick: handleInstall }}` + description «Одна кнопка — и иконка на экране»; при !canInstall — без action + «Откройте план в Chrome — браузер предложит установку».
    - Сохранить `console.debug('[pwa] install click')`, motion, `<section id="install">` — не менять.
  - **Проверка:** `npm run build`; `/` — секция установки визуально без изменений.
  - Files: `src/shared/components/pwa/PlatformInstallCards.tsx` (new), `src/features/landing/components/InstallGuide.tsx`.

### Phase 2: Экран миграции в Telegram

- [x] **Task 3: Компонент `TelegramMigrationScreen` + хелпер URL** (depends on 1, 2)
  - **3a. Хелпер URL** — добавить в `src/shared/utils/api.ts` (рядом с `getBasePath`):
    ```ts
    /** Публичный URL приложения для внешних ссылок (Telegram openLink, invite и т.п.). */
    export function getPublicAppUrl(): string {
      const fromEnv = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '');
      if (fromEnv) return fromEnv;
      if (typeof window !== 'undefined') {
        return `${window.location.origin}${getBasePath()}`;
      }
      return getBasePath() || '/app';
    }
    ```
  - **3b. Экран** — создать `src/features/telegram-migration/components/TelegramMigrationScreen.tsx` (`'use client'`).
  - **Структура JSX (точный каркас):**
    ```tsx
    <>
      <Atmosphere />
      <div className="fixed inset-0 z-[100] overflow-y-auto bg-app-bg" data-telegram-migration-screen>
        <div className="flex min-h-full items-center justify-center px-5 py-10">
          <div className="mx-auto w-full max-w-3xl rounded-[32px] border border-app-border bg-app-surface/70 p-8 text-center shadow-[0_8px_32px_rgba(15,23,42,0.08)] backdrop-blur-sm sm:p-12">
            {/* h2, p, Button, cards row, footer ShieldCheck — см. тексты ниже */}
          </div>
        </div>
      </div>
    </>
    ```
  - **Точные тексты (копировать дословно):**
    - H2: «Приложение переехало»
    - Абзац: «Мини-приложение в Telegram больше не работает. План чтения теперь на сайте — установите его на телефон как приложение, и он будет работать офлайн.»
    - Кнопка: «Открыть сайт»
    - Footer (как InstallGuide): «Бесплатно, без магазина приложений» + `ShieldCheck`
  - **Кнопка «Открыть сайт»:**
    ```ts
    const url = getPublicAppUrl();
    const webApp = window.Telegram?.WebApp;
    if (webApp?.openLink) {
      webApp.openLink(url);
      console.debug('[tg-migration] open site click', { via: 'openLink', url });
    } else {
      window.open(url, '_blank', 'noopener,noreferrer');
      console.debug('[tg-migration] open site click', { via: 'window.open', url });
    }
    ```
  - **Карточки** (импорт из Task 2), порядок: `useIsIOSUserAgent()` → iOS первым на iOS, иначе Android первым. Wrapper: `<div className="mx-auto mt-8 flex max-w-xl flex-col gap-4 sm:flex-row">`.
    - Android: `description="Откройте сайт в Chrome — браузер предложит установить приложение"`, без `action`.
    - iOS steps (передать явно):
      1. `{ icon: Globe, text: <>Откройте сайт в <span className="font-semibold">Safari</span></> }`
      2. `{ icon: Share, text: <>Нажмите <span className="font-semibold">«Поделиться»</span></> }`
      3. `{ icon: SquarePlus, text: <>Выберите <span className="font-semibold">{'«На экран „Домой"»'}</span></> }`
  - **useEffect при mount:** `console.debug('[tg-migration] screen shown')`.
  - **Не использовать** `motion/react` на этом экране.
  - **DOM:** `data-telegram-migration-screen`, на кнопке `data-telegram-migration-screen-open-site`.
  - **Проверка:** `npm run build`; компонент компилируется, импорты резолвятся.
  - Files: `src/shared/utils/api.ts`, `src/features/telegram-migration/components/TelegramMigrationScreen.tsx` (new).

- [x] **Task 4: Гейт в root layout + отключение Telegram-auth-флоу** (depends on 3)
  - **4a. TelegramMigrationGate** — `src/features/telegram-migration/components/TelegramMigrationGate.tsx` (`'use client'`).
  - **State machine (явно):**
    ```ts
    type GateState = 'idle' | 'active';  // idle = не показываем оверлей
    ```
  - **Логика в useEffect:**
    1. Если `isTelegramMiniAppEnabled()` → `setState('idle')`, return (mini-app включён — гейт не нужен).
    2. Retry initData (как login/page.tsx:38-44): до 3 раз по 350ms вызывать `isTelegramWebApp()`.
    3. Если после retry `isTelegramWebApp()` → `console.debug('[tg-migration] gate: telegram detected, miniapp disabled → show screen')`, `setState('active')`.
    4. Иначе → `idle`.
  - **Render:** `state === 'active' ? <TelegramMigrationScreen /> : null`.
  - **4b. layout.tsx** — импорт `TelegramMigrationGate`, вставить **сразу после** `<ChunkGuard />` (строка ~127), **до** `<ThemeProvider>`:
    ```tsx
    <ChunkGuard />
    <TelegramMigrationGate />
    <ThemeProvider>
    ```
  - **4c. page.tsx** — строка 34, обернуть redirect:
    ```tsx
    if (isTelegramWebApp() && isTelegramMiniAppEnabled()) {
      router.replace('/login?redirect=/dashboard');
    }
    ```
    Добавить импорт `isTelegramMiniAppEnabled` из `@/shared/utils/constants`.
  - **4d. login/page.tsx** — в начале `checkTelegram()` (после объявления функции, до `hasTelegramWebAppObject`):
    ```tsx
    if (!isTelegramMiniAppEnabled()) {
      setTelegramLoading(false);
      return;
    }
    ```
    Импорт `isTelegramMiniAppEnabled`.
  - **Не менять:** AuthProvider, middleware, API routes.
  - **Проверка:** `npm run build`; без env-флага в обычном браузере оверлей не виден; в DevTools можно временно замокать `window.Telegram.WebApp.initData = 'test'` + пересборка — оверлей появляется.
  - Files: `src/features/telegram-migration/components/TelegramMigrationGate.tsx` (new), `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/login/page.tsx`.

### Phase 3: PWA-инструкция в профиле

- [x] **Task 5: Секция «Установите приложение» в настройках** (depends on 2)
  - **Создать:** `src/shared/components/pwa/InstallPwaSection.tsx` (`'use client'`).
  - **Скопировать `<details>`-обёртку 1:1** из `OfflineDataSection.tsx:83-92` (summary + chevron ▼), заменить заголовок на «Установите приложение».
  - **Early return (первая строка тела компонента после хуков):**
    ```tsx
    if (installed || isStandalone || isTelegramWebApp()) return null;
    ```
    Хуки: `usePWAInstall()`, `useIsStandalone()`, плюс `useIsIOSUserAgent()` из PlatformInstallCards.
  - **Контент внутри `<div className="space-y-5 border-t border-app-border px-4 py-4">`:**
    - `<p className="text-sm text-app-text-secondary">` — «Своя иконка на экране, запуск в одно касание, работает без интернета.»
    - `<div className="flex flex-col gap-4 sm:flex-row">` — карточки (порядок по UA):
      - Android: `canInstall` → `action={{ label: 'Установить', onClick: handleInstall }}` + description «Одна кнопка — и иконка на экране»; иначе description «Откройте план в Chrome — браузер предложит установку».
      - iOS: `<IOSInstallCard />` без props (default steps).
    - `handleInstall`: `console.debug('[pwa] settings install click')` → `await install()`.
  - **DOM:** `data-install-pwa-section` на `<details>`.
  - **Проверка:** `npm run build`.
  - Files: `src/shared/components/pwa/InstallPwaSection.tsx` (new).

- [x] **Task 6: Подключить секцию на страницу настроек** (depends on 5)
  - **Файл:** `src/app/dashboard/settings/page.tsx`.
  - **Импорт:** `import { InstallPwaSection } from '@/shared/components/pwa/InstallPwaSection';`
  - **Вставка:** после `<OfflineDataSection />` (строка ~67), внутри scroll-`<div>`:
    ```tsx
    <OfflineDataSection />
    <InstallPwaSection />
    ```
  - **Проверка:** `/dashboard/settings` в Chrome (не standalone) — секция «Установите приложение» видна и раскрывается; DevTools → Rendering → emulate `display-mode: standalone` → секция исчезает.
  - Files: `src/app/dashboard/settings/page.tsx`.

### Phase 4: Документация

- [x] **Task 7: Документация и env-справочники** (depends on 1, 4, 6)
  - **ENV_SETUP.md** — добавить строку в таблицу client vars (рядом с `NEXT_PUBLIC_REGISTER_*`):
    | `NEXT_PUBLIC_TELEGRAM_MINIAPP_ENABLED` | client (build-time) | Default **выключен**. `true`/`1` ⇒ mini-app работает; иначе в Telegram — экран миграции. Пересборка для переключения. |
    + подраздел «Локальная разработка»: для теста legacy mini-app → `.env.local`: `NEXT_PUBLIC_TELEGRAM_MINIAPP_ENABLED=true`.
  - **docs/configuration.md** — тот же флаг + упомянуть `getPublicAppUrl()` / `NEXT_PUBLIC_APP_URL` для ссылки «Открыть сайт».
  - **deploy/.env.example** — после блока `NEXT_PUBLIC_REGISTER_ENABLED` (строка ~29):
    ```env
    # Telegram mini-app (build-time). Пусто/false ⇒ экран «Приложение переехало» в Telegram; 'true'/'1' временно вернуть mini-app.
    NEXT_PUBLIC_TELEGRAM_MINIAPP_ENABLED=
    ```
  - **docs/authentication.md** — в разделе Telegram: mini-app по умолчанию выключен (`NEXT_PUBLIC_TELEGRAM_MINIAPP_ENABLED`); auth через initData только при явном включении; основной канал — сайт/PWA.
  - **AGENTS.md** — в Project Structure добавить:
    - `src/features/telegram-migration/components/` — TelegramMigrationGate, TelegramMigrationScreen
    - `src/shared/components/pwa/PlatformInstallCards.tsx`, `InstallPwaSection.tsx`
    - `getPublicAppUrl()` в `src/shared/utils/api.ts`
  - **Финальная проверка:** `npm run build`; docs-чекпоинт `/aif-docs`.
  - Files: `ENV_SETUP.md`, `docs/configuration.md`, `deploy/.env.example`, `docs/authentication.md`, `AGENTS.md`.

## Критерии приёмки

1. Флаг не задан (или `false`) + открытие в Telegram (или dev-мок initData) → вместо приложения полноэкранный экран «Приложение переехало» в стиле лендинга; кнопка «Открыть сайт» ведёт на https://bible.baptistnn.ru/app во внешнем браузере; карточки Chrome/Safari упорядочены по платформе.
2. `NEXT_PUBLIC_TELEGRAM_MINIAPP_ENABLED=true` → поведение Telegram mini-app не изменилось (auth-флоу через `/api/auth/telegram` работает).
3. Вне Telegram экран миграции никогда не показывается, независимо от флага.
4. `/dashboard/settings`: в обычном браузере видна секция «Установите приложение» с работающей кнопкой установки (Chrome) / инструкцией (Safari); в установленном PWA (standalone) секция отсутствует.
5. Лендинг (`/`) визуально не изменился после рефакторинга InstallGuide.
6. `npm run build` зелёный; линтер без новых ошибок; никаких hardcoded-цветов — только `*-app-*` токены.

## Чеклист ручной проверки (для Sonnet 5 после всех задач)

| # | Действие | Ожидание |
|---|----------|----------|
| 1 | `npm run build` | Exit 0 |
| 2 | Открыть `/` в Chrome | Лендинг, секция установки на месте |
| 3 | Открыть `/dashboard/settings` | Секция «Установите приложение» видна |
| 4 | DevTools → emulate standalone → reload settings | Секция скрыта |
| 5 | (опционально) `.env.local` с `NEXT_PUBLIC_TELEGRAM_MINIAPP_ENABLED=true`, rebuild | Telegram redirect на login работает как раньше |
