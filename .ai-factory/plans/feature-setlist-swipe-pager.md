# Implementation Plan: Свайп-пейджер и разгрузка шапки песни

Branch: chordpro-viewer (новая ветка не создаётся — решение Игоря 2026-07-27)
Created: 2026-07-27 · Refined: 2026-07-27 (`/aif-improve`)
Прототип решений: `.ai-factory/design/setlist-swipe-prototype.html`

## Settings
- Testing: yes
- Logging: standard (`console.debug('[Component] событие', {данные})`)
- Docs: yes — обязательный чекпойнт документации в `/aif-implement`

## Roadmap Linkage
Milestone: "M7 Сетлисты"
Rationale: UX-полировка закрытого M7; `SongToolStack` попутно готовит слот для M10 «Рукописные пометки».

---

## Как читать этот план

План рассчитан на реализацию без доступа к обсуждению, которое его породило. Порядок:

1. Прочитать этот раздел, «Решения», «Инварианты» и «Контракты компонентов» — целиком, до кода.
2. Перед каждой фазой прочитать файлы из списка «Читать перед стартом» этой фазы.
3. Задачи выполнять по порядку. У каждой есть блок **Готово, когда** — это критерий приёмки, и **НЕ делай** — грабли, на которые уже наступали.
4. Все интерфейсы новых компонентов заданы в «Контрактах» дословно. Придумывать свои имена пропсов, свои пороги и свои data-атрибуты не нужно и не следует.

---

## Решения по дизайну (зафиксированы с Игорем, не пересматривать)

1. **Вариант C** — шапка песни: `back + заголовок + чип тональности + настройки`. Максимум 2 действия справа. Позиция в сете и листание уезжают вниз.
2. **Подсказка «N из M» — с начала жеста**: появляется на старте перетаскивания, показывает цель, гаснет через 900 мс после отпускания.
3. **Ридер: `FloatingChapterNav` не трогаем** — счётчик в Библию не добавляем, позиция читается из заголовка главы.
4. **Свайп в ридере — по контексту**: внутри плана листает главы дня, вне плана — главы книги (как сейчас ведут себя ‹ ›).
5. **Карандаш заметок — только в песнях** ⇒ `SongToolStack` живёт в `features/songs`, в `shared` не выносится.
6. **Одна ось — одно значение: вертикаль = продвижение внутри песни, горизонталь = переход между песнями сета.**
   - `scroll` (1 колонка) — вертикаль это скролл текста, горизонталь свободна ⇒ свайп работает.
   - `sheets` (2 колонки, дефолт планшета) — вертикаль это листы стопкой, горизонталь свободна ⇒ свайп работает.
   - `paged` — единственное исключение: страницы там лежат **вбок** (`flow.scrollLeft += pitch`), горизонталь занята. Режим **сохраняем** (в нём живёт клавиатурное/педальное листание через `nextPageDelta`), свайп в нём **выключен**.
   - Предикат один: **`mode !== 'paged'`**.
7. **Раскладка одна на все ширины.** Шапка, нижний док и стек инструментов на планшете такие же, как на телефоне. Отдельной широкой раскладки НЕТ: при 768 px заголовку остаётся ~560 px, проблема переполнения существует только на узком экране.

---

## Инварианты (нарушение = сломанный прод)

- **Край экрана — системе.** `resolveSwipeDirection` отдаёт 24 px слева/справа под back-свайп ОС. Drag-follow обязан использовать ту же функцию, а не свою копию порогов.
- **Свайп не единственный способ.** Видимые ‹ › остаются: в песне — в таблетке дока, в ридере — существующий `FloatingChapterNav`.
- **Свайп выключаем, а не удаляем.** `SwipePager` принимает `enabled`.
- **Новых маршрутов нет** ⇒ `APP_SHELL_ROUTES` не меняется. Новых сетевых read-путей нет, кроме прогрева главы (задача 10) — он идёт через существующий слой с таймаутом и IDB-фолбэком.
- **`resolveSwipeDirection` — общий примитив.** Единственный текущий импортёр — `useHorizontalSwipe`, который используется только в `src/app/dashboard/song/page.tsx:88`. Сигнатуру не менять; drag-follow строится поверх.
- **Ключи кэша Писания** — только через существующие `setCachedText`/`persistText` из `../bible-text-cache`. Писателя и читателя разводить нельзя.

