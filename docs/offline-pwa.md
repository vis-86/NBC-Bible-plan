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
первого дня). Stores: `bibleChapters`, `songs`, `apiCache`, `outbox`, `meta`, `manifest`,
`songState`.

**Версия схемы: 2.** `1 → 2` (M10) добавила стор `songState` и НИЧЕГО не пересоздаёт:
у пользователя с установленной PWA снос существующих стёр означал бы потерю скачанного
Писания и песен. Миграция закрыта тестом «данные v1 переживают апгрейд»
(`db.test.ts`) — тест первого открытия этого не ловит, разница видна только на базе,
где уже что-то лежит.

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

#### Поисковый текст едет в `songs:list`

Поиск по тексту песни (`useSongSearch`, `docs/song-viewer-spec.md` §14) работает офлайн,
потому что BFF кладёт очищенный текст песни в поле `SongSummary.plainText` **прямо в ответ
списка** `songs:list` — того самого, что уже читается (`useSongs` → `readThrough`) и греется
(`downloadManager.downloadSongs` → `persistApiCache(SONGS_LIST_CACHE_KEY, …)`). Один кэш-ключ
вместо второго индекса: писатель и читатель не могут разойтись, отдельного прогрева не нужно.

- **Вес.** Замер на боевом корпусе (97 песен): текст ~157 КБ, полный ответ `GET /api/songs`
  ~175 КБ (сырой `content` в список НЕ отдаётся — только `plainText`, вдвое легче). Порог,
  за которым обсуждается отдельный ленивый индекс, — ~400 КБ.
- **Деградация на старом кэше.** `plainText` опционально: у пользователей с установленной PWA
  в IDB лежит `songs:list`, записанный версией без поля. Для таких песен поиск по тексту молча
  не работает (по названию — работает), пока первый онлайн-заход не обновит список через
  `readThrough`. Падать нельзя — покрыто тестом `useSongSearch.test.ts` («песня без plainText»).

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

#### Pull-to-refresh: осознанный обход circuit breaker

Жест «потянуть вниз» на экране сетлистов идёт НЕ через `readSetlistsThrough`, а через
отдельный `refreshSetlistsFromNetwork()` (`offlineSetlists.ts`):

- `readThrough` работает поверх `raceNetwork`, и при разомкнутой цепи (недавний
  таймаут) он мгновенно отдаёт **тот же самый** кэш. Пользователь тянет список,
  спиннер крутится, ничего не меняется — выглядит как поломка. Ручное обновление —
  явный пользовательский интент, оно и **есть** пробный запрос, поэтому берётся
  generic-комбинатор `raceWithTimeout` (breaker обойдён), а успех замыкает цепь
  через `reportNetworkSuccess()`.
- Таймаут длиннее сетевого дефолта: `PULL_REFRESH_TIMEOUT_MS = 10s` против 6s —
  пользователь смотрит на спиннер и готов ждать дольше фонового чтения.
- **Офлайн — fail fast, без похода в сеть.** `navigator.onLine === false` → сразу
  ошибка «Нет сети. Список не обновлён» (ждать бессмысленно by construction).
- **Фолбэка на IDB здесь нет намеренно:** данные уже на экране. При неудаче список
  не трогаем, показываем только ненавязчивую строку с ошибкой — подменять валидный
  список `ErrorMessage`'ем было бы регрессом.
- Успех пишет `apiCache` под тем же `SETLISTS_LIST_CACHE_KEY` и в той же форме
  (полный ответ `{ setlists }`), что и `readThrough` — иначе следующий офлайн-старт
  уронил бы карточку.

Первичное чтение при этом остаётся обычным read-through + IDB: pull-to-refresh —
надстройка, offline-first не нарушен. Регрессия закрыта e2e-кейсом «pull-to-refresh
офлайн» в `e2e/offline/setlists-offline.spec.ts`.

### Офлайн-вход

`src/shared/offline/lastKnownUser.ts` + `AuthProvider.tsx`: последний подтверждённый
сервером пользователь сохраняется в `meta` при каждой успешной проверке сессии.
Фолбэк применяется ТОЛЬКО когда `fetch('/api/auth/session')` падает по сетевой ошибке
(`catch`) — при явном `response.ok === false` / `user: null` это настоящее «сессии
нет», фолбэк не применяется. `logout()` и `__onSessionExpired` обязаны чистить
last-known-user, иначе устройство остаётся «офлайн-залогинено».

