# Implementation Plan: Offline cache-first (SWR) + sync-манифест

Branch: `feature/song-section-markers` (новая ветка НЕ создавалась — решение Игоря 2026-08-19)
Created: 2026-08-19

## Settings
- Testing: yes — юниты (vitest) + e2e (`npm run e2e:offline`)
- Logging: verbose — DEBUG под `NEXT_PUBLIC_LOG_LEVEL`, как в существующем offline-слое
- Docs: yes — обязательный чекпоинт (`docs/offline-pwa.md`, `CLAUDE.md`, `AGENTS.md` описывают network-first как инвариант и после правки станут врать)

## Roadmap Linkage
Milestone: "none"
Rationale: ROADMAP описывает song viewer (M1–M10); работа инфраструктурная — offline-слой и BFF,
ни в один milestone не ложится. Побочно снимает часть боли M7 (сеты) и подпирает M9.

## Research Context
Source: `.ai-factory/RESEARCH.md` (Active Summary) + веб-research 2026-08-19

Goal: убрать задержки чтения (skeleton при открытии песни из сета) и обеспечить свежесть
офлайн-данных без перекачки каталога. Приоритет чтения разворачивается: кеш сначала, сеть — фоном.

Decisions (зафиксировано с Игорем 2026-08-19):
- Применение свежего: списки — молча; ОТКРЫТАЯ песня — не подменять, показать плашку
  «Песня обновлена → Обновить» (защита чтения на служении и якорей ink-пометок).
- TTL кеша — 5 минут: свежее → в сеть не ходим вовсе.
- Прогрев: при открытии сета греем ВСЕ его песни; плюс sync-прогрев на КАЖДОМ запуске.
- Ограничений по типу сети нет (Network Information API отсутствует в Safari/iOS).
- Свежесть — через версии: `GET /api/sync/manifest` с ПЕР-ЭЛЕМЕНТНЫМИ версиями,
  качаем только дельту, удалённые чистим по полному списку id (tombstones не нужны).
- TanStack Query + IDB persister — ОТВЕРГНУТ. Совпадает с «эскалационной лестницей» из
  RESEARCH.md: порог не перейдён. `persistQueryClient` переписывает персист целиком на
  каждой мутации (больно на каталоге песен), плюс пришлось бы переносить туда circuit
  breaker, таймауты и `OfflineNoDataError` — они выстраданы багами.

Open questions: нет (все развилки закрыты в обсуждении 2026-08-19).

## Offline-бюджет (обязательный чек-лист, skill-context/aif-plan)

- **(a) Таймаут + `onLine===false` fail-fast на каждом новом сетевом пути** — новый путь ровно
  один: `GET /api/sync/manifest` (T10/T14). Идёт через `raceNetwork`, при заведомом офлайне
  не выполняется вовсе. Фоновая ревалидация SWR по определению не блокирует UI.
- **(b) Симметрия писателя и читателя** — дельта-синк ОБЯЗАН греть те же ключи, что читают
  экраны: `songs:list`, стор `songs`, `setlists:list:v2`, `setlists:item:<id>`, `plan:*`.
  Ассерт в тестах — теми же экспортируемыми константами (T15).
- **(c) `APP_SHELL_ROUTES`** — новых `router.push`-маршрутов план НЕ вводит. Проверить и
  зафиксировать в T16, изменений не ожидается.
- **(d) Оба режима офлайна в тестах** — и мгновенный reject fetch, и НИКОГДА не резолвящийся
  fetch. Оба на каждом изменённом read-пути (T3, T9, T15).
- **Произведение таймаутов** — главный выигрыш плана: при попадании в кеш последовательные
  экраны больше не перемножают N×T, потому что в сеть на критическом пути не ходят вообще.

## Общий примитив: перечень потребителей (skill-context, правило 2)