---

## Контракты компонентов (реализовать дословно)

```ts
// src/shared/components/pager/SwipePager.tsx
export interface SwipePagerProps {
  enabled: boolean;
  canPrev: boolean;
  canNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  /**
   * Вызывается вместо onNext, когда canNext === false, но у экрана есть
   * терминальное действие (ридер: последняя глава дня → завершение дня).
   * Не задан ⇒ на границе просто резинка без коммита.
   */
  onEnd?: () => void;
  /** Состояние жеста для PagerHint. Вызывается только на СМЕНАХ состояния, не на каждый pointermove. */
  onDragChange?: (state: SwipeDragState) => void;
  className?: string;
  children: React.ReactNode;
}

export interface SwipeDragState {
  active: boolean;
  /** Куда поедем, если отпустить сейчас. null — ось ещё не решена или жест отменён. */
  direction: 'prev' | 'next' | null;
  /** true, когда в эту сторону идти некуда (и onEnd не задан). */
  atEdge: boolean;
}
```

```ts
// src/shared/components/pager/PagerHint.tsx
export interface PagerHintProps {
  visible: boolean;
  /** 0-based индекс позиции, которую показываем. */
  index: number;
  total: number;
  /** Подпись под цифрой. Пустая строка ⇒ строка подписи не рендерится вовсе. */
  label: string;
  atEdge: boolean;
}

export interface PagerHintState {
  visible: boolean;
  index: number;
  label: string;
  atEdge: boolean;
}

export interface UsePagerHintApi {
  state: PagerHintState;
  /** Показать и держать (жест идёт). */
  show: (index: number, label: string, atEdge: boolean) => void;
  /** Показать и погасить через ms. */
  showAndHide: (index: number, label: string, atEdge: boolean, ms: number) => void;
  hide: () => void;
}

export function usePagerHint(): UsePagerHintApi;
```

```ts
// src/features/setlists/components/SetlistPagerDock.tsx
export interface SetlistPagerDockProps {
  index: number;          // 0-based
  total: number;
  canPrev: boolean;
  canNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  /** Тап по центру — открыть SetlistManageSheet. */
  onOpenSetlist: () => void;
  /** Скрыт вместе с шапкой (тот же флаг, что у PageHeader на этой странице). */
  hidden: boolean;
}
```

```ts
// src/features/songs/components/SongToolStack.tsx
export interface SongToolStackProps {
  /** Слоты снизу вверх. Первый элемент массива — самый нижний. */
  children: React.ReactNode;
  hidden: boolean;
}
```

### Константы жеста (уже существуют, импортировать, не дублировать)

| Что | Значение | Откуда |
|---|---|---|
| `edgeGuardPx` | 24 | дефолт `resolveSwipeDirection` |
| `thresholdPx` | 60 | дефолт `resolveSwipeDirection` |
| `ratio` | 1.5 | дефолт `resolveSwipeDirection` |
| Порог решения оси | 8 px по любой оси | новый, локальная константа `AXIS_LOCK_PX` в `SwipePager` |
| Резинка на границе | ×0.35 | новая константа `EDGE_RESISTANCE` |
| Возврат после отпускания | `transform .24s cubic-bezier(.2,.9,.3,1)` | новая |
| Скрытие подсказки после коммита | 900 мс | новая `HINT_HOLD_COMMIT_MS` |
| Скрытие подсказки после отказа | 700 мс | новая `HINT_HOLD_REJECT_MS` |

### Новые DOM-якоря (kebab-case, правило проекта)

`data-swipe-pager` · `data-pager-hint` · `data-pager-hint-position` · `data-pager-hint-label` ·
`data-setlist-pager-dock` · `data-setlist-pager-dock-prev` · `data-setlist-pager-dock-next` · `data-setlist-pager-dock-counter` ·
`data-song-tool-stack` · `data-song-key-picker-capo-badge` (уже есть, сохранить) · `data-song-key-picker-source-dot` (новый)

---

## Commit Plan

