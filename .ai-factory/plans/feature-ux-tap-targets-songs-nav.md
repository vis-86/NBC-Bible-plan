# Implementation Plan: UX-улучшения — тап-зоны карточки чтения, hide-on-scroll и восстановление позиции в песнях

Branch: feature/ux-tap-targets-songs-nav
Created: 2026-07-08

## Settings
- Testing: yes
- Logging: minimal (только WARN/ERROR; console.debug допустим только под `NODE_ENV !== 'production'` по образцу соседних файлов)
- Docs: yes  # обязательный docs-чекпоинт в /aif-implement

## Research Context
Source: .ai-factory/RESEARCH.md (Active Summary) — тема активного summary (миграция на static export + BFF) **не связана** с этим планом. План — чистые UX-фиксы UI-слоя, не затрагивают offline/SW-архитектуру. Единственное пересечение: не ломать контракт E2E `e2e/offline/outbox-sync.spec.ts` (см. Constraints).

## Цели (из запроса пользователя)

1. **Карточка «чтение на сегодня» (`TodayReadingCard`)**: сейчас неосторожный тап по строке (`data-today-reading-card-item`) отмечает пункт прочитанным, хотя пользователь хотел открыть чтение. Нужно: тап по строке → открыть чтение; отметка — только по чекбоксу и зоне рядом с ним; кликабельную зону чекбокса расширить (~44×44px).
2. **Список песен (`/dashboard/songs`)**: при скролле вниз скрывать нижнюю навигацию (как в ридере Библии), при скролле вверх — показывать. Шапка с поиском **остаётся видимой** (решение пользователя).
3. **Просмотр песни (`/dashboard/song?id=…`)**: нижней навигации там нет (`hideBottomNav`), поэтому по скроллу вниз скрываем шапку (`PageHeader` с кнопкой «назад»), по скроллу вверх — показываем.
4. **Возврат из песни в список**: попадать на ту же позицию скролла (и с тем же поисковым запросом — иначе «то же место» невозможно: отфильтрованный список имеет другую геометрию).

## Контекст кодовой базы (результат исследования — НЕ переисследовать заново)

### Карточка чтения
- `src/features/plan/components/TodayReadingCard.tsx`, строки ~97–164. Строка — `<label>`: из-за нативной связи label↔input клик по ЛЮБОЙ «пустой» зоне строки (включая `ChevronRight`) переключает чекбокс. Навигация — только по вложенной кнопке с текстом (`data-today-reading-card-item-link`). Есть две ветки разметки: основная (`day.items`) и fallback (`day.readings`, чекбокс `readOnly`).
- Обработчики: чекбокс `onChange` → `onToggleItem(day.id, item.item)`; текст-кнопка `onClick` → `onSelectReading(day, reading)` → `router.push('/dashboard/read?...')` (см. `handleSelectReading` в `src/app/dashboard/page.tsx:111`).
- Эталонные паттерны в проекте: `DayChaptersList.tsx:122–128` — расширенная тап-зона чекбокса `w-10 h-10 -m-2`; `CalendarDayDetail.tsx:32–36` — изоляция чекбокса через `e.stopPropagation()`, строка → навигация.

### Hide-on-scroll (механизм ридера)
- `src/shared/hooks/useScrollDirection.ts` — готовый хук: слушает `scroll` на элементе (не window), возвращает `{ hidden, setHidden, ignoreNextScroll }`. Учитывает iOS bounce, троттлинг через rAF. Покрыт тестами (`useScrollDirection.test.ts`).
- `src/shared/components/layout/ChromeVisibility.tsx` — контекст `chromeHidden`/`setChromeHidden`; провайдер в `DashboardLayout`.
- `src/shared/components/layout/BottomNavBar.tsx:93–96` — потребитель: `chromeHidden` → `translate-y-[110%] pointer-events-none`.
- Оркестрация в ридере — `src/features/reading/components/ReadingView.tsx:100–135`: `useScrollDirection(contentRef)` → `setChromeHidden(hidden)`; guard короткого контента (`scrollHeight <= clientHeight` → `setHidden(false)`); cleanup на unmount → `setChromeHidden(false)`; `ignoreNextScroll()` перед программным изменением `scrollTop`.