`readThrough` меняет поведение → полный список импортёров, каждый обязан быть проверен:
`BookPicker.tsx:53`, `useReadingSettings.ts:38`, `useSongs.ts:19`, `PlanContext.tsx:63,73`,
`PlanView.tsx:136`, `offlineSetlists.ts:25,72`, `useAppRole.ts:37`.
`raceNetwork` НЕ трогаем (его потребители — `useBibleText`, `songAnnotationsStore`, `sync.ts`,
`AuthProvider`). `raceWithTimeout` не трогаем вовсе — им пользуется `db.ts` для
`indexedDB.open()`, и любая сетевая политика внутри него убивает сам фолбэк-слой.

**Обратная совместимость:** существующая сигнатура `readThrough` остаётся рабочей — SWR
добавляется отдельной функцией/опцией, чтобы непереведённый потребитель не сломался молча.

## Commit Plan

- **Commit 1** (T1–T3): `feat(offline): add stale-while-revalidate read primitive`
- **Commit 2** (T4–T6): `feat(songs): serve songs and setlists from cache first`
- **Commit 3** (T7–T9): `feat(offline): cache-first for plan, reader and setlist warm-up`
- **Commit 4** (T10–T12): `feat(bff): add sync manifest endpoint with per-item versions`
- **Commit 5** (T13–T15): `feat(offline): delta sync of songs and setlists on startup`
- **Commit 6** (T16–T17): `test(offline): production offline contour + docs`

## Tasks

### Phase 1 — SWR-примитив

- [x] **T1: `readThroughSWR` в `src/shared/offline/readThrough.ts`**
  Сигнатура: `readThroughSWR<T>(key, fetcher, { ttlMs = 5 * 60_000, timeoutMs, onFresh? })
  → Promise<{ data: T; fromCache: boolean; revalidating: boolean }>`.
  Ветки: (1) кеш есть и `Date.now() - updatedAt < ttlMs` → вернуть мгновенно, в сеть НЕ идти;
  (2) кеш есть, протух → вернуть мгновенно, сеть в фоне → `persistApiCache` + `onFresh(data)`;
  (3) кеша нет → текущее поведение `readThrough` БЕЗ изменений (raceNetwork, circuit breaker,
  `OfflineNoDataError`, «нет фолбэка — ждём медленную сеть»).
  `getApiCache` расширить до варианта, отдающего `updatedAt` (сам `getApiCache` не ломать).
  Критично: `data === []` / `null` — валидный кеш, отличать от «записи нет» (`record === undefined`).
  Фоновый промис глушить `.catch(() => {})` — поздний reject не должен стать unhandled.
  LOGGING (verbose, префикс `[offline/readThrough]`): DEBUG на каждой ветке — `cache hit (fresh)`
  c возрастом записи, `cache hit (stale) → background revalidate`, `cache miss → network-first`;
  DEBUG при `onFresh` с флагом «данные изменились/идентичны»; ERROR фоновой сети не логировать
  выше DEBUG (это ожидаемый офлайн).
  Files: `src/shared/offline/readThrough.ts`

- [x] **T2: SWR в `readSongThrough`**
  Тот же контракт для стора `songs` (ключ = `Song.id`, `updatedAt` в записи уже есть).
  Обязательно сохранить ветку `isDefinitelyOffline() → OfflineNoDataError` при пустом кеше.
  LOGGING: префикс `[songs/offline]`, DEBUG на ветках + id песни.
  Files: `src/features/songs/lib/offlineSongs.ts`
  Depends on: T1

- [x] **T3: Юнит-тесты примитивов**
  Кейсы на каждый из двух модулей: свежий кеш → `fetcher` НЕ вызван; протухший кеш → данные
  мгновенно + `onFresh` после сети; пустой кеш → старое поведение; **fetcher мгновенно
  reject + запись в IDB есть**; **fetcher НИКОГДА не резолвится + запись в IDB есть**
  (оба режима офлайна, skill-context (d)); `navigator.onLine === false` + пустой кеш →
  `OfflineNoDataError`; кеш `[]` не принимается за промах; ошибка IDB не роняет путь.
  Files: `src/shared/offline/readThrough.test.ts`, `src/features/songs/lib/offlineSongs.test.ts`
  Depends on: T1, T2

