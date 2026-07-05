# Plan: UI/UX-полировка — offline-индикатор, бровь, попап завершения дня

**Branch:** feature/offline-pwa (текущая, ветка не создавалась — fast mode)
**Created:** 2026-07-05
**Type:** fix / UI polish

## Description

Четыре неровности дизайна (репорт Игоря с iPhone PWA):

1. **Offline UX** — сообщение об офлайне показываем один раз; после закрытия — постоянный компактный серый индикатор «Офлайн» сверху; онлайн — ничего.
2. **Бровь (статус-бар iPhone)** — верхний бар рисуется по-разному на экранах (в ридере зона брови не совпадает с фоном шапки); нужно единое поведение на всех экранах.
3. **Попап успеха прочтения дня** перекрывается баром — кнопки не видны.
4. **Нажатие ✓ при завершении дня** не всегда показывает попап успеха; по «Продолжить» — переход на главную.

## Settings

- **Testing:** Yes — component/unit тесты (jsdom) на индикатор, safe-area классы и completion flow
- **Logging:** Minimal — только WARN на аномалии, новых DEBUG/INFO не добавлять
- **Docs:** No (warn-only)

## Roadmap Linkage

- Milestone: "none"
- Rationale: ROADMAP.md в проекте отсутствует.

## Research Context

RESEARCH.md активен, но его тема (миграция на static export + Hono BFF после offline-PWA v1) к этой задаче не относится. Единственное пересечение: все правки — чистый UI/клиент, миграцию B не осложняют.

## Диагнозы (из обследования кода)

1. **OfflineIndicator** (`src/shared/components/ui/OfflineIndicator.tsx`): баннер показывается при КАЖДОМ переходе offline (dismissed сбрасывается в handleOffline), после закрытия исчезает полностью — постоянного индикатора нет.
2. **Бровь**: `env(safe-area-inset-top)` не используется нигде (только bottom/left/right в globals.css); `viewport-fit=cover` не задан; `viewport.themeColor` захардкожен `#1f2937` независимо от темы; `ReadingHeader` красится `bg-white/95 dark:bg-stone-800/95` напрямую (мимо app-токенов, sepia не учтён) — зона статус-бара живёт своей жизнью на каждом экране. Важно: `--app-bg` ≠ `--app-surface` (light `#FAFAF9` vs `#ffffff`, dark `#1c1917` vs `#292524`) — единого «цвета приложения» для брови не существует, цвет зависит от экрана.
3. **BottomSheet** (`src/shared/components/ui/BottomSheet.tsx`): панель `fixed bottom-0` без `env(safe-area-inset-bottom)` → кнопка «Продолжить» в CompletionModal уходит под home-indicator/бар.
4. **Completion flow**: показ попапа = детекция перехода `day.completed: false→true` в `useDayCompletion`. Если последний item уже completed (чтение не по порядку), `onChapterRead` не вызывается (guard `!currentItemState.completed` в `useChapterNavigation`), переход не случается → ✓ молча ничего не делает. `onBack` уже ведёт на `/dashboard?day=N` — переход на главную по «Продолжить» работает, чинить нужно только показ попапа.

## Tasks

### Phase 1 — независимые фиксы

- [x] **1. Двухступенчатый offline-индикатор** (task #1)
  `OfflineIndicator.tsx` + test: online → ничего; первый offline за сессию → полный баннер с крестиком; после закрытия (или повторный offline в той же сессии) → компактный серый пилл «Офлайн» без крестика, висит до восстановления сети. Флаг «показывали» — module-level/sessionStorage.

- [x] **2. Единая зона статус-бара** (task #2)
  **Инвариант: бровь ВСЕГДА того же цвета, что и header текущего экрана.** Механизм по построению — сам header (sticky, непрозрачный фон) расширяется под статус-бар через `pt-safe` и закрашивает бровь; никаких отдельных «подложек-приближений» под шапками.
  Матрица «бровь = шапка»: PlanView (главная, без шапки-бара) → `--app-bg`; calendar/songs/settings (PageHeader) → `--app-surface`; ридер (ReadingHeader) → фон темы ридера light/dark/**sepia**.
  Шаги: `layout.tsx`: `viewportFit: 'cover'`, `statusBarStyle: 'black-translucent'`, убрать статический themeColor. `globals.css`: утилита `.pt-safe`. `PageHeader` и `ReadingHeader`: pt-safe + фон шапки (ReadingHeader — фон по теме ридера, h-[56px] → min-h). PlanView: fixed-полоска высотой `env(safe-area-inset-top)` цвета `bg-app-bg` (при скролле контент не должен «голым» подъезжать под бровь) + пересчитать pt-10 у header-блока. `ThemeProvider`: механизм `useStatusBarColor(color)` — `<meta name="theme-color">` = цвет брови ТЕКУЩЕГО экрана (дефолт `--app-bg` по теме; PageHeader-экраны → `--app-surface`; ридер → тема ридера, включая sepia).
  Верификация: чек-лист главная/календарь/песни/настройки/ридер(light/dark/sepia) × обе темы приложения.

### Phase 2 — зависят от viewport-fit

- [x] **3. BottomSheet: нижний safe-area** (task #3, blocked by #2)
  Панель шита: `padding-bottom: max(0.75rem, env(safe-area-inset-bottom))` — чинит CompletionModal и все остальные шиты разом. Проверить двойные отступы в CompletionModal и max-h на маленьких экранах (vh → dvh).

- [x] **4. Детерминированный показ CompletionModal по ✓** (task #4)
  `ReadingView.tsx`: явный локальный state показа модалки в ветке isLastItem (`willCompleteDay` ИЛИ день уже завершён → показать), вместо прослушки props через useDayCompletion. Ветка `!willCompleteDay → onBack()` сохраняется. `onClose → onBack()` (переход на главную) сохраняется. Тесты: ✓ на последнем незавершённом item → модалка; ✓ когда всё уже completed → модалка (регресс бага); закрытие → onBack.

## Commit Plan

Задач 4 (<5), но фиксы независимы — коммитить по задаче:

1. `fix(offline): show offline banner once, persistent gray pill afterwards` — task 1
2. `fix(ui): unify status-bar area (safe-area top + dynamic theme-color)` — task 2
3. `fix(ui): bottom sheet respects safe-area, completion buttons visible` — task 3
4. `fix(reading): always show completion modal on day-finish checkmark` — task 4

## Верификация

- Ручная проверка на iPhone PWA (бровь, home-indicator) — эмуляция iPhone в Chrome DevTools покрывает частично, реальные env(safe-area-*) видны только на устройстве/симуляторе.
- `npm test` (Vitest) + `tsc` — зелёные.
- Регресс: install-prompt, тёмная тема, sepia в ридере, все BottomSheet-ы (настройки чтения, пикеры глав/книг, календарь).
