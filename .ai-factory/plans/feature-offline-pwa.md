# Plan: Offline-first PWA v1

**Branch:** feature/offline-pwa (от feature/unify-page-headers)
**Created:** 2026-07-02
**Type:** feature

## Description

Приложение работает офлайн: Писание, песни и план чтения читаются без сети, прогресс
отмечается офлайн и синхронизируется при появлении интернета (LWW). В настройках —
секция управления офлайн-данными (показать загруженное с размерами / скачать / очистить)
и версия приложения (дата обновления). **Холодный офлайн-старт в скоупе v1.**

SW-стратегия — **статический app-shell SW без build-шага** (решение Игоря 2026-07-02,
упрощение Варианта C): свой SW-body отдаётся через существующий `src/app/sw.js/route.ts`
(basePath `/app` scope уже решён — `@serwist/next` этого из коробки за nginx не умеет).
**Precache-манифеста НЕТ**: чанки `_next/static/**` content-hashed (immutable) → runtime
cache-first без инвалидации безопасен; HTML-навигации — NetworkFirst. Офлайн доступны
посещённые страницы — precache непосещённых чанков всё равно бесполезен без их HTML,
а его инвалидация при деплое ломала бы офлайн для старого закешированного HTML.
Без `@serwist/build`, без build-шага, без standalone-граблей. В SW заложен kill switch.
**Данные (Писание/песни/план/настройки) офлайн живут в IndexedDB через read-through слой
в клиентских единых точках, НЕ в SW Cache API** — ключ контента явный
`(translation, book, chapter)`, а не URL, что снимает проблему
«один URL → разный контент по сессии» без правки API.

## Settings

- **Testing:** Yes — unit на чистую логику (routeStrategy shell-SW, outbox LWW,
  read-through fallback, ключевание bible по `translation` из ответа, last-known-user
  фолбэк, sync replay, version format) + component на секцию настроек.
  SW-стратегия вынесена в тестируемый модуль.
- **Logging:** Verbose — детальные DEBUG-логи SW/кеша/синка/загрузки (offline сложно
  воспроизводится, логи критичны). Управляемо через существующий LOG_LEVEL/DEBUG.
- **Docs:** Yes — обязательный docs-чекпойнт при завершении (сложная поведенческая фича).

## Roadmap Linkage

Milestone: "none" — Rationale: ROADMAP.md отсутствует в проекте.

## Research Context (из .ai-factory/RESEARCH.md, Active Summary)

Три класса данных: ① статика (Писание 14 MB / 3 перевода `data/bible`, песни 388 KB,
план — Directus) через API-роуты; ② юзер-стейт (progress/settings, GraphQL, мутации в
PlanContext **уже оптимистичны**); ③ app shell (Next standalone за nginx, basePath /app).

**Ключевые решения:** opt-in загрузка («Скачать» + показать/очистить), полный offline v1;
два слоя хранилища с ЧЁТКИМ разделением — SW Cache API ТОЛЬКО app shell (runtime
cache-first чанков + NetworkFirst HTML, БЕЗ precache-манифеста и build-шага), IndexedDB —
ВСЕ данные (Писание по ключу (translation, book, chapter), songs, plan/weekly/books,
reading/app-settings, progress-snapshot) + outbox + last-known-user + манифест
загруженного; синк = **write-ahead outbox** (мутация ВСЕГДА в очередь → replay сразу
пытается отправить → запись удаляется после подтверждения; офлайн — не особый случай),
LWW по dayId (CRDT не нужен); replay-триггеры: старт приложения + `visibilitychange` +
`online`; библиотека `idb`; `navigator.storage.persist()` при первой загрузке данных;
холодный старт (посещённых страниц) в скоупе.

**Развязанные тензии:**
- Переводозависимый URL: снята BY DESIGN (решение Игоря 2026-07-02). Контент Писания
  офлайн живёт НЕ в SW-кеше по URL, а в IDB по явному ключу (translation, book, chapter).
  Ответ `/api/bible/{book}/{ch}` УЖЕ содержит поле `translation` — ключуем по факту
  ответа, даже когда перевод резолвит сессия. Роут и клиентские URL НЕ меняем,
  `?translation=` не нужен. Загрузка переводов — отдельный bulk-endpoint с переводом
  в path (Task 22).