### Phase 2 — Хуки, UI, прогрев

- [x] **T4: `useSongs` / `useSong` на SWR**
  `loading: true` только при пустом кеше. `useSong` дополнительно отдаёт
  `freshAvailable: boolean` и `applyFresh()`: свежий ответ НЕ применяется автоматически,
  складывается в ref; сравнение с показанным по `content`/`title`/`key`/`defaultKey` —
  идентичен → применить молча и `freshAvailable` не поднимать.
  `useSongs` (список) применяет свежее молча.
  LOGGING: `[useSong]` DEBUG — источник данных (cache/network), поднятие `freshAvailable`,
  вызов `applyFresh`.
  Files: `src/features/songs/hooks/useSong.ts`, `src/features/songs/hooks/useSongs.ts`
  Depends on: T2

- [x] **T5: Плашка «Песня обновлена» в просмотре песни**
  Ненавязчивая плашка по `freshAvailable` → `applyFresh()`. Токены только семантические
  (`bg-app-*`/`text-app-*`), не перекрывать шапку-оверлей и `SongToolStack`, не появляться
  поверх активного режима ink и играющего автоскролла (в фокус-режиме — отложить до выхода).
  DOM-якорь kebab-case: `data-song-fresh-banner`.
  LOGGING: DEBUG на показ/принятие/отклонение.
  Files: `src/app/dashboard/song/page.tsx` (+ новый компонент в `src/features/songs/components/`)
  Depends on: T4

- [x] **T6: Сетлисты на SWR**
  `readSetlistsThrough` и чтение детали — через `readThroughSWR`, ключи прежние
  (`SETLISTS_LIST_CACHE_KEY`, `setlistCacheKey`) — НЕ дублировать строки.
  Осторожно с module-level кешем `useSetlists`: `resetSetlistsCache()` после мутаций обязан
  сбрасывать и SWR-состояние, иначе экран покажет состав, которого уже нет.
  `refreshSetlistsFromNetwork` (pull-to-refresh) не трогать — он сознательно идёт мимо
  circuit breaker и должен остаться принудительно сетевым.
  LOGGING: `[setlists/offline]` DEBUG — ветка чтения и ключ.
  Files: `src/features/setlists/lib/offlineSetlists.ts`, `src/features/setlists/hooks/useSetlists.ts`,
  `src/features/setlists/hooks/useSetlist.ts`
  Depends on: T1

- [x] **T7: План, настройки чтения, роль, книги, Писание**
  Перевести на `readThroughSWR`: `PlanContext` (`plan:days`, `plan:progress`), `PlanView`
  (`plan:weekly:proverbs`), `useReadingSettings`, `useAppRole`, `BookPicker`.
  `useBibleText` — кеш главы в IDB отдавать сразу, сеть фоном (текст Писания неизменен,
  подмена безопасна). `AuthProvider` и `sync.ts` НЕ ТРОГАТЬ — сессия и replay outbox
  обязаны остаться network-first.
  Внимание: `plan:progress` пишется outbox'ом — свежий сетевой ответ не должен затирать
  локальные неотправленные отметки; при непустом outbox фоновое применение прогресса пропускать.
  LOGGING: DEBUG на каждом переведённом пути с именем ключа.
  Files: `src/features/plan/contexts/PlanContext.tsx`, `src/features/plan/components/PlanView.tsx`,
  `src/features/reading/hooks/useReadingSettings.ts`, `src/features/reading/hooks/useBibleText.ts`,
  `src/features/reading/components/BookPicker.tsx`, `src/shared/hooks/useAppRole.ts`
  Depends on: T1

- [x] **T8: Прогрев песен сета при открытии**
  При открытии сета — фоновая догрузка ВСЕХ его песен в стор `songs` тем же
  `readSongThrough` (симметрия писателя и читателя). Конкурентность 2–3, пропуск песен со
  свежим кешем, тихий отказ при офлайне (`isDefinitelyOffline()` → выход без запросов).
  Не блокирует рендер и не показывает прогресс.
  Импорт `features/songs` из `features/setlists` — продолжение существующего прецедента
  (`useSetlistPlayback.ts:78`), новых исключений FSD не вводим.
  LOGGING: INFO на старт/итог прогрева (`{ setlistId, total, warmed, skipped }`), DEBUG по песне.
  Files: `src/features/setlists/hooks/useSetlist.ts` (или новый `lib/warmSetlistSongs.ts`)
  Depends on: T2

