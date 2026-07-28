# Pull-to-refresh на экране сетлистов

**Branch:** `chordpro-viewer` (по решению Игоря — новая ветка не создаётся)
**Created:** 2026-07-29
**Plan mode:** full

## Settings

- **Testing:** yes (vitest, юнит-уровень: хук жеста + refresh-слой)
- **Logging:** verbose (`console.debug` с префиксом компонента/хука, как в `SwipePager`/`useSetlists`)
- **Docs:** yes — обязательный docs-чекпоинт в конце (`/aif-docs`)

## Roadmap Linkage

- **Milestone:** "M7 Сетлисты" (UX-полировка уже закрытого milestone, как `feature-setlists-ux-polish.md`)
- **Rationale:** фича не открывает новый milestone — это продолжение серии UX-полировок M7; в ROADMAP уходит строкой в блок «UX-полировка M7».

## Goal

На `/dashboard/setlists` добавить нативный жест «потянуть вниз → обновить»:
индикатор проявляется и растёт по мере протягивания, при достижении порога
«взводится», после отпускания крутится, пока идёт перезагрузка списка с сервера.

## Контекст и ключевые решения

**Что есть сейчас:**

- Список рендерит `src/app/dashboard/setlists/page.tsx` → скролл-контейнер
  `div.min-h-0.flex-1.overflow-y-auto` (строка 70), внутри `SetlistsList`.
- Данные: `useSetlists()` — module-level кэш `cache` + `readSetlistsThrough()`
  (network-first + IDB-фолбэк). Кэш сбрасывается только мутациями через
  `resetSetlistsCache()`; способа перечитать список по требованию нет.
- Ключ кэша — единственный источник `SETLISTS_LIST_CACHE_KEY` в
  `src/features/setlists/lib/offlineSetlists.ts`. Новый путь обязан импортировать
  его, а не дублировать строку.
- `globals.css` уже ставит `overscroll-behavior: none` на body/html — нативный
  browser pull-to-refresh не конкурирует, но на самом контейнере нужен
  `overscroll-y-contain`.
- Готовый образец жестовой механики — `src/shared/components/pager/SwipePager.tsx`:
  резиновая формула `shiftForDelta`, ось решается порогом `AXIS_LOCK_PX`,
  прогресс пишется CSS-переменной (без ререндера на каждый `pointermove`).
- Карточка сета — интерактивные `<button>` (`SetlistCard.tsx:70` «открыть сет»,
  `:101` «перейти к песне»). Жест стартует пальцем **на карточке** → на отпускании
  прилетает `click`. Ghost-click в проекте уже ловили (`BottomSheet` гасит его
  `preventDefault` на `touchend`).
- `src/shared/components/ui/LoadingSpinner.tsx` уже существует, но переиспользовать
  его нельзя: он хардкодит `animate-spin`, а в фазе `pulling` иконка должна
  доворачиваться пальцем.

**Решение 1 — общий примитив.** Логика жеста живёт в `shared` (`usePullToRefresh` +
компонент-обёртка `PullToRefresh`), фича сетов только подключает. Экраны песен и
плана позже подключаются одной строкой.

**Решение 2 — отдельный сетевой путь для ручного обновления, а не `readThrough`.**
`readSetlistsThrough()` для pull-to-refresh не годится: при разомкнутой цепи
(`networkHealth`, недавний таймаут) он мгновенно отдаёт **тот же самый** кэш —
пользователь тянет список, спиннер крутится, ничего не меняется, и это выглядит
как поломка. Ручное обновление — явный пользовательский интент: идём в сеть,
успех → пишем в `apiCache` под тем же ключом; неудача → список на экране остаётся
прежним, показываем ошибку. Фолбэк на IDB здесь не нужен (данные уже на экране).

**Решение 3 — offline-first не нарушается.** Первичное чтение по-прежнему
read-through + IDB; pull-to-refresh — надстройка. При `navigator.onLine === false`
жест не ходит в сеть вообще: fail fast + текст «Нет сети» (ждать бессмысленно by
construction — инвариант из `CLAUDE.md`). Новых маршрутов и новых ключей кэша не
появляется, `APP_SHELL_ROUTES` не трогаем.

**Не в объёме:** подключение жеста к экранам песен/плана/чтения (примитив к этому
готов, но включение — отдельная задача), pull-to-refresh внутри `BottomSheet`.