### Песни
- Список: `src/app/dashboard/songs/page.tsx` — `DashboardLayout` (bottom nav виден, `reserveNavSpace=true` → `pb-nav`), `PageHeader variant="page"` + `SearchBar` (debounce 200мс, локальный state текста), скролл-контейнер — `<div className="min-h-0 flex-1 overflow-y-auto px-4 pt-3">` (строка 33). Список — обычный `map`, без виртуализации.
- Деталь: `src/app/dashboard/song/page.tsx` — `DashboardLayout hideBottomNav`, `PageHeader` с `onBack={() => router.push('/dashboard/songs')}`, скролл-контейнер — `<div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">` (строка 32). Обёрнут в `Suspense` (из-за `useSearchParams`).
- `PageHeader` (`src/shared/components/layout/PageHeader.tsx`) — чисто презентационный; класс `sticky` фактически инертен на страницах песен (шапка — сиблинг скролл-контейнера во flex-колонке, не внутри него).
- Layout: `DashboardLayout` → `h-dvh overflow-hidden`, скроллятся только внутренние div'ы. Restore позиции скролла нигде в проекте нет.

### Constraints (обязательные)
- **E2E-контракт**: `e2e/offline/outbox-sync.spec.ts:14–31` использует `page.locator('[data-today-reading-card-item-checkbox]')` + `isChecked()`/`toBeChecked()`. Playwright `isChecked` работает с `input[type="checkbox"]` (или `role="checkbox"` + `aria-checked`). Поэтому **сохранить элемент `<input type="checkbox">` с этим data-атрибутом** — не заменять на `<button>`.
- Data-атрибуты по конвенции kebab-case (`.ai-factory/rules/base.md`, раздел DOM data attributes); существующие атрибуты (`data-today-reading-card-item`, `-item-checkbox`, `-item-link`) сохранить.
- Дизайн-токены: только `bg-app-*`, `text-app-*` и т.п.; в `TodayReadingCard` уже используются `white/5`-оверлеи поверх градиента карточки — их стиль сохранить как есть.
- Не вкладывать `<button>` в `<button>` (невалидный HTML).
- Команды shell выполнять по одной, без `&&`.
- FSD: `app` → `features` → `shared`; общие хуки — в `src/shared/hooks/`.

---

## Tasks

### Phase 1: Тап-зоны в TodayReadingCard

- [x] **Task 1: Переработать разметку строк списка в `TodayReadingCard.tsx`**

  Файл: `src/features/plan/components/TodayReadingCard.tsx` (обе ветки: `day.items` ~97–138 и fallback `day.readings` ~139–164).

  Целевая структура строки (основная ветка):
  - Корень строки: `<label>` → `<div>` (те же классы/атрибуты `data-today-reading-card-item*`, оставить `cursor-pointer`, hover через `group`). На `<div>` повесить `onClick` → та же логика навигации, что сейчас у текст-кнопки (`onSelectReading(day, reading)` с `console.warn` при неспарсенном `readText`). Это ловит клики по padding и `ChevronRight`.
  - Зона чекбокса: обёртка расширяется до ~44×44px по паттерну `DayChaptersList` — `relative flex items-center justify-center w-11 h-11 -my-2.5 -ml-2 mr-2 flex-shrink-0` (визуально позиция круга не должна съехать; подобрать компенсирующие отступы, сейчас `w-6 h-6 mr-4`). На обёртку — `onClick={(e) => e.stopPropagation()}`, чтобы тап по зоне чекбокса и рядом НЕ открывал чтение.
  - Сам `<input type="checkbox">` СОХРАНИТЬ (E2E-контракт), но растянуть его кликабельную область на всю обёртку: `absolute inset-0 w-full h-full appearance-none rounded-full cursor-pointer`. Визуальный круг вынести в отдельный `<span>`-сиблинг (`w-6 h-6 rounded-full border-2 border-white/30 peer-checked:bg-app-success peer-checked:border-app-success …`), input пометить классом `peer`. Иконка `Check` — как сейчас (`peer-checked:opacity-100`). `onChange` не меняется.
  - Текст-кнопку `data-today-reading-card-item-link` оставить (доступность с клавиатуры), но добавить в её `onClick` `e.stopPropagation()` — иначе клик по тексту вызовет навигацию дважды (кнопка + корневой div).
  - `ChevronRight` — без обработчиков (клик уйдёт в корневой div → навигация; это и есть требуемое поведение).
  - Fallback-ветка (`day.readings`): та же структура (div-корень с onClick-навигацией, чекбокс `readOnly` в расширенной обёртке со `stopPropagation`, текст-кнопка со `stopPropagation`).
  - A11y: у input добавить `aria-label={item.completed ? 'Снять отметку о прочтении' : 'Отметить как прочитано'}`.

  Логирование: сохранить существующий `console.warn('[TodayReadingCard] could not parse reading item for navigation', …)`; новых логов не добавлять.