- [x] **T9: Тесты хуков + первый e2e-кейс**
  Юниты: `useSong` не поднимает `freshAvailable` на идентичном контенте и поднимает на
  изменённом; `applyFresh` применяет; список применяется молча; прогрев сета не ходит в сеть
  офлайн и уважает конкурентность; `resetSetlistsCache` чистит SWR-состояние; при непустом
  outbox фоновый прогресс не применяется.
  E2E: «онлайн, кеш прогрет → открытие песни из сета БЕЗ скелета, консоль чистая».
  Files: `src/features/songs/hooks/*.test.ts(x)`, `src/features/setlists/**/*.test.ts`,
  `e2e/offline/`
  Depends on: T4, T6, T7, T8

### Phase 3 — sync-манифест в BFF

- [x] **T10: `GET /api/sync/manifest`**
  Ответ: `{ songs: [[id, v]], setlists: [[id, v]], plan: v }`.
  `v` песни — `date_updated` из Directus (поле есть, `scripts/songs-import/bootstrap.ts:42`).
  `v` сета — ЛОВУШКА: правка состава меняет `setlist_items`, а не `setlists.date_updated`.
  Считать короткий хеш от `(setlist.date_updated + отсортированный список itemId:sort:songId)`.
  ETag от тела + обработка `If-None-Match` → `304` без тела.
  In-memory кеш ответа на 60 с (всплеск запусков не бьёт в Directus).
  Роут регистрируется в `createApp()` рядом с остальными. `Cache-Control: no-cache`
  (валидация обязательна, отдавать из HTTP-кеша без проверки нельзя).
  LOGGING (`[Sync API]`): DEBUG — попадание в in-memory кеш, размер ответа, число элементов;
  INFO — 304 vs 200; ERROR — сбой Directus (отдавать 503, не пустой манифест: пустой
  манифест клиент прочитает как «всё удалили»).
  Files: `server/src/routes/sync.ts`, `server/src/app.ts`,
  `src/features/songs/services/songsServer.ts`, `src/features/setlists/services/setlistsServer.ts`
  Depends on: —

- [x] **T11: Тесты роута + runtime-closure/Docker**
  Тесты через `createApp()` + `app.request()`: форма ответа, 304 при совпадении ETag,
  200 при расхождении, in-memory кеш, 503 при падении Directus.
  ОБЯЗАТЕЛЬНО прогнать `server/src/runtime-closure.test.ts`: bff-образ копирует whitelist
  каталогов `src/`, а не весь `src/` — новый транзитивный импорт без строки `COPY` даёт 502
  на ВСЁМ `/api`. Сейчас в whitelist есть `src/features/setlists/services`, но НЕТ
  `src/features/setlists/lib` — если роут потянет `lib`, добавить COPY-строку.
  Помнить: `deploy/` ИСКЛЮЧЁН из rsync — правка Dockerfile доставляется на сервер вручную (scp),
  это отдельный пункт в описании релиза.
  Files: `server/src/routes/sync.test.ts`, `deploy/Dockerfile` (при необходимости)
  Depends on: T10

- [x] **T12: Клиентский эндпоинт и типы**
  `syncApi.getManifest()` в `src/shared/services/api/endpoints.ts` через `getApiPath()`,
  типы манифеста. Передавать сохранённый ETag заголовком `If-None-Match`, различать 304.
  LOGGING: DEBUG — отправленный ETag, полученный статус.
  Files: `src/shared/services/api/endpoints.ts`, `src/shared/types/`
  Depends on: T10

### Phase 4 — дельта-синк на клиенте