## Tasks

### Прогресс

- [x] T1. `refreshSetlistsFromNetwork()` в `offlineSetlists.ts`
- [x] T2. Тесты `refreshSetlistsFromNetwork`
- [x] T3. `refresh()` в `useSetlists`
- [x] T4. Тесты `useSetlists.refresh`
- [x] T5. Хук `usePullToRefresh`
- [x] T6. Тесты `usePullToRefresh`
- [x] T7. `PullToRefreshIndicator` + `PullToRefresh`
- [x] T8. Подключить жест на экране сетлистов
- [x] T9a. E2E-кейс: pull-to-refresh офлайн
- [x] T9. Верификация
- [x] T10. Docs-чекпоинт

### Фаза 1 — Данные

**T1. `refreshSetlistsFromNetwork()` в `src/features/setlists/lib/offlineSetlists.ts`**

- Новая экспортируемая функция: принудительное сетевое чтение списка сетов.
- Поведение:
  - `isDefinitelyOffline()` (из `@/shared/offline/networkHealth`) → бросить
    `OfflineNoDataError`-подобную ошибку с текстом «Нет сети. Список не обновлён»
    (не ходить в сеть вовсе);
  - иначе `raceWithTimeout(setlistsApi.getSetlists(), PULL_REFRESH_TIMEOUT_MS)`
    (`raceWithTimeout` из `@/shared/offline/networkTimeout` — generic-комбинатор,
    **не** `raceNetwork`: circuit breaker обязан быть обойдён, ручной refresh —
    это и есть пробный запрос);
  - `PULL_REFRESH_TIMEOUT_MS = 10_000` — экспортируемая константа в этом же файле
    (жест инициирован пользователем, ждём дольше дефолтных 6s);
  - успех → `persistApiCache(SETLISTS_LIST_CACHE_KEY, res)` + `reportNetworkSuccess()`
    (цепь замкнуть — сеть жива) → вернуть `res.setlists`;
  - таймаут/ошибка → пробросить наверх (никакого тихого фолбэка на кэш).
- Ключ кэша — импорт существующей константы `SETLISTS_LIST_CACHE_KEY`, новую строку
  не заводить. Форма записи в `apiCache` обязана совпадать с той, что пишет
  `readThrough` (полный ответ `{ setlists }`, не массив) — иначе следующий офлайн-старт
  уронит карточку.
- **Логирование:** `console.debug('[offlineSetlists] manual refresh: start')`,
  `... ok, N setlist(s)`, `console.warn('[offlineSetlists] manual refresh failed', err)`.
- **Файлы:** `src/features/setlists/lib/offlineSetlists.ts`

**T2. Тесты `refreshSetlistsFromNetwork` — `offlineSetlists.test.ts`**

- Кейсы: (a) успех → `apiCache` содержит запись под `SETLISTS_LIST_CACHE_KEY` в той же
  форме, что пишет `readThrough`; (b) `navigator.onLine === false` → fetcher **не**
  вызывается, промис реджектится; (c) fetcher реджектится → ошибка проброшена, старая
  запись в `apiCache` не затёрта; (d) fetcher никогда не резолвится (реальный офлайн
  «висит») → реджект по таймауту, тест не висит (fake timers).
- Ассерт ключа — импортом `SETLISTS_LIST_CACHE_KEY`, не строковым литералом.
- **Файлы:** `src/features/setlists/lib/offlineSetlists.test.ts`
- **Blocked by:** T1

**T3. `refresh()` в `src/features/setlists/hooks/useSetlists.ts`**

- Хук возвращает дополнительно `{ refresh, refreshing, refreshError }`.
- `refresh()`: no-op, если уже `refreshing` **или если первичная загрузка ещё в полёте**
  (`loading`) — иначе pull во время стартового `readSetlistsThrough()` шлёт второй
  запрос; ставит `refreshing = true`, зовёт
  `refreshSetlistsFromNetwork()`; успех → обновить module-кэш `cache` новым списком
  (не `resetSetlistsCache()` — иначе следующий монтаж экрана снова пойдёт в сеть),
  `setSetlists(list)`, `refreshError = null`; ошибка → `refreshError = err.message`,
  список на экране НЕ трогаем.
- Промис `refresh()` резолвится (не реджектится) в обоих исходах — вызывающий жест
  ждёт его, чтобы остановить спиннер, и не должен ловить исключение.
