# Research

Updated: 2026-07-02 23:00
Status: active

## Active Summary (input for /aif-plan)
<!-- aif:active-summary:start -->
Topic: Offline-first PWA — Писание, песни и план чтения работают без сети + синхронизация
прогресса при появлении интернета. В профиле/настройках: показ загруженных offline-данных,
кнопка «очистить», версия приложения (дата обновления).

Goal: Дать community НБЦ пользоваться приложением офлайн (метро, дача, плохая связь):
читать Писание/песни/план, отмечать прогресс — с прозрачной синхронизацией и управлением
локальным хранилищем. SCOPE v1 = ПОЛНЫЙ offline (чтение + запись прогресса с синком).

Реалии кодовой базы (обследовано 2026-07-02):
- SW сейчас ПУСТЫШКА: src/app/sw.js/route.ts отдаёт install/activate + `fetch(){}` (no-op),
  существует только ради install-prompt в Chrome. Кеширования НОЛЬ.
- Данные — три разных класса с разной offline-семантикой:
  ① СТАТИКА (общая, read-only): Писание 14 MB (3 перевода: rst/kassian2019/nrt2019,
    data/bible/*.json) через /api/bible/{book}/{ch}; песни 388 KB (97 шт) через
    /api/songs(+/[id]); план+недельный через /api/plan (Directus).
  ② ЮЗЕР-СТЕЙТ (мутируется): progress (по дням), reading/app settings → GraphQL мутации.
    Мутации в PlanContext УЖЕ оптимистичные (локальный стейт → потом сеть) — половина
    синка бесплатно.
  ③ APP SHELL: Next standalone за nginx, basePath /app.
- Существующие in-memory кеши (теряются на reload), но уже с правильной формой:
  bible-text-cache.ts (Map, ключ включает translationId ✅); useSongs (module-cache +
  коммент «сюда встанет SW cache-first слой» ✅).

Decisions (зафиксировано с Игорем):
- МОДЕЛЬ ЗАГРУЗКИ = OPT-IN «Скачать». Юзер явно тянет перевод(ы)/песни через кнопку,
  видит размер, может очистить. НЕ тихий precache-всё (14 MB на мобильном неприемлемо).
  Совпадает с требованием «показать загруженные данные + очистить».
- SCOPE v1 = ПОЛНЫЙ offline: чтение (Писание/песни/план) + отметки прогресса offline
  через outbox-очередь и синк при сети.
- ДВА СЛОЯ ХРАНИЛИЩА (не «или-или»):
  • SW Cache API — request/response по URL: app shell (precache), /api/bible?translation=X
    (cache-first, наполняется opt-in загрузкой), /api/songs (cache-first), /api/plan (SWR).
  • IndexedDB — структурные данные: outbox мутаций прогресса; last-known-user (пускать в
    приложение офлайн); манифест загруженного (размеры для «показать/очистить»).
- СИНК ПРОГРЕССА = outbox + replay, LAST-WRITE-WINS по dayId (мутации идемпотентны,
  настоящего merge-конфликта нет → CRDT НЕ нужен). Триггер replay: событие `online` +
  опц. Background Sync API. Dedup по последней записи на день.
- БИБЛИОТЕКА IDB = предложить `idb` (~1 KB промис-обёртка). Сырой IndexedDB болезнен,
  Dexie избыточен для outbox+манифеста. Обосновать в плане (правило: не тащить зависимость
  без обоснования).
- SW-СТРАТЕГИЯ = ВАРИАНТ C (ГИБРИД). Свой SW-body отдаётся через существующий
  src/app/sw.js/route.ts (basePath /app scope уже решён — serwist/next этого НЕ умеет из
  коробки за nginx). Precache-манифест чанков Next (с revision-хешами, авто-инвалидация на
  деплое) генерит `@serwist/build injectManifest` как BUILD-step. Runtime-стратегии пишем
  сами (cache-first статика, SWR план — ~30 строк, полный контроль, нет риска что Workbox
  precache-нёт 14 MB Писания). ОТВЕРГНУТО: @serwist/next (конфликт с basePath-отдачей +
  неизвестная совместимость с Next 16.2.4); чистый ручной precache (хрупкий manifest хешей).
- ХОЛОДНЫЙ ОФЛАЙН-СТАРТ = В СКОУПЕ v1. Закрыл приложение → нет сети → открыл заново →
  работает. Именно это требует precache чанков (→ обоснование для @serwist/build). НЕ
  «только уже открытое приложение переживает потерю сети».
- ВАЖНО про app-shell: страницы SSR+auth → статического shell-HTML НЕТ. Precache = только
  JS/CSS-чанки Next; HTML-документы кешируются РАНТАЙМ (NetworkFirst/SWR), не precache;
  offline-вход обеспечивает last-known-user + клиентский рендер из кешей.
- ВЕРСИЯ = инжектить build-time timestamp (напр. NEXT_PUBLIC_BUILD_TIME в next.config при
  сборке) + версия SW-кеша; показать в секции настроек.

Как развязаны ключевые тензии:
- Переводозависимый URL: /api/bible/{book}/{ch} для залогиненного резолвит перевод ИЗ
  СЕССИИ → один URL, разный контент = яд для кеша. ЛЕЧЕНИЕ: клиент Писания обязан ходить
  с явным ?translation= (роут уже принимает param) → URL стабилен и кешируем per-перевод.
- Auth-гейт офлайн: приложение за session-cookie; офлайн /api/auth/me упадёт → риск не
  пустить юзера в приложение вообще. ЛЕЧЕНИЕ: last-known-user в IDB, useAuth читает кеш
  офлайн и не блокирует.
- App shell precache за basePath /app: пути ассетов должны совпасть со scope SW (та же
  грабля, что решали для отдачи sw.js из-под basePath).

UI (существующая страница настроек src/app/dashboard/settings/page.tsx — просто новая секция):
  «Оффлайн-данные»: Писание(перевод) — размер — [Скачать]; Песни — статус; План — статус;
  [Очистить всё оффлайн-хранилище]. Ниже: «Версия: YYYY.MM.DD (обновлено N дней назад)».

Скрытые риски для плана:
1. Переписывание no-op SW на кеширующий затронет install-prompt и hydration — был фикс
   b4c2f01 (unblock hydration from telegram.org + loading splash). Осторожно с fetch-хендлером.
2. Offline сессии нет → клиент Писания ОБЯЗАН слать перевод явно, иначе cache-miss.
3. Precache app shell в Next standalone за nginx basePath /app — scope/paths.
4. «Очистить» = caches.delete(имена) + idb.clear + сброс манифеста; не задеть SW-регистрацию.

Open questions (решить на /aif-plan):
- [РЕШЕНО] Стратегия SW = Вариант C (гибрид: свой SW-body через route.ts +
  @serwist/build injectManifest для precache-манифеста чанков). См. Decisions.
- Spike: как отдать SW-body с ИНЖЕКТИРОВАННЫМ манифестом через route.ts. Варианты:
  (a) injectManifest пишет .next-артефакт, route.ts читает его и отдаёт строкой;
  (b) SW собирается отдельным build-шагом в файл, route.ts инлайнит содержимое.
  Проверить, что self.__SW_MANIFEST плейсхолдер корректно подставляется при нашей отдаче.
- Precache-скоуп: только статические чанки Next (_next/static/**), НЕ HTML SSR-страниц,
  НЕ data/bible. Убедиться что 14 MB Писания не попадает в manifest.
- Runtime-роутинг document-запросов (HTML) офлайн: NetworkFirst с fallback на кешированный
  последний dashboard vs отдельная offline-страница. Определить на плане.
- Outbox схема IDB: {dayId, count, completedItems, ts, op}; ключ по dayId (LWW) vs append-log.
- Where writes hook in: перехват в PlanContext.updateProgress (всегда в outbox + попытка
  сети) vs SW-перехват POST /graphql. Клиентский outbox проще и явнее.
- Показ размера загруженного: считать из манифеста (что качали) vs обход ключей Cache API.
- Версия: NEXT_PUBLIC_BUILD_TIME на сборке (docker build arg) — согласовать с deploy
  (rsync + docker compose build на 168.222.202.131; см. memory prod-deploy).

Success signals:
- ХОЛОДНЫЙ СТАРТ офлайн: приложение закрыто → нет сети → открыл заново → грузится и
  работает (чанки из precache, вход по last-known-user).
- В самолётном режиме: вход в приложение (last-known-user), чтение скачанного Писания,
  всех песен и плана; отметки прогресса ставятся и сохраняются.
- При возврате сети прогресс, сделанный офлайн, синхронизируется (LWW), без дублей/потерь.
- В настройках виден список загруженного с размерами, «очистить» реально освобождает
  Cache API + IndexedDB, версия/дата обновления отображается корректно.

Next step: /aif-plan full — offline-first PWA v1 (Вариант C): свой SW-body через
src/app/sw.js/route.ts + @serwist/build injectManifest (precache чанков Next для холодного
старта) + свои runtime-стратегии (cache-first bible?translation/songs, SWR plan, NetworkFirst
HTML), opt-in download manager, IDB (idb) outbox для прогресса + replay on online (LWW),
last-known-user для offline-входа, секция «Оффлайн-данные» + версия в настройках,
build-time timestamp. Начать с spike отдачи SW с инжектированным манифестом через route.ts.
<!-- aif:active-summary:end -->

## Sessions
<!-- aif:sessions:start -->
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
<!-- aif:sessions:end -->
