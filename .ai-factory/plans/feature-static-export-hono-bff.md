# Миграция offline-PWA: static export + Hono BFF (вариант B)

Branch: `feature/static-export-hono-bff`
Created: 2026-07-09
Executor: **Sonnet 5** — каждый таск самодостаточен: конкретные файлы, точные команды, критерии проверки. Ничего «по аналогии».

## Settings

- **Testing:** yes — unit-тесты на новую логику (vitest) + Playwright offline E2E как приёмка
- **Logging:** verbose — DEBUG-логи в BFF и offline-слое (гейт по `LOG_LEVEL`, по образцу существующего `debug()` в `src/shared/offline/`)
- **Docs:** yes — обязательный docs-чекпоинт в конце (T14)

## Research Context (снапшот из .ai-factory/RESEARCH.md)

- Все страницы уже `'use client'`, данные тянутся клиентски через `/api/*` → static export теряет ноль функциональности. SSR/RSC не используются.
- Цель: настоящий static app shell с атомарным precache-манифестом (модель chordpro-app, которая на iOS работает идеально) вместо хрупкого RSC-транспорта App Router.
- iOS-специфика: storage партиционирован (Safari ≠ installed PWA) → данные, скачанные вручную в Safari, невидимы для PWA. Лечение — автозагрузка данных после логина в любом контексте (T11).
- Rewrite на Vite отвергнут; исполняем вариант B: Next `output: 'export'` + Serwist precache + вынос `/api/*` в Hono BFF (отдельный сервис в Docker Compose, nginx: static из `out/` + proxy `/api` → hono).

### Верифицировано разведкой 2026-07-09 (не переделывать!)

- **Update flow (чек-лист п.1) уже реализован**: install БЕЗ `skipWaiting()`, `SKIP_WAITING` по message, toast через `useSwUpdate`, `reg.update()` на visibilitychange + раз в час (`ServiceWorkerRegistrar.tsx`). Сохранить при миграции.
- **Lie-fi timeout (п.3a) уже реализован**: `NAV_TIMEOUT_MS = 4000` в `handleNavigation`.
- **Redirected responses (п.9) уже НЕ кешируются**: `if (res.ok && !res.redirected)` + тест. Гипотеза №2 из RESEARCH опровергнута.
- **401 ≠ network error (п.5) уже реализован** в `src/shared/services/api/client.ts` (`ApiClientError.status`, `__onSessionExpired` только на явный 401; сетевые ошибки — отдельная ветка). Осталось верифицировать `graphql.ts` (T10).
- **better-sqlite3 и @lucia-auth/adapter-sqlite — мёртвые зависимости** (0 импортов в `src/`). Никакого SQLite на сервере нет; вся персистентность — Directus admin-client + файловые JSON Писания (`src/lib/bible-data.ts`, `fs.readFileSync` из `data/`).
- **middleware.ts — единственный жёсткий блокер export**: auth-guard `/dashboard` + 2 легаси-редиректа (`/dashboard/read/<book>/<chapter>` → `?book=&chapter=`; `/dashboard/songs/<id>` → `/dashboard/song?id=`). `/api/**` middleware не трогает.
- **Страницы export-clean**: нет dynamic segments в pages, нет `next/image`, `useSearchParams` уже в `<Suspense>`, нет server actions, root layout без cookie/fetch.
- **Package manager — yarn** (corepack, `yarn.lock`); `package-lock.json` — мусор, удалить.
- **Хрупкость `.toString()`-сериализации SW**: pure-функции без замыканий (минификация переименовывает free references — ловили на устройстве). При переходе на настоящий build-шаг SW (T8) это ограничение снимается.

## Архитектура после миграции

```
   БЫЛО                                СТАНЕТ
   nginx :443                          nginx :443
     /app  → proxy app:3000              /app        → static из out/ (try_files)
     /directus → directus:8055           /app/api/*  → proxy bff:3001
                                         /directus   → directus:8055
   app = next start (standalone,        bff = Hono на node:22-slim
     API routes + middleware + SSR)        (весь бывший /api/*, без native deps)
   SW из route handler'а               SW = static out/sw.js, Serwist precache
     (runtime-кеш посещённых страниц)    (атомарный снимок ВСЕХ HTML+chunks)
   auth-guard в middleware             auth-guard на клиенте (AuthProvider)
                                       легаси-редиректы → nginx rewrite
```

Клиентский код (`getApiPath` → `{basePath}/api/...`) НЕ меняется: URL-контракт `/app/api/*` сохраняется, меняется только кто отвечает (nginx proxy → bff вместо next). IDB-слой (outbox, read-through, download manager, last-known-user) переезжает без изменений.

---

## Progress