- **Commit 1** (задачи 1–3): `feat(shared): swipe pager primitives with drag-follow and position hint`
- **Commit 2** (задачи 4–8): `feat(songs): compact header, bottom pager dock, tool stack`
- **Commit 3** (задачи 9–11): `feat(reading): swipe navigation between chapters with position hint`
- **Commit 4** (задача 12): `chore: reduced-motion pass, a11y and docs for pager`

---

## Tasks

### Фаза 1: Общие примитивы жеста

**Читать перед стартом:** `src/shared/hooks/useHorizontalSwipe.ts` (целиком), `src/shared/hooks/useHorizontalSwipe.test.ts`.

- [x] **Задача 1: `SwipePager` — обёртка контента с drag-follow**

  Новый файл: `src/shared/components/pager/SwipePager.tsx`. Контракт — см. `SwipePagerProps` выше.

  Реализация:
  - Pointer events на корневом `div` (`data-swipe-pager`), не touch-only.
  - `enabled === false` ⇒ обработчики не навешиваются вовсе (пустой объект в спреде), как уже сделано в `useHorizontalSwipe`.
  - `pointerdown`: запомнить `{x, y}`. Ось НЕ решена.
  - `pointermove`: пока `|dx| < AXIS_LOCK_PX && |dy| < AXIS_LOCK_PX` — ничего. Затем один раз решить ось: если `|dx| <= 1.5 * |dy|` — жест отдан вертикальному скроллу, до `pointerup` больше не реагируем.
  - После фиксации горизонтальной оси: `direction = dx < 0 ? 'next' : 'prev'`; `atEdge = (direction === 'next' && !canNext && !onEnd) || (direction === 'prev' && !canPrev)`; `translateX(atEdge ? dx * EDGE_RESISTANCE : dx)`.
  - `onDragChange` вызывать только когда меняется `direction` или `atEdge` (и один раз на `active: true` / `active: false`).
  - `pointerup`: вернуть `transform` в 0 с transition. Коммит только если решение `resolveSwipeDirection(startX, dx, dy, window.innerWidth)` вернуло направление:
    - `'left'` → `canNext ? onNext() : onEnd?.()`
    - `'right'` → `canPrev && onPrev()`
  - `pointercancel` / уход указателя — сброс без коммита.
  - `prefers-reduced-motion: reduce` (через `window.matchMedia`) ⇒ `transform` не выставляется вообще; коммит по порогу работает.

  **Готово, когда:** горизонтальный жест сверх порога коммитит; диагональный не коммитит и не двигает контент; старт в 24 px от края игнорируется целиком; на границе контент едет с коэффициентом 0.35 и не коммитит; `enabled=false` не вешает ни одного обработчика; при reduced-motion нет `transform`.

  **НЕ делай:** не копируй пороги 24/60/1.5 в новый файл — импортируй `resolveSwipeDirection`. Не решай ось заново на каждом `pointermove` — только один раз за жест. Не вызывай `onDragChange` на каждый move.

  LOGGING: `console.debug('[SwipePager] commit', { direction, canPrev, canNext })` на коммите и `console.debug('[SwipePager] rejected', { dx, dy, reason })` при отказе. В `pointermove` не логировать.

- [x] **Задача 2: `PagerHint` — подсказка «N из M» + `usePagerHint`**

  Новый файл: `src/shared/components/pager/PagerHint.tsx` (компонент и хук в одном файле). Контракт — см. `PagerHintProps` / `UsePagerHintApi`.

  - Вид: по центру контейнера (`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2`), тёмная полупрозрачная плашка с `backdrop-blur`, крупная цифра `{index + 1} из {total}` (`tabular-nums`, `data-pager-hint-position`) и мелкая подпись (`data-pager-hint-label`).
  - Плашка намеренно тёмная и нейтральная — она обязана читаться поверх всех трёх тем ридера (`light` / `dark` / `sepia`). **Пропа темы у неё нет.**
  - `atEdge === true` ⇒ вместо `label` показывается «Это первая» (при `index < 0`) или «Это последняя».
  - `label === ''` ⇒ строка подписи не рендерится (нужно для песни, у которой ещё не прогрет каталог названий).
  - `pointer-events: none` + `aria-hidden` — это индикатор жеста, а не контрол. О смене песни/главы сообщает изменившийся заголовок.
  - Появление/скрытие: opacity 160 мс + scale 220 мс; при reduced-motion — только opacity.
  - `usePagerHint` держит таймер скрытия в `useRef`, `showAndHide` сбрасывает предыдущий таймер, `hide` очищает.

  **Готово, когда:** «2 из 5» рендерится; `atEdge` даёт «Это последняя»; пустой `label` не оставляет пустую строку; повторный `showAndHide` не гасит подсказку раньше времени (таймер сброшен).

  **НЕ делай:** не встраивай `usePagerHint` внутрь `SwipePager` — тогда примитив станет непереиспользуемым. Не давай подсказке фокус и роль `status`.

  LOGGING: `console.debug('[PagerHint] show', { index, total, atEdge })` только на переходах состояния показа.

