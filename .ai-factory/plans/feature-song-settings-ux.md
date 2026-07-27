# Implementation Plan: UI/UX настроек просмотра песни, тап-зоны, компактная шапка

Branch: `chordpro-viewer` (новая ветка НЕ создаётся — правило «только ветка chordpro-viewer»
в `feature-song-viewer-editor.md`).
Created: 2026-07-28
Контекст этапа: `.ai-factory/plans/feature-song-viewer-editor.md` (инварианты, границы, верификация).

## Settings

- Testing: yes
- Logging: verbose (проектная форма — `console.debug('[Component] ...', {...})` под
  `process.env.NODE_ENV !== 'production'`, как в `PageHeader`/`SongView`)
- Docs: yes — обязательный чекпойнт `/aif-docs` в конце

## Исполнитель и работа с контекстом

Реализацию ведёт **Sonnet 5**. План написан так, чтобы каждая фаза читалась автономно —
для работы над фазой не нужно держать в контексте предыдущие.

**Правило выхода из сессии.** Фаза = логическая точка завершения. Дойдя до конца фазы
(или почувствовав, что контекст заполнен и качество решений падает — что бы ни наступило
раньше), НЕ начинать следующую фазу. Вместо этого:

1. Прогнать `yarn test` + `npx tsc --noEmit` — сессия не завершается на красном.
2. Проставить `- [x]` у выполненных задач прямо в этом файле.
3. Дописать в конец файла раздел `## Журнал сессий` (создать, если его нет) —
   одна строка на сессию: `<дата> — фазы N: сделано <кратко>, отклонения: <или «нет»>,
   тесты: <число>, lint: <errors/warnings>`.
4. Зафиксировать коммит по `## Commit Plan`.
5. Выдать Игорю **готовый промт для новой сессии** по шаблону ниже — не пересказ,
   а текст, который можно скопировать в чистую сессию.

**Шаблон промта для новой сессии:**

```
Продолжаем ветку chordpro-viewer, план .ai-factory/plans/feature-song-settings-ux.md.

Сделано: фазы <N> (задачи <T…>), коммиты <sha…>.
Следующая: фаза <N+1>, задачи <T…>.

Прочитай план целиком, разделы «Решения, принятые до плана», «UX-решения»,
«NEEDS DECISION», «Журнал сессий» и «Границы задачи» — там всё, что нужно;
предыдущую сессию восстанавливать не надо.

Отклонения от плана прошлой сессии: <перечислить или «нет»>.
Открытые вопросы: <перечислить или «нет»>.

Выполни фазу <N+1>, затем остановись по правилу выхода из плана.
```

Отдельно: **не изобретать требования**. Развилка с trade-off, не описанная в плане, —
в `## NEEDS DECISION`, и переход к следующей независимой задаче (правило этапа из
`feature-song-viewer-editor.md`).

## Roadmap Linkage

Milestone: **M3 — Раскладка: колонки, `sheets`/`paged`, настройки отображения** (UX-полировка,
по образцу полировки M7 от 2026-07-27).
Rationale: правится ровно тот UI, который M3 построил (панель настроек, режимы раскладки), плюс
общие примитивы (`BottomSheet`, слайдер) и шапка экрана песни. Новой функциональности нет.

---

## Решения, принятые до плана (Игорь, 2026-07-28)

1. **Режим `paged` удаляется целиком** — код, типы, тесты, e2e. После того как колонки
   задают режим, у `paged` не остаётся точки входа; оставлять недостижимую ветку нельзя.
2. **Слайдер и крестик чинятся общими примитивами**, а не точечно: новый
   `shared/components/ui/RangeSlider.tsx` подключается во все 4 существующих слайдера,
   тап-зона крестика правится в самом `BottomSheet` → чинится во всех шитах разом.
3. **Тесты — да. Документация — да** (обязательный чекпойнт).

## UX-решения (консультация — skill `ui-ux-pro-max`, §2 Touch & Interaction, §8 Forms & Feedback)

Применённые правила: `touch-target-size` (≥44×44), `touch-spacing` (≥8px),
`no-precision-required`, `field-grouping`, `progressive-disclosure`, `whitespace-balance`,
`disabled-states` («контрол, который ни на что не влияет, не показывается — он шумит»,
уже действующий принцип панели), `press-feedback`.