- Auth-гейт офлайн: `AuthProvider.checkSession` (endpoint `/api/auth/session`, НЕ
  `/api/auth/me`) в catch делает `setUser(null)` → выкидывает на /login. Лечение —
  last-known-user в IDB (Task 24).
- App shell: runtime cache-first только для `_next/static/**` (assetPrefix `/app`,
  immutable-хеши в именах), НЕ HTML SSR-страниц и НЕ 14 MB Писания; HTML — рантайм
  NetworkFirst. Precache-манифест отброшен: офлайн и так работают только посещённые
  страницы, а инвалидация precache при деплое ломала бы старый закешированный HTML.

**Риски:** переписывание no-op SW затрагивает install-prompt + hydration-фикс b4c2f01
(telegram.org/splash); basePath /app во всех match; сломанный SW чинится у юзера только
ручной чисткой → обязателен kill switch.

## Architecture / файловая раскладка (FSD)

```
src/sw/sw-source.ts                 ← статический SW-body: cache-first чанки, NetworkFirst
                                      HTML, kill switch; логика роутинга — тестируемый
                                      модуль (Task 21)
src/app/sw.js/route.ts              ← отдаёт SW-body (правка, Task 21)
src/app/api/bible/download/[translation]/route.ts ← bulk-выгрузка перевода (Task 22)
src/shared/offline/
  db.ts                             ← idb: bibleChapters/songs/apiCache/outbox/meta/manifest;
                                      версия схемы + upgrade-колбэк с первого дня (Task 23)
  readThrough.ts                    ← network-first + IDB-fallback для API-данных (Task 31)
  sync.ts                           ← replayOutbox (Task 26)
  downloadManager.ts                ← download*/clearAllOfflineData + storage.persist() (Task 27,28)
src/features/offline/components/
  OfflineDataSection.tsx            ← UI секции настроек (Task 30)
  (hook useOfflineData)
```
Правки в существующих: `bible-text-cache.ts` + `useBibleText.ts` (IDB-fallback чтения,
Task 22); `useSongs.ts` (fetchSongsOnce), `PlanContext.fetchPlan` (plan+progress),
`useReadingSettings.ts`, `BookPicker.tsx` (/api/bible/books) (Task 31);
`AuthProvider.tsx` (Task 24); `PlanContext.tsx` (Task 25); `next.config.ts` (Task 29);
`src/components/ServiceWorkerRegistrar.tsx` (update-flow, Task 21);
`dashboard/settings/page.tsx` + `dashboard/layout.tsx` (sync-провайдер) (Task 30/26).

## Tasks

### Phase 1 — App-shell SW и фундамент (параллельны)
- [x] 21. Статический SW app shell: runtime cache-first `_next/static/**` + NetworkFirst
  HTML + kill switch; остальное passthrough
- [x] 23. IndexedDB-слой: idb-обёртка (bibleChapters/songs/apiCache/outbox/meta/manifest)
  с версией схемы и upgrade-колбэком
- [x] 29. Build-time версия приложения (timestamp)

### Phase 2 — Offline-данные, вход и запись (параллельны, после 23)
- [x] 22. Bulk-endpoint перевода + IDB read-through чтения Писания
  (bible-text-cache/useBibleText) _(blockedBy 23)_
- [x] 31. IDB read-through для songs/plan/weekly/books/settings/progress
  (единые клиентские точки) _(blockedBy 23)_
- [x] 24. Offline-вход: last-known-user фолбэк в AuthProvider _(blockedBy 23)_
- [x] 25. Write-ahead outbox: мутации прогресса ВСЕГДА через очередь (single И batch
  пути) + overlay outbox поверх fetchPlan _(blockedBy 23)_

### Phase 3 — Синхронизация
- [x] 26. Sync-движок: replay outbox (LWW); триггеры — старт приложения +
  visibilitychange + online _(blockedBy 25)_

### Phase 4 — Управление данными
- [x] 27. Download manager: opt-in загрузка Писания (bulk) / песен / плана в IDB +
  navigator.storage.persist() _(blockedBy 22, 31)_