- [x] **Задача 3: Юнит-тесты примитивов**

  Новые файлы: `src/shared/components/pager/SwipePager.test.tsx`, `src/shared/components/pager/PagerHint.test.tsx`. Оба с докблоком `// @vitest-environment jsdom` первой строкой.

  `SwipePager`:
  1. свайп влево сверх порога → `onNext`;
  2. свайп вправо сверх порога → `onPrev`;
  3. диагональ (`dx=70, dy=60`) → ни одного колбэка;
  4. старт при `clientX = 10` → жест игнорируется;
  5. `canNext=false`, `onEnd` не задан, свайп влево → колбэков нет;
  6. `canNext=false`, `onEnd` задан, свайп влево → вызван `onEnd`, не `onNext`;
  7. `enabled=false` → на корне нет `onpointerdown`;
  8. `matchMedia` замокан на `prefers-reduced-motion: reduce` → `style.transform` пуст, но коммит произошёл.

  `PagerHint`: текст «2 из 5»; `atEdge` → «Это последняя»; `label=''` → узла `data-pager-hint-label` нет.

  **Готово, когда:** `yarn test` зелёный, все 8 + 3 кейса проходят.

  LOGGING: `vi.spyOn(console, 'debug').mockImplementation(() => {})` в `beforeEach`, чтобы вывод прогона оставался читаемым.

<!-- Commit checkpoint: задачи 1–3 -->

### Фаза 2: Экран песни

**Читать перед стартом:** `src/app/dashboard/song/page.tsx`, `src/app/dashboard/song/page.test.tsx`, `src/features/songs/components/SongKeyPicker.tsx` (строки 100–135), `src/features/songs/components/SongAutoScroll.tsx` (строки 70–128), `src/features/setlists/hooks/useSetlistPlayback.ts`.

- [x] **Задача 4: Компактный чип тональности**

  Файл: `src/features/songs/components/SongKeyPicker.tsx`, триггер-кнопка (строки ~108–133).

  - Сейчас: `A♭ (моя) | капо 3` (~130 px). Станет: `• A♭ ⌈3⌉` (~78 px).
  - Слово источника (`SOURCE_LABEL`) в триггере заменяется точкой 6×6 px (`data-song-key-picker-source-dot`), видимой только когда `sourceLabel` непустой. Сам словарь `SOURCE_LABEL` не трогать — он нужен внутри шторки.
  - Бейдж капо: оставить `data-song-key-picker-capo-badge`, но текст — только цифра, без слова «капо». Вертикальный разделитель убрать.
  - `aria-label` кнопки обязан стать полным и расшифровывать и точку, и бейдж:
    `Тональность ${value}${sourceLabel ? `, ${sourceLabel}` : ''}${capo > 0 ? `, каподастр ${capo}` : ''}`.
    Точка не должна быть единственным носителем смысла.
  - Обновить комментарий про выравнивание с кнопкой настроек: высота 34–36 px сохраняется.

  **Готово, когда:** при `value='A♭', source='personal', capo=3` ширина триггера ≤ 80 px, `aria-label` содержит «моя» и «каподастр 3», внутри шторки подписи не изменились.

  **НЕ делай:** не трогай `src/features/songs/components/SongKeyPicker.test.tsx` строки 93–117 — они проверяют подпись `data-song-key-picker-capo-label` **внутри шторки**, она не меняется. Существующих ассертов на текст триггера в проекте нет; добавь новый тест на триггер (текст-бейдж = «3», наличие `source-dot`, полный `aria-label`).

  LOGGING: не требуется — изменение чисто презентационное.