- [x] T1. Скелет BFF: `server/`, Hono, логирование, health
- [x] T2. Session-слой: framework-agnostic ядро + Hono-адаптер
- [x] T3. Порт группы auth (8 роутов) + rate limiter
- [x] T4. Порт групп bible/plan/songs
- [x] T5. Порт групп user/chat/graphql/directus-proxy/ai
- [x] T6. `output: 'export'` + dev-режим + удаление серверной части Next
- [x] T7. Клиентский auth-guard + легаси-редиректы
- [x] T8. Build-time SW с precache-манифестом поверх `out/`
- [x] T9. ChunkLoadError guard
- [x] T10. Sync health-гейт + верификация 401-контракта в graphql-клиенте
- [x] T11. Гибридная автозагрузка после логина
- [x] T12. Dockerfile + compose: static-артефакт + сервис bff
- [x] T13. Offline E2E под новую топологию
- [ ] T14. Docs-чекпоинт + приёмка на реальном iPhone

## Tasks

### Phase 1 — Hono BFF (параллельно живёт со старым API до cutover в T6)

#### T1. Скелет BFF: `server/`, Hono, логирование, health

- Создать `server/` в корне репо:
  - `server/src/index.ts` — `@hono/node-server`, порт из `BFF_PORT` (default 3001). Все роуты монтируются под `basePath` из `NEXT_PUBLIC_BASE_PATH` (default `/app`): итоговые пути `/app/api/...` — ровно те же URL, что сейчас отдаёт Next за nginx.
  - `server/src/app.ts` — фабрика `createApp()` (Hono instance) отдельно от listen — для supertest-style тестов через `app.request()`.
  - `server/src/logger.ts` — уровни debug/info/warn/error, гейт по `LOG_LEVEL` (default `info`, в dev `debug`). Формат: `[bff] <level> <msg>`. Логировать: старт (порт, basePath), каждый запрос (method, path, status, ms) на debug, ошибки — error со stack.
  - `server/src/env.ts` — читает и валидирует env (zod): `DIRECTUS_URL`, `DIRECTUS_ADMIN_TOKEN`, `SESSION_SECRET`, `INVITE_ADMIN_SECRET`, `TELEGRAM_BOT_TOKEN`, `REGISTER_CHURCH_CODE?`, `REGISTER_OPEN_NO_CODE?`, `DIRECTUS_AI_FLOW_ID?`, `NEXT_PUBLIC_DIRECTUS_URL`, `NEXT_PUBLIC_AI_ENABLE?`, `NEXT_PUBLIC_BASE_PATH?`, `LOG_LEVEL?`. Отсутствие секретов — lazy throw на первом использовании (как сейчас в `session.ts`), НЕ на импорте.
- Зависимости: `yarn add hono @hono/node-server`, `yarn add -D @types/node` (уже есть). Никакого отдельного package.json — BFF живёт в общем, tsconfig: `server/tsconfig.json` extends корневой, `module: nodenext`, без DOM lib.
- Первый роут: `GET /app/api/health` → 204 (порт из `src/app/api/health/route.ts`, поведение 1:1 — клиентский sync-гейт от него зависит).
- Скрипты в package.json: `"bff:dev": "tsx watch server/src/index.ts"`, `"bff:start": "tsx server/src/index.ts"` (tsx уже в devDeps; отдельный build-шаг не нужен — простота сопровождения).
- Тест: `server/src/app.test.ts` (vitest, node env — дефолт проекта): `app.request('/app/api/health')` → 204.
- Проверка: `yarn test server/` зелёный; `yarn bff:dev` + `curl -i localhost:3001/app/api/health` → 204.

#### T2. Session-слой: framework-agnostic ядро + Hono-адаптер

- `src/lib/session.ts` сегодня: iron-session `sealData`/`unsealData`, cookie `bible-plan-session`, ttl 30 дней, `SessionData = { directus_id, first_name, last_name?, username? }`. Есть портируемый `getSessionFromRequest(request)` (читает cookie-header) и Next-специфичный `getSession()` (через `next/headers`).
- Вынести ядро в `src/lib/session-core.ts` (НЕ импортирует ничего из `next/*`): `sealSession(data): Promise<string>`, `unsealSession(cookieValue): Promise<SessionData|null>`, константы `SESSION_COOKIE_NAME`, `SESSION_TTL`, cookie-опции (`httpOnly, secure: NODE_ENV==='production', sameSite: 'lax', path: '/'` — path `/` обязателен, покрывает `/app/api` под basePath). `src/lib/session.ts` реэкспортирует ядро и оставляет Next-обёртки (до T6 старые роуты живы).
- `server/src/session.ts` — Hono-хелперы поверх ядра: `getSession(c)` (парсит `Cookie` через `hono/cookie` `getCookie`), `createSession(c, data)` (`setCookie`), `deleteSession(c)` (`deleteCookie` с теми же опциями). Логировать (debug): создание/удаление сессии (directus_id, БЕЗ значений cookie).
- Тест: `server/src/session.test.ts` — seal в ядре → unseal через Hono-хелпер на fake request; истёкший/битый cookie → null; `deleteSession` ставит истекающий Set-Cookie.
- Проверка: `yarn test` зелёный целиком (старые тесты `session.test.ts` не сломаны).

#### T3. Порт группы auth (8 роутов) + rate limiter

