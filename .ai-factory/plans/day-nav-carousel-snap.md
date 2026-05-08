# План: карусель выбора дня в `DayNavigationBar` (iOS-wheel UX)

Branch: main
Created: 2026-05-08

## Settings

- **Testing:** no (в проекте нет testing-library setup; ручное QA через chromeDevtools MCP)
- **Logging:** verbose, **гейтнутые через `NODE_ENV !== 'production'`** (детальные `dlog('[day-nav] …')` на snap-events, fallbacks; в production-сборке — noop, чтобы не засорять консоль)
- **Docs:** no (warn-only в `/aif-implement` — это UI-only изменение, без публичного API)

## Roadmap Linkage

Файл `.ai-factory/ROADMAP.md` отсутствует — привязка к вехам не выполнялась.

## Контекст и принятые решения

**Что меняем:** `src/features/plan/components/DayNavigationBar.tsx` — внутренний скролл-трек (`data-day-nav-bar-scroll`) превращаем в карусель iOS-picker-style. Центральный элемент = выбранный день. Соседи слева/справа уменьшены и слегка прозрачны, как будто на «кольце». Снап на ближайший день после свайпа с лёгкой «защёлкивающейся» анимацией.

**Подтверждённые ответы пользователя:**
- **Технология:** `motion` (Framer Motion) + нативный CSS `scroll-snap`. `motion@^12.29.2` уже в `package.json`, в `src/` пока не используется — это первое применение. Новых зависимостей нет.
- **Триггер `onSelectDay`:** только после `scroll-end` (snap), а не во время свайпа. Один фетч плана дня вместо лавины запросов.
- **Дизайн:** сохраняем существующие кубики (w-14 h-16, weekday/number/date/check). Видимая зона: 2 + центр + 2. Крайние видимые `scale 0.85` + `opacity 0.55`.
- **Производительность:** виртуализация окна ±15 дней вокруг выбранного. На границах плана — `hard stop` без rubber-band.
- **Кнопка «Сегодня»:** сохраняем существующее поведение (floating с градиентом), переподключаем к новому источнику `centerDayId`.

**Ключевые архитектурные решения (motivation):**

1. **Native scroll + scroll-snap, а не motion.drag.** Нативный скролл даёт «бесплатно» инерцию iOS, корректную работу со scroll-chaining/overscroll, не требует ручной физики. Через CSS `scroll-snap-type: x mandatory` + `scroll-snap-align: center` браузер сам защёлкнет ближайший элемент. `motion` — только для визуального эффекта «кольца» (scale/opacity по `motionValue`).
2. **Edge spacers вместо `padding`.** Чтобы первый и последний день могли встать в центр, вместо `padding-inline: 50%` (ломает измерения позиций) добавляем пустые spacer-`div` шириной с боковой зазор. `scroll-snap-align: none` на spacer'ах.
3. **Виртуализация на месте.** Не подключаем `react-virtual` ради одной фичи: рендерим только окно `[selectedIdx - 15, selectedIdx + 15]`, ленточка пересчитывает индексы вокруг центра при скролле. Спейсеры компенсируют «отсутствующие» дни, чтобы scroll-position не прыгал.
4. **Snap-end детект:** `scrollend` event (Chromium/Safari 18+/Firefox). Fallback — debounced `scroll` (~120ms тишины + проверка `scrollLeft` = `snap target`). Лог-фолбек через `console.debug('[day-nav] scrollend fallback used')`.
5. **Без rubber-band.** Это иконическая часть iOS picker, но в горизонтальном UI на вебе плохо реализуется без drag-режима — оставляем `hard stop`. Соответствует решению пользователя.
6. **a11y и `prefers-reduced-motion`:** при `reduce-motion` скейл/прозрачность соседей не применяются (только цвет/border выделяет центр), но snap остаётся. Клавиатурная навигация ←/→ — программный snap к соседу.

