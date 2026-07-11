# Implementation Plan: UI/UX дизайн-система — типографика, токены, микро-взаимодействия

Branch: feature/ui-ux-design-system (создана от `feature/static-export-hono-bff`, НЕ от main — main отстаёт на несмерженную static-export работу)
Created: 2026-07-10

## Settings
- Testing: no (новых тестов не пишем; существующие обязаны проходить)
- Logging: minimal (стилевой рефакторинг; runtime-логировать нечего, precache-бюджет уже логируется в build-sw.ts)
- Docs: yes — обязательный docs-чекпойнт в /aif-implement (задача 11, через /aif-docs)

## Roadmap Linkage
Milestone: "none"
Rationale: .ai-factory/ROADMAP.md отсутствует в проекте.

## Research Context
Source: .ai-factory/RESEARCH.md (Active Summary)

Активная тема research — миграция на static export + Hono BFF (уже реализована на базовой ветке); к этой задаче напрямую не относится. Релевантное ограничение из неё: прод = статический `out/` + Serwist precache SW → все шрифты обязаны быть self-hosted через next/font (билд-тайм, попадают в precache), бюджет precache ≤15MB (warn в `scripts/build-sw.ts:48-50`).

## Источник требований

Файл `uiux-dry.txt` (Игорь: «возьми то, что подойдёт») + установленные скиллы:
- `.claude/skills/ui-ux-pro-max` — стили/палитры/типографика/UX-чек-листы (приоритеты: a11y и touch — CRITICAL)
- `.claude/skills/emil-design-eng`, `apple-design`, `animation-vocabulary`, `review-animations` — дисциплина анимаций и полировка

Решения, принятые с Игорем (2026-07-10):
- **Шрифты: Literata (длинное чтение — Библия, куплеты песен) + Inter (UI) + Geist Mono (аккорды/цифры, уже подключён).** Geist Sans из uiux-dry.txt отклонён: кириллица Geist слабее обкатана, гротеск хуже для длинного чтения. Выпадают Plus Jakarta Sans, Lora, Geist Sans → семейств становится 3 вместо 4.
- Палитру НЕ менять: токен-система «Sacred Minimal» (`--app-*`, indigo primary) уже есть и последовательно используется. Рекомендацию ui-ux-pro-max «spiritual purple» не берём — берём только чек-листы (контраст AA, 44×44px, focus, reduced-motion).
- Единый стиль: шкала радиусов с правилом вложенности (базовый 12px), мягкие многослойные тени, adoption общих примитивов (Button/Card/PageHeader) вместо самописных кнопок на каждом экране.

## Что показала разведка (ключевое)

- Tailwind v4 CSS-first (`@theme inline` в `src/app/globals.css`), dark mode через `data-theme`; `border-gray-*` в коде нет — токены используются почти везде.
- Главные разрывы единого стиля: общий `Button` существует, но не используется экранами; 3 конкурирующих паттерна заголовков; радиусы скачут (`rounded-lg`…`rounded-[32px]`); `PastorChat.tsx` — единственный компонент на сырых цветах.
- `whileTap` не используется нигде; press-отклик только `active:scale-95` в неиспользуемом Button.
- Размер шрифта чтения применяется inline-стилем на каждом `<p>` в `BibleText.tsx` — переносим на CSS-переменные контейнера.
- Песни: `songs.css` — легаси-порт с float-позиционированием аккордов; аккорды сейчас Verdana.

## Инварианты (НЕ ломать)

1. `DayNavigationBar` — perf-critical (React.memo/useTransform): менять только визуальные пропсы.
2. `songs.css` float-механика `.chordWrapper`/`.wordWrapper` — только font-family/размеры/цвета.
3. Verse-anchor/verse-per-line инфраструктура (коммиты b72a47d, 4a9e23e) и парсинг номеров стихов.
4. Safe-area/Telegram-CSS в globals.css (`.pt-safe`, `.pb-nav`, `--dock-nav-actual-h`, overscroll-блок) — load-bearing.
5. Static export: только self-hosted шрифты (next/font), следить за precache-бюджетом.
6. Бизнес-логика и стейт не меняются — только стили, разметка и конфигурация.