- [x] **Task 2: Vitest-тесты `TodayReadingCard`** (зависит от Task 1)

  Файл: `src/features/plan/components/TodayReadingCard.test.tsx` (новый; RTL уже используется — образец `CalendarView.test.tsx`).

  Кейсы:
  1. Клик по корню строки (`[data-today-reading-card-item]`) → вызван `onSelectReading`, НЕ вызван `onToggleItem`.
  2. Клик по чекбоксу (`[data-today-reading-card-item-checkbox]`) → вызван `onToggleItem`, НЕ вызван `onSelectReading`.
  3. Клик по текст-кнопке (`[data-today-reading-card-item-link]`) → `onSelectReading` вызван ровно один раз.
  4. Чекбокс остаётся элементом `input[type="checkbox"]` (страховка E2E-контракта).

  ОБЯЗАТЕЛЬНО: компонент вызывает `useRouter` (кнопка «План {год}») — замокать `next/navigation` до импорта компонента, готовый образец: `src/shared/components/layout/BottomNavBar.test.tsx:9–13` (`vi.mock('next/navigation', () => ({ useRouter: () => ({ push: pushMock, replace: vi.fn(), prefetch: vi.fn() }) }))`). Без мока рендер в jsdom упадёт.

  Логирование в тестах не требуется.

### Phase 2: Hide-on-scroll в песнях

- [x] **Task 3: Shared-хук `useAutoHideOnScroll` + юнит-тесты**

  Файлы: `src/shared/hooks/useAutoHideOnScroll.ts`, `src/shared/hooks/useAutoHideOnScroll.test.ts` (новые).

  Тонкая обёртка над `useScrollDirection` для страниц без специфики ридера. Сигнатура: `useAutoHideOnScroll(ref: RefObject<HTMLElement | null>, contentReady?: unknown): { hidden: boolean; ignoreNextScroll: () => void }`.
  - Внутри: `const { hidden, setHidden, ignoreNextScroll } = useScrollDirection(ref)`.
  - Guard короткого контента (паттерн `ReadingView.tsx:121–127`): эффект, зависящий от `contentReady` — если `el.scrollHeight <= el.clientHeight`, вызвать `setHidden(false)`. `contentReady` — любое значение, смена которого означает «контент перерендерился» (длина списка, id песни).
  - Вернуть `{ hidden, ignoreNextScroll }`.

  Тесты (jsdom, по образцу `useScrollDirection.test.ts`): скролл вниз → `hidden=true`; скролл вверх → `hidden=false`; нескроллируемый контент при смене `contentReady` → `hidden=false`.

  Логирование: не добавлять (debug-логи уже есть внутри `useScrollDirection`).

- [x] **Task 4: Список песен — скрытие нижней навигации по скроллу** (зависит от Task 3)

  Файл: `src/app/dashboard/songs/page.tsx`.
  - ОБЯЗАТЕЛЬНЫЙ ПЕРВЫЙ ШАГ: вынести содержимое страницы в дочерний компонент `SongsPageContent` (по образцу `SongPageContent` в `song/page.tsx`), который `SongsPage` рендерит внутри `DashboardLayout`. Причина: `useChromeVisibility` кидает throw вне `ChromeVisibilityProvider`, а провайдер живёт ВНУТРИ `DashboardLayout` — вызов хука в теле самой `SongsPage` гарантированно упадёт. Хуки страницы (`useSongs`, `useSongSearch`, state query, ref) переезжают в `SongsPageContent`.
  - Добавить `const listRef = useRef<HTMLDivElement>(null)` на скролл-контейнер (строка 33).
  - `const { hidden } = useAutoHideOnScroll(listRef, results.length)`.
  - `const { setChromeHidden } = useChromeVisibility()` (импорт из `@/shared/components/layout/ChromeVisibility`); эффект: `setChromeHidden(hidden)`; cleanup на unmount: `setChromeHidden(false)` (паттерн `ReadingView.tsx:100–135`).
  - `PageHeader` с поиском НЕ трогаем — остаётся видимым.
  - Нюанс: bottom nav на этой странице резервирует место (`pb-nav` в `DashboardLayout`). При скрытии nav останется пустой отступ снизу — это допустимо для v1 (не менять `reserveNavSpace`-логику: изменение высоты контейнера при скролле дёргает layout; см. комментарий в `DashboardLayout.tsx:34–37`).

  Логирование: без новых логов (`BottomNavBar` уже логирует `chromeHidden` в debug).

