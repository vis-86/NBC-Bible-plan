# Research

Updated: 2026-07-09 11:20
Status: active

## Active Summary (input for /aif-plan)
<!-- aif:active-summary:start -->
Topic: Архитектурное направление после offline-PWA v1 — уход от хрупкости App Router
(RSC-транспорт vs app-shell model) через Next `output: 'export'` (SPA) + вынос API в
отдельный BFF-сервис; плюс чек-лист production-практик PWA (update flow, nginx headers,
lie-fi, offline E2E).

Goal: Убрать структурный источник offline-багов (per-route HTML с RSC-payload, flight-фетчи
`?_rsc=`, hard-reload при mismatch) и получить настоящий static app shell с precache-манифестом,
сохранив 100% кода страниц/FSD. Плюс закрыть production-риски: залипание обновлений SW,
lie-fi, logout офлайн.

КЛЮЧЕВОЙ ФАКТ (обследовано 2026-07-04): ВСЕ страницы уже `"use client"` (единственный
server component — root layout.tsx), данные тянутся клиентски через /api/*. Приложение —
де-факто SPA внутри враждебного транспорта App Router. SSR/RSC-выгоды не используются
вообще → static export теряет НОЛЬ функциональности страниц.

Decisions (зафиксировано с Игорем 2026-07-04):
- СЕКВЕНИРОВАНИЕ: (1) сейчас — дошипить v1 на текущей ветке feature/offline-pwa (работает,
  тяжёлое решено: outbox, IDB read-through, download manager, last-known-user — переживут
  миграцию без изменений); (2) следующая итерация — ВАРИАНТ B (static export + BFF);
  (3) rewrite на Vite — ОТВЕРГНУТ (C = B + переписать глюe-слой страниц; offline-свойства
  идентичны, выгода вкусовая, не стоит переписывания работающего кода).
- ВАРИАНТ B = Next `output: 'export'`: HTML-документы и RSC-payload'ы становятся статикой
  (enumerable, immutable) → классический precache-манифест (Workbox/@serwist/build) работает
  из коробки; класс проблем «документ не закеширован» исчезает структурно. Хак
  src/app/sw.js/route.ts умирает — sw.js обычный файл из-под /app через nginx.
- Цена B: (a) API routes (auth/bible/plan/songs/graphql/directus/ai/chat/user) → вынос в
  Hono на node — route handlers уже на Web Request/Response, почти drop-in; iron-session,
  better-sqlite3, Directus admin-client работают как были; nginx: static из out/ + proxy
  /api → hono. (b) middleware.ts (86 строк) → auth-guard на клиент (офлайн он и так
  клиентский, last-known-user), 301 легаси-URL → nginx. Оценка: дни, не недели.
- Trade-off B (осознанный): теряем опцию SSR/RSC для будущих публичных SEO-страниц —
  для устанавливаемого PWA за логином опция ничего не стоила.

Чек-лист production-практик PWA (вход для плана B, по убыванию ценности):
1. UPDATE FLOW (обязательно вместе с B): убрать skipWaiting-на-install (с precache опасен:
   старая вкладка lazy-грузит чанки, которых уже нет). Паттерн: новый SW ждёт →
   registration.waiting → toast «Доступна новая версия — Обновить» → postMessage
   ('SKIP_WAITING') → controllerchange → reload. Плюс registration.update() на
   visibilitychange (иначе установленное PWA неделями не видит новую версию).
2. NGINX CACHE HEADERS (обязательно вместе с B): sw.js → no-cache; _next/static/** →
   immutable, max-age=31536000; HTML → no-cache. Без этого SW-обновления залипают до суток.
3. LIE-FI (самый заметный UX-выигрыш): (a) NetworkFirst через Promise.race(fetch,
   timeout 3–4s) → мгновенный fallback в кеш вместо 20–30s белого экрана (captive portal,
   метро); (b) триггер синка outbox = `online` + успешный HEAD /api/health ping, не голое
   событие `online` (оно значит «есть интерфейс», не «сервер достижим»).
4. OFFLINE E2E В CI: закрепить ручные Playwright+CDP прогоны (уже делались для фикса
   43cce0a) как регрессионный сьют: cold start офлайн; навигация по всем разделам офлайн;
   отметка прогресса офлайн → синк; деплой новой версии при открытой вкладке.
5. 401 ≠ NETWORK ERROR: api-client обязан различать «сервер сказал 401 → logout» и «сети
   нет → last-known-user». Если catch сваливает оба в одно — logout в метро. Проверить
   grep'ом, закрыть одним explicit-местом в api-client + тест.
6. ЭСКАЛАЦИОННАЯ ЛЕСТНИЦА СИНКА (держать в голове, НЕ делать сейчас): идемпотентные
   отметки/LWW → текущий outbox достаточен ✅; разрослись кеш+инвалидация → TanStack Query
   + IDB persister (замена самописного read-through); multi-device/реальные конфликты/
   partial replication (офлайн-заметки, чат) → PowerSync/ElectricSQL/Replicache/RxDB —
   порог, за которым покупают, а не наращивают outbox.
Первоисточник по стратегиям: Jake Archibald, «The Offline Cookbook».

Open questions (решить на /aif-plan варианта B):
- Hono: отдельный сервис в том же Docker Compose vs sidecar-процесс (деплой на
  168.222.202.131, см. memory prod-deploy).
- manifest.ts → статический manifest.json (basePath /app учесть).
- Precache-скоуп: _next/static/** + все route HTML + RSC .txt payload'ы попадают в манифест
  целиком; 14 MB Писания — НЕ попадает (остаётся в IDB-слое, конфликта нет — проверить).
- Судьба warmAppShell/ignoreSearch-фолбэка после B: precache делает их избыточными —
  выпилить или оставить как belt-and-suspenders.
- Auth-guard на клиенте: где именно (layout vs router-обёртка), поведение при истёкшей
  сессии онлайн vs офлайн (связано с п.5 чек-листа).

Success signals (для B):
- SW — статический файл с полным precache-манифестом; src/app/sw.js/route.ts и
  .toString()-сериализация удалены.
- Cold offline start работает на ЛЮБОМ маршруте без warmAppShell-прогрева.
- Апгрейд Next не трогает offline-логику (нет зависимости от RSC-транспорта).
- Update-toast работает: деплой → открытая вкладка предлагает обновиться, без залипания
  и без битых lazy-чанков.
- Offline E2E сьют зелёный в CI.

Дополнения свежего ресерча (2026-07-08, вход для плана B):
- ИНСТРУМЕНТ PRECACHE = Serwist (преемник next-pwa, поддерживается). Для static export два
  пути: `@serwist/next` (плагин) или голый `@serwist/build` injectManifest поверх `out/` —
  второй проще и без магии плагина (у нас кастомный SW уже есть, переносим логику в sw.ts).
- КЛЮЧЕВОЙ АРГУМЕНТ Б (сформулирован явно): precache-манифест = АТОМАРНЫЙ снимок версии.
  SW v_n отдаёт консистентный набор HTML+chunks+RSC.txt; v_{n+1} активируется только когда
  всё скачано. Класс «белый экран: старый HTML просит исчезнувший чанк» исчезает by design
  (при update flow из п.1 чек-листа, без skipWaiting-на-install).
- CAVEAT next.js#59986 (closed as not planned): static export + app router при
  buildId-mismatch деградирует client-навигацию в full page load (MPA navigation).
  С атомарным precache mismatch внутри версии SW невозможен; проявляется только онлайн
  без SW-контроля, где full reload на свежий HTML = корректное самолечение. Не блокер.
- ЧЕК-ЛИСТ п.7 (belt-and-suspenders): глобальный обработчик ChunkLoadError с
  auto-reload-once + cooldown (защита от reload-loop) — страховка на переходный период
  и для юзеров с залипшим старым SW.

Дополнения 2026-07-09 (iOS-разбор; вход для плана B):
- СИМПТОМ: offline работает на Android, НЕ работает на iOS. Контрольный образец:
  ~/Projects/nbc/nbc-music-chordpro/chordpro-app (Vite + vite-plugin-pwa/Workbox
  generateSW) — на iOS offline работает идеально.
- ГИПОТЕЗА №1 (высокая вероятность): iOS партиционирует storage — у Safari-вкладки и
  установленного PWA РАЗНЫЕ Cache Storage/IndexedDB и даже SW-регистрация не переносится
  при «Добавить на экран Домой». Ручной opt-in «Скачать» кладёт данные в партицию Safari;
  установленное PWA стартует пустым и без SW (первый запуск требует сети). На Android
  storage общий → работает. Chordpro нейтрализует это by design: полный precache-манифест
  (включая все 97 .chordpro через globPatterns) приезжает автоматически при установке SW
  в ЛЮБОМ контексте. Проверить у тестировщиков: скачивали ли данные в том же контексте,
  где тестировали офлайн.
- ГИПОТЕЗА №2: handleNavigation может закешировать redirected response (/dashboard за
  middleware → редирект на /login); отдача redirected response на navigation request =
  fetch error / белый экран. Фикс: не кешировать `response.redirected`, unit-тест в
  sw-source.test.ts. Актуально и для v1 (hotfix), и для B.
- ВЫВОД: chordpro-app = живое доказательство варианта B (static SPA + атомарный precache
  + данные приезжают с SW). Vite ни при чём — Next `output: 'export'` + Serwist даёт
  идентичную offline-модель. Решение «B, не rewrite» подтверждено практикой.
- РЕШЕНИЕ (гибридная автозагрузка данных, закрывает партиционирование как класс): план +
  песни + дефолтный перевод Писания (~6 MB) качаются автоматически фоном после первого
  успешного логина существующим download manager'ом (без кнопки, с ретраем на следующий
  старт при обрыве). Остальные переводы — opt-in кнопкой как сейчас. UX = «просто
  работает», как chordpro.
- Чек-лист, дополнительные пункты (к 1–7 выше):
  8. Автозагрузка данных per-context (см. выше) + детект standalone
     (`display-mode: standalone` / `navigator.standalone`) для телеметрии/баннера.
  9. Не кешировать redirected navigation responses в SW + тест.
  10. Приёмка на реальном iPhone (Playwright WebKit ≠ iOS Safari по SW/storage!):
      установка на домашний экран → автозагрузка внутри PWA → offline cold start →
      отметка прогресса офлайн → синк при появлении сети.
- start_url после B: должен вести на страницу из precache, которая сама решает
  dashboard vs login по last-known-user (auth-guard клиентский, middleware умирает).
- iOS-ограничения для сведения: storage.persist() на iOS — пожелание, не гарантия;
  7-day ITP eviction действует на Safari-вкладку (installed PWA живёт, пока живёт
  иконка); Background Sync API отсутствует → синк только на старте/visibilitychange
  (уже так и сделано).

Контекст исполнения: реализацию плана делает Sonnet 5 → план должен быть максимально
эксплицитным (конкретные файлы, точные команды, критерии проверки на каждый таск, без
«по аналогии» и подразумеваемых шагов).

Next step: `/aif-plan full` — миграция на static export + Hono BFF (вариант B) с
чек-листом практик 1–5, 7–10 и гибридной автозагрузкой данных в скоупе.
<!-- aif:active-summary:end -->

## Sessions
<!-- aif:sessions:start -->
### 2026-07-09 11:20 — iOS offline: партиционирование storage, эталон chordpro-app
What changed:
- Новая вводная: offline работает на Android, ломается на iOS. Разобраны iOS-специфичные
  отказы; главная гипотеза — партиционирование storage Safari ≠ installed PWA (данные,
  скачанные opt-in кнопкой в Safari, не видны установленному PWA; SW-регистрация тоже
  не переносится).
- Сравнение с работающим на iOS эталоном chordpro-app: его секрет — не Vite, а полный
  Workbox precache (app shell + ВСЕ данные) при установке SW в любом контексте.
  Подтверждает вариант B и отклонение rewrite на Vite.
- Решение: гибридная автозагрузка (план+песни+дефолтный перевод — автоматически после
  логина, остальные переводы opt-in); чек-лист пополнен пунктами 8–10 (автозагрузка
  per-context, не кешировать redirected responses, приёмка на реальном iPhone).

Key notes:
- Гипотеза №2 (redirected navigation response в app-shell-html-v1 → белый экран) —
  кандидат на hotfix в v1 ещё до B.
- Playwright WebKit не воспроизводит iOS Safari по SW/storage — только реальное устройство.
- Спросить тестировщиков: контекст скачивания vs контекст офлайн-теста (Safari/PWA).

Links (paths):
- src/sw/sw-source.ts (handleNavigation — проверка redirected), src/app/sw.js/route.ts
- src/shared/offline/downloadManager.ts (точка врезки автозагрузки)
- /Users/igorvasilev/Projects/nbc/nbc-music-chordpro/chordpro-app/vite.config.ts (эталон)

### 2026-06-29 23:32 — PWA-аутентификация вне Telegram: invite+password (Вариант 1)
What changed:
- Прошли от «логин+пароль+секретное слово» к простой модели: invite+password как
  единственный источник аккаунтов, Telegram mini-app — только привязка.
- Зафиксирован ВАРИАНТ 1: все аккаунты заводятся через invite на вебе; мини-апп только
  привязывает tg_id к существующему юзеру → дублей нет by design.
- Telegram заблокирован в РФ → на вебе от Telegram уходим полностью; mini-app = вторичный
  канал для VPN-пользователей с авто-входом после привязки.
- Сервер в РФ → локализация ФЗ-152 выполнена; псевдонимная модель (без email/телефона/ФИО)
  → обязательства оператора почти нулевые.

Key notes:
- Переиспользование: `/api/auth/login` (Directus password auth) почти как есть; синтетические
  email уже в ходу; `telegram_user_mapping` остаётся, привязка = вставка строки на сущ. юзера.
- КРИТИЧНО: убрать авто-создание в findOrCreateUser при неизвестном initData (иначе дубли).
- Один механизм set-password по подписанной ссылке = и онбординг, и сброс пароля.
- Подписать session-cookie HMAC; убрать Directus access_token из cookie. Lucia пока не нужна.
- PWA — greenfield, учесть basePath `/app`.

Links (paths):
- src/lib/directus-user.ts (findOrCreateUser, telegram_user_mapping)
- src/lib/session.ts (self-rolled cookie, нужно подписать)
- src/app/api/auth/login/route.ts (Directus password auth — переиспользуем)
- src/app/api/auth/telegram/route.ts (initData verify)
- src/middleware.ts (guard /dashboard), next.config.ts (basePath /app)

### 2026-07-01 00:32 — Раздел «Песни»: chordpro→html, перенос рендера из chordpro-app
What changed:
- Новая тема. Перенос раздела песен (список/просмотр/поиск) из соседнего chordpro-app.
- Установлено ключевое расхождение: источник = Vite/MUI/router/zustand, наш = Next/
  Tailwind/Directus → перенос послойный, не drop-in.
- Зафиксирован объём: data = Directus collection `songs` (recommended), scope v1 = только
  список+просмотр+поиск, nav = 5-й пункт BottomNavBar.
- Уточнение скоупа: переносим ТОЛЬКО мобильный рендер (chordpro → html, single-column),
  без viewer-контролов. Офлайн — отдельным этапом позже (PWA уже есть).

Key notes:
- Цепочка рендера БЕЗ MUI: parseSongBlocks → SongBlock → ChordProHtmlColumn → LineRenderer
  → ChordRenderer + lineParser. Парсер (songParser/lineParser/chordProUtils) — pure TS,
  переносится as-is.
- Главный объём «с правкой» = перекрасить ported .css под тему проекта (var(--app-*),
  dark/light).
- Поиск — fuse.js на клиенте (97 песен). Список грузит только title/artist/slug.
- Разовый import-скрипт 97 .chordpro → Directus по образцу scripts/bible-import/cli.ts.
- Future: офлайн через SW cache-first; useSongs() готовить под вставку кэш-слоя.

Links (paths):
- Источник: /Users/igorvasilev/Projects/nbc/nbc-music-chordpro/chordpro-app
  - src/shared/lib/chordpro/{songParser,lineParser,chordProUtils,chordProParser}.ts
  - src/components/SongViewer/{SongBlock,ChordProHtmlColumn,LineRenderer,ChordRenderer,
    lineParser,MobileBlocksLayout}.tsx + ChordProHtml.css
  - public/data/*.chordpro (97 файлов, slug-named)
- Наш проект (точки интеграции):
  - src/shared/components/layout/BottomNavBar.tsx (+ пункт Music)
  - src/app/dashboard/ (новый раздел songs/), src/features/ (новый features/songs/)
  - scripts/bible-import/cli.ts (прецедент import-скрипта)
  - src/app/sw.js (PWA — для будущего офлайна)

### 2026-07-02 23:00 — Offline-first PWA: чтение офлайн + синк прогресса + управление данными
What changed:
- Новая тема (offline-этап, который в песнях откладывали — теперь основной).
- Обследована кодовая база: SW сейчас no-op (только install-prompt); данные делятся на
  3 класса (статика 14 MB Писание + 388 KB песни + план; юзер-стейт progress/settings;
  app shell). Мутации прогресса УЖЕ оптимистичные в PlanContext.
- Зафиксировано с Игорем: opt-in модель загрузки («Скачать» + показать/очистить),
  SCOPE v1 = полный offline (чтение + запись прогресса с синком).
- Целевая архитектура: два слоя — SW Cache API (shell/bible/songs/plan по URL) +
  IndexedDB (outbox прогресса, last-known-user, манифест загруженного). Синк = outbox +
  replay on `online`, LWW по дню. Библиотека `idb`.

Key notes:
- ЯД ДЛЯ КЕША: /api/bible/{book}/{ch} резолвит перевод из СЕССИИ → один URL/разный контент.
  Лечение: клиент шлёт явный ?translation= (роут принимает). bible-text-cache уже ключуется
  по переводу — форма верная.
- AUTH-ГЕЙТ ОФЛАЙН — главный скрытый риск: /api/auth/me офлайн падает → last-known-user в
  IDB, иначе в приложение не войти без сети и весь offline бессмыслен.
- SW-переписывание затрагивает install-prompt + hydration (фикс b4c2f01 telegram.org/splash).
- Версия: build-time timestamp (docker build arg на деплое; см. memory prod-deploy).
- Синк CRDT НЕ нужен — прогресс идемпотентен, LWW достаточно.

Links (paths):
- src/app/sw.js/route.ts (no-op SW — переписать на кеширующий)
- src/app/manifest.ts, src/components/ServiceWorkerRegistrar.tsx
- src/features/reading/bible-text-cache.ts (Map, ключ с translationId — прототип формы)
- src/features/reading/hooks/useBibleText.ts, src/app/api/bible/[book]/[chapter]/route.ts
  (перевод из сессии/?translation=; getChapterTextByTranslation, lib/bible-data)
- src/features/songs/hooks/useSongs.ts (module-cache + коммент под SW-слой)
- src/features/plan/contexts/PlanContext.tsx (оптимистичные toggleItem/Complete/Many;
  updateProgress → graphqlClient.mutate — точка врезки outbox)
- src/shared/services/api/endpoints.ts (planApi/songsApi/bibleApi/progressApi)
- src/app/dashboard/settings/page.tsx (дом для секции «Оффлайн-данные» + версия)
- data/bible/ (14 MB, 3 перевода), data/songs/ (388 KB)
- next.config.ts (basePath /app, сюда build-time timestamp)

### 2026-07-04 21:00 — Стратегия после v1: уход от App Router-хрупкости → static export SPA + BFF
What changed:
- Вопрос Игоря: Next мешает offline-PWA — перевести в SPA? переписать на Vite+React?
- КЛЮЧЕВАЯ НАХОДКА: все страницы уже "use client" (server — только root layout), данные
  клиентски через /api/* → приложение де-факто SPA, SSR/RSC-выгоды не используются. Боль
  (misclassified flight-фетчи, reload-loop от чужого HTML, .toString()-сериализация SW,
  warmAppShell, схлопывание сегментов в query) — целиком от ТРАНСПОРТА App Router
  (per-route документы с RSC-payload, одноразовые ?_rsc=), не от SSR.
- Сравнены A (остаться/патчить: работает, но налог на каждый апгрейд Next), B (Next
  `output: 'export'` + вынос API в Hono BFF: структурное решение, код страниц не трогаем,
  дни работы), C (Vite rewrite = B + переписать глюe-слой; offline-свойства те же —
  ОТВЕРГНУТ, лечит симптом ценой органа).
- РЕШЕНИЕ ИГОРЯ: вариант B, секвенированно — сначала дошипить v1 на текущей ветке,
  миграция на B следующей итерацией. Vite не делать; из состояния B уход на Vite при
  нужде тривиален (Next к тому моменту — только билдер статики).
- Зафиксирован чек-лист production-практик PWA (детально в Active Summary): update flow
  без skipWaiting + toast «Обновить»; nginx cache headers (sw.js no-cache / static
  immutable / HTML no-cache); lie-fi (race fetch vs timeout 3–4s, ping перед синком);
  offline E2E в CI (Playwright+CDP); различать 401 vs network error (иначе logout в
  метро); эскалационная лестница синка (outbox достаточен → TanStack Query persister →
  PowerSync/ElectricSQL/Replicache — не наращивать outbox за порогом).

Key notes:
- Route handlers уже на Web Request/Response → в Hono почти drop-in; iron-session/
  better-sqlite3/Directus admin-client переносятся как есть; nginx: static out/ + proxy
  /api. middleware.ts: guard → клиент (офлайн и так last-known-user), 301 → nginx.
- Static export убивает хак src/app/sw.js/route.ts: sw.js — обычный файл, HTML+RSC
  payload'ы — enumerable/immutable статика → полный precache-манифест, cold start на
  любом маршруте без прогрева.
- Осознанный trade-off B: теряем опцию SSR/RSC для будущих SEO-страниц — для PWA за
  логином не нужна.
- Защищённый актив (переживает миграцию без изменений): outbox, IDB read-through,
  download manager, last-known-user, тесты офлайн-слоя.
- Первоисточник: Jake Archibald, «The Offline Cookbook».

Links (paths):
- src/sw/sw-source.ts (+ комментарии-хроника граблей RSC/минификации) — умрёт при B
- src/app/sw.js/route.ts, src/shared/offline/appShell.ts (warmAppShell — станет избыточен)
- src/middleware.ts (86 строк: guard + 301 — распилить на клиент/nginx)
- src/app/api/* (9 групп роутов — кандидаты на Hono BFF)
- next.config.ts (output: 'standalone' → 'export' при B)
- Коммиты-хроника боли: 07430df, 43cce0a, 8e9cd4a (fix(pwa) на feature/offline-pwa)

### 2026-07-08 12:00 — Валидация варианта B свежим ресерчем + вход в /aif-plan full
What changed:
- Повторный заход на тему «стабильный offline PWA в Next» — решение от 2026-07-04
  (вариант B: static export + Hono BFF) подтверждено свежими источниками, не устарело.
- Названы конкретные инструменты: Serwist (@serwist/next либо @serwist/build
  injectManifest поверх out/ — предпочтителен второй, SW-логика уже своя).
- Явно сформулирован главный аргумент B: атомарность precache-снимка структурно убирает
  ChunkLoadError/белый экран (старый HTML + исчезнувшие чанки).
- Найден caveat next.js#59986 (buildId mismatch → MPA navigation в static export) —
  разобран, не блокер: под SW-контролем mismatch невозможен, онлайн full reload = самолечение.
- В чек-лист добавлен п.7: глобальный ChunkLoadError-guard c auto-reload-once + cooldown.
- v1 offline-PWA смержен в main — предпосылка для B выполнена.
- Зафиксировано: реализацию будет делать Sonnet 5 → план пишется максимально эксплицитно.

Key notes:
- Источники: serwist.pages.dev/docs/next/getting-started; nextjs.org/docs/app/guides/
  progressive-web-apps; github.com/vercel/next.js/issues/59986; sentry.io/answers/
  chunk-load-errors-javascript; blog.logrocket.com/nextjs-16-pwa-offline-support.

Links (paths):
- .ai-factory/RESEARCH.md Active Summary (дополнения 2026-07-08 влиты туда же)
<!-- aif:sessions:end -->
