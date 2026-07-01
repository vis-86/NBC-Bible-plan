# План: Раздел «Песни» (ChordPro)

**Branch:** `feature/songs-section`
**Создан:** 2026-07-01
**Тип:** feature

## Settings

- **Testing:** Yes — юнит-тесты на ядро парсера/рендера (parseSongBlocks, parseLine) и useSongSearch (Vitest, уже в проекте)
- **Logging:** Standard — ключевые события (загрузка списка, ошибки парсинга/Directus, счётчики); без verbose DEBUG
- **Docs:** No — warn-only (фича самодостаточная; `/aif-implement` эмитит `WARN [docs]`, без обязательного чекпоинта)

## Roadmap Linkage

Milestone: "none"
Rationale: ROADMAP.md отсутствует в проекте.

## Research Context

Из `.ai-factory/RESEARCH.md` (Active Summary):

- **Цель:** каталог песен ChordPro для community НБЦ — список + просмотр (chordpro → html, аккорды над текстом, мобильный single-column) + поиск.
- **Источник:** `/Users/igorvasilev/Projects/nbc/nbc-music-chordpro/chordpro-app` — Vite/MUI/router/zustand SPA. Перенос **послойный, не drop-in**.
- **Решения (зафиксировано):**
  - Data source = **Directus collection `songs`** (content = сырой chordpro), разовый import 97 .chordpro.
  - Scope v1 = **только список + просмотр + поиск**. OUT: транспонирование, колонки, автоскролл, сетлисты, аннотации/рисование, A4 PDF, font-size контролы.
  - Поиск = **fuse.js на клиенте** (97 песен), индекс по title+subtitle.
  - Nav = **5-й пункт `Music` в BottomNavBar**.
  - URL = **числовой id** (`/dashboard/songs/42`) — без проблем с кириллицей.
  - Коллекция Directus создаётся **import-скриптом авто** (admin-token).
- **Главный объём «с правкой»:** перекрасить ported `.css` под тему проекта (`var(--app-*)`, dark/light) и **выпилить zustand** (`useSettingsStore`) из `ChordProHtmlColumn` → props.
- **Future (отдельный этап):** офлайн через SW cache-first; `useSongs()` спроектировать под вставку кэш-слоя без переписывания.

### Цепочка рендера (БЕЗ MUI), переносится из источника
```
parseSongBlocks(content)        lib/songParser.ts        ← pure TS, as-is
  └→ SongBlock                  React + songs.css
       └→ ChordProHtmlColumn    React (strip useSettingsStore → props)
            └→ LineRenderer / TableLineRenderer
                 └→ ChordRenderer + lineParser   ← аккорд-над-словом, pure
```

### Точки интеграции (наш проект)
- `src/lib/directus.ts` → `getDirectusAdminClient()` (staticToken DIRECTUS_ADMIN_TOKEN)
- `src/lib/directus-schema.ts` → `DirectusSchema` (+ `songs`)
- Arch-правило «API Route Proxy for Directus»: клиент НЕ ходит в Directus напрямую → нужны `/api/songs[/id]` роуты
- `src/shared/services/api/{client,endpoints}.ts` → apiClient + typed `songsApi`
- Паттерн страниц: `'use client'` + хуки (`usePlan`/`useProgress` как образец), `DashboardLayout`
- `src/shared/components/layout/BottomNavBar.tsx` → +пункт Music
- `scripts/bible-import/cli.ts` → прецедент import-скрипта; `package.json` npm-script

## Целевая структура
```
src/features/songs/
  types.ts
  lib/        chordProUtils.ts, songParser.ts, lineParser.ts, chordProParser.ts
  components/
    render/   ChordRenderer, LineRenderer, TableLineRenderer, ChordProHtmlColumn,
              SongBlock, songs.css
    SongView.tsx, SearchBar.tsx, SongList.tsx, SongCard.tsx
  hooks/      useSongs.ts, useSong.ts, useSongSearch.ts
  services/   (типы ответов; вызовы через shared endpoints)
src/app/api/songs/route.ts            (GET список)
src/app/api/songs/[id]/route.ts       (GET одна)
src/app/dashboard/songs/page.tsx      (список + поиск)
src/app/dashboard/songs/[id]/page.tsx (просмотр, hideBottomNav)
scripts/songs-import/bootstrap.ts     (создать коллекцию; npm: songs:bootstrap)
scripts/songs-import/cli.ts           (parse+upsert; npm: songs:import)
data/songs/*.chordpro                 (97 файлов, в репо)
```

> Уточнения после `/aif-improve` (детали в описаниях задач):
> - tsx **не резолвит `@/`** → скрипты импортят парсер относительным путём.
> - `createCollection`/`createField` — **без прецедента** в репо (есть только `createItems`); сверять payload с `@directus/sdk` v20.
> - Тема: точные токены `--app-bg/-text/-text-muted/-text-secondary/-primary/-border`.
> - API-роуты в стиле `NextResponse.json` + `console.error('[Songs API]')`.
> - `songs/[id]` — `hideBottomNav` (фокус-режим, как `/read/`).
> - `fuse.js`: определить канонический lockfile (в репо и yarn.lock, и package-lock.json).

## Tasks

### Фаза 1 — Перенос ядра (parser + render)
- [x] **#52** Перенести ChordPro parser в `features/songs/lib` (+ tests parseSongBlocks/parseLine)
- [x] **#53** Перенести render-цепочку, **выпилить zustand**, перекрасить CSS под тему *(blocked by #52)*
- [x] **#54** `SongView`: обёртка chordpro → single-column (порт MobileBlocksLayout без scroll/active) *(blocked by #53)*

### Фаза 2 — Directus + серверный слой данных
- **#55** Directus `songs` в DirectusSchema + bootstrap-скрипт коллекции (idempotent, npm `songs:bootstrap`)
- **#62** Импорт данных: 97 .chordpro → Directus (`data/songs/`, parse+upsert, npm `songs:import`) *(blocked by #52, #55)*
- **#56** API-роуты `/api/songs` и `/api/songs/[id]` (admin-client proxy, стиль NextResponse.json) *(blocked by #55)*
- **#57** `songsApi` в endpoints.ts + типы ответов *(blocked by #56)*

### Фаза 3 — UI: хуки, страницы, навигация
- **#58** Хуки `useSongs` + `useSong` + `useSongSearch` (fuse.js, +зависимость) *(blocked by #57)*
- **#59** Страница списка `/dashboard/songs` + SearchBar/SongList/SongCard *(blocked by #58)*
- **#60** Страница песни `/dashboard/songs/[id]` *(blocked by #54, #58)*
- **#61** Пункт «Песни» (Music) в BottomNavBar *(blocked by #59)*

## Commit Plan

- **Commit 1** (после #52–#54): `feat(songs): port chordpro parser + render core (no zustand/MUI)`
- **Commit 2** (после #55, #62, #56, #57): `feat(songs): directus songs collection, bootstrap+import scripts, API proxy`
- **Commit 3** (после #58–#61): `feat(songs): list/search/view pages + bottom nav entry`

## Открытые вопросы / заметки
- Слой офлайн-кэша — **вне этого плана** (отдельный этап). `useSongs()` держать с одной точкой fetch под будущую вставку.
- Теги/категории песен — отложено.
- `TableLineRenderer` включён в порт, чтобы не сломать chordpro-таблицы (`{start_of_table}`); если в данных таблиц нет — можно убрать на ревью.
