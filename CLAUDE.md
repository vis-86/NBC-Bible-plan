# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# NBC Bible Plan

PWA для церковной общины: план чтения Библии, читалка, песни (ChordPro), офлайн-режим, AI-чат. Волонтёрский проект — простота сопровождения важнее «правильности» (см. `../CLAUDE.md`).

## Архитектурная рамка (нарушение = сломанный прод)

Next.js 16 — **static export** (`output: 'export'`): серверного рантайма Next НЕТ.

- Никаких `src/app/api/**`, `middleware.ts`, Server Actions, динамических `[slug]`-сегментов. Параметры маршрутов — в query string (`/dashboard/read?book=&chapter=`), иначе ломается офлайн app-shell.
- Весь API — **Hono BFF** в `server/` (отдельный процесс, порт 3001, запуск через `tsx` без сборки). Роуты: `server/src/routes/*`. Auth-гард — клиентский `DashboardAuthGate` в `src/app/dashboard/layout.tsx`.
- Клиентские URL строятся ТОЛЬКО через `getApiPath()` из `@/shared/utils/api` (basePath `/app`).
- Directus с клиента — только через прокси `{basePath}/api/directus/*` (`server/src/routes/directus-proxy.ts`). `DIRECTUS_ADMIN_TOKEN` — server-only.
- FSD: импорты строго вниз `app → features → shared`; между фичами не импортировать; доменный код (read-through, типы) живёт в `features/<name>`, в `shared/offline` — только дженерики. **Единственное исключение — `shared/offline/downloadManager.ts`**: оркестратор прогрева обязан звать фиче-локальные слои теми же вызовами, что и экраны (иначе рассинхрон писателя и читателя), обоснование и отвергнутые альтернативы — в шапке файла. Новые упоминания `features/*` в `shared/` — только там.
- `src/lib/` — логика, общая для клиента И `server/` (session-core, directus-*, invite, register-access).

## Команды

```bash
npm run dev          # Next dev (:3000/app) + Hono BFF (:3001) вместе — concurrently, один процесс/Ctrl+C
npm run bff:dev      # только Hono BFF (tsx watch), без Next — если нужен раздельный запуск
npm run build        # manifest → next build (out/) → сборка sw.js
npm run lint         # eslint
npm run test         # vitest run (юнит: src/** + server/**)
npx vitest run src/shared/offline/sync.test.ts        # один файл
npx vitest run -t "имя теста"                          # один тест
npm run e2e:offline  # Playwright: весь e2e/ (offline + layout). Серверы НЕ поднимает —
                     # сначала вручную: npm run build → npm run bff:start & → npm run static:serve &
                     # плюс .env.test (E2E_TEST_LOGIN/PASSWORD) — см. e2e/offline/README.md
npm run static:serve # локальный аналог nginx: out/ + прокси на BFF (для ручной проверки прод-сборки)
npm run deploy       # deploy/deploy.sh: rsync на сервер + сборка bff/nginx ТАМ (--dry-run, --no-build)
```

- Vitest: окружение по умолчанию `node`; компонентным тестам — докблок `// @vitest-environment jsdom` по-файлово.
- Тесты BFF — через фабрику `createApp()` и `app.request()` (`server/src/app.ts`), без реального сервера.

## Верификация (без этого изменение не готово)

1. `npm run test` + `npm run lint` — всегда.
2. Тронул offline/SW/кэширование/роутинг — обязателен production-контур: `npm run build` → просмотреть реальный сгенерированный `out/sw.js` → поднять `bff:start` + `static:serve` → `npm run e2e:offline`. Dev-режим офлайн-баги НЕ воспроизводит.
3. E2e-офлайн-ассерты: страница отдаёт контент **и** консоль чистая (без `Failed to fetch RSC payload`). `page.route` не перехватывает запросы, прошедшие через SW.
4. «Баг только на проде» — СНАЧАЛА проверь свежесть задеплоенного бандла (timestamp `out/` vs коммит фичи, SW может отдавать stale precache), потом смотри исходники.
5. На проде есть тест-аккаунт `claude-offline-test` для e2e/офлайн-проверок — не удалять. Smoke после деплоя — полный критический путь (создание аккаунта через invite + cleanup), а не «GET /login отдал 200».

## Offline/PWA — выстраданные инварианты

**Offline-first по умолчанию: всё, что добавляется в приложение, обязано работать офлайн.** Новая фича/экран/ресурс без явного офлайн-поведения не считается готовой: чтение — через read-through + IDB, запись — через outbox, новый маршрут — в `APP_SHELL_ROUTES`, плюс офлайн-тест. Если офлайн для чего-то сознательно не нужен — это исключение, которое проговаривается с Игорем явно, а не умолчание.