- Портировать в `server/src/routes/auth.ts` 1:1 по поведению из `src/app/api/auth/*/route.ts`: `login`, `logout`, `session`, `register`, `activate`, `invite/create`, `telegram`, `telegram/link`.
- Бизнес-логика УЖЕ в `src/lib/*` (`directus-user.ts`, `invite.ts`, `register-access.ts`, `telegram-server.ts`, `rate-limiter.ts`, `validators/auth.schemas`) и не зависит от Next — импортировать оттуда как есть, НЕ копировать.
- Механика порта (одинакова для всех групп): `NextResponse.json(x, {status})` → `c.json(x, status)`; `request.json()` → `await c.req.json()`; `{ params: Promise<{...}> }` → `c.req.param('...')`; cookie — через `server/src/session.ts`; `export const runtime = 'nodejs'` — удалить (не нужно).
- `clientIp`: в `src/lib/rate-limiter.ts` он читает `x-forwarded-for`/`x-real-ip` из request — сделать сигнатуру принимающей `Headers` (совместимо и с Next, и с Hono `c.req.raw.headers`), поправить вызовы.
- КОНТРАКТЫ, которые нельзя сломать (проверить тестами):
  - `POST /app/api/auth/telegram` при непривязанном tg_id → 200 `{linked:false}` БЕЗ сессии (не 401! клиент различает).
  - `GET /app/api/auth/session` — если профиль в Directus изменился, re-seal cookie в ответе.
  - `login`: Directus `/auth/login` + `/users/me` через raw fetch, затем профиль через admin-client (роль «Чтец» отдаёт из `/users/me` только id — см. memory directus-rebuild-access-links).
  - Rate limits как были: login 10/15min, register 5/h, activate 10/h, telegram/link 10/15min; 429 с тем же телом.
- Логи (debug): вход/выход, register/activate (login, без паролей), rate-limit отказы (warn с ip).
- Тесты: `server/src/routes/auth.test.ts` — на `app.request()` с замоканным Directus fetch (паттерн из существующих `src/lib/*.test.ts`): login happy-path ставит Set-Cookie; login с неверным паролем → 401; register при закрытой регистрации → 503; telegram unlinked → `{linked:false}` без Set-Cookie; rate limit → 429.
- Проверка: `yarn test server/` зелёный.

#### T4. Порт групп bible/plan/songs (+ данные из `data/`)

- `server/src/routes/bible.ts`: `GET /app/api/bible/books`, `GET /app/api/bible/:book/:chapter` (поддержать `?translation=` — клиент шлёт явно; при сессии без параметра — перевод из reading-settings, как сейчас), `GET /app/api/bible/download/:translation` (bulk, без auth).
- `src/lib/bible-data.ts` читает JSON с диска (`fs.readFileSync`) относительно cwd — в BFF-контейнере рабочая директория должна содержать `data/` (учтено в T12). Для локалки `yarn bff:dev` из корня репо работает как есть.
- `server/src/routes/plan.ts`: `GET /app/api/plan`, `GET /app/api/plan/weekly?book=`. `server/src/routes/songs.ts`: `GET /app/api/songs`, `GET /app/api/songs/:id` (404 если нет). Всё через существующие `src/lib/directus-data.ts` / `src/features/songs/services/songsServer.ts`.
- Логи (debug): book/chapter/translation запросов Писания; размер bulk-выгрузки (info).
- Тесты: `server/src/routes/content.test.ts` — books отдаёт список; неизвестная глава → 404; `?translation=` уважается; songs/:id несуществующий → 404.
- Проверка: `yarn test server/`; ручной smoke: `curl localhost:3001/app/api/bible/books | head -c 200`.

#### T5. Порт групп user/chat/graphql/directus-proxy/ai

- `server/src/routes/user.ts`: `app-settings`, `progress`, `reading-settings` (GET/POST, все — 401 без сессии, 1:1 из `src/app/api/user/*`).
- `server/src/routes/chat.ts`: `GET/POST/DELETE /app/api/chat/history` (session-gated, пагинация limit/offset).
- `server/src/routes/graphql.ts`: порт `src/app/api/graphql/route.ts`. Внутри — НЕ настоящий GraphQL, а regex-диспетчер (`updateProgress`, `updateProgressBatch`, `getDayProgress`) поверх Directus SDK по коллекции `reading` с фильтром `directus_user_id`. Портировать ДОСЛОВНО (снять `@ts-nocheck` только если типы чинятся тривиально; рефакторинг диспетчера — вне скоупа). КРИТИЧНО: это путь синка outbox — контракт ответов должен совпасть байт-в-байт по форме JSON (клиент — `src/shared/services/api/graphql.ts`).
- `server/src/routes/directus-proxy.ts`: catch-all `/app/api/directus/*` всех методов через `src/lib/directus-proxy.ts` (`proxyToDirectus`). Стриминг тела: `c.req.raw.body` + `duplex: 'half'` — проверить вручную POST'ом с телом.
- `server/src/routes/ai.ts`: `POST /app/api/ai/*` — диспетчер `chat|bible-text|reference` → Directus Flow, гейт `NEXT_PUBLIC_AI_ENABLE`.
- Логи: graphql-операции (имя операции + directus_id, debug); proxy (method+path+status, debug); ai (тип запроса, info).
- Тесты: `server/src/routes/graphql.test.ts` — три операции с моком Directus SDK, форма ответов сверена с тем, что ждёт `src/shared/services/api/graphql.ts`; user-роуты без сессии → 401.
- Проверка: `yarn test server/` зелёный. **Чекпоинт-коммит #1**: `feat(bff): hono bff with full api surface ported` (T1–T5).