- Гварда `active` при размонтировании — как в существующем эффекте.
- **Логирование:** `console.debug('[useSetlists] refresh: start / ok N / failed')`.
- **Файлы:** `src/features/setlists/hooks/useSetlists.ts`
- **Blocked by:** T1

**T4. Тесты `useSetlists.refresh` — новый `useSetlists.test.ts`**

- `// @vitest-environment jsdom`, `renderHook` + мок `offlineSetlists`.
- Кейсы: (a) успешный refresh заменяет список и обновляет module-кэш (второй
  `renderHook` стартует уже с новыми данными и без сетевого вызова); (b) ошибка
  refresh → `refreshError` заполнен, `setlists` прежние; (c) повторный вызов во время
  `refreshing` → второго обращения к сети нет; (d) `refresh()` во время первичной
  загрузки → `refreshSetlistsFromNetwork` не вызывается.
- Между тестами сбрасывать module-кэш (`resetSetlistsCache()`).
- **Файлы:** `src/features/setlists/hooks/useSetlists.test.ts`
- **Blocked by:** T3

### Фаза 2 — Общий примитив жеста

**T5. Хук `src/shared/hooks/usePullToRefresh.ts`**

- API: `usePullToRefresh({ enabled, onRefresh })` → `{ scrollRef, handlers, pullPx, phase }`,
  где `phase: 'idle' | 'pulling' | 'armed' | 'refreshing'`.
- Механика (по образцу `SwipePager`, формулы переиспользовать по смыслу, не импортом):
  - `pointerdown` фиксирует старт **только** если `scrollRef.current.scrollTop <= 0`,
    и вызывает `setPointerCapture(e.pointerId)`. В `SwipePager` захвата нет — он висит
    на полноэкранном узле; здесь палец тянет от верхнего края вниз и легко уходит за
    пределы вьюпорта: без захвата `pointerup` теряется и фаза навсегда залипает в
    `pulling`. Release — в `pointerup`/`pointercancel`;
  - ось решается порогом 8px: `|dy| > 1.5 * |dx|` и `dy > 0` → вертикальный pull,
    иначе жест игнорируется до конца (обычный скролл/горизонталь не ломаем);
  - резиновое сопротивление: `pull = (MAX_PULL_PX * dy) / (dy + MAX_PULL_PX)`,
    `MAX_PULL_PX = 96`; порог взвода `TRIGGER_PX = 64`;
  - `pointerup`: `pull >= TRIGGER_PX` → `phase = 'refreshing'`, `await onRefresh()`,
    минимальная длительность видимого спиннера `MIN_SPIN_MS = 500` (иначе быстрый
    ответ даёт мигание), затем `phase = 'idle'`; иначе — плавный возврат к `idle`;
  - `pointercancel` / уход пальца — возврат к `idle` без вызова `onRefresh`;
  - размонтирование во время refresh — не звать `setState` (флаг `active` в ref).
- **Подавление ghost-click (обязательно).** Жест начинается пальцем на карточке сета,
  и на отпускании прилетает `click` — пользователь провалится в сет вместо обновления.
  Хук отдаёт в `handlers` `onClickCapture` со `stopPropagation` + `preventDefault`,
  пока взведён флаг «жест был вертикальным» (ref; сбрасывается после первого
  подавленного клика либо на следующем `pointerdown`).
- Стейт меняется только на сменах фазы. На корень пишутся **две** CSS-переменные:
  `--ptr-pull` (px, текущее смещение) и `--ptr-progress` (0…1, `pull / TRIGGER_PX`
  с потолком 1) — по образцу `--swipe-progress` в `SwipePager`. Одной px-переменной
  мало: индикатор не посчитает scale/opacity, не зная `MAX_PULL_PX`, и константа
  продублируется в компоненте — тот самый рассинхрон писателя и читателя, на котором
  проект уже горел с ключами кэша.
- `enabled === false` → возвращать пустой объект обработчиков (жест выключен).
- **Логирование:** `console.debug('[usePullToRefresh] armed / commit / cancel / click suppressed', { pullPx })`.
- **Файлы:** `src/shared/hooks/usePullToRefresh.ts`

**T6. Тесты `usePullToRefresh` — `usePullToRefresh.test.ts`**

