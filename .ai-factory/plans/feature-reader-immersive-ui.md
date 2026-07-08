# Implementation Plan: Immersive-ридер (YouVersion-style chrome)

Branch: feature/reader-immersive-ui
Created: 2026-07-06

## Settings
- Testing: yes
- Logging: verbose
- Docs: no  # warn-only

## Принятые решения (пользователь был AFK — выбраны рекомендованные варианты, можно скорректировать до /aif-implement)
- **Выход из ридера:** стрелка «назад» удаляется; выход — через BottomNavBar, который теперь виден в ридере (в состоянии покоя). Системный back продолжает работать.
- **Скролл:** вниз → прячутся BottomNavBar и инфо о плане; вверх или у верха главы → возвращаются. Шапка ридера остаётся sticky всегда. Плавающие ‹ › видимы всегда, меняется только их bottom-offset.
- **Инфо о плане в шапке:** компактный бейдж «День N · X из Y» только при чтении по плану; при свободном чтении — ничего.
- **Completion-flow не меняется:** правая плавающая кнопка становится ✓ на последней главе дня; `shouldShowCompletionOnCheck` → CompletionModal | onBack — как сейчас.

## Research Context
Source: .ai-factory/RESEARCH.md (Active Summary) — тема research (static export + BFF) напрямую не про эту фичу.
Релевантные ограничения оттуда: все страницы уже `"use client"`, SSR/RSC не используется — вся новая логика (scroll-detection, chrome visibility) чисто клиентская и переживёт миграцию на `output: 'export'` без изменений.

## Уточнения после /aif-improve (2026-07-06)
- **UX-регресс предотвращён:** пункт «Библия» в BottomNavBar жёстко ведёт на `?book=Бытие&chapter=1` — с навом, видимым в ридере, тап по активной «Библии» сбрасывал бы читаемую главу. Fix: тап по уже активному пункту нава → no-op (задача 2).
- **Смена главы не размонтирует ReadingView** (`router.push` с новыми search-параметрами на тот же маршрут) → сброс `chromeHidden` вешается на effect по `reading.book/chapter`, не на mount/unmount. Провайдер живёт в per-page DashboardLayout → при уходе с маршрута состояние умирает само (задача 5).
- **iOS bounce клампится с обеих сторон:** игнорировать scroll-события вне `[0, scrollHeight - clientHeight]` — overscroll на дне главы иначе даёт мерцание chrome (задача 1).
- **Формулы offset плавающих кнопок:** chrome виден → `bottom: calc(var(--dock-nav-h) + env(safe-area-inset-bottom) + 12px)`; скрыт → `calc(env(safe-area-inset-bottom) + 16px)` (задача 4).
- **Бейдж при `day && !currentItem`:** только «День N», без счётчика — не переносить «0 из Y» из текущего футера (задача 3).
- Кросс-проверки: ссылок на `reading-plan-footer`/`reading-header-back-button` в тестах и скриптах нет; ReadingContent скролл-логики не содержит.

## Архитектурные заметки (FSD)
- Состояние видимости chrome нужно и `shared/components/layout` (BottomNavBar), и `features/reading` (ReadingView, FloatingChapterNav) → живёт в **shared**: `ChromeVisibilityProvider` + `useChromeVisibility()` (провайдер в DashboardLayout).
- Скролл-контейнер ридера — внутренний div (`contentRef`), не window → `useScrollDirection(ref)` работает по element-scroll.
- На реадер-странице BottomNavBar — overlay (без `.pb-nav`), чтобы скрытие нава не вызывало layout-прыжок; клиренс — bottom padding внутри контента ридера.
- z-слои: BottomNavBar z-50, FloatingChapterNav z-40, шапка z-30.

## Commit Plan
- **Commit 1** (после задач 1–2): `feat(ui): scroll-aware chrome visibility, bottom nav available in reader`
- **Commit 2** (после задач 3–5): `feat(reading): immersive reader — floating chapter nav, plan badge in header, no back arrow`
- **Commit 3** (после задачи 6): `chore(reading): drop ReadingPlanFooter, tests`

## Tasks

### Phase 1: Инфраструктура (shared)
- [x] Task 1 (#8): `useScrollDirection` хук + `ChromeVisibility` контекст в shared (+ jsdom-тесты; логика: вниз>threshold → hidden, вверх/у верха → visible, кламп iOS bounce с ОБЕИХ сторон)
- [x] Task 2 (#9): DashboardLayout — провайдер + показ нава на `/dashboard/read` как overlay; BottomNavBar — translate-y анимация скрытия по `chromeHidden`; тап по активному пункту нава → no-op (фикс сброса главы «Библией») (depends on 1)

### Phase 2: Ридер
- [x] Task 3 (#10): ReadingHeader — убрать стрелку/`onBack`, схлопнуть дублирующиеся ветки, бейдж «День N · X из Y» (без счётчика при отсутствии currentItem; только при day), спейсер для центровки, все 3 темы ридера
- [x] Task 4 (#11): FloatingChapterNav — плавающие ‹ › по бокам внизу, ✓ на последней главе дня, theme-aware, bottom-offset анимируется по `chromeHidden` (формулы с `--dock-nav-h` — см. уточнения) (depends on 1)
- [x] Task 5 (#12): ReadingView — скролл→`setChromeHidden`, сброс в visible по effect на `reading.book/chapter` (смена главы НЕ размонтирует компонент), замена ReadingPlanFooter и запасного футера на FloatingChapterNav (parity: вне плана кнопки скрыты пока loading), пропсы бейджа в хедер, паддинги контента (depends on 1–4)
<!-- Commit checkpoint: tasks 1-5 -->

### Phase 3: Финализация
- [x] Task 6 (#13): удалить ReadingPlanFooter (+`readerFooterTheme`), grep по остаточным ссылкам, `vitest run` + lint/tsc зелёные (depends on 5)
<!-- Commit checkpoint: task 6 -->

## Smoke-чеклист (ручная верификация после /aif-implement)
1. Три темы ридера (light/dark/sepia): цвета шапки, бейджа, плавающих кнопок, нава.
2. Скролл вниз → nav+бейдж-инфо уходят, ‹ › плавно опускаются; скролл вверх / верх главы → всё возвращается.
3. Чтение вне плана (`/dashboard/read?book=Бытие&chapter=1`): нет бейджа и ✓, ‹ › работают.
4. Последняя глава дня → ✓ → CompletionModal → «Продолжить» → выход.
5. Выход через bottom nav из любого состояния (в т.ч. когда nav был скрыт и вернулся скроллом вверх).
6. Уход из ридера со скрытым chrome → на дашборде меню видно (сброс на unmount).
7. PWA на iPhone: safe-area (бровь/нижний отступ) не ломается; короткая глава без скролла → chrome всегда видим.
8. **Офлайн-прогон** (prod build + Playwright/CDP `setOffline`, аккаунт claude-offline-test): открыть ридер офлайн (app-shell `ignoreSearch`), полистать главы ‹ › (текст из IDB), отметить ✓ офлайн → отметка в outbox → синк при восстановлении сети; выход через bottom nav офлайн на дашборд/песни. Фича офлайн-нейтральна (новых маршрутов и fetch-путей нет), прогон — регрессионная страховка UI-обвязки.