**A. Структура панели: плоский список из 6 равнозначных блоков → 3 смысловые группы.**
Сейчас `space-y-6` даёт шесть контролов одного визуального веса — сканировать нечего,
взгляд читает всё подряд. Группы с заголовками режут время поиска примерно втрое:

```
ТЕКСТ
  [A−]  ▬▬▬●▬▬▬  [A+]           17px
  Плотность      [Свободно] [Компактно]
──────────────────────────────────────────  (только ≥640px)
РАСКЛАДКА
  Колонки        [▌ 1 колонка] [▌▌ 2 колонки]
  Одна колонка — непрерывный скролл.
  Две — листы с перелистыванием вниз.
──────────────────────────────────────────
ОТОБРАЖЕНИЕ
  Аккорды                            [switch]
  Заголовок песни                    [switch]
```

- Заголовок группы: `text-[11px] font-semibold uppercase tracking-wide text-app-text-muted`.
- Разделение групп: `border-t border-app-border` + `pt-5` (не рамки/карточки — панель
  маленькая, коробки съедят ширину).

**B. Размер шрифта: слайдер + степпер, а не голый слайдер.**
`A−` / `A+` (44×44, шаг 1px, `disabled` на границах 12/32) закрывают точную подстройку,
слайдер — быструю. Подписи «12px / 32px» под треком убираются: их роль теперь у кнопок,
а значение показывается справа (`tabular-nums`, `number-tabular`). Это снимает исходную
жалобу («приходится прицеливаться») даже до правки самого слайдера.

**C. Связанная настройка показывается текстом, а не вторым контролом.**
`mode` больше не самостоятельное состояние — он производный от `columns`. Показывать его
задизейбленным контролом или «зеркалом» нельзя (`disabled-states`: выглядит нажимаемым,
но не работает). Правильная форма — helper-строка под группой «Колонки», описывающая
следствие выбора. Пользователь видит связь, но не может рассинхронизировать её.

**D. Колонки — с глифом.** `[▌ 1 колонка]` / `[▌▌ 2 колонки]`: вертикальные полоски
(`currentColor`, SVG или два `<span>`) читаются быстрее подписи. Формы `ChoiceGroup`
это требует расширения — см. T6.

**E. Тап-зоны.** Слайдер: визуальный трек 6px, но **интерактивная зона 44px по вертикали**
и тумб 28px. Крестик шита: сейчас `p-1.5` + иконка 18px = ~27×27 — вдвое ниже нормы;
становится 44×44 при неизменном визуальном размере иконки.

## NEEDS DECISION (не блокирует — есть рабочий дефолт)

**Полупрозрачность компактной шапки vs инвариант «бровь = цвет шапки».**
`useStatusBarColor('surface')` красит бровь непрозрачным `--app-surface`. Если шапка станет
`bg-app-surface/85 backdrop-blur-md` (как у ридера), на прокрученном контенте её фактический
цвет разойдётся с бровью. Дефолт для реализации: **сначала непрозрачный `bg-app-surface`**
(меняются только высота, типографика, тень и бордер — этого хватает для «компактно и не
отвлекает»); полупрозрачность включать отдельным шагом только если визуально проверено,
что стык брови и шапки не виден. Расхождение видно — оставить непрозрачный вариант.

---

## Commit Plan

- **Commit 1** (T1–T2): `feat(shared): range slider primitive and 44px sheet close target`
- **Commit 2** (T3–T4): `refactor(songs): drop paged view mode`
- **Commit 3** (T5–T7 + T4a): `feat(songs): view mode derived from columns, regrouped settings panel`
- **Commit 4** (T7): `feat(songs): compact reader-style song header`
- **Commit 5** (T8): `test: layout e2e and verification pass`

---

## Tasks

### Фаза 1 — общие примитивы