### Phase 2 — static export и cutover

#### T6. `output: 'export'` + dev-режим + удаление серверной части Next

- `next.config.ts`:
  - `output: 'export'` (вместо `'standalone'`), `basePath`/`assetPrefix` без изменений, `env.NEXT_PUBLIC_APP_BUILD_TIME` остаётся.
  - Dev-DX: в dev (`process.env.NODE_ENV !== 'production'` — у `next dev` это `development`) добавить `rewrites: /app/api/* → http://localhost:3001/app/api/*`; в prod-конфиге rewrites недопустимы при export — поэтому вернуть rewrites только когда `phase === PHASE_DEVELOPMENT_SERVER` (использовать сигнатуру `(phase) => NextConfig`; при production build поле rewrites отсутствует). Рабочий dev-флоу: `yarn bff:dev` + `yarn dev`.
- Удалить: `src/app/api/**` целиком, `src/middleware.ts`, `src/app/sw.js/route.ts` (замена — T8), `src/app/manifest.ts` → статический `public/manifest.webmanifest` генерируется скриптом `scripts/build-manifest.ts` из тех же данных (basePath из env) и вызывается в `build`; `<link rel="manifest" href="{basePath}/manifest.webmanifest">` добавить в `src/app/layout.tsx` metadata (`manifest` field).
- `package.json`: `"build": "next build && tsx scripts/build-manifest.ts && tsx scripts/build-sw.ts"` (build-sw появится в T8; до него — оставить закомментированную заготовку и добавить в T8).
- Удалить мёртвые зависимости: `yarn remove better-sqlite3 @lucia-auth/adapter-sqlite`; удалить `package-lock.json`; grep убедиться что `lucia` тоже не импортируется — если да, удалить и `lucia`.
- Проверка: `yarn build` завершается, в `out/` лежат `dashboard.html`, `login.html`, `_next/static/**`; `yarn test` зелёный (тесты удалённых роутов удалить вместе с роутами — их логика уже покрыта в `server/`); `yarn lint` зелёный. Dev-флоу: `yarn bff:dev` + `yarn dev` → логин работает.

#### T7. Клиентский auth-guard + легаси-редиректы

- Auth-guard (замена middleware): в `src/app/dashboard/layout.tsx` (он `'use client'`) — компонент-гейт поверх существующего `AuthProvider`: пока `loading` — показывать существующий skeleton/loading (НЕ контент); если `!user && !loading` → `router.replace('/login?redirect=' + encodeURIComponent(pathname+search))`. Офлайн-ветку НЕ трогать: `AuthProvider` уже отдаёт last-known-user при сетевой ошибке — гейт просто доверяет `user`. Никакого «flash of protected content»: контент рендерится только при `user != null`.
- `/login` уважает `?redirect=` — проверить, что существующая логика редиректа после логина сохранилась (она была рассчитана на middleware-формат).
- Легаси-редиректы из middleware → nginx (T12): `location ~ ^/app/dashboard/read/([^/]+)/([^/]+)$ { return 301 /app/dashboard/read?book=$1&chapter=$2; }` и `location ~ ^/app/dashboard/songs/(\d+)$ { return 301 /app/dashboard/song?id=$1; }`. В коде клиента ничего не делать.
- Логи (debug, существующий debug-хелпер offline-слоя): решение гейта (user/last-known/redirect).
- Тесты: компонентный тест гейта (`@vitest-environment jsdom`, testing-library): loading → skeleton; нет юзера → redirect; юзер есть → children; last-known-user (мок fetch-fail) → children.
- Проверка: `yarn test`; вручную: dev-флоу, открыть `/dashboard` разлогиненным → редирект на login; залогиненным → контент. **Чекпоинт-коммит #2**: `feat(app): static export cutover, client auth guard` (T6–T7).

### Phase 3 — Serwist precache SW

#### T8. Build-time SW с precache-манифестом поверх `out/`