- `// @vitest-environment jsdom`, синтетические pointer-события (образец —
  `SwipePager.test.tsx`). В jsdom нет `setPointerCapture` — застабить на элементе.
- Кейсы: (a) pull ниже порога → `onRefresh` не вызван, фаза вернулась в `idle`;
  (b) pull выше порога → `onRefresh` вызван ровно один раз, фаза `refreshing` до
  резолва; (c) старт при `scrollTop > 0` → жест не начинается; (d) преимущественно
  горизонтальное движение → жест не начинается; (e) `onRefresh` реджектится → фаза
  всё равно возвращается в `idle` (спиннер не залипает); (f) `pointercancel` в
  середине → `onRefresh` не вызван; (g) ghost-click: после вертикального жеста клик
  по вложенной кнопке подавлен, следующий обычный клик проходит; (h) `pointerup` вне
  элемента (pointer capture) → фаза завершается, не залипает в `pulling`.
- **Файлы:** `src/shared/hooks/usePullToRefresh.test.ts`
- **Blocked by:** T5

**T7. Компоненты `PullToRefreshIndicator` + обёртка `PullToRefresh`**

- `PullToRefreshIndicator` (`src/shared/components/ui/PullToRefreshIndicator.tsx`):
  круглая «таблетка» с `Loader2` (lucide) по центру сверху контейнера,
  `position: absolute`, не влияет на layout списка.
  - `opacity` и `scale` считаются из `var(--ptr-progress)` (0 → невидим, 1 → полный
    размер), поворот иконки — из `var(--ptr-pull)`: иконка «доводится» пальцем;
  - `phase === 'armed'` — лёгкий акцент (полная непрозрачность + тик по шкале);
  - `phase === 'refreshing'` — `animate-spin`, индикатор зафиксирован на высоте покоя;
  - `prefers-reduced-motion` → без вращения и без scale: индикатор просто
    появляется/исчезает (`useReducedMotion` из `motion/react`, как в `SetlistsList`).
  - **Существующий `LoadingSpinner` не переиспользуем:** он хардкодит `animate-spin`,
    а в фазе `pulling` иконка должна доворачиваться пальцем, а не крутиться сама.
    Берём `Loader2` напрямую и оставляем это обоснование комментарием — иначе ревью
    пометит дублирование примитива.
- `PullToRefresh` (`src/shared/components/ui/PullToRefresh.tsx`): обёртка, владеет
  скролл-контейнером (`min-h-0 flex-1 overflow-y-auto overscroll-y-contain`),
  вешает `handlers` (включая `onClickCapture`) и `scrollRef` из хука, рендерит
  индикатор + `children`.
  Props: `{ enabled?, onRefresh, className?, children }`.
- Только семантические токены (`bg-app-surface-elevated`, `text-app-text-secondary`,
  `shadow-app-md`, `border-app-border`) — хардкод-шейдов и `dark:` быть не должно.
- DOM-якоря: `data-pull-to-refresh`, `data-pull-to-refresh-indicator`,
  `data-pull-to-refresh-phase="idle|pulling|armed|refreshing"`.
- **Файлы:** `src/shared/components/ui/PullToRefreshIndicator.tsx`,
  `src/shared/components/ui/PullToRefresh.tsx`
- **Blocked by:** T5

### Фаза 3 — Интеграция

**T8. Подключить жест на экране сетлистов**

- В `src/app/dashboard/setlists/page.tsx` заменить `div.min-h-0.flex-1.overflow-y-auto`
  на `<PullToRefresh onRefresh={refresh} className="px-4 pt-3 pb-6">`, взяв `refresh`
  из `useSetlists()`.
- `refreshError` показывать ненавязчиво (строка над списком, `text-app-text-muted`,
  сама гаснет при следующем успешном обновлении) — не подменять список
  `ErrorMessage`: данные на экране валидны, обновиться просто не удалось.
- Локальная копия `localSetlists` синхронизируется существующим `useEffect` по
  `setlists` — после успешного refresh список перерисуется автоматически; убедиться,
  что оптимистичные правки из шита не воскресают после обновления.
- Условие `enabled={!managed}` **не нужно**: проверено — `SetlistManageHost` — сосед
  скролл-контейнера в `page.tsx`, `BottomSheet` рендерится fixed-оверлеем, жест из
  открытого шита физически не стартует. Проп `enabled` остаётся в API примитива для
  будущих экранов.