- [x] **Задача 5: `SetlistPagerDock` — нижняя таблетка `‹ · N/M · ›`**

  Новый файл: `src/features/setlists/components/SetlistPagerDock.tsx`. Контракт — см. `SetlistPagerDockProps`.

  - Одна pill-таблетка: `‹` (44×44) | центр `иконка ListMusic + {index+1} / {total}` | `›` (44×44). Итого ~165 px.
  - Позиционирование: `absolute bottom-4 left-1/2 -translate-x-1/2 pb-safe`, `backdrop-blur-md`, фон `bg-app-surface/90`, тень `shadow-app-card`. Обёртка `pointer-events-none`, сама таблетка `pointer-events-auto`.
  - Правый край НЕ занимает — он отдан `SongToolStack`. Проверка на 375 px: стек начинается с x=313, таблетка занимает 105…270.
  - Скрытие: `hidden === true` ⇒ `translate-y` вниз + `opacity-0`, `transition duration-300`. **Анимировать `transform`/`opacity`, не `bottom`.**
  - `aria-label`: «Предыдущая песня сета» / «Следующая песня сета»; у центра — `Песня ${index+1} из ${total}, открыть список сета` (тот же текст, что у текущего счётчика в шапке — переиспользовать формулировку).
  - Тач-цели ≥ 44×44.

  **Готово, когда:** таблетка центрирована, стрелки дизейблятся на границах, тап по центру вызывает `onOpenSetlist`, при `hidden` уезжает вниз без layout-сдвига.

  **НЕ делай:** не подключай `useChromeVisibility` — на странице песни источник скрытия другой (см. задачу 7). Флаг приходит пропом.

  LOGGING: `console.debug('[SetlistPagerDock] nav', { direction, index, total })`.

- [x] **Задача 6: `SongToolStack` — правый край под инструменты**

  Новый файл: `src/features/songs/components/SongToolStack.tsx`. Правка: `src/features/songs/components/SongAutoScroll.tsx` (строки 109–125).

  Зачем сейчас: карандаш заметок (M10) добавится в тот же угол; без стека второй FAB встанет поверх первого. Единственная задача плана, работающая на будущее — включена по прямой просьбе Игоря.

  - Вертикальная колонка: `absolute right-3.5 bottom-3.5 pb-safe flex flex-col-reverse items-center gap-2.5`. `flex-col-reverse` — чтобы первый ребёнок был нижним слотом.
  - Горизонтальный бюджет фиксирован: 48 px + поле, не зависит от числа инструментов. Стек растёт **вверх**.
  - Play/pause автоскролла переезжает из `SongAutoScroll` в слот стека: `SongAutoScroll` перестаёт позиционировать кнопку сам (убрать `absolute bottom-4 right-4 pb-safe`), но продолжает владеть логикой и кнопками скорости.
  - Кнопки скорости (80×80, `right-3 top-1/2`) не трогать. Добавить рядом комментарий-контракт: **активный инструмент забирает правый край целиком, остальные слоты в это время скрыты** — это правило для будущей палитры карандаша.
  - Мелочь оттуда же: `.sheet-num` в `src/features/songs/components/render/songs.css:327` стоит `right: 1rem` и в режиме `sheets` попадает под стек. Перенести номер листа в **левый** нижний угол листа (`left: 1rem`).

  **Готово, когда:** в режиме `scroll` автоскролл выглядит и работает как раньше, но позиционируется стеком; добавление второго ребёнка в стек не меняет горизонтальную геометрию; в `sheets` номер листа не перекрыт.

  **НЕ делай:** не выноси `SongToolStack` в `shared` — карандаш пока только в песнях (решение 5). Не добавляй проп `activeTool` — его нечем заполнять до M10; правило зафиксировано комментарием.

  LOGGING: `console.debug('[SongToolStack] render', { slots })`.