- [x] **T1. `RangeSlider` — слайдер с тап-зоной 44px**

  Создать `src/shared/components/ui/RangeSlider.tsx` (`'use client'`, named export,
  `RangeSliderProps` в том же файле, `cn()` для классов) — обёртка над
  `<input type="range">` с пропами `value`, `onChange`, `min`, `max`, `step?`,
  `disabled?`, `aria-label`/`id`, `className?`, плюс проброс `data-*`.

  Требования к геометрии (это суть задачи, а не косметика):
  - Внешняя обёртка `flex min-h-11 items-center` — интерактивная высота ≥44px.
  - Сам `input`: `h-11 w-full appearance-none bg-transparent touch-manipulation cursor-pointer`.
  - Визуальный трек — псевдоэлементы `::-webkit-slider-runnable-track` / `::-moz-range-track`:
    высота 6px, `background: var(--app-surface-muted)`, `border-radius`.
  - Тумб `::-webkit-slider-thumb` / `::-moz-range-thumb`: **28×28**, `background: var(--app-surface)`,
    `border: 2px solid var(--app-primary)`, `box-shadow: var(--app-shadow-sm)`.
    WebKit не центрирует тумб автоматически — нужен `margin-top: -11px` (= (28−6)/2).
  - `:active` тумба — `transform: scale(1.06)` (press-feedback); под
    `@media (prefers-reduced-motion: reduce)` transition отключить.
  - `:focus-visible` — сохранить кольцо `--app-primary` (не терять фокус-стили).
  - `disabled` — `opacity: .5`, `cursor: not-allowed`.

  Псевдоэлементы range утилитами Tailwind не описываются — CSS положить в
  `src/app/globals.css` под классом `.app-range` (прецедент CSS-переменных там же).
  Хардкод-шейдов Tailwind не использовать: только `--app-*` переменные.

  ВАЖНО (проверить руками): тело шита имеет `touch-pan-y overflow-y-auto` —
  горизонтальный drag тумба не должен уводить шит в вертикальный скролл или в
  drag-to-dismiss. Если уводит — `touch-action: none` на самом `input`.

  ЛОГИРОВАНИЕ: не нужно — компонент презентационный, состояния не держит,
  внешних вызовов нет (лог на каждый тик drag'а — шум).

  Файлы: `src/shared/components/ui/RangeSlider.tsx` (новый), `src/app/globals.css`.

- [x] **T2. Тап-зона крестика в `BottomSheet` — 44×44**

  `src/shared/components/ui/BottomSheet.tsx`, кнопка `data-bottom-sheet-close-button`:
  `p-1.5` → `flex h-11 w-11 items-center justify-center rounded-full`, иконка `X` 18 → 20.
  Чтобы иконка не уехала от края, компенсировать: у `data-bottom-sheet-header`
  `px-6` → `pl-6 pr-3`, у кнопки `-mr-1`.

  Не сломать существующие инварианты кнопки (обе описаны комментариями в файле —
  сохранить их): `onTouchEnd` с `preventDefault` + `stopPropagation` (ghost-click в
  календаре) и то, что кнопка живёт внутри drag-области шапки (`dragHandlers`).
  `active:scale-90` оставить.

  ЛОГИРОВАНИЕ: не добавлять — в файле уже есть `LOG_FIX`-канал, точку закрытия он
  покрывает через `drag dismissed`; отдельный лог тапа по крестику ничего не даёт.

  Файлы: `src/shared/components/ui/BottomSheet.tsx`.

- [x] **T2a. Тесты примитивов**

  - `src/shared/components/ui/RangeSlider.test.tsx` (`// @vitest-environment jsdom`):
    рендер, `onChange` отдаёт число нужного типа, `disabled` не вызывает `onChange`,
    на корне присутствует класс с `min-h-11` (регрессия тап-зоны — именно её чинили).
  - `src/shared/components/ui/BottomSheet.test.tsx` (файл уже есть): добавить кейс
    «кнопка закрытия имеет класс `h-11 w-11`» и «тап по ней вызывает `onClose`».

  Файлы: `src/shared/components/ui/RangeSlider.test.tsx` (новый),
  `src/shared/components/ui/BottomSheet.test.tsx`.

<!-- Commit checkpoint 1: T1, T2, T2a -->

### Фаза 2 — удаление режима `paged`

- [x] **T3. Убрать `paged` из кода**

  Порядок — снизу вверх по зависимостям:
  1. `src/features/songs/hooks/useSongViewSettings.ts` — `SongViewMode` = `'scroll' | 'sheets'`,
     убрать `'paged'` из `MODES`. (`sanitize` уже отбрасывает неизвестный `mode` в дефолт —
     сохранённый на планшете `paged` тихо станет `scroll`; отдельная миграция не нужна,
     но **это надо проверить тестом**, а не предположить.)
  2. `src/features/songs/components/SongView.tsx` — убрать проп-значение `'paged'`,
     `usePagedFlow`, `handleFlowClick`, блок `data-song-view-pager`, `PAGER_HEIGHT`
     из `reservedHeight` (остаётся `SHEET_PADDING_TOP + PAGE_PADDING`).
  3. Удалить `src/features/songs/hooks/usePagedFlow.ts`.
  4. `src/features/songs/lib/sheets.ts` — удалить `PAGER_HEIGHT` и `nextPageDelta`
     (использовались только `usePagedFlow`; **сначала grep**, а потом удаление).
     Комментарии со ссылками на `paged` в этом файле — поправить текстом.
  5. `src/app/dashboard/song/page.tsx` — убрать все `mode !== 'paged'` из условий
     `swipeEnabled`, `SetlistPagerDock` и комментарии про «горизонталь занята листанием».

  ЛОГИРОВАНИЕ: существующий `console.debug('[SongView] parsed N section(s)')` оставить.
  Новых логов не добавлять — удаление кода.

  Файлы: `useSongViewSettings.ts`, `SongView.tsx`, `usePagedFlow.ts` (удалить),
  `lib/sheets.ts`, `src/app/dashboard/song/page.tsx`.

- [x] **T4. Тесты и e2e после удаления `paged`**

  - `src/features/songs/hooks/useSongViewSettings.test.ts` — заменить кейсы с `'paged'`;
    **добавить новый**: сохранённый `{"mode":"paged"}` из старой версии читается как `scroll`
    и не роняет парсинг.
  - `src/features/songs/lib/sheets.test.ts` — **удалить `describe('nextPageDelta')`
    (3 кейса) и импорт `nextPageDelta`**. Без этого тесты не скомпилируются сразу
    после T3: функция удалена в шаге 4 T3, а тест на неё остаётся.
  - `src/features/songs/components/SongView.test.tsx` — удалить кейсы «paged mode only»
    и тап по третям.
  - `src/app/dashboard/song/page.test.tsx` — удалить кейс «mode paged → свайп-обработчик
    не навешен», сузить локальный тип `mode`.
  - `e2e/layout/song-layout.spec.ts` — удалить `describe('Раскладка песни — постраничный
    режим (paged)')` (2 теста). Хелпер `openSong` — см. T4a, там правка по существу.
  - `e2e/layout/song-autoscroll.spec.ts` — удалить `paged` из типа `mode`; цикл
    `for (const mode of ['sheets','paged'])` — см. T4a.

  Файлы: перечислены выше.

- [x] **T4a. E2E-хелпер `openSong`: перевести с `mode` на `columns`**

  Отдельная задача, потому что это правка ПО СУЩЕСТВУ, а не сужение типа, и делать её
  надо вместе с T5 (после него `mode` из localStorage не читается вообще).

  `e2e/layout/song-layout.spec.ts`:
  - Убрать поле `mode` из интерфейса `Settings` и из `DEFAULT_SETTINGS` — ключ
    `songs:view-settings` его больше не содержит. Оставшийся `mode` в патчах молча
    перестал бы влиять на раскладку, и тесты «на листы» проверяли бы `scroll`.
  - Все вызовы `openSong(..., { mode: 'sheets', columns: 2, ... })` → `{ columns: 2, ... }`.
  - **[song-layout.spec.ts:136](e2e/layout/song-layout.spec.ts:136) — разобрать отдельно.**
    Там `columns` параметризован и включает **1**: `openSong(WIDE, { mode:'sheets', columns, fontSize })`.
    После правки `columns: 1` даёт `scroll`, и кейс упадёт по существу. Одноколоночных
    листов больше не существует by design ⇒ параметризацию по `columns` сузить до `[2]`
    (или удалить кейс `columns: 1`, если он остаётся пустым) и поправить название теста.
  - [song-layout.spec.ts:280](e2e/layout/song-layout.spec.ts:280) (NARROW + `columns: 2`)
    — кейс сохраняет смысл и становится ТОЧНЕЕ: проверяет, что на узком экране
    `resolveSongViewMode` возвращает `scroll` несмотря на сохранённые 2 колонки.

  `e2e/layout/song-autoscroll.spec.ts:213`: цикл по режимам вырождается в один кейс —
  переписать в «`columns: 2` на широком экране ⇒ FAB автоскролла скрыт», название теста
  привести к новой формулировке.

  Файлы: `e2e/layout/song-layout.spec.ts`, `e2e/layout/song-autoscroll.spec.ts`.
  Зависит от T5 (делать после него, коммитить вместе с фазой 3).

<!-- Commit checkpoint 2: T3, T4 -->

### Фаза 3 — режим из колонок и редизайн панели

- [x] **T5. `mode` становится производным от `columns`**

  `mode` перестаёт быть самостоятельным персистируемым состоянием — иначе появится второй
  источник истины и рассинхрон (тот же класс бага, что «ключ кэша в двух местах»).

  `src/features/songs/hooks/useSongViewSettings.ts`:
  - Убрать `mode` из интерфейса `SongViewSettings`, `DEFAULT_SONG_VIEW_SETTINGS`, `sanitize`
    и из записываемого JSON. Ключ localStorage тот же (`songs:view-settings`); лишнее поле
    в старом JSON просто игнорируется `sanitize` — новой миграции не требуется.
  - Экспортировать чистую функцию
    `resolveSongViewMode(columns: SongViewColumns, isWideLayout: boolean): SongViewMode`
    → `columns === 2 && isWideLayout ? 'sheets' : 'scroll'`.
    Чистая и экспортируемая — чтобы и страница, и тесты считали режим ОДНИМ вызовом
    (писатель и читатель из одного источника).

  `src/app/dashboard/song/page.tsx`:
  - `const mode = isWideLayout ? viewSettings.mode : 'scroll'` →
    `const mode = resolveSongViewMode(viewSettings.columns, isWideLayout)`.
  - `SongView` получает `mode={mode}` и `columns={viewSettings.columns}` как раньше.
    Внутри `SongView` уже есть `effectiveColumns = mode === 'scroll' ? 1 : columns` —
    оставить как защиту.

  ЛОГИРОВАНИЕ (verbose): в `page.tsx` рядом с существующим debug-каналом —
  `console.debug('[SongPage] view mode', { columns, isWideLayout, mode })` под
  `process.env.NODE_ENV !== 'production'`. Причина: связь «колонки → режим» неявная,
  и при жалобе «включил 2 колонки, а листов нет» это первая строка, которую смотрят.

  ТЕСТЫ: `useSongViewSettings.test.ts` — таблица `resolveSongViewMode`
  (4 комбинации columns × isWideLayout); чтение старого JSON с `mode` не ломается.

  Файлы: `src/features/songs/hooks/useSongViewSettings.ts`,
  `src/app/dashboard/song/page.tsx`, `src/features/songs/hooks/useSongViewSettings.test.ts`.
  Зависит от T3.

- [x] **T6. Редизайн панели `SongViewSettings`**

  `src/features/songs/components/SongViewSettings.tsx` — по макету из раздела
  «UX-решения» выше (A–D). Конкретно:

  1. **Убрать блок `data-section="mode"` целиком** (контрол «Режим просмотра»).
  2. **Группы вместо плоского списка**: локальный подкомпонент `SettingsGroup`
     ({ title, children }) — заголовок `text-[11px] font-semibold uppercase tracking-wide
     text-app-text-muted mb-3`, у всех групп кроме первой `border-t border-app-border pt-5`.
     Порядок: «Текст» (шрифт + плотность) → «Раскладка» (колонки, только `isWideLayout`) →
     «Отображение» (аккорды, заголовок).
  3. **Размер шрифта**: строка `[A−] [RangeSlider] [A+]  17px`.
     Подпись «Размер шрифта» ОБЯЗАНА остаться доступной (видимой или как `aria-label`
     слайдера): существующий тест берёт блок через `getByText(/Размер шрифта/)`, и без
     подписи слайдер вдобавок остаётся без имени для скринридера.
     Кнопки — `h-11 w-11`, `aria-label` «Уменьшить/Увеличить шрифт», `disabled` на
     границах (12/32, константы взять из хука — не хардкодить второй раз), между
     кнопкой и слайдером `gap-2` (≥8px, `touch-spacing`). Значение — `tabular-nums`.
     Подписи «12px / 32px» под треком удалить. Слайдер — `RangeSlider` из T1,
     сохранить атрибут `data-song-view-settings-font-slider` (на нём висят e2e).
  4. **Колонки с глифом**: `ChoiceGroup` расширить необязательным пропом
     `iconFor?: (option: T) => React.ReactNode` (рендерится слева от подписи,
     `flex items-center justify-center gap-2`). Проп необязательный — остальные
     вызовы `ChoiceGroup` (ReadingSettingsForm, плотность) не меняются.
     Глиф: 1 колонка — одна полоска `w-1 h-4 rounded-full bg-current`; 2 колонки — две.
     **Глиф обязан быть `aria-hidden`**: доступное имя кнопки собирается из содержимого,
     и тесты (свои и существующие) берут кнопку через
     `getByRole('button', { name: '2 колонки' })` — незакрытый глиф подмешается в имя
     и сломает их, а заодно заставит скринридер читать декорацию.
  5. **Helper-строка** под группой «Раскладка», `data-song-view-settings-mode-hint`:
     «Одна колонка — непрерывный скролл. Две — листы с перелистыванием вниз.»
     `text-xs text-app-text-muted mt-2`. Это ЕДИНСТВЕННОЕ место, где виден режим.
  6. **Тумблеры** (`ToggleRow`) — оставить как есть, только переименовать подписи в
     «Аккорды» / «Заголовок песни» (в группе «Отображение» слово «Показывать»
     избыточно) и сохранить `data-section-show-chords` / `data-section-show-header`.
     Переименование меняет и `aria-label` (`ToggleRow` берёт его из `label`) — а
     [SongViewSettings.test.tsx:50](src/features/songs/components/SongViewSettings.test.tsx:50)
     ищет `getByRole('switch', { name: 'Показывать аккорды' })` и `'Показывать шапку'`.
     Обновить обе строки теста ВМЕСТЕ с переименованием, а не ловить падением.

  Токены — только `bg-app-*` / `text-app-*` / `border-app-*`; хардкод-шейдов и
  `dark:`-вариантов нет.

  ЛОГИРОВАНИЕ: не добавлять — панель презентационная, изменения настроек уже
  наблюдаемы через лог из T5.

  ТЕСТЫ (`SongViewSettings.test.tsx`, уже есть): контрола «Режим просмотра» больше нет;
  три заголовка групп отрендерены; `A+`/`A−` меняют `fontSize` на ±1 и задизейблены на
  границах; на узком экране (`useMediaQuery` → false) группа «Раскладка» и helper-строка
  не рендерятся; выбор колонок вызывает `onSettingsChange({ columns })`.

  Файлы: `src/features/songs/components/SongViewSettings.tsx`,
  `src/shared/components/ui/ChoiceGroup.tsx`,
  `src/features/songs/components/SongViewSettings.test.tsx`.
  Зависит от T1, T5.

- [x] **T7. `RangeSlider` в остальных трёх слайдерах**

  Заменить дублирующийся `<input type="range" className="h-2 w-full ...">` на `RangeSlider`:
  - `src/features/songs/components/SongKeyPicker.tsx` — полутона
    (`data-song-key-picker-semitone-slider`) и каподастр (`data-song-key-picker-capo-slider`).
    Оба `data`-атрибута сохранить: на них висят тесты.
  - `src/features/reading/components/ReadingSettingsForm.tsx` — размер шрифта и
    межстрочный интервал (у второго `step="0.1"` и `parseFloat` — проверить, что
    `RangeSlider` корректно отдаёт дробное значение, а не `parseInt`).
    Проп `disabled` там используется — он должен работать.

  Подписи min/max под треками в этих трёх местах оставить как есть (степпер добавляем
  только шрифту песни — расширять объём на ридер сейчас не нужно).

  ТЕСТЫ: `SongKeyPicker.test.tsx` — прогнать существующие, не переписывая; они ходят по
  `data`-атрибутам и должны остаться зелёными (это и есть проверка, что замена
  прозрачная). Если тест ломается на изменившейся структуре DOM — чинить причину,
  а не тест.

  Файлы: `SongKeyPicker.tsx`, `ReadingSettingsForm.tsx`.
  Зависит от T1.

<!-- Commit checkpoint 3: T5, T6, T7, T4a (T4a делается после T5 — см. его описание) -->

### Фаза 4 — компактная шапка экрана песни

- [x] **T8. `PageHeader` — вариант `density='compact'` и его применение на песне**

  Эталон — `ReadingHeader` (`min-h-[52px] pt-safe`, `text-[15px] font-bold`, тонкий бордер,
  без плотной тени). Сейчас песня использует `PageHeader variant='view'`:
  `pt-safe-3 pb-3`, `text-lg`, `shadow-app-sm` — выше и тяжелее ридера.

  `src/shared/components/layout/PageHeader.tsx`:
  - Новый необязательный проп `density?: 'default' | 'compact'` (по умолчанию `'default'`
    — ни один существующий вызов не меняется).
  - `compact` (действует только при `variant='view'`): `min-h-[52px] pt-safe pb-0`
    + `flex items-center` (одна строка, вертикальное центрирование вместо паддингов),
    заголовок `text-[15px]` вместо `text-lg`, `gap-2` вместо `gap-4`,
    `border-b border-app-border` без `shadow-app-sm`.
  - Кнопка «назад» и слот `right` — тап-зоны довести до `h-11 w-11` (сейчас `p-2` +
    иконка 20 = 36×36), с отрицательными полями, чтобы визуально не разъехалось.
  - Обновить докблок компонента: описать `density` и то, что `compact` — это
    «шапка режима чтения», паритет с `ReadingHeader`.

  **Фон.** Дефолт — непрозрачный `bg-app-surface` (см. `## NEEDS DECISION`).
  Полупрозрачный `bg-app-surface/85 backdrop-blur-md` включать только после визуальной
  проверки стыка с бровью; расходится — оставить непрозрачный и зафиксировать это
  строкой в плане.

  `src/app/dashboard/song/page.tsx`: передать `density="compact"`. Обёртка
  `data-song-page-header-collapse` остаётся `bg-app-surface` **непрозрачной** — иначе при
  сворачивании (`grid-rows-[0fr]` + `pt-safe`) мигнёт бровь; инвариант «бровь = цвет
  шапки» тут держится именно обёрткой.

  ЛОГИРОВАНИЕ: в существующий `console.debug('[PageHeader] render', {...})` добавить
  поле `density`.

  ТЕСТЫ: `src/shared/components/layout/PageHeader.test.tsx` **уже существует** — не
  создавать заново, а дополнить. Существующие кейсы обязаны остаться зелёными без правок:
  это и есть регрессия остальных экранов (календарь, настройки, список песен), которые
  продолжают использовать `density='default'`. Новые кейсы: `density='compact'` даёт
  `min-h-[52px]` и НЕ даёт `shadow-app-sm`; кнопка «назад» имеет тап-зону `h-11 w-11`.

  Файлы: `src/shared/components/layout/PageHeader.tsx`,
  `src/app/dashboard/song/page.tsx`, `src/shared/components/layout/PageHeader.test.tsx`.

<!-- Commit checkpoint 4: T8 -->

### Фаза 5 — верификация

- [x] **T9. Полный контур проверки** (кроме ручного п.5 — см. ниже)

  Офлайн/SW/роутинг **не тронуты** (правок в `APP_SHELL_ROUTES`, read-through, outbox,
  `src/sw/` нет) → прод-контур `yarn build` + `yarn e2e:offline` по правилам не требуется.

  1. `yarn test` — зелёный, **731 тест** (baseline 421 на 2026-07-25; выросло за счёт
     T2a/T4/T5/T6/T8 — новые/переписанные тесты).
  2. `yarn lint` — **59 errors / 31 warnings**, без изменений в error-числе (baseline
     59/30); +1 warning — унаследован из нетронутого файла, не из этой ветки работы.
     В тронутых файлах (полный список — `git status`) ошибок и warning'ов нет.
  3. `npx tsc --noEmit` — чисто.
  4. `npx playwright install chromium` → `npx playwright test e2e/layout/` на реальном
     прод-контуре (`yarn build` → `bff:start` + `static:serve`) — **12/12 passed**.
  5. **Ручная проверка тач-зон на реальном устройстве или в тач-эмуляции — НЕ ВЫПОЛНЕНА
     в этой сессии.** Причина: страница песни требует авторизации, `.env.test`/
     `.env.local` с тестовыми учётными данными недоступны агенту (запрещено читать
     секреты напрямую — политика безопасности сессии). Это единственный настоящий
     критерий приёмки задачи (слайдер берётся пальцем без прицеливания, крестик шита
     закрывается с первого раза, шапка песни визуально совпадает по высоте с шапкой
     ридера) — **Игорю нужно проверить руками перед тем, как считать фичу готовой.**
  6. Скриншоты — не сняты (требует той же авторизации, что и п.5).

- [x] **T10. Документация (обязательный чекпойнт `/aif-docs`)**

  - `docs/design-system.md` — `RangeSlider` (тап-зона 44px, тумб 28px), правило
    «интерактивная зона ≥44px даже при тонком визуальном контроле», `PageHeader density`.
  - `docs/song-viewer-spec.md` — §4.4 (`paged`) помечается удалённым с датой и причиной,
    таблица §4.5 и §7 (`mode`) приводятся к реальности: `mode` больше не хранится, а
    выводится из `columns`; §12 (критерии приёмки) — убрать пункты про `paged`.
  - `AGENTS.md` — `usePagedFlow` из карты убрать, `RangeSlider` добавить в
    `shared/components/ui`.
  - `.ai-factory/plans/feature-song-viewer-editor.md` — в блоке «Что уже сделано»,
    этап 3, поправить описание режимов (было «`sheets` и `paged`»).
  - `.ai-factory/ROADMAP.md` — строка про UX-полировку по образцу записи от 2026-07-27.

<!-- Commit checkpoint 5: T9, T10 -->

---

## Границы задачи

- Только ветка `chordpro-viewer`. `main`, `deploy/`, прод-конфиги, `.env*` — не трогать.
- `npm run deploy` не выполнять ни при каких условиях.
- Проект на **Yarn 1**: `npm install` переписывает `yarn.lock` — не использовать.
- Автоскролл, транспозиция, сетлисты, свайп-пейджер — вне объёма. Замена слайдеров в
  `SongKeyPicker`/`ReadingSettingsForm` (T7) — единственное касание соседних фич,
  и оно чисто механическое.
- Попутные улучшения — текстом в отчёте, а не коммитом.

## Журнал сессий

2026-07-28 — фазы 1–5 (T1–T10, кроме документации): сделано T1–T9 полностью, включая
редизайн панели настроек (T6), удаление `paged` (T3/T4/T4a), `resolveSongViewMode` (T5),
`RangeSlider` во всех 4 слайдерах (T1, T7), компактную шапку песни (T8). Отклонения: нет.
Тесты: 731 (было 421 baseline на 2026-07-25). Lint: 59 errors / 31 warnings (без роста
error-числа; +1 warning унаследован из нетронутого файла). `tsc --noEmit` чисто.
`e2e/layout/` — 12/12 passed на реальном прод-контуре (build + bff:start + static:serve).
**Не выполнено:** ручная проверка тач-зон на устройстве/тач-эмуляции (T9 п.5) — страница
песни требует авторизации, тестовые креды (`.env.test`) недоступны агенту по политике
безопасности. Это единственный настоящий критерий приёмки — Игорю проверить руками:
слайдер шрифта берётся пальцем без прицеливания, крестик шита закрывается с первого раза,
шапка песни визуально совпадает по высоте с шапкой ридера. Осталось: T10 (документация).