Дистиллят 22 разборов багов — полные версии в `.ai-factory/skill-context/*/SKILL.md` (читать при работе над соответствующей задачей).

- **Каждый** read-путь офлайн-ресурса (Писание, песни, план) идёт через общий слой — **cache-first + фоновая ревалидация** (`readThroughSWR` / `readSongThroughSWR` / фиче-локальный слой): кеш свежее TTL (5 мин) отдаётся без похода в сеть, протухший — мгновенно + ревалидация фоном, пустой — прежний network-first со всеми гарантиями (`raceNetwork`, circuit breaker, `OfflineNoDataError`). Network-first осознанно остался у сессии (`AuthProvider`: источник истины — сервер, но last-known-user подставляется оптимистично ДО ответа, ответ «сессии нет» его снимает; не превращать обратно в «ждать сеть» — это вернёт лоадер на каждый холодный старт), replay outbox (`sync.ts`) и pull-to-refresh сетов. Голый `fetch`/`apiClient.get` для офлайн-ресурса запрещён. Добавил фолбэк списку — сразу проверь парную деталь (и наоборот): рассинхрон list↔detail уже давал «офлайн: не открывается песня».
- Свежесть офлайн-данных держит **дельта-синк** на каждом запуске: `GET /api/sync/manifest` (пер-элементные версии + ETag) → скачивается только изменившееся, отсутствующее в манифесте удаляется из IDB. Версии — в сторе `meta` (`sync:versions`/`sync:etag`), `DB_VERSION` не поднимался. Подробности — `docs/offline-pwa.md`.
- Фоновый свежий ответ применяется молча ВЕЗДЕ, кроме открытой песни: там `freshAvailable` + плашка «Песня обновлена» (текст не должен уезжать под руками на служении, к строкам привязаны ink-пометки).
- Тесты с `fake-indexeddb`: стор не сбрасывается между кейсами файла, а cache-first отдаст запись соседнего теста вместо вызова мока — уникальные ключи на кейс либо `db.clear('apiCache')` в `beforeEach`.
- Реальный офлайн **вешает** запросы, а не reject'ит. Любой network-first — с таймаутом; `navigator.onLine === false` → fail fast (ждать бессмысленно — ожидание бесконечно by construction); `onLine === true` не значит ничего (lie-fi). Последовательные network-first экраны перемножают таймауты: считай N×T, а не сумму.
- Ключ кэша/IDB/localStorage — **один экспортируемый константный источник**, импортируемый и писателем, и читателем (расхождение `useSongs` vs `downloadSongs` — реальный баг). Download/warm-up обязан греть все ключи, которые читают экраны; ассерт в тестах — тем же вызовом, что в проде.
- Для каждого `cache.match(x)`: «под каким точным ключом это писалось при install?» — cache-busting параметры (`_rsc`, `?v=`) ломают точное совпадение; `ignoreSearch` — осознанно.
- SW: ветвись по `request.mode` (`navigate` vs RSC/flight-фетчи); новый `router.push`-маршрут → добавить в `APP_SHELL_ROUTES`; `cache.put` навигаций только при `res.ok && !res.redirected` (закэшированный login-redirect навсегда убивает офлайн). Никогда не отдавай чужой кэшированный HTML как app-shell (бесконечный reload-loop).
- Функции, встраиваемые через `.toString()` в генерируемый SW (`src/sw/`): только аргументы, никаких свободных переменных — минификация даёт `ReferenceError` только в прод-бандле. Чек-лист правки: юнит-тесты → build → инспекция реального `sw.js` → офлайн-навигация на этой сборке.
- Записи офлайн-ресурсов — через write-ahead outbox + LWW-sync (`@/shared/offline/outbox`), не прямым POST. Обязательный тест-кейс офлайн-фичи: «fetcher rejects + запись уже в IDB».
- Добавляя состояние/политику в общий примитив (`withTimeout` и т.п.) — перечисли ВСЕХ импортёров: один не-сетевой потребитель (например `indexedDB.open`) превращает «оптимизацию» в отказ фолбэк-слоя.

## Auth и Directus — инварианты

