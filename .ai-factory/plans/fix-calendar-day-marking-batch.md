# Fix: отметка дней в календаре + батч-запрос для «отметить все»

**Slug:** fix-calendar-day-marking-batch
**Branch:** main (без ветки — full mode)
**Created:** 2026-07-02

## Settings

- **Testing:** yes (Vitest unit — batch resolver + `toggleCompleteMany`)
- **Logging:** verbose (`console.log`/`debug` на границах батч-операций)
- **Docs:** warn-only (внутренняя правка, отдельный docs-чекпоинт не обязателен)

## Roadmap Linkage

- Milestone: "none"
- Rationale: `.ai-factory/ROADMAP.md` отсутствует — линковка невозможна.

---

## Проблема (что чиним)

В `CalendarView.tsx` все массовые действия сделаны циклом `for (dayId of ...) await onToggleComplete(dayId)`:

1. **N запросов вместо одного.** «Отметить пропущенные», «Отметить»/«Отменить» для выбранных дней шлют по одному GraphQL-мутейшену на каждый день (`PlanContext.toggleComplete` → `graphqlClient.mutate`). Для 50–100 пропущенных дней это 50–100 последовательных round-trip'ов: медленно, при частичном сбое остаётся неконсистентное состояние.

2. **Баг Undo.** `handleMarkSelected`/`handleUnmarkSelected` сохраняют в `lastActionDaysRef` **все** выбранные дни (`[...selectedDaysArray]`), но реально меняют только подмножество (`daysToMark`/`daysToUnmark` — только не-/отмеченные). `handleUndo` затем слепо `toggle`-ит **все** сохранённые дни → дни, которые не менялись, переворачиваются в противоположное состояние. Отмена портит данные.

3. **`toggle`-семантика в батче ненадёжна.** Групповое действие должно быть идемпотентным «установить completed=true/false», а не «переключить» — иначе повторный клик/гонка состояния даёт неверный результат.

## Решение (сквозной explicit-batch)

Ввести явную операцию «установить completed для набора дней» на всех слоях, один сетевой запрос:

- **Backend resolver** `UpdateProgressBatch(days, completed)` — фиксированное число запросов к Directus (bulk `readItems`/`createItems`/`updateItems`/`deleteItems`), а не по дню. Admin-client + фильтр по `directus_id` (как в существующем `UpdateProgress`). ⚠️ Диспетчить **раньше** ветки `UpdateProgress` — иначе substring-collision `updateProgress` ⊂ `updateProgressBatch` уводит батч в single-day ветку.
- **GraphQL client** — `progressMutations.updateProgressBatch(days, completed)`.
- **PlanContext** — `toggleCompleteMany(dayIds, completed)`: один оптимистичный апдейт состояния для всех дней + один `mutate`. `toggleComplete`/`toggleItem` (одиночные) остаются.
- **CalendarView** — все три хендлера + Undo переведены на `onToggleCompleteMany`; `lastActionDaysRef` хранит фактически изменённые дни и направление, Undo применяет инверсию только к ним.

Затрагиваемые файлы: `src/app/api/graphql/route.ts`, `src/shared/services/api/graphql.ts`, `src/features/plan/contexts/PlanContext.tsx`, `src/features/plan/hooks/useProgress.ts`, `src/features/plan/components/CalendarView.tsx`, `src/app/dashboard/calendar/page.tsx` (+ тесты).

---

## Tasks

### Phase 1 — Backend
- ✅ **#1 Batch progress resolver** — `src/app/api/graphql/route.ts`: ветка `UpdateProgressBatch(days, completed)`, bulk-операции Directus (`createItems`/`updateItems`/`deleteItems` подтверждены в SDK и уже используются), admin-client + `directus_id`, verbose-логи.
  - 🔴 **Dispatch-ordering (critical):** существующий guard `query.includes('updateProgress')` (route.ts:66) ловит и `updateProgressBatch` как подстроку → батч уходит в single-day ветку и падает с "Invalid day parameter". Ветку `UpdateProgressBatch` диспетчить **до** `UpdateProgress`, с `return` внутри.
  - **Guards:** `readItems` с `limit: -1` (Directus default 100); вызывать `createItems`/`updateItems`/`deleteItems` только на непустых массивах (иначе throw); дубли-строки дня удалять одним `deleteItems` (сохранить анти-дубль поведение).

### Phase 2 — Client transport + state
- ✅ **#2 GraphQL client mutation** — `graphql.ts`: `progressMutations.updateProgressBatch` (blocked by #1).
- ✅ **#3 PlanContext.toggleCompleteMany** — один оптимистичный апдейт + один `mutate`, обновление `readChapters`, early-return на пустом/неизвестном наборе (фильтр по существующим в плане дням) (blocked by #2).
- ✅ **#4 useProgress expose** — вернуть `toggleCompleteMany` (blocked by #3).

### Phase 3 — UI + фикс бага
- ✅ **#5 CalendarView + calendar/page** — прокинуть `onToggleCompleteMany`, заменить циклы на один вызов, переписать `lastActionDaysRef` (`{ days, completed }`) + `handleUndo` (инверсия только реально изменённых дней). Заодно убрать мёртвые per-cell `console.debug`/`console.warn` из грид-`.map` (лог на каждый рендер каждой ячейки) — оставить только осмысленный `bulk action executed` (blocked by #4).

### Phase 4 — Tests
- ✅ **#6 Тесты** — resolver (bounded число запросов, mark/unmark/invalid, фильтр по user+year, **regression на dispatch-ordering**) + `toggleCompleteMany` (ровно один `mutate`, оптимистичный апдейт, no-op на пустом/неизвестном) (blocked by #1, #3).

## Commit Plan

- **Commit 1** (`feat(plan): batch progress update endpoint`) — задачи #1, #2.
- **Commit 2** (`refactor(calendar): bulk day marking via single request + fix undo`) — задачи #3, #4, #5.
- **Commit 3** (`test(plan): cover batch progress resolver and toggleCompleteMany`) — задача #6.

## Проверка

- `npx tsc --noEmit` (проект TS strict) + `npm test`.
- Ручной smoke: «Отметить пропущенные» и «Отметить/Отменить выбранные» → в Network один POST `/api/graphql`; Undo возвращает ровно затронутые дни, не трогая остальные.
