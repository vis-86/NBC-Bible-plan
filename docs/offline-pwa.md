[← Аутентификация](authentication.md) · [Back to README](../README.md) · [Деплой →](deployment.md)

# Offline-first PWA

## Обзор

Приложение работает офлайн: Писание, песни и план чтения читаются без сети, прогресс
отмечается офлайн и синхронизируется при появлении интернета (Last-Write-Wins). Секция
«Оффлайн-данные» в настройках позволяет скачать данные на устройство заранее (opt-in),
показать что скачано и очистить.

Два независимых слоя хранения:

- **Service Worker Cache API** — ТОЛЬКО app shell: атомарный build-time precache ВСЕХ
  статических файлов `out/` (HTML-навигации, `_next/static/**`, RSC/flight-пейлоады).
  Никаких данных.
- **IndexedDB** (`src/shared/offline/db.ts`, обёртка `idb`) — ВСЕ данные: Писание,
  песни, ответы API (`apiCache`), очередь неподтверждённых мутаций (`outbox`),
  last-known-user и манифест скачанного (`meta`/`manifest`).

## Service Worker (app shell) — build-time Serwist precache

С миграции на static export + Hono BFF (`.ai-factory/plans/feature-static-export-hono-bff.md`,
T8) SW больше не runtime-кеширует посещённые страницы — весь app shell кешируется
атомарно ещё на этапе сборки:

- **Source:** `src/sw/sw.ts` — обычный TS-модуль (бандлится esbuild'ом в
  `scripts/build-sw.ts`, НЕ `.toString()`-сериализация, как было раньше в
  `sw-source.ts` — тот подход остался в истории, файл удалён). Роутинг-решение
  (`routeStrategy`) и логика мэппинга/prune — чистые функции, покрыты
  `src/sw/sw.test.ts`.
- **Build pipeline:** `yarn build` = `next build` (`output: 'export'` → `out/`) →
  `tsx scripts/build-manifest.ts` (генерирует `public/manifest.webmanifest`) →
  `tsx scripts/build-sw.ts` (`@serwist/build` `injectManifest`: globDirectory `out/`,
  globPatterns HTML/JS/CSS/JSON/SVG/PNG/WEBP/WOFF2/TXT/WEBMANIFEST → `out/sw.js` с
  precache-манифестом всех этих файлов; лог пишет число записей и суммарный размер,
  warn при > 15 MB).
- **Навигации:** cache-first по точному `pathname` (ignoreSearch — query load-bearing
  только на клиенте: `?book=&chapter=`, `?id=`). Export кладёт страницы как
  `dashboard.html` → навигация на `{basePath}/dashboard` резолвится в precache-ключ
  `{basePath}/dashboard.html` (`{basePath}/` → `index.html`). Сеть на навигациях не
  нужна — версия атомарна, обновления приезжают через отдельный update flow (ниже).
  Незнакомый pathname (опечатка/устаревшая ссылка, НЕ входит в export) →
  `OFFLINE_FALLBACK_HTML` — НИКОГДА не чужой закешированный HTML другого маршрута:
  документ App Router несёт вшитый RSC-payload конкретного маршрута, расхождение с
  текущим URL уводит гидратацию в цикл hard-reload (проверено на устройстве в
  прежней runtime-кеш модели).
- **`_next/static/**`, RSC/flight `.txt`:** cache-first из того же precache
  автоматически (не-навигационные same-origin GET); `/api/*`, не-GET, cross-origin —
  passthrough без `event.respondWith`. Поиск идёт по `precacheLookupKeys` — сначала
  точный URL, затем URL без query: RSC-пейлоад клиентской навигации (`router.push`)
  всегда несёт уникальный cache-busting `_rsc=<hash>`, и по точному ключу не нашёлся бы
  никогда. Query у статики export'а не выбирает файл (как и у навигаций).
- **Kill switch:** константа `SW_DISABLED` в `sw.ts`. При `true` SW на `activate`
  чистит все caches и делает `unregister()`. Чтобы это реально попало к пользователю —
  `ServiceWorkerRegistrar` вызывает `reg.update()` при возврате вкладки в фокус и раз в
  час (без этого браузер годами не подтянет новую версию SW).
