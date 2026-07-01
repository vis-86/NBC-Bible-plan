# Research

Updated: 2026-07-01 00:32
Status: active

## Active Summary (input for /aif-plan)
<!-- aif:active-summary:start -->
Topic: Новый раздел «Песни» — список + просмотр (chordpro → html) + поиск. Перенос
рендера из соседнего проекта chordpro-app. Офлайн — отдельным этапом позже.

Goal: Дать community НБЦ каталог песен в формате ChordPro: список с поиском, просмотр
песни с аккордами над текстом (мобильный single-column рендер). Переиспользовать ядро
рендера из chordpro-app по максимуму, без затаскивания его тяжёлой поверхности.

Источник (chordpro-app): /Users/igorvasilev/Projects/nbc/nbc-music-chordpro/chordpro-app
- Стек источника ≠ наш: Vite SPA + MUI v7 + react-router v7 + zustand + fuse.js.
- Наш стек: Next 16 App Router + Tailwind v4/shadcn + lucide + Directus + iron-session.
- => перенос послойный, НЕ drop-in.

Что переносим (мобильный рендер chordpro → html, цепочка БЕЗ MUI):
  parseSongBlocks(content)        shared/lib/chordpro/songParser.ts   ← pure TS, as-is
    └→ SongBlock                  React + .css, no MUI
         └→ ChordProHtmlColumn    React + .css
              └→ LineRenderer     React + .css
                   └→ ChordRenderer + lineParser   ← аккорд-над-словом, pure
  Из MobileBlocksLayout берём только маппинг блоков; выкидываем scrollIntoView/
  active-block (это для автоскролла/подсветки — вне скоупа).
  Парсер as-is: songParser.ts, lineParser.ts, chordProUtils.ts (+ chordProParser.ts
  для метаданных при импорте).

Decisions (зафиксировано):
- DATA SOURCE = Directus collection `songs`, content = сырой chordpro-текст.
  Консистентно с остальным app (plan/reading/chat_history живут в Directus), прод
  пересобирается из исходников. Разовый import-скрипт из 97 .chordpro
  (прецедент: scripts/bible-import/cli.ts).
- SCOPE v1 = ТОЛЬКО список + просмотр + поиск. Мобильный single-column рендер
  (chordpro → html). OUT: транспонирование, колонки, автоскролл, сетлисты,
  рисование/аннотации, A4 PDF, font-size контролы.
- ПОИСК = fuse.js на клиенте (97 песен — мало). Грузим список один раз, индекс по
  title + artist/subtitle. Directus-фильтр — оверкилл.
- NAV = 5-й пункт в BottomNavBar (иконка lucide `Music`, href /dashboard/songs).
- ТЕМА: ported `.css` (ChordProHtml.css + классы song-block-*) с фикс-цветами →
  перекрасить под тему проекта (var(--app-*), поддержка dark/light). Это основной
  объём работы «с правкой».

Целевой скелет (FSD проекта):
  src/features/songs/
    lib/        songParser, lineParser, chordProUtils   (порт as-is)
    components/ SongList, SongCard, SongView, SongBlock, ChordProHtmlColumn,
                LineRenderer, ChordRenderer + songs.css (перекрашенный)
    hooks/      useSongs(), useSongSearch(fuse)
    services/   songsApi → /api/directus proxy
  src/app/dashboard/songs/page.tsx          ← список + поиск
  src/app/dashboard/songs/[slug]/page.tsx   ← просмотр песни
  BottomNavBar: + { id:'songs', icon: Music, href:'/dashboard/songs' }
  scripts/songs-import/cli.ts               ← разовый импорт 97 .chordpro → Directus

Open questions (решить на /aif-plan):
- Схема `songs` в Directus: id, title, slug(unique), subtitle/artist, content(chordpro),
  key, tempo, time, status(published/draft), sort. Теги/категории — отложить.
- Slug в URL: файлы уже slug-named, но кириллица (`1-аллилуйя…`) → encodeURIComponent
  либо использовать numeric id. Решить на плане.
- Payload: список тянет только title/artist/slug (НЕ весь content); полный content —
  на странице песни по slug.
- Песни как Server Component (fetch на сервере) vs client + apiClient — определить
  по паттерну reading/plan фич.

Future-note (офлайн, отдельный этап):
- bible-plan уже PWA (src/app/sw.js + manifest, basePath /app). Офлайн-песни позже =
  закэшировать ответы songs-API + страницы в SW (cache-first) или localStorage-снапшот
  списка. Directus остаётся источником; useSongs() спроектировать так, чтобы кэш-слой
  вставлялся потом без переписывания.

Success signals:
- Раздел «Песни» в нижней навигации; список 97 песен с рабочим поиском (fuzzy, терпит
  опечатки/раскладку).
- Открытие песни → корректный рендер аккордов над текстом, читается на телефоне,
  совпадает по теме с остальным приложением (dark/light).
- Ядро рендера переиспользовано из chordpro-app, без MUI/zustand/router в нашем коде.

Next step: /aif-plan full — раздел «Песни»: Directus-коллекция + import-скрипт, порт
рендера chordpro→html (songParser/LineRenderer/ChordRenderer), список+поиск(fuse),
страницы /dashboard/songs и /dashboard/songs/[slug], пункт в BottomNavBar.
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
<!-- aif:sessions:end -->