- `yarn add -D @serwist/build serwist`.
- Новый источник SW: `src/sw/sw.ts` (обычный TS-модуль под esbuild/`@serwist/build`, ограничение «pure functions + .toString()» снимается). Перенести и СОХРАНИТЬ поведение из `sw-source.ts`:
  - install БЕЗ `skipWaiting()`; `SKIP_WAITING` по message; prune чужих кешей до `clients.claim()`; kill switch `SW_DISABLED`.
  - Precache: манифест инжектится `injectManifest` из `@serwist/build` (скрипт `scripts/build-sw.ts`): globDirectory `out/`, globPatterns `**/*.{html,js,css,json,svg,png,webp,woff2,txt,webmanifest}` (в `.txt` — RSC-payload'ы export'а). 14 MB Писания в `out/` НЕ лежит (оно в `data/` на сервере BFF) — конфликта нет.
  - Навигации: отдавать из precache **точный pathname с ignoreSearch** (query load-bearing только на клиенте: `?book=&chapter=`, `?id=`). ВАЖНО: export кладёт страницы как `dashboard.html` — навигация на `/app/dashboard` должна резолвиться в precache-ключ `/app/dashboard.html` (маппинг `pathname + '.html'`, для `/app/` → `/app/index.html`). Незнакомый pathname → precached `/app/index.html` НЕЛЬЗЯ (App Router hydration reload loop при чужом HTML — проверено в v1) → отдавать существующий `OFFLINE_FALLBACK_HTML` (перенести константу).
  - Стратегия навигаций: cache-first из precache (атомарный снимок версии — сеть не нужна; обновления приезжают через SW update flow). `_next/static/**` — из precache автоматически. `/api/*`, не-GET, cross-origin — passthrough (не respondWith).
  - `SW_BUILD` больше не нужен для инвалидации (ревизии манифеста меняются сами), но оставить в логе версии SW.
- `scripts/build-sw.ts`: esbuild-бандл `src/sw/sw.ts` → `injectManifest` → `out/sw.js`. Итоговый pipeline: `yarn build` = `next build` → manifest → sw. Скрипт логирует: сколько файлов в precache, суммарный размер (warn если > 15 MB — защита от случайного попадания тяжёлых данных).
- `ServiceWorkerRegistrar.tsx` НЕ менять (URL `{basePath}/sw.js` тот же, update-toast-флоу совместим). Проверить только, что `Service-Worker-Allowed` больше не нужен (sw.js теперь лежит в корне scope — не нужен).
- Тесты: переписать `src/sw/sw-source.test.ts` → `src/sw/sw.test.ts` под новую структуру, сохранив покрытие поведения: маппинг pathname→html-ключ (вкл. `/app/` и ignoreSearch), fallback на OFFLINE_FALLBACK_HTML для незнакомого pathname (НЕ чужой HTML), отсутствие skipWaiting в install, SKIP_WAITING message, kill switch. Удалить `sw-source.ts` + старый тест.
- Проверка: `yarn build` → `out/sw.js` существует, содержит precache-манифест (grep `"revision"`), `yarn test` зелёный. **Чекпоинт-коммит #3**: `feat(sw): serwist precache with atomic app-shell snapshot` (T8).

#### T9. ChunkLoadError guard (чек-лист п.7)

- `src/shared/components/ChunkErrorReload.tsx` (client, подключить в root `layout.tsx`): глобальный обработчик `window 'error'` + `unhandledrejection`; если ошибка — ChunkLoadError / `Loading chunk .* failed` / `Failed to fetch dynamically imported module` → `location.reload()` ОДИН раз с cooldown (sessionStorage-флаг `chunk-reload-at`, не чаще раза в 60 сек — защита от reload-loop). Лог (warn) перед reload.
- Тест (jsdom): событие с ChunkLoadError → reload вызван; второе событие в пределах cooldown → reload НЕ вызван.
- Проверка: `yarn test`.

#### T10. Sync health-гейт (п.3b) + верификация 401-контракта в graphql-клиенте (п.5)

- `src/shared/offline/sync.ts`: перед replay по триггеру `online` — `HEAD {basePath}/api/health` с таймаутом 3s (использовать существующий `networkTimeout.ts`); неуспех → лог (debug) и выход без попытки replay (событие `online` означает «есть интерфейс», не «сервер достижим»). Триггеры start/visibilitychange не менять (replay сам по себе безопасен — «офлайн» = факт неуспеха отправки).
- `src/shared/services/api/graphql.ts`: убедиться, что 401 от сервера и сетевая ошибка — разные ветки (как в `client.ts`): 401 → `__onSessionExpired`, network throw → НЕ logout (outbox переживёт). Если конфляция есть — исправить по образцу `client.ts`.
  - **Решение при выполнении (уточнено у Игоря)**: НЕ менять — `graphql.ts` намеренно НЕ вызывает `__onSessionExpired` вообще (зафиксировано регрессионным тестом в commit `4f4401a`, "T6: аудит 401-vs-network" из более раннего фичи-плана `feature-offline-pwa.md`). Причина: фоновый outbox-синк (триггеры `online`/`visibilitychange`) не должен дёргать redirect на `/login` посреди пользовательской сессии из-за протухшего токена — запись просто остаётся в очереди до следующего явного действия пользователя. И 401, и сетевая ошибка одинаково пробрасываются как `Error` и одинаково оставляют запись в outbox. Формулировка задачи выше — как она была в плане; фактическое поведение сознательно отличается.