- **Update flow** не менялся миграцией: install БЕЗ `skipWaiting()` → SW ждёт →
  `useSwUpdate` показывает тост «Доступна новая версия» → `SKIP_WAITING` по клику →
  `controllerchange` → reload. Ревизии precache-манифеста меняются сами по себе при
  каждой сборке — отдельная константа для инвалидации (`SW_BUILD`) больше не нужна для
  этого, но версия пишется в лог SW.

## IndexedDB-слой

`src/shared/offline/db.ts` — schema-versioned (`openDB(name, version, {upgrade})` с
первого дня). Stores: `bibleChapters`, `songs`, `apiCache`, `outbox`, `meta`, `manifest`.

### Read-through (Писание/песни/план/настройки)

- **Писание:** `src/features/reading/bible-text-cache.ts` + `useBibleText.ts` — цепочка
  memory → network → (fail) IDB. Ключ `(translationId, book, chapter)`; при сетевом
  ответе ключуется по полю `translation` из ОТВЕТА сервера (не по клиентским
  настройкам) — сессия может резолвить перевод иначе.
  После успешной загрузки главы `useBibleText` best-effort прогревает соседние
  главы КНИГИ (`chapter±1`, в границах `BIBLE_STRUCTURE`) — свайп между главами
  (`SwipePager` в `ReadingView`) делает переход мгновенным жестом, и без прогрева
  серия свайпов офлайн умножала бы таймауты (N экранов × T). Прогрев НЕ ретраится
  и НЕ добавляет circuit breaker в общий `raceNetwork`: у него есть не-сетевые
  потребители (`indexedDB.open`), и «оптимизация» превратила бы отказ фолбэк-слоя
  в норму. При `navigator.onLine === false` прогрев не запускается вовсе (ждать
  нечего — сеть заведомо недоступна); зависший fetch соседа отваливается по
  `raceNetwork`/таймауту, не блокируя отрисовку текущей главы.
- **Остальные данные:** общий паттерн `src/shared/offline/readThrough.ts` —
  network-first, успешный ответ пишется в `apiCache` по логическому ключу
  (`plan:days`, `plan:progress`, `plan:weekly:proverbs`, `songs:list`, `bible:books`,
  `reading:settings`), при сетевой ошибке — чтение из `apiCache`.

### Сетлисты — read-through + online-only запись (исключение)

Чтение сетлистов (список и деталь) — обычный `readThrough`, как всё остальное:
`SETLISTS_LIST_CACHE_KEY` / `setlistCacheKey(id)` (`src/features/setlists/lib/offlineSetlists.ts`),
прогрев — `downloadSetlists()` в `downloadManager.ts`, входит в `ensureOfflineData()`
(автозагрузка после логина) и в ручное «Скачать всё».

**Запись (создание/редактирование/удаление) — осознанное исключение из offline-first.**
Решение Игоря (2026-07-26, `.ai-factory/plans/feature-setlists.md`): `POST/PATCH/DELETE
/api/setlists*` не идут через outbox — при `navigator.onLine === false` UI сразу
показывает «Нужен интернет» и блокирует кнопку, без попытки записи и без постановки в
очередь. Причина — редакторов единицы, конфликт синхронизации маловероятен и не
оправдывает сложность LWW/outbox для этого пути; при росте числа муз. редакторов это
можно пересмотреть (`M6` — обобщение outbox).

### Офлайн-вход

`src/shared/offline/lastKnownUser.ts` + `AuthProvider.tsx`: последний подтверждённый
сервером пользователь сохраняется в `meta` при каждой успешной проверке сессии.
Фолбэк применяется ТОЛЬКО когда `fetch('/api/auth/session')` падает по сетевой ошибке
(`catch`) — при явном `response.ok === false` / `user: null` это настоящее «сессии
нет», фолбэк не применяется. `logout()` и `__onSessionExpired` обязаны чистить
last-known-user, иначе устройство остаётся «офлайн-залогинено».

### Write-ahead outbox (прогресс)