- [x] **T13: Хранение версий в IDB**
  Версии и ETag — в существующий стор `meta` (ключи `sync:versions`, `sync:etag`).
  Сознательно БЕЗ новых сторов и без подъёма `DB_VERSION`: миграция офлайн-схемы — самый
  дорогой риск в проекте (снос стора = потеря скачанного Писания у установивших PWA).
  LOGGING: DEBUG — чтение/запись карты версий, её размер.
  Files: `src/shared/offline/syncVersions.ts` (новый), `src/shared/offline/db.ts` (только типы `meta`)
  Depends on: —

- [x] **T14: `ensureOfflineData` → дельта вместо one-shot**
  Снять гард `if (!have.has('songs'))`: он качает ресурс РАЗ ЗА ЖИЗНЬ установки — сет,
  собранный в четверг, не приедет к воскресенью. Новый алгоритм на каждом запуске
  (сохранив idle-отложку 5 с и in-flight гард):
  1. `isDefinitelyOffline()` → выход без сети;
  2. `getManifest()` с ETag; 304 → выход (ноль работы);
  3. сравнить с `sync:versions` → скачать только новые/изменившиеся песни и сеты;
  4. удалить из стора `songs` и из `apiCache` всё, чего нет в манифесте (снятая с публикации
     песня иначе живёт в IDB вечно — tombstones не нужны, полный список id их заменяет);
  5. записать новые версии и ETag ТОЛЬКО после успешного применения (частичный сбой не
     должен зафиксировать версию недокачанного).
  Каждый джоб независим, наружу не бросает (ретрай — следующий запуск, идемпотентность
  делает его бесплатным). Греть ровно те ключи, что читают экраны — см. offline-бюджет (b).
  LOGGING (`[offline/autoDownload]`): INFO — старт с контекстом (`standalone`/`browser-tab`),
  итог `{ checked, updated, added, removed, skipped304 }`; DEBUG — по каждому элементу дельты.
  Files: `src/shared/offline/autoDownload.ts`, `src/shared/offline/downloadManager.ts`
  Depends on: T12, T13

- [x] **T15: Тесты дельты**
  304 → ни одного запроса деталей; изменилась одна песня → ровно один запрос детали;
  песня исчезла из манифеста → удалена из `songs` И из `apiCache`; сеть падает посреди
  дельты → версии НЕ записаны, следующий запуск дочищает; офлайн → выход без запросов;
  ассерты на ключи кеша ТЕМИ ЖЕ экспортируемыми константами, что в проде (симметрия).
  Files: `src/shared/offline/autoDownload.test.ts`, `src/shared/offline/downloadManager.test.ts`
  Depends on: T14

### Phase 5 — Прод-контур и документация

- [x] **T16: Production-верификация (без неё изменение НЕ готово)**
  `npm run test` → `npm run lint` → `npm run build` → просмотреть реальный сгенерированный
  `out/sw.js` → `npm run bff:start` + `npm run static:serve` → `npm run e2e:offline`.
  Dev-режим офлайн-баги не воспроизводит. Проверить, что `APP_SHELL_ROUTES` не требует
  изменений (новых маршрутов план не вводит) и что e2e-ассерты включают чистую консоль
  (без `Failed to fetch RSC payload`).
  Новые e2e-кейсы: «онлайн с кешем → без скелета»; «песню удалили на сервере → ушла из IDB»;
  «cold start офлайн после дельта-синка».
  Depends on: T9, T15

- [x] **T17: Документация (обязательный чекпоинт)**
  `docs/offline-pwa.md` — новая модель чтения (SWR + TTL 5 мин), sync-манифест, дельта,
  политика применения свежего, что осталось network-first (сессия, replay outbox,
  pull-to-refresh) и почему.
  `CLAUDE.md` — инвариант «каждый read-путь network-first + IDB-фолбэк» переформулировать
  в «cache-first + фоновая ревалидация; network-first остаётся для сессии и outbox».
  `AGENTS.md` — строки про новый роут `sync`, `syncVersions.ts`, изменённый `autoDownload`.
  Depends on: T16