- Жест не должен мешать: скроллу списка, раскрытию `<details>` архива, тапу по
  карточке и kebab-меню (`ActionMenu` портируется в `body` — pointer-цепочка до
  контейнера не доходит).
- **Логирование:** `console.debug('[SetlistsPage] pull-to-refresh → refresh()')`.
- **Файлы:** `src/app/dashboard/setlists/page.tsx`
- **Blocked by:** T3, T7

**T9a. E2E-кейс: pull-to-refresh офлайн**

- Доклеить один `test()` в существующий `e2e/offline/setlists-offline.spec.ts` —
  фикстура (создание/удаление тестового сета под `claude-offline-test`) там уже есть,
  логин переиспользуется через `storageState` (BFF рейт-лимитит `/api/auth/login`
  10/15мин — заново не логиниться).
- Кейс: экран сетов загружен → `context.setOffline(true)` → pull-жест на
  `[data-pull-to-refresh]` через `mouse.move` → `mouse.down` → **серия** `mouse.move`
  (одним движением жест не распознается: ось решается порогом 8px) → `mouse.up`.
- Ассерты: список остался на экране, `data-pull-to-refresh-phase` вернулся в `idle`
  (спиннер не залип), видно «Нет сети», консоль чистая (в т.ч. без
  `Failed to fetch RSC payload`) — проверка консоли обязательна, как в остальных
  офлайн-спеках.
- `page.route` не перехватывает запросы через SW — офлайн переключается контекстом.
- **Файлы:** `e2e/offline/setlists-offline.spec.ts`
- **Blocked by:** T8

**T9. Верификация**

- `yarn test` + `yarn lint` — обязательно (проект на Yarn 1, `npm install` переписывает
  `yarn.lock`).
- Затронут слой записи `apiCache` → прогнать production-контур: `yarn build` →
  поднять `bff:start` + `static:serve` → `yarn e2e:offline` (регрессия: офлайн-старт
  экрана сетов по-прежнему отдаёт список из IDB, консоль чистая; плюс новый кейс T9a).
  Нужен `.env.test` — см. `e2e/offline/README.md`.
- Ручная проверка жеста в браузере с touch-эмуляцией: индикатор растёт по мере
  протягивания, взводится на пороге, крутится во время запроса, список обновляется;
  офлайн (`window.dispatchEvent(new Event('offline'))` + `navigator.onLine` мок) —
  сообщение «Нет сети», список не пропадает, спиннер не залипает.
- Проверить, что обычный скролл списка и горизонтальные жесты внутри экрана не
  сломались.
- **Blocked by:** T9a

**T10. Docs-чекпоинт**

- `docs/design-system.md` — секция про новый общий примитив `PullToRefresh`
  (когда применять, пороги, поведение при reduced-motion).
- `AGENTS.md` — строки в «Key entry points» / структуру `shared/hooks`, `shared/components/ui`.
- `docs/offline-pwa.md` — абзац: pull-to-refresh идёт мимо circuit breaker осознанно,
  офлайн — fail fast без похода в сеть.
- `.ai-factory/ROADMAP.md` — строка в блок «UX-полировка M7».
- Прогнать через `/aif-docs`.
- **Blocked by:** T9

## Commit Plan

| Чекпоинт | Задачи | Сообщение |
|---|---|---|
| 1 | T1–T4 | `feat(setlists): add manual network refresh path for setlist list` |
| 2 | T5–T7 | `feat(ui): add shared pull-to-refresh gesture primitive` |
| 3 | T8, T9a, T9 | `feat(setlists): enable pull-to-refresh on the setlists screen` |
| 4 | T10 | `docs: document pull-to-refresh primitive and offline behaviour` |

## Риски

- **Конфликт с нативным browser pull-to-refresh** (Chrome Android, не-standalone):
  `overscroll-behavior` на body уже `none`, но контейнер обязан иметь
  `overscroll-y-contain` — иначе пользователь получит два индикатора.
- **iOS elastic bounce** даёт `scrollTop < 0`: условие старта `scrollTop <= 0`
  это учитывает, но проверить, что жест не стартует посреди инерционного скролла.
- **Тихий stale-refresh:** если по невнимательности использовать `raceNetwork`
  вместо `raceWithTimeout`, разомкнутая цепь превратит обновление в no-op со
  спиннером. Это явное решение T1 — не «оптимизировать» обратно.