- [x] **Task 5: Деталь песни — скрытие шапки по скроллу** (зависит от Task 3)

  Файл: `src/app/dashboard/song/page.tsx` (компонент `SongPageContent`).
  - `const contentRef = useRef<HTMLDivElement>(null)` на скролл-контейнер (строка 32).
  - `const { hidden } = useAutoHideOnScroll(contentRef, song?.id)`.
  - Шапку схлопывать локальной обёрткой (в `PageHeader` ничего не менять — он используется календарём и списком песен):

    ```tsx
    <div
      data-song-page-header-collapse
      className={cn(
        'grid transition-[grid-template-rows,padding] duration-300 ease-out bg-app-surface',
        hidden ? 'grid-rows-[0fr] pt-safe' : 'grid-rows-[1fr] pt-0'
      )}
    >
      <div className="min-h-0 overflow-hidden">
        <PageHeader title={…} onBack={…} … />
      </div>
    </div>
    ```

    Приём `grid-rows-[0fr]`→`[1fr]` анимирует высоту без измерения; контент под шапкой плавно занимает место.
  - КРИТИЧНО — safe-area («бровь»): `PageHeader` несёт `pt-safe-3` и фоном `bg-app-surface` сам красит зону статус-бара; инвариант проекта — «бровь всегда одного цвета с шапкой экрана» (`globals.css:328–331`), meta theme-color держит `useStatusBarColor('surface')`. Полное схлопывание в чистый `0fr` убрало бы и safe-area-отступ → на устройствах с вырезом контент уехал бы под статус-бар, а бровь цвета surface повисла бы над контентом цвета bg. Решение (в разметке выше): в скрытом состоянии обёртка сохраняет `pt-safe` (класс из `globals.css:332`) и фон `bg-app-surface` — бровь остаётся закрашенной полоской высотой `env(safe-area-inset-top)`; в видимом состоянии `pt-0` — бровь красит сам `PageHeader` своим `pt-safe-3` (двойного отступа нет). Оба свойства анимируются одним переходом (`transition-[grid-template-rows,padding]`). На десктопе/устройствах без выреза `env(...) = 0` — поведение не меняется.
  - Bottom nav здесь скрыт (`hideBottomNav`) — `ChromeVisibility` не трогать.

  Логирование: не добавлять.

### Phase 3: Восстановление позиции списка песен

- [x] **Task 6: Хук `useScrollRestore` + prop `initialValue` у SearchBar**

  Файлы: `src/features/songs/hooks/useScrollRestore.ts`, `src/features/songs/hooks/useScrollRestore.test.ts` (новые), `src/features/songs/components/SearchBar.tsx`.

  Хук (фичевый, не shared — используется только песнями): `useScrollRestore(ref: RefObject<HTMLElement | null>, key: string, ready: boolean, onBeforeRestore?: () => void)`.
  - **Сохранение**: подписка на `scroll` (passive, троттлинг через rAF по образцу `useScrollDirection`) → `sessionStorage.setItem(key, String(scrollTop))`.
  - **Восстановление**: один раз, когда `ready` становится `true` (список отрендерен): прочитать значение, если > 0 — вызвать `onBeforeRestore?.()` и выставить `el.scrollTop`. Флаг «уже восстановили» в ref.
  - `sessionStorage` может кидать (private mode) — обернуть чтение/запись в try/catch с `console.warn('[useScrollRestore] sessionStorage unavailable', err)` один раз.
  - Значение НЕ чистить после восстановления: возврат на таб «Песни» с «Главной» тоже вернёт позицию — поведение нативных табов, это осознанно.

  `SearchBar`: добавить опциональный prop `initialValue?: string` → `useState(initialValue ?? '')`. Существующий debounce-эффект при монтировании вызовет `onSearch(initialValue)` — этого достаточно для восстановления фильтра.

  Тесты хука (jsdom): scroll → значение записано в sessionStorage; mount с `ready=true` и сохранённым значением → `scrollTop` выставлен и `onBeforeRestore` вызван до этого; повторная смена `ready` не восстанавливает второй раз.

- [x] **Task 7: Интеграция restore в `songs/page.tsx`** (зависит от Tasks 4, 6)

  Файл: `src/app/dashboard/songs/page.tsx`.
  - Ключи sessionStorage: `songs:list-scroll` и `songs:list-query`.
  - Инициализация `query` из `sessionStorage.getItem('songs:list-query') ?? ''` (лениво, в try/catch); тот же начальный текст передать в `SearchBar initialValue`. В `handleSearch` — дописывать query в sessionStorage.
  - `useScrollRestore(listRef, 'songs:list-scroll', ready, ignoreNextScroll)`, где `ready` = `!loading && results.length > 0`, а `ignoreNextScroll` — из `useAutoHideOnScroll` (Task 4). **Критично**: без `ignoreNextScroll()` программное выставление `scrollTop` даст большой положительный delta → нижняя навигация мгновенно спрячется при входе на страницу.
  - Проверить сценарий: список → скролл → открыть песню → «назад» → та же позиция и тот же поисковый запрос; фильтр сузился и позиция вне диапазона → браузер сам клампит `scrollTop` (доп. кода не нужно).

  Логирование: только warn из хука; в странице новых логов не добавлять (существующий `console.debug` поиска сохранить).