- Тесты: sync-гейт (health недостижим → replay не вызван; достижим → вызван) — уже покрыто `sync.test.ts`; graphql 401 vs network-fail ветки — уже покрыто `graphql.test.ts` (обе ветки не трогают `__onSessionExpired`, см. решение выше).
- Проверка: `yarn test`. **Чекпоинт-коммит #4**: `feat(offline): chunk-error guard, health-gated sync` (T9–T10).

### Phase 4 — iOS: автозагрузка данных

#### T11. Гибридная автозагрузка после логина (чек-лист п.8)

- Проблема: iOS партиционирует storage (Safari ≠ installed PWA) — ручной opt-in «Скачать» кладёт данные не в ту партицию. Решение — данные приезжают автоматически в ЛЮБОМ контексте.
- `src/shared/offline/autoDownload.ts`: `ensureOfflineData()` — идемпотентно докачивает недостающее существующим download manager'ом: `downloadPlan()` + `downloadSongs()` + `downloadBibleTranslation(<дефолтный перевод юзера из reading-settings, fallback 'nrt2019'>)`. «Недостающее» — по `manifest`-store IDB (уже ведётся download manager'ом). Запуск: после успешного подтверждения сессии сервером (точка в `AuthProvider` после server-confirmed user; НЕ на last-known-user ветке), с `requestIdleCallback`/`setTimeout(5s)` отложкой, чтобы не конкурировать со стартовой загрузкой. Обрыв — молча, ретрай при следующем старте (идемпотентность = ретрай бесплатен). Одновременный запуск — гард как `in-flight` в `sync.ts`.
- Ручной opt-in в настройках НЕ трогать (остальные переводы — только руками). `clearAllOfflineData` продолжает работать; после очистки автозагрузка на следующем старте вернёт дефолтный набор — это осознанно, отразить строкой в `OfflineDataSection` («базовые данные скачиваются автоматически»).
- Телеметрия в лог (info): контекст запуска (`display-mode: standalone` / `navigator.standalone` / browser tab), что докачано, сколько байт.
- Тесты: `ensureOfflineData` — полный manifest → ноль загрузок; частичный → докачка недостающего; ошибка сети → не throw; параллельный вызов → один прогон (fake-indexeddb, мок download-функций).
- Проверка: `yarn test`. **Чекпоинт-коммит #5**: `feat(offline): auto-download core data after login (ios partition fix)` (T11).

### Phase 5 — деплой, E2E, docs

#### T12. Dockerfile + compose: static-артефакт + сервис bff

- `deploy/Dockerfile` — переписать:
  - stage `build` (node:22-slim + corepack, БЕЗ python3/make/g++ — native-зависимостей больше нет): `yarn install --frozen-lockfile` → ARGs как сейчас (`NEXT_PUBLIC_*`) → `yarn build` → артефакт `out/`.
  - stage `bff` (runner): node:22-slim, non-root, копирует `server/`, `src/lib`, `src/features/songs/services`, `src/shared` (то, что импортирует server — точный список установить по факту импортов), `node_modules` (production), `data/` (файлы Писания — их читает `bible-data.ts` с диска), `package.json`. CMD `yarn bff:start`. `EXPOSE 3001`.
  - stage `static`: `FROM nginx:alpine`, `COPY --from=build /app/out /usr/share/nginx/html/app` — это НОВЫЙ образ для сервиса nginx (вместо стокового), conf.d монтируется как раньше.
- `deploy/compose.yml`: сервис `app` → заменить на `bff` (build target `bff`, те же runtime-секреты минус `JWT_SECRET`-если-он-был-только-для-lucia — проверить; volume `app_db` больше не нужен — удалить); сервис `nginx` → `build: { context: .., target: static }` вместо image.
- `deploy/nginx/conf.d/tls.conf`:
  - `location /app` → `root /usr/share/nginx/html; try_files $uri $uri.html $uri/ =404;` + легаси-редиректы из T7.
  - `location /app/api/` → `proxy_pass http://bff:3001;` (заголовки `X-Forwarded-For`/`X-Real-IP` — их читает rate-limiter).
  - Cache headers (чек-лист п.2, значения из `docs/nginx.md`): `location = /app/sw.js` → `Cache-Control: public, max-age=0, must-revalidate`; `location /app/_next/static/` → `public, max-age=31536000, immutable`; `*.html` (и `location /app` exact-html-ответы) → `no-cache`; `manifest.webmanifest` → `max-age=0, must-revalidate`.
