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
- FSD: импорты строго вниз `app → features → shared`; между фичами не импортировать; доменный код (read-through, типы) живёт в `features/<name>`, в `shared/offline` — только дженерики.
- `src/lib/` — логика, общая для клиента И `server/` (session-core, directus-*, invite, register-access).

## Команды

```bash
npm run dev          # Next dev на :3000/app — И ПАРАЛЛЕЛЬНО нужен BFF:
npm run bff:dev      # Hono BFF на :3001 (tsx watch); без него все /api падают
npm run build        # manifest → next build (out/) → сборка sw.js
npm run lint         # eslint
npm run test         # vitest run (юнит: src/** + server/**)
npx vitest run src/shared/offline/sync.test.ts        # один файл
npx vitest run -t "имя теста"                          # один тест
npm run e2e:offline  # Playwright офлайн-регрессия (сам собирает и поднимает static-serve)
npm run static:serve # локальный аналог nginx: out/ + прокси на BFF (для ручной проверки прод-сборки)
npm run deploy       # deploy/deploy.sh: rsync на сервер + сборка bff/nginx ТАМ (--dry-run, --no-build)
```

- Vitest: окружение по умолчанию `node`; компонентным тестам — докблок `// @vitest-environment jsdom` по-файлово.
- Тесты BFF — через фабрику `createApp()` и `app.request()` (`server/src/app.ts`), без реального сервера.

## Верификация (без этого изменение не готово)

1. `npm run test` + `npm run lint` — всегда.
2. Тронул offline/SW/кэширование/роутинг — обязателен production-контур: `npm run build` → просмотреть реальный сгенерированный `out/sw.js` → `npm run e2e:offline`. Dev-режим офлайн-баги НЕ воспроизводит.
3. E2e-офлайн-ассерты: страница отдаёт контент **и** консоль чистая (без `Failed to fetch RSC payload`). `page.route` не перехватывает запросы, прошедшие через SW.
4. «Баг только на проде» — СНАЧАЛА проверь свежесть задеплоенного бандла (timestamp `out/` vs коммит фичи, SW может отдавать stale precache), потом смотри исходники.
5. На проде есть тест-аккаунт `claude-offline-test` для e2e/офлайн-проверок — не удалять. Smoke после деплоя — полный критический путь (создание аккаунта через invite + cleanup), а не «GET /login отдал 200».

## Offline/PWA — выстраданные инварианты

**Offline-first по умолчанию: всё, что добавляется в приложение, обязано работать офлайн.** Новая фича/экран/ресурс без явного офлайн-поведения не считается готовой: чтение — через read-through + IDB, запись — через outbox, новый маршрут — в `APP_SHELL_ROUTES`, плюс офлайн-тест. Если офлайн для чего-то сознательно не нужен — это исключение, которое проговаривается с Игорем явно, а не умолчание.

Дистиллят 22 разборов багов — полные версии в `.ai-factory/skill-context/*/SKILL.md` (читать при работе над соответствующей задачей).

- **Каждый** read-путь офлайн-ресурса (Писание, песни, план) идёт через network-first + IDB-фолбэк (`readThrough` / фиче-локальный слой). Голый `fetch`/`apiClient.get` для офлайн-ресурса запрещён. Добавил фолбэк списку — сразу проверь парную деталь (и наоборот): рассинхрон list↔detail уже давал «офлайн: не открывается песня».
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

## Прод и деплой

- Стек: Docker Compose на своём сервере, `/opt/nbc/bible-plan/deploy`. Сервисы: `bff` (Hono) + `nginx` (запечённый `out/` + прокси). Образы собираются НА сервере из rsync-нутого дерева.
- `deploy/deploy.sh` **исключает `deploy/` из rsync** — изменения инфраструктуры (compose, Dockerfile, nginx-конфиги) доставляются вручную (scp) и применяются на сервере.
- Секреты — только через env (`/opt/nbc/bible-plan/deploy/.env` на сервере, `.env.local` локально); значения в логах/выводе только маскированными.

## UI и дизайн-система

- Только семантические токены `bg-app-*` / `text-app-*` / `border-app-*` / `shadow-app-*` (источник — CSS-переменные в `globals.css`, TS-константы в `src/shared/config/design-tokens.ts`). Хардкод-шейды Tailwind (`stone-`, `red-`…) и `dark:`-варианты запрещены; тёмная тема — автоматически через переменные. Исключение: `theme-light|dark|sepia` в ридере — пользовательский выбор, не тема приложения.
- DOM-якоря для e2e/аналитики: kebab-case `data-{component-kebab}-{зона}` (`TodayReadingCard` → `data-today-reading-card-day-counter`), не `data-component`.
- Скриншоты на dev-сборке: перед КАЖДЫМ снимком прячь Next dev-индикатор (`nextjs-portal{display:none!important}` через evaluate). DevTools-пресет «Offline» не переключает `navigator.onLine` — событийную UI-логику проверяй `window.dispatchEvent(new Event('offline'))`.
- Компоненты `'use client'`, named exports, props-интерфейс `<Name>Props` в том же файле, `cn()` для классов.

## Источники истины по документации

- Карта проекта и структура — `AGENTS.md` (импортируется ниже). Детальные гайды — `docs/*` (актуальны, включая `docs/deployment.md`, `docs/offline-pwa.md`, `docs/design-system.md`).
- `.ai-factory/skill-context/*` — дистиллированные правила по типам задач (plan/implement/fix/verify/review); поддерживаются `/aif-evolve`.
- `.cursor/rules/dev-rule` — тонкий указатель на AGENTS.md/CLAUDE.md для Cursor, структуру не дублирует.

@AGENTS.md