## Progress Log (для продолжения в новой сессии)

Ведётся `/aif-implement`. Источник истины по прогрессу — чекбоксы выше; здесь — то,
что из чекбокса не восстановить.

### 2026-08-19 — сессия 1
- Ветка: `feature/song-section-markers` (новая не создавалась, решение Игоря).
- **T1** — `readThroughSWR` + `getApiCacheRecord` + `DEFAULT_SWR_TTL_MS` дописаны в конец
  `src/shared/offline/readThrough.ts`. Существующий `readThrough` НЕ тронут (обратная
  совместимость): ветка «кеша нет» просто делегирует в него. Добавлена ветка, которой не
  было в плане: протухший кеш + `isDefinitelyOffline()` → фоновую ревалидацию не запускаем
  вовсе (в офлайне это гарантированно висящий fetch).
- **T2** — `readSongThroughSWR` + `getCachedSongRecord` в `src/features/songs/lib/offlineSongs.ts`,
  тот же контракт, ключ = `Song.id`, `OfflineNoDataError` на пустом кеше сохранён.
- **T3** — по 8 кейсов в `readThrough.test.ts` и `offlineSongs.test.ts` (оба режима офлайна,
  кеш `[]`, ошибка IDB, `onLine === false`). Ловушка на будущее: `fake-indexeddb` НЕ
  сбрасывается между тестами внутри файла — новым кейсам нужны уникальные ключи/id,
  иначе «пустой кеш» окажется непустым от соседнего теста.
- Проверено: `npx vitest run` по обоим файлам (32 теста) + `npx eslint` по 4 файлам — чисто.
  Полный `npm run test` / `npm run build` / e2e — по плану в T16.

#### Фаза 2 (T4–T9) — та же сессия
- **T4** — `useSongs`: module-кэш + набор подписчиков, свежий список применяется молча;
  добавлен `resetSongsCache()`. `useSong`: `freshAvailable`/`applyFresh`, сравнение по
  `content/title/key/defaultKey`, плюс module-map `seen` уже показанных песен —
  без него даже чтение из IDB даёт кадр скелета, а цель плана ровно в его отсутствии.
- **T5** — `SongFreshBanner` (левый нижний угол: правый занят `SongToolStack`, центр —
  `SetlistPagerDock`), якорь `data-song-fresh-banner`. Условие показа считается на
  рендере → после выхода из ink/фокус-режима плашка появляется сама.
- **T6** — `readSetlistsThroughSWR`/`readSetlistThroughSWR` (ключи прежние).
  `resetSetlistsCache()` теперь ещё и инкрементит `generation`: поздняя ревалидация
  после мутации отбрасывается. `refreshSetlistsFromNetwork` не тронут.
- **T7** — переведены `PlanView` (weekly), `useReadingSettings` (вынесен
  `normalizeSettings`), `BookPicker`, `useAppRole`, `useBibleText` (IDB-глава отдаётся
  мгновенно + фоновая ревалидация).
  **Отклонение от плана:** в `PlanContext` (`plan:days`, `plan:progress`) чтение
  cache-first, но `onFresh` НЕ подключён — маппинг дней/прогресса/outbox-оверлея
  собирается одним куском на ~90 строк, и его переиспользуемый разбор — отдельный
  рефакторинг. Свежее применяется на следующем монтировании. Побочно это
  автоматически выполняет требование «не затирать неотправленные outbox-отметки».
- **T8** — `src/features/setlists/lib/warmSetlistSongs.ts`; вызывается из `useSetlist`
  И из `useSetlistPlayback` (реальный вход в сет — переход с карточки сразу на первую
  песню, `useSetlist` там не монтируется).
- **T9** — `useSong.test.tsx`, `warmSetlistSongs.test.ts`, +2 кейса в `useSetlists.test.ts`,
  e2e `e2e/offline/cache-first.spec.ts` (без скелета онлайн + офлайн из IDB).
