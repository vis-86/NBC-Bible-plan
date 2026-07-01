# Прижать нижнюю навигацию к низу (docked tab-bar)

**Тип:** UI/UX enhancement
**Ветка:** остаёмся на текущей `feature/reusable-page-header` (продолжение UI-полировки; отдельная ветка не создавалась — см. «Git»)
**Дата:** 2026-07-01

## Контекст

Сейчас `BottomNavBar` — плавающая «пилюля»:
`fixed bottom-6 left-4 right-4 max-w-md mx-auto h-[72px] glass-nav rounded-[24px] border shadow-2xl safe-area-bottom`
(`src/shared/components/layout/BottomNavBar.tsx:79`).

Проблемы:
- Вертикальный зазор `bottom-6` (24px) + тень «съедают» полезное место снизу.
- `safe-area-bottom` (padding-bottom) на floating-элементе — латентный баг: раздувает высоту, а не приподнимает пилюлю над home-indicator.

Эталон — нижний бар экрана чтения (`ReadingView.tsx:210`): `fixed bottom-0 left-0 right-0 ... border-t ... pb-safe`.

**Цель:** прижать навигацию к низу как на экране чтения (эффективнее по месту), но слева/справа учесть закругления/вырез экрана через `env(safe-area-inset-left/right)`.

## Решение (выбрано пользователем)

**Full-bleed докнутый таб-бар:**
- `fixed bottom-0 left-0 right-0 max-w-md mx-auto` — вровень с низом, центрован по ширине карточки.
- `rounded-t-[24px] border-t border-app-border` — скруглены только верхние углы, верхняя граница; тень от `.glass-nav` (`box-shadow: 0 -4px 20px`), `shadow-2xl` не нужен.
- Safe-area: контент бара приподнят на `max(0.5rem, env(safe-area-inset-bottom))`; боковые отступы иконок `max(1rem, env(safe-area-inset-left/right))` — это и есть учёт закруглений.
- Совпадает по стилю с экраном чтения (full-bleed bottom-0).

## Settings

- **Testing:** нет (правка чисто CSS/className, поведение навигации не меняется — по решению пользователя)
- **Logging:** без изменений (уже есть `console.debug('[BottomNavBar] navigate', ...)`)
- **Docs:** нет (warn-only)

## Roadmap Linkage

Milestone: "none". Rationale: Skipped by user (точечная UI-правка).

## Git

Full-mode ветка автоматически не создавалась: рабочее дерево чистое, задача — продолжение серии UI-правок на `feature/reusable-page-header`. Ветвление от `main` внесло бы лишнюю merge-сложность. Изменение можно влить в ту же UI-серию. При желании выделить отдельно: `git checkout -b feature/dock-bottom-nav`.

## Клиренс контента (уточнено на /aif-improve)

Глубокий анализ выявил, что клиренс под баром **разъезжается по страницам** и докинг это усиливает:
- `PlanView.tsx:250` — `pb-32`, `songs/page.tsx:32` — `pb-28`, `settings/page.tsx:37` — только `pb-safe` (**недостаточно** → контент прячется), chat-инпут `PastorChat.tsx:455` — **без клиренса** (в обычном flow → докнутый бар ложится поверх поля ввода).

**Решение (вариант A — централизация, выбрано):** резервировать место под бар на уровне `DashboardLayout` (`padding-bottom` на `<main>`, gated тем же `!isReaderPage && !hideBottomNav`) и убрать постраничные magic-numbers `pb-32`/`pb-28`/`pb-safe`. Единый источник высоты — CSS-переменная `--dock-nav-h: 64px`. Чинит chat+settings единообразно, убирает дрейф.

## Tasks

### Фаза 1 — Вёрстка

1. [x] **Утилиты и переменная в `globals.css`** — рядом с `.safe-area-bottom` (~316-323) добавить: `--dock-nav-h: 64px` (единый источник высоты); `.dock-nav-safe-b` (`padding-bottom: max(0.5rem, env(safe-area-inset-bottom))`); `.dock-nav-safe-x` (`padding-left/right: max(1rem, env(safe-area-inset-left/right))`); `.pb-nav` (`padding-bottom: calc(var(--dock-nav-h) + env(safe-area-inset-bottom))` — клиренс для #3). Причина классов/переменной: паттерн проекта + надёжность Tailwind v4 с `max()`+`env()` + единый источник высоты для #2 и #3.

2. [x] **Переверстать `BottomNavBar.tsx`** (блокируется #1) — контейнер `<nav>` (строка 79): убрать `bottom-6 left-4 right-4 h-[72px] rounded-[24px] border shadow-2xl safe-area-bottom px-2`; добавить `bottom-0 left-0 right-0 rounded-t-[24px] border-t border-app-border min-h-[64px] pt-2 .dock-nav-safe-b .dock-nav-safe-x`; оставить `fixed max-w-md mx-auto glass-nav flex items-center justify-around z-50`. Детерминированный `min-h-[64px]` (= `--dock-nav-h`) обязателен: от него считается клиренс в #3. Кнопки (`.map`) и `console.debug` не трогать.

### Фаза 2 — Клиренс и проверка

3. [x] **Централизовать клиренс в `DashboardLayout`, убрать magic-numbers** (блокируется #2) — на `<main>` добавить `.pb-nav`, gated `!isReaderPage && !hideBottomNav`; убрать ставшие лишними `pb-32` (PlanView:250), `pb-28` (songs:32) и nav-часть `pb-safe` (settings:37). Не трогать `hideBottomNav`/ридер (у них бар не рендерится; у ридера свой bottom bar и `pb-32`). Проверить отсутствие перекрытия и двойных отступов.

4. [x] **Визуальная проверка** (блокируется #3) — `/run` + Chrome DevTools emulation: mobile, светлая/тёмная тема, safe-area (home-indicator + landscape insets), активный пункт. Обязательно экраны, зависящие от нового клиренса: **plan/главная**, **chat** (поле ввода не перекрыто), **settings** (низ виден), **songs list**.

## Commit Plan

Задач < 5 — один коммит в конце:
`feat(ui): dock bottom nav to screen edge with safe-area insets`