**Файлы, которые будут затронуты:**
- `src/features/plan/components/DayNavigationBar.tsx` — переписываем
- `src/features/plan/hooks/useDayNavCarousel.ts` — **новый**, инкапсулирует scroll-логику
- `src/app/globals.css` — мини-добавление `@media (prefers-reduced-motion)` правил, если понадобятся (опционально)

**Что НЕ трогаем:**
- `PlanView.tsx` `handleSelectDay` (контракт `onSelectDay(id)` сохраняем)
- `PlanContext` (тот же `setSelectedDayId`)
- Дизайн самих кубиков (кроме обёртки `motion.div` + transform)
- URL sync (он уже работает через `replaceState`)

---

## Tasks

### Phase 1: Hook — изоляция scroll-логики

- [x] **Task 1: Создать `useDayNavCarousel` hook**

  **Файл:** `src/features/plan/hooks/useDayNavCarousel.ts` (новый).

  **API:**
  ```ts
  export interface UseDayNavCarouselArgs {
    dayIds: number[];           // отфильтрованный plan.id
    selectedDayId: number | null;
    onSnapToDay: (dayId: number) => void;  // вызывается после scrollend
    cubeWidthPx: number;        // 56 (w-14) — для расчётов
    gapPx: number;              // 12 (gap-3)
    windowRadius?: number;      // default 15 — окно виртуализации
  }
  export interface UseDayNavCarouselReturn {
    trackRef: React.RefObject<HTMLDivElement | null>;
    visibleDayIds: number[];           // окно для рендера
    leadingSpacerPx: number;           // ширина spacer'а слева
    trailingSpacerPx: number;          // справа
    centerDayId: number | null;        // текущий "по центру" в реальном времени
    isScrolling: boolean;              // активен ли свайп/инерция (для гейта window-shift)
    scrollX: MotionValue<number>;      // для подписки на transform
    scrollToDay: (dayId: number, behavior?: ScrollBehavior) => void;
  }
  ```

  **DEV-helper для логов (в начале файла):**
  ```ts
  const dlog: typeof console.debug =
    process.env.NODE_ENV !== 'production' ? console.debug.bind(console, '[day-nav]') : () => {};
  ```

  **Поведение:**
  1. Хранит `scrollX` (motionValue) — обновляется в `onScroll` через `scrollX.set(track.scrollLeft)`.
  2. На каждом scroll-событии пересчитывает `centerDayId` исходя из `scrollLeft + viewportWidth/2` → ближайший snap-target. **Гистерезис:** новый `centerDayId` фиксируется только если расстояние от центра viewport до центра кубика < `(cubeWidthPx + gapPx) / 2 - 4px` (dead-zone), иначе оставляем предыдущий. Лог: `dlog('center →', dayId)` при изменении.
  3. **`scrollend` listener** (с feature-detect через `'onscrollend' in window`) — вызывает `onSnapToDay(centerDayId)` если он отличается от `selectedDayId`. Fallback: debounced `scroll` (timeout 120ms тишины + проверка `scrollLeft` на snap-target). Лог: `dlog('scrollend → snap to', dayId)` или `dlog('scrollend fallback used')`.
  4. **`isScrolling` flag:** `true` от первого `scroll`-события до либо `scrollend`, либо истечения debounce-таймера. Используется как гейт для window-shift (см. п.5) и для подавления отправки `onSnapToDay` во время активного скролла.
  5. **Виртуализация:** `visibleDayIds = dayIds.slice(max(0, selectedIdx - R), min(N, selectedIdx + R + 1))`. `leadingSpacerPx = max(0, selectedIdx - R) * (cubeWidthPx + gapPx) + halfViewportPadding`, аналогично trailing. **Расширение окна происходит ТОЛЬКО при `isScrolling === false`**, иначе игнорируем (защита от прыжков spacer'а под пальцем). Когда окно сдвигается — `scrollLeft` корректируется на дельту spacer'а атомарно с ререндером (через `useLayoutEffect`), чтобы избежать визуального jitter. Лог: `dlog('window shifted', { from, to, deltaPx })`.
  6. **`scrollToDay(dayId, behavior)`:** вычисляет target `scrollLeft` на основе индекса в полном `dayIds`. Если день вне текущего окна — сначала **synchronously** расширяет окно (с пересчётом spacer'ов), затем `track.scrollTo({ left, behavior })`. No-op если `centerDayId === target` и `behavior === 'smooth'` (избегаем лишний smooth-scroll).
  7. **Edge `halfViewportPadding` = `(track.clientWidth - cubeWidthPx) / 2`** — гарантирует, что первый/последний день могут оказаться в центре. Hard stop достигается тем, что `scrollLeft` не уйдёт за `0`/`scrollWidth - clientWidth` (нативное поведение).

  **Cleanup (return из useEffect — обязательно):**
  - `track.removeEventListener('scroll', onScroll)`
  - `track.removeEventListener('scrollend', onScrollEnd)` (если был attach)
  - `clearTimeout(debounceTimer)`
  - `clearTimeout(isScrollingTimer)`
  - ResizeObserver — `disconnect()` (см. Task 2)

  **Зависимости:** ни одной (только React + `motion`).

- [x] **Task 2: ResizeObserver для пересчёта halfViewportPadding**

  **Файл:** тот же `useDayNavCarousel.ts`.

  **Поведение:** на изменение ширины track (поворот устройства, шторка, изменение шрифта) пересчитываем `halfViewportPadding` и подстраиваем `leadingSpacerPx` так, чтобы текущий `centerDayId` оставался по центру. Корректируем `track.scrollLeft` атомарно с ресайзом, чтобы центр не «уплыл». Лог: `dlog('resize, repositioning', { newWidth, centerDayId })`.

  **Блокируется:** Task 1.

- [x] **Task 2.5: Initial mount centering (без анимации)**

  **Файл:** `useDayNavCarousel.ts` + интеграция в `DayNavigationBar.tsx`.

  **Контекст:** при первом маунте `selectedDayId` приходит как `null` (`PlanContext` сначала загружает план, потом ставит сегодняшний день, см. `PlanContext.tsx:148-156`). Карусель не должна делать smooth-scroll с нулевой позиции — это будет некрасивая анимация на старте.

  **Поведение:**
  1. Локальный ref `hasCenteredRef` (boolean), стартует `false`.
  2. `useLayoutEffect` слушает `selectedDayId`: когда он впервые становится не-null И `trackRef.current` готов — вызывает `scrollToDay(selectedDayId, 'auto')` (мгновенный jump, не smooth) и ставит `hasCenteredRef.current = true`.
  3. Все последующие изменения `selectedDayId` (Task 6) идут через `'smooth'`.
  4. Если `selectedDayId === null` — карусель остаётся на `scrollLeft = 0`, спейсер обеспечивает что первый день виден слева. Это редкий промежуточный кадр (мс), визуально допустимо.

  **Лог:** `dlog('initial center → jump to', selectedDayId)`.

  **Блокируется:** Task 1.

### Phase 2: Визуал кольца через motion

- [x] **Task 3: Обернуть кубики в `motion.div` с transform по расстоянию до центра**

  **Файл:** `src/features/plan/components/DayNavigationBar.tsx`.

  **Поведение:**
  1. **Дочерний компонент `<CubeMotion indexInWindow={i} ... />`** — каждый видимый день рендерится через него. Внутри:
     ```ts
     // Позиция центра ЭТОГО кубика в track-coordinates (стабильная, зависит от spacer + index):
     const cubeCenter = leadingSpacerPx + indexInWindow * (cubeWidthPx + gapPx) + cubeWidthPx / 2;
     // Расстояние центра кубика до центра viewport — функция от scrollX:
     const distance = useTransform(scrollX, (x) => Math.abs(cubeCenter - (x + viewportWidth / 2)));
     // Интерполяция через числовые массивы (быстрее в motion v12, чем function-based):
     const STEP = cubeWidthPx + gapPx;
     const scale   = useTransform(distance, [0, STEP, 2 * STEP, 3 * STEP], [1.0,  0.92, 0.85, 0.78]);
     const opacity = useTransform(distance, [0, STEP, 2 * STEP, 3 * STEP], [1.0,  0.85, 0.55, 0.40]);
     ```
     **Важно:** хук `useTransform` принимает MotionValue → не вызывает ре-рендер React.
  2. `<motion.button style={{ scale, opacity }}>` — рендерим прямо как `motion.button` (а не `motion.div` + nested `<button>`), чтобы сохранить нативную семантику кнопки и onClick.
  3. `transformOrigin: 'center bottom'` (через `style.transformOrigin` или Tailwind `[transform-origin:center_bottom]`) — ощущение «уходящих под кольцо» снизу.
  4. **`will-change: transform`** на кубиках — GPU композитинг, плавность на слабых устройствах. Через Tailwind: `will-change-transform`.
  5. `prefers-reduced-motion: reduce` через `useReducedMotion()` (импорт из `motion/react`):
     - если `true` → `scale = 1, opacity = 1` (фиксированные числа, без `useTransform`); снап остаётся, кольца нет.

  **`viewportWidth` для расчёта:** прокидываем из hook'а как часть state (или отдельный motion-value), обновляется в ResizeObserver (Task 2). На SSR fallback: `0` — до первого `useLayoutEffect` кубики просто отрисуются с дефолтными scale/opacity.

  **Логирование:** `dlog('reduce-motion =', reduceMotion)` один раз при mount.

  **Блокируется:** Task 1.

- [x] **Task 4: «Защёлкивающаяся» анимация при смене центра**

  **Файл:** тот же `DayNavigationBar.tsx`.

  **Реализация:** **`useAnimate()` от motion** (импорт `from 'motion/react'`). НЕ key-based remount, НЕ `whileInView`. `useAnimate` возвращает `[scope, animate]`:

  ```tsx
  const [scope, animate] = useAnimate();
  // scope биндим на root track:
  <div ref={(el) => { trackRef.current = el; (scope as any).current = el; }} ...>
  // на каждом snap (centerDayId changed && !isScrolling по факту scrollend):
  useEffect(() => {
    if (centerDayId == null || prefersReducedMotion) return;
    animate(
      `[data-day-nav-cube="${centerDayId}"]`,
      { scale: [1.08, 1.0] },
      { duration: 0.18, ease: [0.34, 1.56, 0.64, 1] } // back-out
    );
    dlog('snap pulse for', centerDayId);
  }, [centerDayId, prefersReducedMotion, animate]);
  ```

  **Тонкость:** scale из `useTransform` (Task 3) и pulse-animate конфликтуют по одному и тому же CSS-property. Решение: **pulse применяется к НЕ-motion обёртке/inner-`<span>` внутри motion.button**, либо к `data-day-nav-cube-number` — через `[data-day-nav-cube="${id}"] [data-day-nav-cube-pulse]` селектор. Это предотвращает «скачок» motion-value scale при animate.

  **`prefers-reduced-motion`:** пропускаем pulse целиком.

  **Лог:** `dlog('snap pulse for', centerDayId)`.

  **Блокируется:** Task 3.

### Phase 3: Интеграция и контракт

- [x] **Task 5: Заменить scroll-логику в `DayNavigationBar` на новый hook + spacer'ы**

  **Файл:** `src/features/plan/components/DayNavigationBar.tsx`.

  **Изменения:**
  1. Убираем старый `useEffect` со `scrollIntoView` + `IntersectionObserver` для today-cube (`DayNavigationBar.tsx:52-97`).
  2. Подключаем `useDayNavCarousel({ dayIds, selectedDayId, onSnapToDay: onSelectDay, cubeWidthPx: 56, gapPx: 12 })`.
  3. Track:
     ```jsx
     <div
       ref={trackRef}
       data-day-nav-bar-track
       role="listbox"
       aria-label="Дни плана чтения"
       tabIndex={0}
       className="day-navigation-bar w-full overflow-x-auto pb-2 pt-8 pb-8
                  snap-x snap-mandatory
                  [scroll-snap-stop:normal]
                  [touch-action:pan-x]
                  [overscroll-behavior-x:contain]
                  [overflow-anchor:none]
                  [scrollbar-width:none] [-ms-overflow-style:none]
                  [&::-webkit-scrollbar]:hidden"
     >
       <div style={{ width: leadingSpacerPx }} aria-hidden className="shrink-0" />
       <div data-day-nav-bar-scroll className="flex gap-3">
         {visibleDayIds.map((id, i) => <CubeMotion key={id} dayId={id} indexInWindow={i} ... />)}
       </div>
       <div style={{ width: trailingSpacerPx }} aria-hidden className="shrink-0" />
     </div>
     ```
  4. **CSS-свойства (полный список):**
     - `snap-x snap-mandatory` — на track (Tailwind core)
     - `snap-center will-change-transform` — на каждой `motion.button` (НЕ на spacer'ах)
     - `[scroll-snap-stop:normal]` — позволяет flick'ом пролетать несколько снапов (iOS-like). Если `always` — пользователь будет «упираться» в каждый день, что хуже.
     - `[touch-action:pan-x]` — критично для iOS PWA: запрещает вертикальный pan, чтобы свайп не конфликтовал с outer `overflow-y-auto` в `PlanView`.
     - `[overscroll-behavior-x:contain]` — горизонтальный свайп не «утянет» browser-back-gesture или родительский скролл.
     - `[overflow-anchor:none]` — браузер не пытается «закреплять якорь» на DOM-узлах при ре-рендере виртуального окна (иначе бывают visual jumps).

  5. **Реструктуризация JSX:** убираем промежуточный `<div ref={scrollContainerRef} className="day-navigation-bar-scroll flex gap-3 min-w-max">` с двойным ref и заменяем на схему выше: один `trackRef` на overflow-контейнере, внутренний flex без рефа.

  **Контракт `onSelectDay`:** вызывается ТОЛЬКО когда `centerDayId !== selectedDayId` после `scrollend` (или fallback debounce). Идемпотентно. Во время `isScrolling === true` НЕ вызывается.

  **Лог:** `dlog('onSelectDay called', { from: selectedDayId, to: centerDayId })`.

  **Блокируется:** Task 1, 3.

- [x] **Task 6: Программный recenter при внешнем изменении `selectedDayId`**

  **Файл:** тот же.

  **Поведение:** когда `selectedDayId` приходит извне (из URL `?day=N`, из тапа на «Сегодня», программного `setSelectedDayId` в `PlanContext`), `useEffect` вызывает `scrollToDay(selectedDayId, 'smooth')`.

  **Защита от петли «snap → onSelectDay → setSelectedDayId → recenter»:**
  - `scrollToDay` no-op'ит, если `centerDayId === target` (см. Task 1 пункт 6).
  - **Отдельно от Task 2.5:** initial mount уже спозиционировался через `'auto'`. Этот useEffect должен пропускать первый запуск, чтобы не делать дублирующий `'smooth'`-scroll сразу после `'auto'`-jump. Использовать `hasCenteredRef` из Task 2.5: пропуск пока `hasCenteredRef.current === false`.

  **Лог:** `dlog('external selectedDayId change → recenter', selectedDayId)`.

  **Блокируется:** Task 1, 2.5, 5.

- [x] **Task 7: Кнопка «Сегодня» — переключить источник на `centerDayId`**

  **Файл:** тот же.

  **Изменения:**
  1. Условие появления кнопки: `centerDayId !== todayDayNumber` (вместо `!isTodayCubeVisible || selectedDayId !== todayDayNumber`).
  2. Логика стороны (left/right) — `todayDayNumber > centerDayId ? 'right' : 'left'`. Убираем `IntersectionObserver` — он больше не нужен, у нас всегда есть `centerDayId`.
  3. Onclick: `scrollToDay(todayDayNumber, 'smooth')`. После snap-end автоматически вызовется `onSelectDay(todayDayNumber)` через основной поток — отдельно его дёргать не нужно.
  4. Сохраняем визуал: floating с градиентом, тот же дизайн, тот же ARIA.

  **Лог:** `console.debug('[day-nav] today button click')`.

  **Блокируется:** Task 5.

### Phase 4: Polish & QA

- [x] **Task 8: a11y и клавиатурная навигация**

  **Файл:** тот же.

  **Семантика ARIA (важно: разделяем `isCenter` vs `isSelected`):**
  - `isCenter` — live во время свайпа, дрожит. Чисто визуальный indicator (через motion-transforms).
  - `isSelected` (= `dayId === selectedDayId`) — стабильное состояние, обновляется только после snap. Это и есть «выбран» с точки зрения SR.

  **Поведение:**
  1. Track:
     ```jsx
     role="listbox"
     aria-label="Дни плана чтения"
     tabIndex={0}
     aria-activedescendant={selectedDayId !== null ? `day-cube-${selectedDayId}` : undefined}
     ```
  2. Каждый кубик (`motion.button`):
     ```jsx
     id={`day-cube-${day.id}`}
     role="option"
     aria-selected={day.id === selectedDayId}  // НЕ centerDayId
     aria-label={`День ${day.id}, ${formattedDate}, ${statusLabel}`}
     ```
     где `statusLabel`: «выполнено» / «пропущено» / «предстоит».
  3. **Клавиатурная навигация** (onKeyDown на track):
     - `ArrowLeft` / `ArrowRight`: `e.preventDefault(); scrollToDay(neighborDayId, 'smooth')`. После snap-end → onSelectDay автоматически.
     - `Home`: `scrollToDay(dayIds[0], 'smooth')`
     - `End`: `scrollToDay(dayIds[dayIds.length-1], 'smooth')`
     - `Enter`/`Space` на сфокусированном track: no-op (ничего «активировать» не нужно — выбор = центрирование).
  4. **Tap на не-центральный кубик:** `scrollToDay(id, 'smooth')`. НЕ моментальный `setSelectedDayId(id)` — пусть проходит через snap-flow для единого пути.

  **Лог:** `dlog('keyboard nav', { key, from, to })`.

  **Блокируется:** Task 5.

- [x] **Task A: Рамка следует за `centerDayId`, убран `ring-offset`**

  **Файлы:** `DayNavigationBar.tsx`.

  **Изменения:**
  - `getDayCubeClasses(status, isCenter)` — второй аргумент переименован в `isCenter`; убран `ring-offset-1 ring-offset-app-bg` (рамка flush с кубиком)
  - `CubeMotionProps` — добавлен `isCenter: boolean`; `isSelected` сохранён только для `aria-selected`
  - `React.memo` comparator — добавлено `prev.isCenter === next.isCenter`
  - Рендер-луп — `const isCenter = id === centerDayId`, передаётся в `CubeMotion`
  - Рамка визуально следует за центральным кубиком во время свайпа; `aria-selected` по-прежнему на `selectedDayId`

- [x] **Task B: Оптимизация ref-sync — 9 отдельных `useEffect` → 2 `useLayoutEffect`**

  **Файлы:** `useDayNavCarousel.ts`, `DayNavigationBar.tsx`.

  **Изменения:**
  - `useDayNavCarousel.ts`: 5 отдельных `useEffect(() => { ref.current = value }, [value])` заменены одним `useLayoutEffect(() => { ... })` без deps (запускается синхронно после каждого рендера)
  - `DayNavigationBar.tsx`: аналогично, 4 → 1 `useLayoutEffect`
  - Итого: -9 `useEffect`-вызовов, -8 async flush'ей; refs всегда актуальны до следующего paint

- [ ] **Task 9: Ручное QA через chromeDevtools MCP**

  Сценарии:
  1. **Свайп влево/вправо:** убедиться, что после остановки центральный кубик «защёлкивается», `onSelectDay` вызывается ровно один раз с правильным id, URL обновляется, контент дня перезагружается.
  2. **Тап по соседу:** smooth scroll к нему, snap, `onSelectDay`.
  3. **Тап «Сегодня»:** smooth scroll к today, snap, кнопка скрывается.
  4. **Стиль кольца:** проверить scale/opacity соседей в DevTools (Performance → нет жёлтых long tasks при свайпе).
  5. **Виртуализация:** свайпнуть на 50 дней вперёд — DOM содержит только окно ±15 + spacer'ы, никаких 365 узлов.
  6. **Hard stop на краях:** day 1 и последний день — не уезжают мимо центра.
  7. **Reduced motion:** в DevTools rendering → `prefers-reduced-motion: reduce` — соседи без scale/opacity, snap работает.
  8. **Resize:** разворот устройства / DevTools resize → центр не теряется.
  9. **URL sync:** ручная вставка `?day=42` в URL → карусель smooth-scroll'ит на день 42.
  10. **Console:** verbose логи `[day-nav] *` присутствуют, нет ошибок.

  **Регрессии:**
  - Календарь (CalendarView): тап на день → возврат на /dashboard?day=N → DayNavigationBar встаёт на нужный день.
  - Mark all read: после клика на текущем дне статус кубика обновляется без ререндера всей ленты.

  **Блокируется:** Task 1–8.

---

## Commit Plan

10 задач (Task 1, 2, 2.5, 3, 4, 5, 6, 7, 8, 9) — нужны чекпоинты.

- **Commit 1** (после Task 2.5): `feat(plan): add useDayNavCarousel hook with virtualization, scrollend detection, initial centering`
- **Commit 2** (после Task 4): `feat(plan): add iOS-wheel scale/opacity transforms and snap pulse to day nav`
- **Commit 3** (после Task 7): `feat(plan): wire DayNavigationBar to carousel hook, preserve today button`
- **Commit 4** (после Task 9): `feat(plan): a11y for day nav carousel (listbox + activedescendant) and verified manual QA`

---

## Open Questions / Risks

1. **`scrollend` поддержка.** Safari 18 поддерживает, iOS Safari 18+ тоже. Для iOS 17- — debounced fallback. Логируем какой путь использован — мониторим в production.
2. **Снап на динамической ширине spacer'а.** При расширении окна виртуализации `leadingSpacerPx` меняется → `scrollLeft` нужно сдвинуть на ту же дельту, иначе визуальный прыжок. Реализация в Task 1 пункт 5; защита от прыжков под пальцем — через `isScrolling`-гейт.
3. **`useTransform` производительность.** На 5 одновременно отображаемых кубиках — пренебрежимо. Если когда-то решим увеличить окно до 7+, проверить FPS.
4. **iOS PWA в `standalone`.** Native scroll иногда дёргается при `overflow: scroll` внутри fixed-position. `PlanView` сам имеет `overflow-y-auto` — потенциальный конфликт scroll-chaining. `overscroll-behavior-x: contain` + `touch-action: pan-x` в Task 5 это закрывает.
5. **React Compiler (`reactCompiler: true`).** Auto-memoization не должен ломать `useMotionValue` / `useTransform` (они идемпотентны). Если при QA увидим warning от компилятора в консоли — точечно добавим `'use no memo'` в файл `useDayNavCarousel.ts`. Не блокер.
6. **`PlanContext.fetchPlan` инициализирует `selectedDayId` уже после загрузки** (см. `PlanContext.tsx:148-156`), поэтому Task 2.5 закрывает ровно этот сценарий.
