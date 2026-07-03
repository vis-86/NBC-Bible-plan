[← Аутентификация](authentication.md) · [Back to README](../README.md) · [Деплой →](deployment.md)

# Offline-first PWA

## Обзор

Приложение работает офлайн: Писание, песни и план чтения читаются без сети, прогресс
отмечается офлайн и синхронизируется при появлении интернета (Last-Write-Wins). Секция
«Оффлайн-данные» в настройках позволяет скачать данные на устройство заранее (opt-in),
показать что скачано и очистить.

Два независимых слоя хранения:

- **Service Worker Cache API** — ТОЛЬКО app shell: `_next/static/**` (cache-first,
  content-hashed/immutable) + HTML-навигации (NetworkFirst, с кешированием посещённых
  страниц). Никаких данных.
- **IndexedDB** (`src/shared/offline/db.ts`, обёртка `idb`) — ВСЕ данные: Писание,
  песни, ответы API (`apiCache`), очередь неподтверждённых мутаций (`outbox`),
  last-known-user и манифест скачанного (`meta`/`manifest`).

## Service Worker (app shell)

- **Source:** `src/sw/sw-source.ts` — статический body (без build-шага, без
  `@serwist/build`). Роутинг-решение (`routeStrategy`) и обе fetch-стратегии
  (`handleStaticAsset`, `handleNavigation`) — чистые функции, покрыты unit-тестами; в
  сам SW встраиваются через `.toString()` (единый источник правды, без дублирования
  логики в plain-JS).
- **Route:** `src/app/sw.js/route.ts` отдаёт `buildSwBody()` по `{basePath}/sw.js`.
- **Стратегии:** same-origin GET `_next/static/**` → cache-first (`app-shell-static-v1`).
  Same-origin GET HTML-навигации → NetworkFirst: успешный ответ кешируется в
  `app-shell-html-v1`; офлайн — точное совпадение из кеша (реальный HTML посещённой
  страницы), при промахе — любая другая закешированная страница (тот же SPA-бандл,
  клиентский роутинг подхватывает), и только если кеш вообще пуст — bare-текст
  `"Offline"` (503). Всё остальное (не-GET, cross-origin, `/api/*`) — passthrough без
  `event.respondWith`.
- **Kill switch:** константа `SW_DISABLED` в `sw-source.ts`. При `true` SW на
  `activate` чистит все caches и делает `unregister()`. Чтобы это реально попало к
  пользователю — `ServiceWorkerRegistrar` вызывает `reg.update()` при возврате вкладки
  в фокус и раз в час (без этого браузер годами не подтянет новую версию SW).

## IndexedDB-слой

`src/shared/offline/db.ts` — schema-versioned (`openDB(name, version, {upgrade})` с
первого дня). Stores: `bibleChapters`, `songs`, `apiCache`, `outbox`, `meta`, `manifest`.

### Read-through (Писание/песни/план/настройки)

- **Писание:** `src/features/reading/bible-text-cache.ts` + `useBibleText.ts` — цепочка
  memory → network → (fail) IDB. Ключ `(translationId, book, chapter)`; при сетевом
  ответе ключуется по полю `translation` из ОТВЕТА сервера (не по клиентским
  настройкам) — сессия может резолвить перевод иначе.
- **Остальные данные:** общий паттерн `src/shared/offline/readThrough.ts` —
  network-first, успешный ответ пишется в `apiCache` по логическому ключу
  (`plan:days`, `plan:progress`, `plan:weekly:proverbs`, `songs:list`, `bible:books`,
  `reading:settings`), при сетевой ошибке — чтение из `apiCache`.

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