`src/shared/offline/outbox.ts`. Мутация прогресса ВСЕГДА пишется в outbox → replay
немедленно пытается отправить → запись удаляется только после подтверждения сервера.
Не ветвление online/offline (`navigator.onLine` не используется — он врёт) — «офлайн»
это просто факт неуспеха попытки отправки. Постановка в очередь всегда резолвится
успехом (не throw), чтобы не ломать optimistic UI в `PlanContext`.

Два пути мутаций, оба покрыты:

- `enqueueSingleProgress` — `updateProgress` (`PlanContext.tsx`, `op: 'single'`)
- `enqueueBatchProgress` — `toggleCompleteMany` → `updateProgressBatch` (календарь,
  `op: 'batch'`)

`getPendingOutboxOverlay()` накладывает ожидающие подтверждения записи поверх
устаревшего снапшота прогресса из `apiCache` при офлайн-`fetchPlan` — иначе
офлайн-отметки визуально «пропадают» после reload, хотя лежат в очереди.

**Важно:** для `ts` записи используется `monotonicTs()`, а не голый `Date.now()` —
миллисекундная точность коллизирует при двух `enqueue` подряд в одном тике и ломает
строгий LWW-порядок.

### Sync-движок (replay)

`src/shared/offline/sync.ts` — `replayOutbox()`. Идемпотентен, защищён от
параллельного запуска (`in-flight` флаг). Порядок отправки — по `ts` (старые → новые);
каждая мутация — «set», а не дельта, поэтому строго возрастающий порядок сам по себе
даёт корректный итоговый результат на сервере. Отдельно — dedup: запись, для КАЖДОГО
из своих `dayId` полностью перекрытая более поздней записью, удаляется без отправки.

Триггеры (`registerSyncTriggers()`, подключены в `dashboard/layout.tsx`): старт
приложения, `visibilitychange` (вкладка в фокусе), `online` (одного `online`
недостаточно — в Safari/iOS событие капризное).

### Download manager (opt-in загрузка) и очистка

`src/shared/offline/downloadManager.ts`:

- `downloadBibleTranslation(translationId, onProgress?)` — bulk-endpoint
  `/api/bible/download/[translation]` (один запрос, ~6 MB для nrt2019), прогресс — по
  `Content-Length` через `reader` стрима ответа.
- `downloadSongs(onProgress?)` — список карточек (`/api/songs`), затем контент каждой
  песни по id (`/api/songs/[id]`).
- `downloadPlan()` — прогрев `apiCache` теми же ключами, что читает read-through
  (`plan:days`, `plan:weekly:proverbs`, `bible:books`).
- Все три вызывают `navigator.storage.persist()` — иначе браузер может под давлением
  диска молча выселить IndexedDB/Cache API (реальная потеря скачанного на iOS PWA).
- `clearAllOfflineData({ force? })` — чистит `bibleChapters`/`songs`/`apiCache`/
  `manifest`. НЕ трогает SW-кеш app shell и НЕ трогает `meta` (last-known-user — иначе
  очистка выкидывает из офлайн-входа). Если outbox не пуст — сначала пытается
  `replayOutbox()`; если после попытки остались неподтверждённые записи — по умолчанию
  отказывается чистить (`cleared: false`), UI предлагает `force: true`.

### Автозагрузка после логина (iOS partition fix)

`src/shared/offline/autoDownload.ts` (T11). Проблема: iOS партиционирует storage
(Safari-вкладка ≠ установленное PWA) — ручной opt-in «Скачать» в браузере кладёт
данные не в ту партицию, которую видит установленное приложение, и пользователь
остаётся без офлайн-данных, хотя формально «скачал».

Решение — базовый набор (план, песни, дефолтный перевод НЗ пользователя, fallback
`nrt2019`) докачивается сам, в ЛЮБОМ контексте (browser tab / installed PWA):

- `scheduleEnsureOfflineData()` запускается из `AuthProvider` СРАЗУ после
  server-confirmed входа (НЕ на ветке last-known-user — офлайн-вход не должен
  пытаться качать без сети). Отложка `requestIdleCallback`/`setTimeout(5s)`, чтобы не
  конкурировать со стартовой загрузкой дашборда; in-flight гард — параллельный вызов
  не даёт повторный прогон.