- [x] **Задача 7: Сборка страницы песни**

  Файл: `src/app/dashboard/song/page.tsx`.

  - Из `right`-слота `PageHeader` (строки 136–198) **удалить** три узла: `data-song-page-setlist-prev`, `data-song-page-setlist-counter`, `data-song-page-setlist-next`. Остаются `SongKeyPicker` и кнопка настроек.
  - Скролл-контейнер (строки 206–210) обернуть в `SwipePager` вместо `{...swipeHandlers}`. Импорт `useHorizontalSwipe` со страницы уходит (сам хук остаётся в проекте как основа `SwipePager`).
  - Предикат:
    ```ts
    const swipeEnabled =
      playback.inSetlist &&
      mode !== 'paged' &&                 // решение 6: в paged горизонталь занята страницами
      !isViewSettingsOpen && !isKeyPickerOpen && !isSetlistSheetOpen;
    ```
    Гейт по шторкам — новый: сейчас свайп живёт под открытой шторкой, где горизонтальный жест уже принадлежит ей.
  - `SetlistPagerDock` рендерится сиблингом скролл-контейнера (рядом с `SongAutoScroll`) при `playback.inSetlist && mode !== 'paged'`; `hidden={headerHidden}` — тот же флаг, что у шапки (строка 63).
  - `PagerHint` внутри `SwipePager`. `label` — название целевой песни: искать по `songs` из уже вызванного `useSongs()` (строка 51). **Каталог ещё не загружен или песня не найдена ⇒ `label = ''`** (подсказка покажет только «N из M»); лишнего запроса не делать, спиннер не показывать.
  - `navigateToSetlistSong` (строки 79–84) переиспользовать без изменений — он уже сбрасывает `scrollTop`, ставит автоскролл на паузу и делает `router.replace`.
  - Кнопки автоскролла обернуть в `SongToolStack` с `hidden={headerHidden}`.

  **Готово, когда:** шапка при `капо 3` + личной тональности + длинном названии не переполняется на 375 px; свайп листает сет; в `paged` свайп не работает; при открытой шторке свайп не работает; док и стек прячутся вместе с шапкой.

  **НЕ делай:** не меняй `router.replace` на `push` в `navigateToSetlistSong` — иначе back после N свайпов прогонит N песен.

  LOGGING: сохранить существующий `[useSetlistPlayback]` debug; добавить `console.debug('[SongPage] swipe nav', { from, to })` в `navigateToSetlistSong`.

- [x] **Задача 8: Тесты страницы песни + offline-e2e**

  Файлы: `src/app/dashboard/song/page.test.tsx`, `e2e/offline/setlists-offline.spec.ts`.

  **Это блокирующая задача, а не формальность.** Удаляемые в задаче 7 якоря используются:
  - `page.test.tsx`: строки 112, 113, 125, 149, 158, 165, 173;
  - `e2e/offline/setlists-offline.spec.ts`: строки 108, 124, 127, 129.

  Что сделать:
  - Заменить `[data-song-page-setlist-prev|next|counter]` на `[data-setlist-pager-dock-prev|next|counter]` в обоих файлах.
  - В `page.test.tsx` добавить кейсы: (а) свайп влево на последней песне сета → `router.replace` не вызван, подсказка показывает границу; (б) `mode === 'paged'` → жест не коммитит.
  - Проверить, что e2e-ассерт `toHaveText('2 / 2')` соответствует новому формату счётчика в доке (пробелы вокруг слэша сохранить).

  **Готово, когда:** `yarn test` зелёный И прогнан офлайн-контур: `yarn build` → `yarn bff:start &` → `yarn static:serve &` → `yarn e2e:offline` зелёный.

  **НЕ делай:** не помечай задачу выполненной по одному только `yarn test` — e2e-спека офлайн-регрессии сетлистов не запускается юнит-прогоном.

  LOGGING: глушение `console.debug` в юнит-тестах.

<!-- Commit checkpoint: задачи 4–8 -->

### Фаза 3: Ридер Библии