### Рукописные пометки песни — полный offline-first круг (M10)

Первая фича, у которой **и чтение, и запись** офлайн-полные (в отличие от сетлистов).
Спека модели — `docs/song-viewer-spec.md` §6/§7.

- **Чтение** — `readAnnotations()` (`src/features/songs/lib/songAnnotationsStore.ts`):
  сеть с таймаутом → IDB-стор `songState`. `navigator.onLine === false` с пустым кэшем ⇒
  fail fast. Пометок нет нигде ⇒ **пустой набор, а не ошибка**: «ещё не рисовал» —
  нормальное состояние, ронять из-за него лист песни нечем.
- **Ключ стора — один экспортируемый источник** `songStateKey(songId)`, им ходят и
  читатель (экран песни), и писатель (прогрев в `downloadManager`, `downloadSongs`
  греет пометки тем же вызовом `readAnnotations`, что зовёт экран).
- **Ответ сети применяется по LWW, а не безусловно.** Правка, нарисованная офлайн, лежит
  в outbox; песня, открытая до replay, получила бы с сервера СТАРОЕ состояние — оно
  затёрло бы свежую локальную запись и стёрло пометки с экрана. Если `updatedAt` кэша
  больше сетевого, побеждает кэш и IDB не переписывается.
- **Запись — только через outbox** (см. ниже), прямого POST нет: ветвление online/offline
  завело бы второй источник истины рядом с очередью.
- **Адрес запроса строит `apiClient`**, basePath он добавляет сам. Обёртка в `getApiPath()`
  давала `/app/app/api/...` — вечный 404, неотличимый от «пометок нет», то есть тихую
  потерю пометок на всех устройствах. Поймано офлайн-e2e T15, закрыто юнит-тестом на URL.

### Write-ahead outbox (прогресс и пометки)

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

#### Очередь — дискриминированный union (M10)

`OutboxRecord` перестала быть структурой «только про прогресс»:

```ts
type OutboxRecord =
  | { kind?: 'progress'; op: 'single' | 'batch'; dayIds: number[]; ... }
  | { kind: 'songAnnotations'; songId: number; payload: SongAnnotations; ... };
```

- **Запись без `kind` — это прогресс.** Такие записи прямо сейчас лежат в IDB у
  пользователей: читать их иначе значило бы молча потерять неотправленный прогресс.
  Единственная точка разбора — `isProgressOutboxRecord()` в `db.ts`.
- **`id` записи пометок детерминированный** — `songAnnotations:${songId}`. Новая правка
  тех же пометок **заменяет** предыдущую запись в очереди, а не копит их: отправлять
  промежуточные состояния бессмысленно, каждая запись — «set», а не дельта.
- Поэтому в dedup по дням (`replayOutbox`) пометки не участвуют — их вытесняет сам ключ.
- Отправка — `PUT /api/songs/:id/state`. **4xx считается финальным исходом**: битое тело
  или чужая песня повторами не лечатся, и без этого запись висела бы в очереди вечно,
  бесплатно бомбя сервер на каждом триггере синка.
- Payload в `shared/offline` описан структурно (`{ strokes: unknown[]; updatedAt }`), а не
  типом фичи: `shared` не имеет права зависеть от `features/songs` (FSD).
- Сервер тоже применяет LWW: `PUT` со старым `updatedAt` отбрасывается со `status:'stale'`
  и **200** — отброс это штатный исход гонки, а не ошибка клиента.

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
- `downloadSongs()` дополнительно греет `songState` — пометки скачиваются вместе с
  песнями, тем же вызовом `readAnnotations()`, которым их читает экран.
- `clearAllOfflineData({ force? })` — чистит `bibleChapters`/`songs`/`apiCache`/
  `manifest`/`songState`. НЕ трогает SW-кеш app shell и НЕ трогает `meta` (last-known-user — иначе
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
маршрут (`cold-start-any-route.spec.ts`), update-flow (тост → SKIP_WAITING → reload,
`update-flow.spec.ts`) и полный круг записи пометок песни
(`song-annotations-offline.spec.ts`: нарисовал офлайн → reload → сеть → Directus →
чистый IDB).

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