- Аккаунты создаются ТОЛЬКО через invite или код церкви (ФЗ-152: без email/телефона/ФИО). Telegram mini-app лишь **привязывает** tg_id к существующему аккаунту, не создаёт; клиент ветвится по `data.linked`, не по `res.ok` (иначе redirect-loop).
- Синтетический email `{login}@local.baptistnn.ru` — домен обязан иметь реальный TLD (Directus v11 отклоняет `@local`, `.invalid`, `.test`).
- Профили читать через **admin-client** по `directus_id` из сессии; `/users/me` под user-токеном не использовать — policy роли «Чтец» возвращает только `id`. Сессия не хранит Directus access_token (он живёт ~15 мин без refresh).
- Поле, скопированное в iron-session cookie, — это кэш: перед добавлением ответь «что происходит, когда источник меняется?» (нужен refresh-путь).
- Регистрация — tri-state, сервер источник истины (`src/lib/register-access.ts`, матрица в `ENV_SETUP.md`); UI-флаги `NEXT_PUBLIC_REGISTER_*` — build-time зеркало, обязаны совпадать с серверными. Прод-состояние смотри в серверных compose-файлах, не предполагай.

## Роли доступа (сетлисты)

- Роли: `reader` (дефолт), `musician` (CRUD сетлистов), `musician_editor` (CRUD сетлистов
  + создание и редактирование песен). Обе музыкантские роли проходят `canManageSetlists`;
  `canEditSongs` — только `musician_editor` (редактор песен M9). Маппинг Directus-роль →
  `AppRole` — `src/lib/app-roles.ts`.
- **Реальный гейт — BFF, не Directus.** Приложение ходит в Directus админ-токеном через
  BFF, поэтому Directus-права — второй рубеж, а не защита. Каждый мутирующий роут
  сетлистов обязан пройти через `requireSetlistWrite`, песен — через `requireSongWrite`
  (`server/src/middleware/requireRole.ts`). Клиентский `useAppRole`/`canManageSetlists`/
  `canEditSongs` управляет только видимостью кнопок.
- **Прав на `songs` в Directus у политик пользователей НЕТ — и выдавать их нельзя**
  (решение Игоря 2026-09-24). Ни чтения, ни записи: BFF читает и пишет песни админ-токеном.
  Прокси `/api/directus/*` ходит под учёткой самого пользователя, а в Directus музыкант может
  войти и напрямую — выданная запись `songs` стала бы путём правки мимо BFF (без zod, генерации
  slug, с произвольным `status`). «Второй рубеж» для песен — полный запрет, а не права роли.
- Роль резолвится отдельным эндпоинтом `GET /api/user/role` — в iron-session cookie её
  НЕ класть (кэш в cookie требует refresh-пути, см. инвариант выше; отдельный эндпоинт
  этой проблемы не создаёт).
- **Осознанные исключения из offline-first:** запись сетлистов (создание/редактирование/
  удаление) и запись песен (редактор M9) — online-only, с явным UI «нужен интернет».
  Песня для правки грузится ТОЛЬКО из сети, мимо read-through (правка поверх кеша откатила бы
  чужую), а после записи IDB песни и список обновляются явно. Чтение — полноценно офлайн
  (read-through + IDB), как и все остальные ресурсы. Подробности и обоснование —
  `docs/offline-pwa.md`, редактор — `docs/song-viewer-spec.md` §15.
- **Ссылка на песню `/s?id=`** — гостю online-only (осознанное исключение, 2026-10-09);
  вошедшего страница уводит в `/dashboard/song` (офлайн). Кому открыта песня — поле
  `songs.visibility` (`public`/`members`), гейт — `GET /api/public/songs/:id` в BFF.
  `GET /api/songs*` — только с сессией. Подробности — `docs/offline-pwa.md`.

## Прод и деплой

- Стек: Docker Compose на своём сервере, `/opt/nbc/bible-plan/deploy`. Сервисы: `bff` (Hono) + `nginx` (запечённый `out/` + прокси). Образы собираются НА сервере из rsync-нутого дерева.
- `deploy/deploy.sh` **исключает `deploy/` из rsync** — изменения инфраструктуры (compose, Dockerfile, nginx-конфиги) доставляются вручную (scp) и применяются на сервере.
- Секреты — только через env (`/opt/nbc/bible-plan/deploy/.env` на сервере, `.env.local` локально); значения в логах/выводе только маскированными.

## UI и дизайн-система