- [x] 28. Очистка offline-хранилища _(blockedBy 23)_

### Phase 5 — UI настроек
- [x] 30. Секция «Оффлайн-данные» + версия в настройках _(blockedBy 27, 28, 29)_

## Commit Plan

Чекпойнты (11 задач):
1. После 21 → `feat(pwa): app-shell service worker (cache-first chunks, network-first html)`
2. После 23–29 → `feat(offline): indexeddb foundation + build-time app version`
3. После 22–31 → `feat(offline): idb read-through for bible, songs and plan data`
4. После 24–25–26 → `feat(offline): offline auth fallback + write-ahead outbox with sync`
5. После 27–28 → `feat(offline): opt-in download manager and storage cleanup`
6. После 30 → `feat(settings): offline data management section + app version`

## Порядок исполнения (по зависимостям)

Параллельно 21, 23, 29 ; после 23: 22, 31, 24, 25 (параллельны) → 26 (после 25) ;
27 (после 22, 31), 28 (после 23) ; 30 (после 27, 28, 29).

## Уточнения после /aif-improve (2026-07-02, повторный анализ кодовой базы)

**Task 21 (SW app shell) — обязательные детали:**
- SW статический (без build-шага и `@serwist/build`): body — текст из `src/sw/sw-source.ts`,
  отдаётся route.ts как сейчас; логика выбора стратегии (routeStrategy) — отдельная
  чистая функция под unit-тесты.
- Перехватывает ТОЛЬКО same-origin GET: `_next/static/**` → cache-first (immutable
  content-hashed имена, инвалидация не нужна; кеш чистить по LRU/при активации новой
  версии SW осторожно — старый HTML может ссылаться на старые чанки); navigation/HTML →
  NetworkFirst. Всё остальное — passthrough БЕЗ respondWith: cross-origin (в т.ч.
  `telegram.org/js/telegram-web-app.js` из root layout — hydration-фикс b4c2f01),
  все non-GET, ВСЕ `/api/*` (данные живут в IDB, Task 22/31).
- **Kill switch:** константа-флаг в SW-body (напр. `SW_DISABLED`) — выкат версии с
  флагом = SW сам делает `caches.delete(...)` + `registration.unregister()`. Сломанный
  SW иначе чинится у юзера только ручной чисткой браузера.
- Update-flow: `ServiceWorkerRegistrar.tsx` сейчас только register без update-логики —
  добавить `reg.update()` (visibilitychange/интервал), иначе новая версия SW (включая
  kill switch!) не подхватится до перезахода.

**Task 23 (IDB) — версия схемы:** в `db.ts` с первого дня `openDB(name, version,
{upgrade})` — первое изменение схемы у живых юзеров без upgrade-пути = потеря данных
или сломанное приложение.

**Task 22 (Писание в IDB) — bulk endpoint + read-through:**
- Данные на диске: `data/bible/{index.json + books/*.json}` (rst в корне),
  `data/bible/nrt2019/…` (~6.1 MB), `data/bible/kassian2019/…` (~1.4 MB, только НЗ).
  Bulk-endpoint `/api/bible/download/[translation]` собирает index + books в один
  ответ (~6 MB, 1 запрос на перевод; прогресс — по Content-Length через reader).
- Read-through чтения: `useBibleText`/`bible-text-cache` — memory → network →
  (fail) IDB. Ключ `(translation, book, chapter)` как в memory-кеше; при
  network-ответе ключевать по полю `translation` из ответа (не по настройкам клиента).
  Роут `/api/bible/[book]/[chapter]` и URL клиента НЕ меняются.

**Task 24 (offline-вход):** endpoint — `/api/auth/session`. Фолбэк на IDB только в
`catch` (network error); `response.ok === false`/`user: null` — реальное «сессии нет»,
IDB-фолбэк НЕ применять. `logout()` обязан чистить last-known-user (иначе после выхода
устройство пускает офлайн).

**Task 25 (write-ahead outbox) — два пути мутаций + cold-start:**
- **Write-ahead, не ветвление online/offline:** мутация ВСЕГДА пишется в outbox →
  replay-движок немедленно пытается отправить → запись удаляется ТОЛЬКО после
  подтверждения сервера. Один путь записи; `navigator.onLine` не используется для
  ветвления (он врёт) — «офлайн» определяется фактом network error при отправке.
  Закрывает race «запрос ушёл, но упал по таймауту».