- `deploy/deploy.sh` — проверить, что rsync+build+up работает с новой структурой (память prod-deploy: rsync source → 168.222.202.131:/opt/nbc/bible-plan/deploy, `docker compose build && up -d`).
- Проверка ЛОКАЛЬНО (не прод!): `docker compose -f deploy/compose.yml build` собирается; `docker compose up` локально (без TLS — можно временный server-блок на :8080 в default.conf или `docker run` nginx-образа) → `curl localhost:8080/app/dashboard` отдаёт HTML, `curl -i localhost:8080/app/api/health` → 204, `curl -sI localhost:8080/app/sw.js | grep -i cache-control` → must-revalidate.
  - **Статус (2026-07-10, T12 завершён)**: Dockerfile (3 стадии `build`/`bff`/`static`), `compose.yml` (`app`→`bff`, `nginx` теперь `build: target: static`, volume `app_db` удалён) и `tls.conf` (proxy `/app/api/`→`bff:3001`, cache-заголовки, легаси-редиректы) переписаны. `deploy.sh` обновлён: `APP_SERVICE` теперь `"bff nginx"`.
  - **Проверено локально** (Docker Desktop, `docker compose build bff nginx` с фиктивным `.env`): оба образа собираются; smoke-тест в отдельной docker-сети (bff + nginx c временным HTTP-конфигом на :8080, аналог tls.conf без TLS) — `/app/dashboard` → 200, `/app/api/health` → 204, `/app/sw.js` → `Cache-Control: public, max-age=0, must-revalidate`, легаси-редирект `/app/dashboard/songs/42` → 301, `/` → 302 `/app`. Все контейнеры/образы/сеть удалены после проверки.
  - Список файлов, скопированных в `bff`-стадию, установлен по факту импортов (`server/src` → `src/lib/**`, `src/features/songs/services/**`, `src/types/**`, транзитивно `src/shared/utils/**`) — не по прежнему `src/shared` целиком.
  - **Побочный фикс, обнаруженный при первом реальном прогоне `yarn build`** (blocker для T12, до этого сборка ни разу не запускалась целиком): `src/sw/sw.ts` использует `/// <reference no-default-lib="true" />` (нужно для webworker-контекста без DOM) — при совместной компиляции с остальным приложением это подавляло `dom`-lib для всей tsc-программы (291 ложная ошибка `Cannot find name 'window'` и т.п.). Исключил `src/sw` из `tsconfig.json` (`sw.ts` уже собирается отдельно esbuild'ом в `scripts/build-sw.ts`, типизация покрывается через `sw.test.ts`/vitest). Заодно всплыли и исправлены 2 реальных TS-ошибки: `autoDownload.ts` (`'requestIdleCallback' in window` теперь статически всегда true в свежем `lib.dom.d.ts` → TS сужал else-ветку до `never`; заменил на `typeof window.requestIdleCallback === 'function'`) и устаревший `@ts-expect-error` в `BottomNavBar.test.tsx`. `yarn test` (320/320) и `yarn tsc --noEmit` зелёные после фикса.

#### T13. Offline E2E под новую топологию + новые сценарии

- Обновить harness: `playwright.config.ts` webServer (или README-команды) — прогон против локальной сборки: `yarn build` → поднять BFF (`yarn bff:start`) + статику. Для статики добавить `"static:serve": "tsx scripts/static-serve.ts"` — 30-строчный сервер на `@hono/node-server` + `serveStatic` из `out/` под `/app` с proxy `/app/api` → localhost:3001 (или объединить: флаг `BFF_SERVE_STATIC=1` в самом BFF — выбрать одно, задокументировать в e2e/README).
- Существующие спеки (`cold-offline-start`, `offline-navigation`, `outbox-sync`) должны пройти. `warmAppShell()` теперь избыточен для HTML (precache), но не удалять, пока спеки не зелёные; после — упростить: прогрев нужен только для IDB-данных (или заменить на ожидание autoDownload из T11).
- Новые спеки: `e2e/offline/cold-start-any-route.spec.ts` — логин → дождаться SW ready + autoDownload → офлайн → прямой `goto` на РАНЕЕ НЕ ПОСЕЩЁННЫЙ маршрут (например `/dashboard/calendar`) → контент рендерится (killer-фича precache, при runtime-кеше это не работало). `e2e/offline/update-flow.spec.ts` — прогон с версией A → пересборка/подмена sw.js (изменить SW-байты) → reg.update() → появление update-toast → клик → reload → новая версия активна, кеши старой удалены.
- Креды: `E2E_TEST_LOGIN`/`E2E_TEST_PASSWORD` из `.env.test` (фиктивные для локального Directus-мока или локальный стенд; прод-аккаунт claude-offline-test — только для ручных прогонов на проде).
- Проверка: `yarn e2e:offline` зелёный локально. **Чекпоинт-коммит #6**: `feat(deploy): static+bff topology, nginx cache headers, e2e suite` (T12–T13).
  - **Статус (2026-07-10, T13 завершён)**: harness — `scripts/static-serve.ts` (Hono + `serveStatic` из `out/` под basePath + proxy `{basePath}/api/*` → BFF), `"static:serve"` в package.json, `playwright.config.ts` (baseURL по умолчанию `:8080`, порт конфигурируется `STATIC_SERVE_PORT`/`E2E_BASE_URL`). Все 5 спеков зелёные (3 существующих + 2 новых из T13), `yarn e2e:offline` проходит целиком.
  - **Побочные блокеры, обнаруженные при первом реальном прогоне `yarn build` + e2e под новой топологией (до этого не запускались вместе ни разу):**
    1. Next.js 16.2.4 падал на пререндере `/_global-error` и `/_not-found` (`Cannot read properties of null`, известный баг фреймворка при `output: 'export'`) из-за `NODE_ENV=development` в `.env.local` конфликтующего со сборкой (`next build` требует `production`) — non-deterministic race в зависимости от того, какая из auto-generated error-страниц ловит рассинхрон первой. Добавлены собственные `src/app/global-error.tsx` и `src/app/not-found.tsx` (минимальные, без зависимости от провайдеров — снимает нестабильность независимо от NODE_ENV) + сборка запускается с `NODE_ENV` явно unset.
    2. Реальная гонка в клиентском auth-guard (T7): `checkSession()` в `AuthProvider` не выставлял `loading=true` на повторных вызовах (`refreshAuth()` после логина) — `router.push('/dashboard')` на странице логина не ждёт `refreshAuth()`, и `DashboardAuthGate` успевал увидеть стухшее `user === null` от предыдущей проверки и редиректить обратно на `/login` раньше, чем повторный `checkSession()` резолвился. Проявлялось только при клиентской навигации без полной перезагрузки (ровно сценарий `cold-start-any-route.spec.ts`, который намеренно не делает `page.goto()` после логина). Фикс: `setLoading(true)` в начале `checkSession()` — гейт показывает лоадер вместо преждевременного редиректа. Регрессии в `AuthProvider.test.tsx`/`login/page.test.tsx` нет (7/7 зелёные).
  - `yarn lint` даёт 60 pre-existing ошибок в непричастных файлах (`BibleText.tsx`, `Toast.tsx`, `endpoints.ts`, `graphql.ts`) — не в скоупе T13, не трогать.

#### T14. Docs-чекпоинт (обязательный) + приёмка на реальном iPhone

- Обновить: `docs/offline-pwa.md` (precache-модель вместо runtime-HTML-кеша, автозагрузка, схема хранилищ), `docs/deployment.md` + `docs/nginx.md` (новая топология static+bff, cache headers теперь В КОНФИГЕ, а не только в доках), `docs/architecture.md` и `AGENTS.md` (карта: `server/`, `scripts/build-sw.ts`, удалённые `middleware.ts`/`src/app/api`), `.ai-factory/DESCRIPTION.md` (стек: + Hono BFF, − better-sqlite3/lucia, deployment-секция), `docs/authentication.md` (клиентский auth-guard вместо middleware).
- Ручная приёмка на реальном iPhone (Playwright WebKit ≠ iOS Safari по SW/storage!) — чек-лист в `docs/offline-pwa.md`, раздел «Приёмка iOS»:
  1. Safari → логин → установить на экран «Домой».
  2. Открыть PWA (онлайн) → дождаться автозагрузки (настройки → Оффлайн-данные показывают скачанное).
  3. Авиарежим → холодный запуск PWA с экрана «Домой» → dashboard, читалка, песни, календарь работают.
  4. Отметить прогресс офлайн → включить сеть → отметка синкнулась (проверить с другого устройства/веба).
  5. Деплой новой версии → открытое PWA в течение часа предлагает «Обновить» → обновление без белого экрана.
- Этот пункт закрывает Игорь руками; таск считается выполненным после фиксации результатов чек-листа (что прошло/что нет) в PR/коммите.
- **Финальный коммит #7**: `docs: static export + bff architecture, ios acceptance checklist` (T14).

## Commit Plan

| # | После | Сообщение |
|---|-------|-----------|
| 1 | T5 | `feat(bff): hono bff with full api surface ported` |
| 2 | T7 | `feat(app): static export cutover, client auth guard` |
| 3 | T8 | `feat(sw): serwist precache with atomic app-shell snapshot` |
| 4 | T10 | `feat(offline): chunk-error guard, health-gated sync` |
| 5 | T11 | `feat(offline): auto-download core data after login (ios partition fix)` |
| 6 | T13 | `feat(deploy): static+bff topology, nginx cache headers, e2e suite` |
| 7 | T14 | `docs: static export + bff architecture, ios acceptance checklist` |

Без трейлеров Co-Authored-By и упоминаний Claude (правило пользователя).

## Definition of Done (success signals из RESEARCH)

- SW — статический файл `out/sw.js` с полным precache-манифестом; `src/app/sw.js/route.ts` и `.toString()`-сериализация удалены.
- Cold offline start работает на ЛЮБОМ маршруте без предварительного посещения (E2E `cold-start-any-route`).
- Update-toast работает при деплое новой версии (E2E `update-flow`), без залипания и битых lazy-чанков.
- `yarn test`, `yarn lint`, `yarn e2e:offline` зелёные; `yarn build` производит `out/` + `out/sw.js`.
- iOS-приёмка на реальном устройстве пройдена (T14, все 5 пунктов).