### Phase 4: Верификация

- [x] **Task 8: Полная проверка** (зависит от Tasks 1–7)
  - `npm run lint` (или eslint по затронутым файлам) — без новых ошибок.
  - `npm test` (= `vitest run`) — все юнит-тесты зелёные, включая существующий `useScrollDirection.test.ts`.
  - E2E: `npm run e2e:offline` требует **локальный прод-билд** (см. комментарий в `playwright.config.ts`: dev-режим не регистрирует стабильный SW). Последовательность (каждая команда отдельным вызовом): `npm run build` → `npm start` (фоном) → `npm run e2e:offline`. Креды подхватываются из `.env.test` (dotenv в конфиге); тест гоняется на реальном аккаунте и сам восстанавливает исходное состояние отметки. Критично убедиться, что `outbox-sync.spec.ts` проходит (контракт `isChecked()` на `[data-today-reading-card-item-checkbox]`). Если `.env.test` недоступен/пуст — остановиться и запросить у пользователя, не пропускать E2E молча.
  - Ручная проверка в браузере (dev server): (a) тап по строке карточки открывает ридер, тап по чекбоксу отмечает; (b) на `/dashboard/songs` скролл вниз прячет нижнюю навигацию, вверх — показывает, шапка с поиском на месте; короткий отфильтрованный список — навигация видима; (c) на `/dashboard/song?id=…` скролл вниз плавно прячет шапку, вверх — возвращает; в мобильной эмуляции с safe-area убедиться, что при скрытой шапке зона статус-бара остаётся закрашенной (`pt-safe`-подложка из Task 5); (d) выход из песни возвращает на позицию списка с сохранённым запросом.
  - Docs-чекпоинт (`Docs: yes`): обновить AGENTS.md — новые хуки `useAutoHideOnScroll` (shared/hooks) и `useScrollRestore` (features/songs/hooks) в дереве структуры; изменения провести через `/aif-docs`.

  **Результат**: `npx eslint` по затронутым файлам — 0 ошибок (в проекте есть 73 pre-existing ошибки в нетронутых файлах — не по теме плана). `npm test` — 58 test files / 302 tests, все зелёные. E2E: порт 3000 был занят чужим dev-сервером пользователя — прод-сервер поднят на порту 3001 (`PORT=3001 npm start` + `E2E_BASE_URL=http://localhost:3001`), все 3 offline-теста прошли, включая `outbox-sync.spec.ts` (контракт чекбокса сохранён). При первом `npm run build` обнаружена побочная SSR-warning (`sessionStorage is not defined` при статической генерации `/dashboard/songs`) — исправлено guard'ом `typeof window === 'undefined'` в `readInitialQuery`, пересобрано начисто. Ручная проверка в браузере (реальный аккаунт vis-86) — все 4 сценария (a)-(d) подтверждены скриншотами, включая восстановление позиции+запроса ("бог") и `pt-safe`-подложку при скрытой шапке песни.

## Commit Plan

- **Commit 1** (после Tasks 1–2): `fix(plan): раздельные тап-зоны в карточке чтения — строка открывает ридер, чекбокс отмечает`
- **Commit 2** (после Tasks 3–5): `feat(songs): скрытие навигации и шапки по скроллу в списке и просмотре песни`
- **Commit 3** (после Tasks 6–8): `feat(songs): восстановление позиции и поискового запроса списка при возврате из песни`

## Примечания для исполнителя (Sonnet 5)

- Весь необходимый контекст кодовой базы уже собран в разделе «Контекст кодовой базы» — повторное глубокое исследование не требуется, достаточно прочитать перечисленные файлы перед правкой.
- Не трогать `ReadingView` / `ReadingHeader` / `FloatingChapterNav` — механика ридера остаётся как есть; `useScrollDirection` не модифицировать (новое поведение — только в обёртке `useAutoHideOnScroll`).
- Не менять `PageHeader.tsx` (кроме случая, если без этого никак): collapse-обёртка живёт в `song/page.tsx`.
- Shell-команды выполнять по одной (без `&&`, `||`, `;`).