- `ensureOfflineData()` идемпотентна: сверяется с манифест-store IDB, докачивает
  только недостающее. Обрыв одного джоба — молча, не блокирует остальные и не
  бросает наружу; ретрай — на следующем запуске (следующий логин/старт).
- Ручной opt-in в настройках (`OfflineDataSection`) на ОСТАЛЬНЫЕ переводы Писания не
  тронут — это по-прежнему только руками. После `clearAllOfflineData` автозагрузка на
  следующем старте вернёт дефолтный базовый набор — осознанное поведение, отражено
  строкой в UI.

## UI

`src/features/offline/components/OfflineDataSection.tsx` (+ `useOfflineData` hook) —
секция в `dashboard/settings/page.tsx`: по строке на Писание (все self-hosted
переводы)/песни/план с датой и размером последней загрузки, кнопки скачать/обновить,
инлайн-подтверждение очистки. Версия приложения — build-time timestamp
(`next.config.ts` → `NEXT_PUBLIC_APP_BUILD_TIME`, `src/shared/config/appVersion.ts`),
вычисляется один раз при `next build`/старте `next dev`.

`src/shared/components/ui/OfflineIndicator.tsx` (в корневом `layout.tsx`) — небольшой
неблокирующий баннер, показывается по браузерным событиям `online`/`offline`. НЕ
скрывает остальной UI — приложение остаётся полностью рабочим под баннером через
IndexedDB read-through слой.

## Тестирование

IndexedDB-зависимые unit-тесты используют `fake-indexeddb/auto` (jsdom). Между тестами
БД сбрасывается через `__deleteDB()` (`src/shared/offline/db.ts`) — важно ЯВНО закрыть
предыдущее открытое соединение перед `indexedDB.deleteDatabase()`, иначе в
fake-indexeddb удаление зависает без `onblocked`.

Автоматизированный офлайн-регресс (реальный SW/кеш/outbox в браузере, Playwright) —
см. `e2e/offline/README.md`: холодный старт из кеша, навигация офлайн между разделами,
outbox-синк, а также killer-фича прекеша — офлайн-переход на РАНЕЕ НЕ ПОСЕЩЁННЫЙ
маршрут (`cold-start-any-route.spec.ts`) и update-flow (тост → SKIP_WAITING → reload,
`update-flow.spec.ts`).

## Приёмка iOS (ручной чек-лист)

Playwright гоняет WebKit, а не реальную iOS Safari — Service Worker lifecycle,
storage-партиционирование (Safari-вкладка vs installed PWA) и системные тосты
отличаются достаточно, чтобы автоматизированный прогон не заменял ручную приёмку на
устройстве перед релизом, затрагивающим SW/офлайн-слой.

1. Safari → войти → установить на экран «Домой» (Поделиться → «На экран „Домой“»).
2. Открыть установленное PWA (онлайн) → дождаться автозагрузки (Настройки →
   «Оффлайн-данные» показывают скачанные план/песни/перевод НЗ без ручного нажатия
   «Скачать»).
3. Включить авиарежим → холодный запуск PWA с экрана «Домой» (не из недавних вкладок
   Safari, а именно новый запуск) → дашборд, читалка, песни, календарь — работают, в
   том числе разделы, которые ДО этого запуска ни разу не открывались.
4. Отметить прогресс дня офлайн → выключить авиарежим → отметка синкнулась (проверить
   с другого устройства/веб-версии — Directus должен показать тот же прогресс).
5. Задеплоить новую версию (пересборка образа/рестарт контейнера) → открытое (не
   закрытое) PWA в течение часа предлагает тост «Доступна новая версия» → «Обновить» →
   обновление применяется без белого экрана и без reload-цикла (несколько
   перезагрузок подряд).

Результат чек-листа (что прошло / что нет) фиксируется в PR или коммите,
закрывающем `.ai-factory/plans/feature-static-export-hono-bff.md` (T14).