**Читать перед стартом:** `src/features/reading/components/ReadingView.tsx`, `src/features/reading/hooks/useChapterNavigation.ts`, `src/features/reading/hooks/useBibleText.ts`, `src/features/reading/components/FloatingChapterNav.tsx`.

- [x] **Задача 9: Свайп между главами**

  Файл: `src/features/reading/components/ReadingView.tsx`.

  - Обернуть область текста в `SwipePager`:
    - `onPrev = handlePrevChapter`
    - `onNext = day ? handleFloatingNext : handleNextChapter` — **ровно те же обработчики, что у кнопок `FloatingChapterNav`** (строки 253–259).
    - `onEnd = day ? handleFloatingNext : undefined` — на последней главе дня `canGoNext()` даёт `false`, но это не «край», а завершение дня: `handleFloatingNext` ведёт в `CompletionModal`. Ради этого `onEnd` и заведён в контракте.
    - `canPrev = canGoPrev()`, `canNext = canGoNext()`.
  - `FloatingChapterNav` **не трогать** — счётчик в ридер не добавляем (решение 3).
  - `PagerHint`:
    - в режиме плана `total = day.items.length`, `index` = позиция текущего item;
    - вне плана `total` = число глав книги из `BIBLE_STRUCTURE`, `index = chapter - 1`;
    - `label` в обоих случаях — ссылка целевой главы вида «Псалтирь 80».
  - `enabled = false` при открытых `BookPicker` / `ChapterPicker` / `ReadingSettings` / `CompletionModal`.

  **Готово, когда:** свайп внутри дня листает главы плана и отмечает прочитанное так же, как кнопка ›; свайп влево на последней главе дня открывает `CompletionModal`; вне плана на главе 1 свайп вправо показывает «Это первая» и не переходит; вертикальный скролл текста не ловится как свайп.

  **НЕ делай:** не пиши для свайпа отдельную ветку навигации — он обязан вызывать те же функции, что кнопки. Разошедшиеся пути «кнопка ≠ жест» — это класс багов, который в проекте уже разбирался.

  LOGGING: `console.debug('[ReadingView] swipe nav', { from, to, planMode })`.

- [x] **Задача 10: Прогрев соседней главы**

  Файл: `src/features/reading/hooks/useBibleText.ts` (добавить эффект) или новый `src/features/reading/hooks/usePrefetchChapter.ts` рядом.

  Зачем: свайп делает переход мгновенным жестом. Без прогрева серия свайпов офлайн даёт **произведение** таймаутов (N экранов × T), а не сумму.

  - После успешной загрузки текущей главы — best-effort прогрев соседних (prev/next по тому же правилу, что `canGoNext`/`canGoPrev`): `bibleApi.getText` → `setCachedText` + `persistText`.
  - `isDefinitelyOffline()` (уже импортируется в файле) ⇒ прогрев **не запускается вовсе**: ждать бессмысленно, ожидание бесконечно by construction.
  - Прогрев обёрнут в `raceNetwork(promise, DEFAULT_NETWORK_TIMEOUT_MS)` и `.catch(() => {})` — он никогда не влияет на UI и не даёт unhandled rejection.
  - Ключи — только существующие `setCachedText` / `persistText`, те же, что читает `useBibleText`.

  **Готово, когда:** после открытия главы соседние лежат в кэше; при `navigator.onLine === false` сетевого вызова нет; зависший fetch прогрева не мешает отрисовке текущей главы.

  **НЕ делай:** не добавляй прогреву ретраи и не вводи circuit breaker в общий `raceNetwork`/`withTimeout` — у этих примитивов есть не-сетевые потребители (`indexedDB.open`), и «оптимизация» превратится в отказ фолбэк-слоя.

  LOGGING: `console.debug('[useBibleText] prefetch', { book, chapter, skipped })`.