- Починены 3 чужих теста, сломанных сменой семантики (это ожидаемо, не регресс):
  `useReadingSettings.test.ts` и `useSetlistPlayback.test.ts` чистят `apiCache` в
  `beforeEach` (свежая запись соседнего теста перебивала мок), `useSetlists.test.ts`
  мокает `readSetlistsThroughSWR` вместо `readSetlistsThrough`.
- Состояние: `npx vitest run` — 1037/1037 зелёных. Lint: новых ошибок не добавлено
  (в репозитории и так ~118 ошибок baseline; по тронутым файлам счётчик не вырос,
  в `useSongs` даже стало на одну меньше).

#### Фазы 3–4 (T10–T15) — та же сессия
- **T10** — `server/src/routes/sync.ts` + регистрация в `createApp()`. Версии дают
  `getSongVersions()` (songsServer, `date_updated ?? date_created` — иначе все ни разу
  не правленные песни делили бы пустую версию) и `getSetlistVersions()` (setlistsServer,
  sha1-12 от `date_updated` + отсортированного состава). Версия плана — sha1-12 от самого
  плана (своего поля версии у него нет), стоимость гасится in-memory кешем 60 с.
  В `SetlistRow` добавлено поле `date_updated`.
- **T11** — `server/src/routes/sync.test.ts` (7 кейсов, включая «правка ТОЛЬКО состава
  меняет версию сета» и «Directus упал → 503, не пустой манифест»).
  `runtime-closure.test.ts` — зелёный БЕЗ правки `deploy/Dockerfile`: новый роут тянет
  только уже скопированные каталоги. Ручная доставка `deploy/` не требуется.
- **T12** — `syncApi.getManifest(etag)` в `endpoints.ts`. Сделан на голом `fetch`, а не
  через `apiClient`: тот считает любой не-`ok` статус ошибкой, а 304 здесь — штатный и
  самый частый ответ.
- **T13** — `src/shared/offline/syncVersions.ts`, две записи в существующем сторе `meta`
  (`sync:versions`, `sync:etag`). `DB_VERSION` НЕ поднимался.
- **T14** — `ensureOfflineData` = `ensureBaseline()` (гард первой загрузки по стору
  `manifest`) + `runDeltaSync()`. Гард `if (!have.has('songs'))` больше не решает
  вопрос свежести. Отдельно закрыт неочевидный случай: на ПЕРВОМ запуске baseline уже
  скачал каталог целиком, поэтому для только что скачанных ресурсов версии берутся прямо
  из манифеста — иначе первый запуск качал бы всё дважды (тест на это есть).
  Версии и ETag пишутся только после успеха обеих дельт.
- **T15** — 6 кейсов в `autoDownload.test.ts` + 6 в `downloadManager.test.ts`; ассерты на
  ключи кеша идут ТЕМИ ЖЕ вызовами, что в проде (`getCachedSong`, `getApiCache(SONGS_LIST_CACHE_KEY)`,
  `readSetlistThrough`). Моки `downloadManager`/`endpoints` в старых тестах расширены
  (без этого дельта тихо падала в catch и тесты «проходили» вхолостую).
- Состояние: `npx vitest run` — 1056/1056 зелёных.
- **Осталось: T16 (прод-контур: build → sw.js → bff:start + static:serve → e2e:offline)
  и T17 (документация).** T16 требует поднятых серверов и `.env.test` — это ручной шаг.

#### Фаза 5 (T16–T17) — та же сессия
- **T17** — обновлены `docs/offline-pwa.md` (новый раздел «Cache-first (SWR)» с таблицей
  политики применения свежего + раздел «Sync-манифест и дельта-синк»), `CLAUDE.md`
  (инвариант переформулирован) и `AGENTS.md` (новый роут `sync`, `syncVersions.ts`,
  `warmSetlistSongs.ts`, `SongFreshBanner.tsx`, изменённый `autoDownload`).
