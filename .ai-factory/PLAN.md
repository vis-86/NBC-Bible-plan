# Plan: Кнопка перехода к чтению дня в попапе календаря

**Branch:** feature/unify-page-headers (текущая, ветка не создавалась — fast mode)
**Created:** 2026-07-02
**Type:** enhancement

## Description

В календаре при клике на день открывается BottomSheet «Действия с выбранными днями» со списком выбранных дней (`День N`). Нужно в каждой строке дня добавить кнопку, по которой можно сразу перейти к чтению этого дня.

## Settings

- **Testing:** Yes — component-тест на новую навигацию + unit на helper
- **Logging:** Verbose — `console.debug` при клике навигации, `console.warn` при неразрешимой ссылке
- **Docs:** No (warn-only)

## Roadmap Linkage

Milestone: "none" — Rationale: ROADMAP.md отсутствует в проекте.

## Context (findings)

- Целевой попап — **Context Menu BottomSheet** в `CalendarView.tsx` (открывается по одиночному клику, `handleDayClick` → `selectedDays`), рендерит список `День {id}` (строки ~528-543). Это и есть «список дней» из запроса.
- Второй попап (double-click, `CalendarDayDetail`) показывает список **глав** и уже имеет кнопку «Перейти к чтению» — его не трогаем, но переиспользуем общий helper.
- Навигация идёт через `onSelectReading(day, reading)` → `handleSelectReading` в `calendar/page.tsx`, который строит путь `/dashboard/read/{book}/{chapter}?day&item` и делает `router.push`.
- Логика выбора «первой главы дня» уже есть в `CalendarDayDetail.handleStartReading` (первая непрочитанная → первая → `readings[0]`) — выносим в shared helper во избежание дублирования.

## Decisions

- **Размещение:** кнопка в **каждой строке дня** (работает при любом числе выбранных дней). Клик закрывает попап и открывает первую непрочитанную главу дня.
- **Тесты:** да (component + unit helper).

## Tasks

### Phase 1 — Shared logic
- [x] 1. **getDayFirstReading в `src/shared/utils/bible.ts`** — чистая функция резолва первой читаемой главы дня (первая непрочитанная item → первая item → `readings[0]` → null). `console.warn` на null.

### Phase 2 — UI
- [x] 2. **Кнопка перехода в строке дня** (`CalendarView.tsx`, список выбранных дней) — иконка-кнопка на строку, `stopPropagation`, резолв через `getDayFirstReading`, закрытие попапа + `onSelectReading`. `console.debug` при клике. _(depends: 1)_
- [x] 3. **Рефактор `CalendarDayDetail`** — заменить локальную логику `handleStartReading` на `getDayFirstReading`, поведение идентично. _(depends: 1)_

### Phase 3 — Tests
- [x] 4. **Component-тест `CalendarView.test.tsx`** — выбор дня → клик по кнопке строки → `onSelectReading` с ожидаемым reference + закрытие попапа; unit на `getDayFirstReading`. _(depends: 2)_

## Commit

Единый коммит (4 задачи): `feat(calendar): add per-day "go to reading" button in selected-days sheet`

## Next Steps

Запусти `/aif-implement` для выполнения плана. Просмотр задач — `/tasks` или TaskList.