- [x] **Задача 11: Тесты ридера**

  Файлы: `src/features/reading/components/ReadingView.test.tsx` (новый), `src/features/reading/hooks/useBibleText.test.ts` (дополнение).

  1. Свайп влево на последней главе дня плана → вызван тот же обработчик, что у кнопки ›, показан `CompletionModal`.
  2. Свайп внутри дня → переход на `day.items[i+1]`, `onChapterRead` вызван для текущей.
  3. Вне плана: свайп вправо на главе 1 → перехода нет, подсказка «Это первая».
  4. Прогрев, **оба офлайн-режима** (обязательный кейс по правилам проекта):
     - (а) `navigator.onLine === false` → `bibleApi.getText` для соседей не вызывается вовсе;
     - (б) fetch соседей **никогда не резолвится** → прогрев отваливается по таймауту, текущая глава отрисована, экран не залипает.

  **Готово, когда:** `yarn test` зелёный, все 4 группы проходят.

  LOGGING: глушение `console.debug` в тестах.

<!-- Commit checkpoint: задачи 9–11 -->

### Фаза 4: Отделка

- [ ] **Задача 12: reduced-motion, a11y и документация**

  Файлы: `docs/design-system.md`, `docs/offline-pwa.md`, `AGENTS.md`, `.ai-factory/ROADMAP.md`.

  - Прогон с `prefers-reduced-motion: reduce`: подсказка без scale, контент без `translateX`, переходы работают.
  - A11y: все тач-цели ≥ 44×44; `aria-label` стрелок дока и триггера тональности расшифровывают иконки и точку; `PagerHint` не крадёт фокус и `aria-hidden`.
  - Проверка обеих тем приложения и трёх тем ридера (`light` / `dark` / `sepia`) — подсказка читается везде.
  - `docs/design-system.md`: раздел про `SwipePager` / `PagerHint` / `SetlistPagerDock` / `SongToolStack`; правило «шапка = back + заголовок + максимум 2 действия»; правило «одна ось — одно значение» с таблицей режимов и исключением `paged`; правило «правый край песни = стек инструментов».
  - `docs/offline-pwa.md`: прогрев соседней главы и почему он не ретраится.
  - `AGENTS.md`: новые файлы в таблицу ключевых точек входа.
  - `.ai-factory/ROADMAP.md`: пометка к M7 о полировке; упоминание, что `SongToolStack` готовит слот для M10.
  - Прототип `.ai-factory/design/setlist-swipe-prototype.html` оставить как есть — он источник решений, а не артефакт реализации.

  **Готово, когда:** документация описывает все четыре новых компонента и оба правила, `AGENTS.md` не отстаёт от дерева файлов.

<!-- Commit checkpoint: задача 12 -->

---

## Верификация (без этого изменение не готово)

1. `yarn test` + `yarn lint` — всегда.
2. **Офлайн-контур обязателен** (задача 8 меняет `e2e/offline/setlists-offline.spec.ts`):
   `yarn build` → `yarn bff:start &` → `yarn static:serve &` → `yarn e2e:offline`.
   Нужен `.env.test` с `E2E_TEST_LOGIN` / `E2E_TEST_PASSWORD` — см. `e2e/offline/README.md`.
3. Ручная проверка на 375 px в обеих темах: шапка не переполняется при `капо 3` + личной тональности + длинном названии.
4. Ручная проверка на 768 px: `scroll` и `sheets` — свайп работает, док и стек не наезжают друг на друга, номер листа не перекрыт.
5. Свайп на реальном тач-устройстве: не перехватывает системный back-свайп у края, не ловит вертикальный скролл текста, работает при включённом автоскролле.
6. Офлайн-санити: перевести вкладку в офлайн, пролистать 3 главы подряд свайпом — экраны отдают текст из IDB, зависаний нет.

---

## Что осознанно НЕ делаем

- **Не объединяем `useSetlistPlayback` и `useChapterNavigation` в общий `usePager`.** Общее у них — только `{index, total, canPrev, canNext}`; всё остальное (побочные эффекты плана, отметка прочитанного, завершение дня, прогрев песен сета) различается. Общим делается слой жеста и подсказки, а не навигационная логика.
- **Не удаляем режим `paged`** и не переносим педальное листание в `sheets`. Педаль пока не используется, но и не отвергнута; выключить свайп в одном режиме дешевле, чем переносить функциональность (решение 6).
- **Не добавляем счётчик в `FloatingChapterNav`** — решение 3.
- **Не делаем отдельную широкую раскладку шапки/дока** — решение 7.
- **Не выносим `SongToolStack` в `shared`** — решение 5.