- Только семантические токены `bg-app-*` / `text-app-*` / `border-app-*` / `shadow-app-*` (источник — CSS-переменные в `globals.css`, TS-константы в `src/shared/config/design-tokens.ts`). Хардкод-шейды Tailwind (`stone-`, `red-`…) и `dark:`-варианты запрещены; тёмная тема — автоматически через переменные. Исключение: `theme-light|dark|sepia` в ридере — пользовательский выбор, не тема приложения.
- DOM-якоря для e2e/аналитики: kebab-case `data-{component-kebab}-{зона}` (`TodayReadingCard` → `data-today-reading-card-day-counter`), не `data-component`.
- Оболочка дашборда (`.h-app-viewport`) — `position: fixed; inset: 0` БЕЗ `transform`
  (раньше был `translateZ(0)`; убран вместе с переходом на no-cover, см. пункт про полосу ниже).
  Плоский `fixed` НЕ создаёт containing block, поэтому fixed-оверлеи резолвятся к вьюпорту.
  Оверлеи всё равно порталятся в оболочку (`useAppShellPortalTarget`): `BottomSheet`,
  `ActionMenu`, панель скорости автоскролла — держит стекинг/overflow предсказуемым.
  ИСТОРИЧЕСКИ портал был обязателен из-за transform-containing-block: WebKit резал fixed-потомка
  такого предка по ЛЮБОМУ промежуточному `overflow: hidden` (шторка транспонирования в 52px шапке
  песни схлопывалась так), Chromium — нет. Убрав transform, этот механизм отключился, но портал
  оставлен как безопасный дефолт; при правках оверлеев перепроверяй на РЕАЛЬНОМ iPad/iPhone
  (в Chromium регрессия не ловится). Гейт — структурный ассерт в `e2e/layout/song-layout.spec.ts`.
- **iOS-полоса снизу под нижним баром решена снятием `viewport-fit=cover`** (`layout.tsx`
  → `viewport-fit=auto`). Cover растягивал layout viewport под home-indicator, и под плавающим
  баром вылезала полоса фона, разной высоты портрет/ландшафт. Замеры с реального iPhone: с auto
  оболочка `fixed;inset:0` точно совпадает с visualViewport в обеих ориентациях. Цена: без cover
  `env(safe-area-inset-*)` = 0 везде → своей «брови» под цвет шапки нет (рисует система, статус-бар
  `black-translucent`); `pt-safe-*`/`h-safe-top` и прочие `env()` стали no-op'ами, оставлены как
  ссылки. **Не возвращать cover, не решив полосу снизу.**
- `touch-action` считается браузером по цепочке до БЛИЖАЙШЕГО скролл-контейнера: `pan-y` на `[data-swipe-pager]` до вложенного `.overflow-y-auto` НЕ доходит, и Chrome на Android забирает горизонтальный жест себе (`pointercancel` через ~20px) — свайп глав/песен молча умирает. Скролл-контейнеры внутри пейджера обязаны сами быть `pan-y` (правило в `globals.css`). Гейт — `e2e/gestures/swipe-pager.spec.ts`; jsdom-тесты `SwipePager` этот класс багов не ловят.
- Тот же класс багов у вертикали: на `scrollTop === 0` Chrome на Android всё равно опознаёт протягивание вниз как свой скролл (уходит в overscroll) и присылает `pointercancel` — pointer-жест pull-to-refresh умирает, не добрав порога. CSS тут не спасает: нужен нативный не-passive `touchmove` с `preventDefault()`, пока тянут вниз от верха (`usePullToRefresh`), React вешает свои слушатели passive'ными. Гейт — `e2e/gestures/pull-to-refresh.spec.ts`.
- Перетаскивание аккорда в редакторе песни (`SongChordCanvas`): `touch-action: none` стоит ИНЛАЙНОМ на самом аккорде (класс `touch-none` на кнопке перебивает неслоёное правило `globals.css`) — иначе тот же `pointercancel` на ~20px. На тексте строки `none` нет, чтобы вертикальная прокрутка редактора жила. Гейт — `e2e/gestures/chord-drag.spec.ts` (проверено: с `manipulation` на аккорде падает).
- Скриншоты на dev-сборке: перед КАЖДЫМ снимком прячь Next dev-индикатор (`nextjs-portal{display:none!important}` через evaluate). DevTools-пресет «Offline» не переключает `navigator.onLine` — событийную UI-логику проверяй `window.dispatchEvent(new Event('offline'))`.
- Компоненты `'use client'`, named exports, props-интерфейс `<Name>Props` в том же файле, `cn()` для классов.

## Источники истины по документации

- Карта проекта и структура — `AGENTS.md` (импортируется ниже). Детальные гайды — `docs/*` (актуальны, включая `docs/deployment.md`, `docs/offline-pwa.md`, `docs/design-system.md`).
- `.ai-factory/skill-context/*` — дистиллированные правила по типам задач (plan/implement/fix/verify/review); поддерживаются `/aif-evolve`.
- `.cursor/rules/dev-rule` — тонкий указатель на AGENTS.md/CLAUDE.md для Cursor, структуру не дублирует.

@AGENTS.md