- **T16, прогресс:**
  - `npx vitest run` — 1056/1056 зелёных; `npm run lint` — 117 ошибок против 118 в baseline
    (новых не добавлено, одна ушла).
  - `npm run build` — ок, `out/sw.js` собран: 219 precache-записей, 6.20 MB. В реальном
    сгенерированном `sw.js` присутствуют все девять `APP_SHELL_ROUTES`; изменений не
    потребовалось — план новых `router.push`-маршрутов не вводит, как и планировалось.
  - `runtime-closure.test.ts` — зелёный, правка `deploy/Dockerfile` НЕ нужна
    (ручная доставка `deploy/` по scp в этот релиз не входит).
  - **Ловушка окружения:** порт 8080 на машине занят посторонним процессом →
    `static:serve` поднимался как `STATIC_SERVE_PORT=8099` + `E2E_BASE_URL=http://localhost:8099`.
  - Первый прогон `npx playwright test`: **25 passed, 3 failed**, все три падения — таймаут
    на `login`, то есть исчерпан рейт-лимит BFF (`/api/auth/login`, 10/15 мин на IP), а не
    регресс. Немедленный повторный прогон подтвердил: падений стало больше, все на логине.
  - **Из-за этого отдельный спек `e2e/offline/cache-first.spec.ts` был удалён**, а оба его
    кейса перенесены в `setlists-offline.spec.ts` (там логин уже есть и сет уже создаётся):
    каждый новый спек — это +1 логин, а полный прогон и так на грани бюджета.
  - Осталось: финальный прогон `e2e/offline` после паузы рейт-лимита.

##### T16, прогон 2 (после паузы рейт-лимита): 10 passed, 2 failed — обе регрессии мои, починены
- `cold-start-any-route.spec.ts` ждёт console-строку **`auto-download finished`** как маркер
  «офлайн-данные готовы». Разбив `ensureOfflineData` на baseline + дельту, я потерял эту
  строку (появились `baseline download finished` / `delta sync finished`). Вернул
  терминальный `info('auto-download finished', { context })` в конец `ensureOfflineData` —
  и как контракт спека, и как честный маркер завершения. **Переименование этой строки
  ломает прод-контур молча**, менять только вместе со спеком (комментарий в коде стоит).
- `outbox-sync.spec.ts`: «офлайн отметил пункт → онлайн → replay → reload» показывал
  снимок ДО отметки. Причина — `plan:progress` под cache-first с TTL 5 минут: outbox
  после успешного replay уже пуст, оверлеем это не прикрыть, и из кеша поднимался
  устаревший снапшот. **`plan:progress` возвращён на network-first** (единственные здесь
  данные, которые правит сам пользователь); IDB-фолбэк сохранён. `plan:days` остаётся
  cache-first.
- **Урок для будущих переводов на SWR:** cache-first безопасен для read-only ресурсов;
  для любого пользовательски мутируемого ключа сначала ответь, что произойдёт после
  «записал → синхронизировалось → перечитал» внутри окна TTL.
- Новый кейс `cache-first: вторая песня сета открывается без скелета` — ✓ зелёный.

##### T16, прогоны 3–4: ЗЕЛЁНО, прод-контур закрыт
- Прогон 3 (`e2e/offline` целиком): 9 passed, 3 failed — все три падения на `login`
  (рейт-лимит `/api/auth/login`, 10/15 мин на IP), до ассертов тесты не доходили.
  Обе регрессии прогона 2 подтверждённо закрыты: `cold-start-any-route` ✓,
  новый `cache-first: вторая песня сета без скелета` ✓.
- Прогон 4 (только упёршиеся в лимит спеки, после паузы 15 мин):
  `offline-navigation` ×2 и `outbox-sync` — **3 passed**. Фикс `plan:progress`
  (возврат на network-first) подтверждён прогоном.
- Итог по всем прогонам: каждый спек `e2e/offline` хотя бы раз прошёл на этой сборке
  зелёным; красных ассертов не осталось.
- **Эксплуатационная заметка:** полный `npm run e2e:offline` жрёт по одному логину на
  спек-файл и упирается в рейт-лимит BFF, если гонять его дважды подряд. Между полными
  прогонами нужна пауза ~15 мин, либо гонять подмножество спеков.

### Статус плана: все T1–T17 выполнены.