## Commit Plan
- **Commit 1** (задачи 1-2): `feat(design): font system Inter+Literata+Geist Mono, radius/shadow tokens`
- **Commit 2** (задачи 3-4): `feat(design): reading & songs typography on Literata`
- **Commit 3** (задачи 5-7): `refactor(ui): adopt Button/Card/PageHeader primitives, retokenize PastorChat`
- **Commit 4** (задачи 8-9): `feat(ui): touch targets, focus rings, micro-interactions`
- **Commit 5** (задачи 10-11): `docs: design system reference` (+ фиксы по итогам верификации)

## Tasks

### Phase 1: Фундамент — шрифты и токены
- [x] Task 1: Шрифтовая система Inter + Literata + Geist Mono через next/font (`src/app/layout.tsx`, `src/app/globals.css`; убрать Plus Jakarta/Lora/Geist Sans и legacy `body { font-family: Arial }`; проверить precache-бюджет)
- [x] Task 2: Токены — шкала радиусов (base 12px, вложенность outer>inner), мягкие многослойные тени, аудит контраста AA обеих тем (`globals.css`)
<!-- Commit checkpoint: tasks 1-2 -->

### Phase 2: Типографика контента (главная ценность)
- [x] Task 3: Чтение Библии — Literata, font-size/line-height через CSS-переменные на `<article>` вместо inline per-`<p>`, стиль номеров стихов (`src/shared/components/bible/BibleText.tsx`, `VerseOfTheDay.tsx`) (depends on 1, 2)
- [x] Task 4: Песни — лирика Literata, аккорды Geist Mono вместо Verdana, карточки на токенах (`src/features/songs/components/render/songs.css`, `SongView.tsx`, `SongCard.tsx`) (depends on 1, 2)
<!-- Commit checkpoint: tasks 3-4 -->

### Phase 3: Единый стиль компонентов
- [x] Task 5: Обновить `Button` (44px, press-отклик, focus-ring), создать `Card`, внедрить по экранам (settings, PlanView, CalendarView, ReadingSettingsForm, pickers) (depends on 2)
- [x] Task 6: Унифицировать заголовки через `PageHeader` (PlanView, SongView; ReadingHeader — только токены) (depends on 5) — SongView уже был на PageHeader (song/page.tsx); ReadingHeader аудирован, уже на токенах (тема ридера намеренно независима от app dark mode); PlanView greeting — задокументированное исключение в PageHeader.tsx (прозрачный editorial-хедер, бровь красится отдельной fixed-полоской — форсировать PageHeader сломало бы этот инвариант)
- [x] Task 7: Ретокенизация `PastorChat.tsx` — сырые цвета → `app-*` токены (depends on 2)
<!-- Commit checkpoint: tasks 5-7 -->

### Phase 4: Эргономика и движение
- [ ] Task 8: Тач-таргеты ≥44px (BottomNavBar min-h, контролы настроек), focus-visible, aria-label на иконках
- [ ] Task 9: Микро-взаимодействия — whileTap/active:scale press-отклик, fade+rise entrance ≤250ms out-expo, только transform/opacity, reduced-motion (depends on 5)
<!-- Commit checkpoint: tasks 8-9 -->

### Phase 5: Верификация и документация
- [ ] Task 10: lint + тесты + build + precache-бюджет + визуальная проверка Chrome 375px (light/dark/sepia, verse-per-line, плотные аккорды) + чек-лист ui-ux-pro-max (depends on 3-9)
- [ ] Task 11: Docs-чекпойнт — `docs/design-system.md` через /aif-docs, обновить DESCRIPTION.md (depends on 10)
<!-- Commit checkpoint: tasks 10-11 -->