- Мутации идут ДВУМЯ путями: `updateProgress` (single, `PlanContext.tsx:168`) и
  `toggleCompleteMany` → `progressMutations.updateProgressBatch` (`PlanContext.tsx:362`,
  календарь). Outbox покрывает оба (`op: 'single' | 'batch'`), иначе офлайн-отметки
  из календаря молча теряются.
- Офлайн-reload: `fetchPlan` прочитает из IDB `apiCache` СТАРЫЙ снапшот
  `/api/user/progress` (Task 31) → накладывать pending-записи outbox поверх него
  (иначе офлайн-отметки визуально «пропадают», хотя лежат в очереди).
- Постановка в очередь резолвится успехом (не throw), даже если немедленная отправка
  не удалась — callers пробрасывают ошибку и ломают optimistic UI.

**Task 26 (sync) — триггеры replay:** старт приложения + `visibilitychange` +
`online` (одного `online` мало — в Safari/iOS событие капризное). Replay идемпотентен
и защищён от параллельного запуска (in-flight флаг); порядок — по ts, LWW по dayId
(dedup: последняя запись на день побеждает).

**Task 31 (read-through остальных данных) — единые точки врезки:**
`fetchSongsOnce` (`useSongs.ts` — коммент про cache-слой уже там), `PlanContext.fetchPlan`
(`/api/plan` + `/api/user/progress`), `useReadingSettings` (`/api/user/reading-settings` —
из него резолвится translationId, без него офлайн-чтение Писания слепое), `BookPicker`
(`/api/bible/books`), недельный план (`/api/plan/weekly`). Паттерн один: network-first,
успешный ответ пишется в IDB `apiCache`, при network-fail — чтение из IDB.

**Task 27 (download manager) — что качает:** Писание = bulk-endpoint по переводу
(1 запрос, Task 22) → IDB; песни = `/api/songs` + N × `/api/songs/[id]` (список отдаёт
только карточки, контент по id) → IDB songs; план = прогрев apiCache
(`/api/plan`, `/api/plan/weekly?book=proverbs`, `/api/bible/books`). Всё в IDB,
SW-кеш в данных не участвует. При первой загрузке — `navigator.storage.persist()`
(иначе Safari/Chrome под давлением диска молча выселяют IDB и Cache API; для iOS-PWA
это реальная потеря скачанных 6 MB); результат persist показать/залогировать.

**Task 28 (очистка) — защита данных:** чистятся IDB-stores данных (bibleChapters,
songs, apiCache, manifest); SW-кеш shell и регистрацию НЕ трогаем. Если outbox непуст
(несинканный прогресс) — предупредить или сначала выполнить синк. «Очистить
offline-данные» НЕ трогает last-known-user (он чистится только на logout, Task 24) —
иначе очистка выкидывает из офлайн-входа.

## Открытые вопросы (решить при реализации)

- NetworkFirst HTML офлайн: fallback на последний dashboard vs отдельная offline-страница.
- Политика очистки chunk-кеша: LRU-лимит vs очистка при активации новой версии SW
  (осторожно: старый закешированный HTML ссылается на старые чанки).
- Формат bulk-выгрузки перевода: один агрегат ~6 MB (1 запрос, прогресс по
  Content-Length) vs 66 per-book запросов (резюмабельность, гранулярный прогресс).
  Дефолт — агрегат; решить на реализации Task 22.
- Background Sync API — усиление, НЕ обязателен для v1 (foreground replay достаточно).
- BUILD_TIME на docker-деплое (ARG/ENV vs `new Date()` в next.config) — согласовать с
  prod-deploy (rsync + docker compose build на 168.222.202.131).

## Next Steps

`/aif-implement` — начать с Task 21 или 23 (параллельны). Просмотр задач — `/tasks` / TaskList.
```
/aif-implement
CONTEXT FROM /aif-plan:
- Plan file: .ai-factory/plans/feature-offline-pwa.md
- Testing: yes | Logging: verbose | Docs: yes (mandatory checkpoint)
```
