# Сетлисты + роли доступа (M2 + M7)

Ветка: `chordpro-viewer` (новую НЕ создавать — правило этапа в `feature-song-viewer-editor.md`).
Дата: 2026-07-26. Исполнитель реализации: **Sonnet 5** через `/aif-implement`.
Контекст и инварианты этапа: `.ai-factory/plans/feature-song-viewer-editor.md`.

## Settings

- **Testing:** yes — юнит-тесты вместе с кодом, BFF-тесты через `createApp()` + `app.request()`.
- **Logging:** verbose — `console.debug` с префиксом `[<модуль>]` на клиенте, `logger.debug/error` в BFF.
- **Docs:** yes — обязательный docs-чекпоинт в конце (`/aif-docs`): `docs/architecture.md`,
  `docs/offline-pwa.md` (исключение по офлайну), `AGENTS.md` (новый слайс), `CLAUDE.md` (гейт ролей).

## Roadmap Linkage

- **Milestone:** M2 (роли доступа) + M7 (сетлисты) — оба из `.ai-factory/ROADMAP.md`.
- **Rationale:** M7 был заблокирован M2 и M6; решения Игоря от 2026-07-26 снимают блокировку M2
  (модель ролей задана) и снимают зависимость от M6 (запись сетлистов — осознанно online-only).
  M8 (печать/PDF) остаётся независимым и не входит в этот план.

---

## Решения Игоря (2026-07-26) — не пересматривать

1. **Две роли.** `musician` — просмотр сетов и их CRUD. `musician_editor` — редактирование песен
   (это M9, в текущий этап НЕ входит; роль вводится в модель, но прав в коде пока не даёт).
   Обычный пользователь («Чтец») сеты **видит**, но не создаёт и не удаляет.
2. **Роль приходит отдельным запросом** при открытии приложения у авторизованного пользователя.
   В iron-session cookie роль **не класть** — кэш в cookie требует refresh-пути (инвариант
   `CLAUDE.md`), а отдельный эндпоинт этой проблемы не создаёт.
3. **Офлайн:** чтение сетов — полноценно офлайн (read-through + IDB). Создание/редактирование/
   удаление — **online-only**, осознанное исключение из offline-first, с явным UI «нужен интернет».
   M6 (обобщение outbox) не требуется и в этот этап не входит.
4. **Дата сета опциональна.** Дашборд показывает сеты с `date >= сегодня` и сеты без даты.
   Прошедшие не удаляются, а уезжают в раздел «Архив» на экране сетлистов. Удаляет `musician`.
5. **Объём v1:** создание + просмотр + удаление + **редактирование состава и порядка**.

## Факты о проде (проверено 2026-07-26, не додумывать)

**Directus-коллекции уже существуют:**

| Коллекция | Поля |
| :-- | :--- |
| `setlists` | `id` uuid PK, `title` string NOT NULL, `date` date nullable, `date_created` timestamp, `created_by` uuid → `directus_users` |
| `setlist_items` | `id` uuid PK, `setlist` uuid → `setlists` (**on_delete CASCADE**), `song` integer → `songs` (**on_delete SET NULL**), `sort` integer, `key` string nullable, `capo` integer nullable |
| `song_user_state` | `id` uuid, `user_id` uuid, `song` integer, `key`, `strokes` json, `scroll_speed` — **вне этого этапа** |

- `setlist_items.setlist` = CASCADE ⇒ при удалении сета items уходят сами, вручную чистить не надо.
- `setlist_items.song` = SET NULL ⇒ удалённая песня оставляет item с `song = null`.
  **Обязательный кейс:** GET детали фильтрует такие items и логирует `logger.warn`.
**Роли и policy созданы через Directus API 2026-07-26** (T0 закрыт, см. ниже):

| Сущность | id | Состав |
| :-- | :--- | :--- |
| policy `setlist_editor` | `5e855ec4-3528-465f-8c8d-049783861db8` | CRUD на `setlists` и `setlist_items` (8 permissions, `fields: ['*']`, без фильтров) |
| role `musician` | `465d9509-0401-4b24-a345-bbcb80204020` | policies: `full`, `custom`, `setlist_editor` |
| role `musician_editor` | `ab9872e4-853e-41be-8797-bacd55f0cb01` | policies: `full`, `custom`, `setlist_editor` |

`full` + `custom` продублированы с роли «Чтец» — иначе музыкант потерял бы доступ к плану чтения.
Права на редактирование песен (M9) `musician_editor` пока НЕ выданы: роль заведена как задел.
Связи роль↔policy лежат в junction `access` (по 3 записи на роль) — при пересборке прода их
надо восстанавливать вместе с ролями, иначе роль останется без policy (уже наступали).
- Каталог песен — **97 записей**, не 1000+. Виртуализация списка НЕ нужна и её не делать
  (`SongList` рендерит всё, это работает). Не вводить `react-window`/`virtua`.
- В проекте уже есть примитив `src/shared/components/ui/BottomSheet.tsx` (+ тесты) — переиспользовать,
  свой не писать. `SearchBar`, `SongCard`, `PageHeader`, `Toast`, `Modal` — тоже готовы.

---

## Архитектура

### Гейт доступа

**Реальный контур контроля — BFF.** Приложение ходит в Directus админ-токеном через BFF,
поэтому права Directus — второй рубеж, а не защита. Каждый мутирующий роут сетлистов обязан
пройти через `requireSetlistWrite`. Клиентский флаг роли управляет только видимостью кнопок.

```
GET  /api/user/role      → { role: 'reader' | 'musician' | 'musician_editor' }   (нужна сессия)
GET  /api/setlists       → список (любой авторизованный)
GET  /api/setlists/:id   → сет + items + краткие данные песен (любой авторизованный)
POST   /api/setlists     → создать            ⟵ requireSetlistWrite
PATCH  /api/setlists/:id → title/date/состав  ⟵ requireSetlistWrite
DELETE /api/setlists/:id → удалить            ⟵ requireSetlistWrite
```

`PATCH` заменяет состав целиком (`songIds[]` → пересоздать items с `sort = index`), а не диффит.
Проще и предсказуемее; конкурентная правка двумя людьми = last-write-wins, это принято осознанно
(редакторов единицы). В `NEEDS DECISION` вынесено, если понадобится иначе.

### Офлайн-контракт

| Путь | Поведение |
| :-- | :--- |
| Список сетов | `readThrough(SETLISTS_LIST_CACHE_KEY, …)` — network-first + IDB `apiCache` |
| Деталь сета | `readThrough(setlistCacheKey(id), …)` — тот же паттерн |
| Песни внутри сета | уже покрыты `readSongThrough` / store `songs` |
| Любая запись | `navigator.onLine === false` ⇒ fail fast + UI «нужен интернет», без outbox |

**Ключи кэша — один экспортируемый источник** (`SETLISTS_LIST_CACHE_KEY`, `setlistCacheKey(id)`),
импортируемый и читателем (`useSetlists`/`useSetlist`), и писателем (`downloadManager`).
Расхождение строк уже ломало офлайн — см. `patches/2026-07-10-16.46`.

Все network-first пути — с таймаутом; `isDefinitelyOffline()` ⇒ fail fast. Экраны сетлистов
последовательные (список → деталь) — считать N×T, а не сумму.

### Маршруты (static export — параметры только в query, никаких `[slug]`)

```
/dashboard/setlists              — список: «Ближайшие», «Без даты», «Архив»
/dashboard/setlist?id=<uuid>     — просмотр сета
/dashboard/setlist-edit          — создание (без id) / редактирование (?id=<uuid>)
```

Все три добавить в `APP_SHELL_ROUTES` (`src/shared/offline/appShell.ts`).
Тронут app-shell ⇒ **обязателен полный прод-контур верификации** (см. раздел «Верификация», п. 4).

### Структура файлов

```
src/lib/app-roles.ts                          — AppRole, маппинг Directus-роль → AppRole, canManageSetlists()
server/src/middleware/requireRole.ts           — Hono middleware (гейт)
server/src/routes/setlists.ts                  — CRUD-роуты
server/src/routes/setlists.test.ts
src/features/setlists/
  types.ts                                     — Setlist, SetlistItem, SetlistSummary
  lib/offlineSetlists.ts                       — ключи кэша + read-through
  lib/archive.ts                               — partitionSetlists(list, today) → upcoming/undated/past
  hooks/useSetlists.ts  useSetlist.ts  useSetlistDraft.ts
  components/SetlistsList.tsx  SetlistCard.tsx  SetlistView.tsx
  components/SetlistBuilder.tsx  SelectedChipsRow.tsx  NameSetlistSheet.tsx  SetlistItemRow.tsx
  components/SetlistDashboardStrip.tsx
src/shared/hooks/useAppRole.ts                 — роль + офлайн-фолбэк
src/app/dashboard/setlists/page.tsx
src/app/dashboard/setlist/page.tsx
src/app/dashboard/setlist-edit/page.tsx
```

FSD: `app → features → shared`, между фичами не импортировать. `SongCard`/`SearchBar` живут в
`features/songs` — **не импортировать их напрямую из `features/setlists`**. Нужную строку списка
песен в билдере рендерить своим компонентом (`SetlistSongPickRow`) внутри слайса сетлистов;
поисковую строку — общий `SearchBar` перенести в `src/shared/components/ui/` (он не доменный),
это единственное разрешённое перемещение в рамках этапа.

---

## UI/UX-спецификация (по ui-ux-pro-max + брифу Игоря)

### Информационная архитектура билдера (mobile, <768px)

```
┌──────────────────────────────────────────┐
│ ✕ Отмена     Новый сет      Выбрано: 3   │  ← PageHeader, sticky
├──────────────────────────────────────────┤
│ 🔍 Поиск по песням                        │  ← общий SearchBar, sticky
├──────────────────────────────────────────┤
│ [Господь мой ✕][Свят ✕][Аллилуйя ✕]  →   │  ← лента chips, sticky, только при N≥1
├──────────────────────────────────────────┤
│ ☑ Господь мой пастырь        Соль        │
│ ☐ Великий Бог                 Ре          │  ← список, вся строка тап-таргет
│ ☑ Свят, свят, свят            Ля          │
│ …                                         │
├──────────────────────────────────────────┤
│              ( Далее → )                  │  ← FAB, safe-area-inset-bottom
└──────────────────────────────────────────┘
```

### User flow

1. `/dashboard/songs` → кнопка «Создать сет» в `PageHeader` (**рендерится только при
   `canManageSetlists`**) → `router.push('/dashboard/setlist-edit')`.
2. **Выбор.** Тап по любой части строки переключает выбор (не только по чекбоксу).
   Выбранная песня мгновенно появляется chip'ом в ленте; лента скроллится к новому chip.
   Тап по ✕ на chip снимает выбор и синхронно снимает галку в списке.
   Порядок в сете = порядок добавления.
3. **Далее.** FAB активен при N≥1 (при N=0 — `disabled` + `aria-disabled`, не скрывать: исчезающая
   кнопка непредсказуема). Тап → `NameSetlistSheet`.
4. **Именование.** BottomSheet с одним фокусом: видимый label «Название сета» + input
   (`autoFocus`, `maxLength=100`), опциональное поле даты (`<input type="date">`, пусто = «без даты»),
   кнопка «Сохранить» с loading-состоянием и блокировкой на время запроса.
5. **Сохранение.** POST → редирект `router.replace('/dashboard/setlist?id=<новый>')` + toast «Сет создан».
6. **Просмотр.** Список песен сета, тап → `/dashboard/song?id=<songId>&from=setlist&setlistId=<uuid>`
   (возврат по back восстанавливает позицию — паттерн `useScrollRestore` уже есть).
7. **Редактирование.** В `SetlistView` кнопка «Изменить» (при праве) → `/dashboard/setlist-edit?id=<uuid>`
   c предзаполненным выбором и названием; сохранение → PATCH.
8. **Удаление.** В `SetlistView` при праве — «Удалить» в конце экрана, визуально отделено,
   danger-токен, обязательный confirm-диалог (`Modal`).

### Обязательные UX-инварианты (чек-лист приёмки UI)

- **Тач-таргеты** ≥44px: строка списка, chip целиком, ✕ внутри chip (расширить hit-area, не увеличивая
  визуальный размер), FAB. Зазор между соседними таргетами ≥8px.
- **Доступность выбора:** контейнер списка `role="listbox" aria-multiselectable="true"`,
  строка `role="option" aria-selected`; chip — `<button aria-label="Убрать <название> из сета">`.
  Счётчик «Выбрано: N» — `aria-live="polite"`.
- **Не только цветом:** выбранное состояние — галка + фон, не один фон.
- **Потеря данных:** уход из билдера при N≥1 → confirm «Отменить создание сета?».
  Черновик (`выбранные id + название + дата`) держать в `sessionStorage` под ключом
  `setlists:draft` — переход в песню и обратно не должен обнулять выбор.
- **Reduced motion:** появление chips и стаггер списка — через `useReducedMotion` (паттерн `SongList`).
- **Safe-area:** FAB и панель действий — `env(safe-area-inset-bottom)`; нижняя навигация
  на экране билдера скрывается (`useChromeVisibility`, паттерн уже есть).
- **Токены:** только `bg-app-*` / `text-app-*` / `border-app-*` / `shadow-app-*`. Никаких `stone-`,
  `red-`, `dark:`.
- **DOM-якоря:** kebab-case `data-setlist-builder-*`, `data-setlist-card-*`, `data-setlist-strip-*`.

### Планшет (≥768px) — Master-Detail

Один компонент, ветвление по media-query (паттерн `SONG_WIDE_LAYOUT_QUERY` из `features/songs`,
завести свой `SETLIST_WIDE_LAYOUT_QUERY = '(min-width: 768px)'`).

```
┌───────────────────────────┬────────────────────────┐
│ 🔍 Поиск                   │ Название сета          │
│ ☑ Господь мой пастырь      │ [_________________]    │
│ ☐ Великий Бог              │ Дата: [__.__.____]     │
│ ☑ Свят, свят, свят         │ ─────────────────────  │
│ …            (2/3 ширины)  │ 1 ⠿ Господь мой   ✕   │
│                            │ 2 ⠿ Свят, свят    ✕   │
│                            │        (1/3 ширины)    │
│                            │ [    Сохранить    ]    │
└───────────────────────────┴────────────────────────┘
```

- Ленты chips и FAB на планшете **нет** — их роль выполняет правая панель, видимая постоянно.
- BottomSheet именования на планшете **не показывается** — поле названия уже на экране.
- Правая панель — единственное место с drag-reorder; на мобильном переупорядочивание живёт
  в режиме редактирования отдельным списком.

### Drag-reorder (обе ширины)

- Порог начала перетаскивания (`drag-threshold`) — иначе тап по строке будет ловиться как drag.
- **Обязательная клавиатурная/a11y-альтернатива:** кнопки «Вверх»/«Вниз» на каждой строке с
  `aria-label`, работающие без мыши. Drag-only недопустим.
- Реализация без новой зависимости: HTML5 drag-and-drop не работает на touch — использовать
  pointer events + `transform` (анимировать только `transform`/`opacity`).
  Если реализация вырастает в отдельную библиотеку — остановиться и вынести в `NEEDS DECISION`,
  а порядок оставить на кнопках «Вверх/Вниз» (они самодостаточны).

### Режим сета в просмотре песни

Вход: `/dashboard/song?id=<songId>&setlistId=<uuid>`. Наличие `setlistId` включает режим.
Порядок песен берётся из кэша сета (`readSetlistThrough`) ⇒ **режим полностью работает офлайн**.

Новый маршрут в `APP_SHELL_ROUTES` **не нужен**: SW отдаёт документ `/dashboard/song` для любых
search-параметров (`resolveNavigationKey` в `src/sw/sw.ts`, ветка `mode === 'navigate'`).
Это проверено по исходнику SW — не «наверное».

#### Конфликт горизонтали — главное ограничение

`usePagedFlow` **уже занял горизонтальный жест**: в режиме `paged` свайп листает страницы
одной песни через `scrollLeft`. Вешать поверх него переход к следующей песне нельзя.

**Правило:** свайп между песнями активен **только при `mode === 'scroll'`**.
Это не ограничение на практике: в `src/app/dashboard/song/page.tsx` уже стоит
`mode = isWideLayout ? viewSettings.mode : 'scroll'`, а `SONG_WIDE_LAYOUT_QUERY` — `(min-width: 640px)`.
То есть **на телефоне режим всегда `scroll`**, и свайп доступен всегда. В `paged`/`sheets`
(только ≥640px, по явному выбору пользователя) переход между песнями живёт на кнопках `‹ ›`
в шапке — они рендерятся во всех режимах и являются основным, всегда доступным способом.

#### Жест — обязательные условия

- **Не стартовать в 24px от левого и правого края экрана** — там живёт системный back-свайп
  iOS и предиктивный back Android. Перехват = сломанная навигация ОС.
- Порог: `|dx| > 60px` **и** `|dx| > 1.5 * |dy|`. Иначе вертикальный скролл текста
  (основное взаимодействие на этом экране) будет ловиться как листание.
- Pointer events, не `touchstart`-only — чтобы работало и с трекпадом/стилусом.
- На границах сета (первая/последняя песня) — свайп не зацикливается; лёгкий rubber-band
  или просто отсутствие реакции. Не переходить к другому сету.
- `prefers-reduced-motion` — переход без анимации сдвига, мгновенная замена контента.

#### Навигация и состояние

- Переход между песнями — **`router.replace`, не `push`**. Иначе back после десяти свайпов
  прогонит десять песен вместо возврата к сету (`back-stack-integrity`).
- `handleBack` сейчас захардкожен на `/dashboard/songs` — в режиме сета обязан вести
  на `/dashboard/setlist?id=<setlistId>`.
- При смене песни: **сбросить `scrollTop` контейнера в 0** (компонент не размонтируется,
  иначе новая песня откроется с середины) и **поставить автоскролл на паузу**
  (скорость per-song подхватится своя, но продолжать ехать по новой песне — неверно).
- Соседние песни (prev/next) прогревать `readSongThrough` при входе в режим —
  свайп должен быть мгновенным и работать офлайн даже без полной загрузки каталога.

#### Быстрое открытие списка сета

- В `PageHeader` — кнопка-счётчик «3 / 8» (tap-target ≥44px, `aria-label="Песня 3 из 8, открыть список сета"`).
- Тап → `BottomSheet` со списком песен сета: номер, название, текущая подсвечена
  (`aria-current="true"`, не только цветом). Тап по строке → переход + закрытие шторки.
- Рядом со счётчиком — кнопки `‹` / `›` (`disabled` на границах, `aria-label`).
- Шторка списка сета и шторки настроек/тональности взаимоисключаемы — при открытии одной
  закрывать остальные (иначе две шторки друг поверх друга; `SongAutoScroll` уже гейтится
  по `isViewSettingsOpen || isKeyPickerOpen` — добавить туда третий флаг).

### Блок на дашборде

- Компонент `SetlistDashboardStrip` над/под `PlanView` в `src/app/dashboard/page.tsx`.
- Горизонтальный скролл со `scroll-snap-type: x mandatory`, карточка ~72% ширины вьюпорта на
  мобильном, `overscroll-behavior-x: contain` — чтобы не конфликтовать со свайпами страницы.
- Карточка: дата («вс, 3 августа» / «без даты») + название + «N песен». Тап → `/dashboard/setlist?id=`.
- Показывает `upcoming` + `undated` (даты вперёд по возрастанию, затем без даты). Архив — не показывает.
- **Пустое состояние: блок не рендерится вовсе.** У обычного читателя дашборд не должен обрастать
  пустыми секциями. Скелетон при загрузке тоже не показывать (блок опциональный, не должен дёргать layout).

---

## Tasks

### Фаза 0 — предусловие

- [x] **T0. Directus: роли и права.** Выполнено через API 2026-07-26 — policy `setlist_editor`
  (8 permissions), роли `musician` и `musician_editor`, по 3 записи в `access` на роль.
  Проверено запросом `/roles?fields=policies.policy.name`. Id — в разделе «Факты о проде».
- [x] **T0b. Назначить роль.** Выполнено 2026-07-26 по указанию Игоря: роль `musician` выдана
  `vis-86` (Игорь) и `claude-offline-test` (e2e-аккаунт, не удалять). Остальные 66 из 68
  аккаунтов — «Чтец». Проверено через `/users?fields=role.name&limit=-1`.
  **NB для тестов:** в проде есть ДВА похожих тестовых аккаунта — `claude-offline-test`
  (тот самый e2e, `f84d374c-…`) и `offlinetest` (`a2fdb115-…`, роль «Чтец», не трогать).
  Запрос пользователей делать с `limit=-1`: дефолтные 50 обрезают список из 68.

### Фаза 1 — роли (M2)

- [x] **T1. `src/lib/app-roles.ts` + тесты.**
  Экспортировать `type AppRole = 'reader' | 'musician' | 'musician_editor'`,
  `DIRECTUS_ROLE_TO_APP_ROLE` (по `name` роли Directus, регистронезависимо),
  `resolveAppRole(directusRoleName: string | null | undefined): AppRole` (дефолт — `'reader'`,
  неизвестное имя → `'reader'` + не бросать), `canManageSetlists(role): boolean`
  (`true` для `musician` и `musician_editor`), `canEditSongs(role)` (`true` только для
  `musician_editor` — задел под M9, в этом этапе нигде не вызывается).
  Файл в `src/lib/`, т.к. используется и клиентом, и `server/`.
  **Логирование:** `console.warn('[app-roles] unknown directus role, falling back to reader', name)`
  при неизвестном имени.
  **Тесты:** каждое имя роли, `null`/`undefined`, неизвестное имя, регистр.

- [x] **T2. BFF: `GET /api/user/role` + `requireSetlistWrite`.** Зависит от T1.
  - `server/src/routes/user.ts`: роут `GET /role` — по `session.directus_id` читает
    `directus_users` **админ-клиентом** с `fields: ['role.name']` (по инварианту `/users/me`
    под user-токеном не использовать), возвращает `{ role: resolveAppRole(...) }`.
    Нет сессии → 401. Ошибка Directus → 500 + `logger.error`, НЕ тихий `'reader'`
    (иначе владелец прав молча теряет кнопки и это невозможно отладить).
  - `server/src/middleware/requireRole.ts`: `requireSetlistWrite` — Hono middleware, резолвит
    роль тем же путём, `403 { error: 'Forbidden' }` при отсутствии права, кладёт роль в
    `c.set('appRole', role)` для переиспользования в хендлере.
  **Логирование:** `logger.debug('[role] resolved <id> → <role>')`,
  `logger.warn('[role] denied setlist write for <id> (<role>)')` на каждом 403.
  **Тесты** (`server/src/routes/user.test.ts` через `createApp()` + `app.request()`):
  401 без cookie; `reader` → `{role:'reader'}`; `musician` → `{role:'musician'}`;
  ошибка Directus → 500.

- [x] **T3. Клиент: `useAppRole` + endpoints.** Зависит от T2.
  - `src/shared/services/api/endpoints.ts`: `userApi.getRole()` → `GET /api/user/role`.
  - `src/shared/hooks/useAppRole.ts`: грузит роль один раз за сессию страницы (module-level
    кэш, как `useSongs`), через `readThrough(APP_ROLE_CACHE_KEY, …)` — офлайн отдаёт последнюю
    известную роль. Возвращает `{ role, canManageSetlists, loading }`.
    До загрузки — `role: 'reader'` (**fail-closed**: не показывать кнопки записи авансом).
    Сброс кэша при смене пользователя (следить за `user.directus_id` из `useAuth`) — иначе после
    logout/login чужая роль останется в модульном кэше.
  **Логирование:** `console.debug('[useAppRole] role=<role> (source=network|cache)')`.
  **Тесты:** сеть ок; сеть падает + есть кэш → роль из кэша; сеть падает + кэша нет → `'reader'`;
  смена `directus_id` сбрасывает кэш.

**COMMIT 1:** `feat(auth): app roles (musician/musician_editor) with BFF gate`

### Фаза 2 — BFF сетлистов

- [x] **T4. `server/src/routes/setlists.ts` — чтение.** Зависит от T1.
  - `GET /` → `{ setlists: [{ id, title, date, itemCount }] }`, сортировка
    `date ASC NULLS LAST, date_created DESC`. Требует сессию.
  - `GET /:id` → `{ setlist: { id, title, date, items: [{ id, sort, songId, title, subtitle, songKey }] } }`.
    Items сортируются по `sort`; **items с `song === null` отфильтровать** (SET NULL после удаления
    песни) + `logger.warn('[setlists] orphan item <itemId> in setlist <id>')`.
    Невалидный uuid → 400, не найдено → 404.
  - Зарегистрировать группу в `server/src/app.ts` (путь `/api/setlists`).
  **Логирование:** `logger.debug` на входе с `id`, `logger.error` на исключениях.
  **Тесты:** 401 без сессии; список с сортировкой (сет с датой раньше сета без даты);
  деталь с items по `sort`; orphan-item отфильтрован; 400 на кривой id; 404.

- [x] **T5. `server/src/routes/setlists.ts` — запись + гейт.** Зависит от T2, T4.
  - `POST /` — body `{ title, date?, songIds[] }`. Валидация (zod, как в существующих роутах):
    `title` trim 1..100; `date` — `YYYY-MM-DD` или `null`/отсутствует; `songIds` — массив
    integer ≥1, длина 1..100, **без дубликатов**. Создаёт `setlists` (+`created_by` =
    `session.directus_id`), затем `setlist_items` с `sort = index`. Отдаёт `{ id }`, статус 201.
  - `PATCH /:id` — те же поля, все опциональные, но при переданном `songIds` состав заменяется
    целиком: удалить существующие items сета, создать заново с `sort = index`.
  - `DELETE /:id` — удаляет `setlists`; items уходят по FK CASCADE (руками не чистить).
  - Все три — под `requireSetlistWrite`.
  **Обработка ошибок:** невалидное тело → 400 с полем-причиной; несуществующий `songId` →
  Directus вернёт FK-ошибку → перехватить и отдать 400 `{ error: 'Unknown song id' }`,
  не 500. Частичный сбой при создании items → удалить созданный setlist (компенсация) +
  `logger.error`, отдать 500.
  **Логирование:** `logger.debug('[setlists] create by <userId>: <N> songs')`,
  то же для patch/delete; `logger.warn` на каждом 403 (из middleware).
  **Тесты:** 403 для `reader` на POST/PATCH/DELETE (**обязательный кейс, не пропускать**);
  201 для `musician`; порядок `sort` соответствует порядку `songIds`; PATCH заменяет состав;
  дубликаты в `songIds` → 400; пустой массив → 400; `title` из пробелов → 400;
  кривая дата → 400; несуществующий songId → 400.

**COMMIT 2:** `feat(setlists): BFF CRUD routes with role gate`

### Фаза 3 — данные и офлайн

- [x] **T6. Офлайн-слой сетлистов.** Зависит от T4.
  - `src/features/setlists/types.ts` — `SetlistSummary`, `Setlist`, `SetlistItem`.
  - `src/shared/services/api/endpoints.ts` — `setlistsApi` (get/getOne/create/update/remove).
  - `src/features/setlists/lib/offlineSetlists.ts` — **единственный источник ключей**:
    `export const SETLISTS_LIST_CACHE_KEY = 'setlists:list'`,
    `export function setlistCacheKey(id: string) { return `setlists:item:${id}`; }`.
    Функции `readSetlistsThrough()` / `readSetlistThrough(id)` поверх общего `readThrough`
    (не копировать его логику).
  - `src/features/setlists/lib/archive.ts` — чистая
    `partitionSetlists(list, todayISO): { upcoming, undated, past }`. Граница: `date === today`
    считается **upcoming** (сет на сегодня нужен именно сегодня). Сравнение строк `YYYY-MM-DD`
    лексикографически, без `Date` и таймзон.
  - Хуки `useSetlists`, `useSetlist(id)` по образцу `useSongs`/`useSong`.
  **Логирование:** `console.debug('[setlists/offline] served from IDB', key)` на фолбэке.
  **Тесты:** `partitionSetlists` — прошлое/сегодня/будущее/без даты/пустой список/сортировка;
  read-through в **обоих офлайн-режимах** — (а) fetcher мгновенно reject, (б) fetcher никогда
  не резолвится (таймаут); кэш пуст + `navigator.onLine === false` → быстрый `OfflineNoDataError`,
  а не ожидание.

- [x] **T7. Download/warm-up + очистка.** Зависит от T6.
  - `src/shared/offline/downloadManager.ts`: `downloadSetlists()` — греет
    `SETLISTS_LIST_CACHE_KEY` и `setlistCacheKey(id)` для **каждого** сета (не только списка:
    рассинхрон list↔detail уже давал «офлайн: не открывается»). Пишет запись манифеста `setlists`.
  - `clearAllOfflineData` — чистить записи сетлистов из `apiCache` вместе с остальным.
  - `src/shared/offline/autoDownload.ts` — добавить сетлисты в базовый набор после логина.
  - `src/features/offline/components/OfflineDataSection.tsx` — строка «Сетлисты» в UI настроек.
  **Логирование:** `console.debug('[downloadManager] setlists warmed: N')`.
  **Тесты:** ассерт «после `downloadSetlists()` читатель (`readSetlistThrough`) отдаёт данные
  офлайн» — **тем же вызовом, что в проде**, не сравнением строк ключей.

**COMMIT 3:** `feat(setlists): offline read-through, archive split, download warm-up`

### Фаза 4 — экраны просмотра

- [x] **T8. Экран `/dashboard/setlists`.** Зависит от T6.
  - `src/app/dashboard/setlists/page.tsx` + `SetlistsList`/`SetlistCard`.
  - Секции: «Ближайшие», «Без даты», «Архив» (архив свёрнут, раскрывается тапом; счётчик в заголовке).
  - Пустое состояние: «Сетов пока нет» + кнопка «Создать сет» (только при `canManageSetlists`).
  - Пункт «Сетлисты» в нижней навигации **не добавлять** — лимит 5 пунктов; вход с экрана песен
    и с дашборда. Если это неверно — см. `NEEDS DECISION`.
  - Добавить `/dashboard/setlists` в `APP_SHELL_ROUTES`.
  **Логирование:** `console.debug('[SetlistsPage] loaded N setlists (upcoming/undated/past)')`.
  **Тесты (jsdom):** рендер трёх секций; пустое состояние; кнопка создания скрыта у `reader`.

- [x] **T9. Экран `/dashboard/setlist?id=`.** Зависит от T8.
  - `SetlistView`: заголовок (название + дата), список песен с порядковыми номерами,
    тап → `/dashboard/song?id=<songId>&setlistId=<uuid>` (одного параметра достаточно,
    отдельный `from=` не заводить); кнопки «Изменить»/«Удалить» — только при праве,
    «Удалить» с confirm-`Modal`.
  - Офлайн: экран открывается из кэша; кнопки записи при `offline` — `disabled` + подпись
    «Нужен интернет» (не скрывать: исчезнувшая кнопка читается как потеря прав).
  - Добавить `/dashboard/setlist` в `APP_SHELL_ROUTES`.
  **Логирование:** `console.debug('[SetlistView] id=… items=…')`, `console.warn` при удалении.
  **Тесты (jsdom):** рендер; отсутствие кнопок у `reader`; `disabled` в офлайне
  (`window.dispatchEvent(new Event('offline'))`); confirm перед удалением.

- [x] **T10. Блок на дашборде.** Зависит от T6.
  - `SetlistDashboardStrip` в `src/app/dashboard/page.tsx` по спецификации выше.
  - Не рендерится при пустом списке и во время загрузки; ошибка загрузки — тоже молча ничего
    (дашборд не должен ломаться из-за опционального блока), но `console.warn`.
  **Тесты (jsdom):** не рендерится на пустом списке; показывает upcoming+undated, не показывает past;
  порядок сортировки.

**COMMIT 4:** `feat(setlists): list, detail and dashboard strip screens`

### Фаза 4b — режим сета в просмотре песни

Зависит от T6 и T9, **не зависит от билдера** — можно делать до Фазы 5 и пользоваться
на сетах, созданных прямо в Directus.

- [x] **T17. `useSetlistPlayback` — навигация по сету.** Зависит от T6.
  `src/features/setlists/hooks/useSetlistPlayback.ts`: на вход `setlistId` и текущий `songId`,
  на выход `{ items, index, total, prevId, nextId, goTo(songId), inSetlist }`.
  Данные — через `readSetlistThrough` (кэш ⇒ офлайн). `setlistId` пуст → `inSetlist: false`
  и все переходы no-op (хук безопасно вызывается на обычном просмотре песни).
  Песня не входит в сет (кривой URL) → `inSetlist: false` + `console.warn`, экран НЕ падает
  и работает как обычный просмотр.
  Прогрев соседей: `void readSongThrough(prevId)` / `(nextId)` при смене индекса.
  **Логирование:** `console.debug('[useSetlistPlayback] setlist=… index=i/N prev=… next=…')`.
  **Тесты:** индекс/prev/next в середине, на первой и последней позиции; сет из одной песни;
  песни нет в сете; пустой `setlistId`; офлайн (fetcher reject + сет в IDB) → навигация работает.

- [x] **T18. Свайп и кнопки перехода.** Зависит от T17.
  - `src/shared/hooks/useHorizontalSwipe.ts` — pointer events, параметры
    `{ onSwipeLeft, onSwipeRight, enabled, edgeGuardPx = 24, thresholdPx = 60, ratio = 1.5 }`.
    Общий примитив в `shared` — **перечислить импортёров перед любой будущей правкой**
    (сейчас импортёр один; политика из `.ai-factory/skill-context/aif-plan`).
  - Подключить в `src/app/dashboard/song/page.tsx`: `enabled = inSetlist && mode === 'scroll'`.
  - Кнопки `‹ ›` в `PageHeader` — во всех режимах, `disabled` на границах.
  - При переходе: `router.replace`, `contentRef.current.scrollTop = 0`, пауза автоскролла,
    `ignoreNextScroll()` (иначе программный сдвиг схлопнет шапку).
  - `handleBack` в режиме сета → `/dashboard/setlist?id=<setlistId>`.
  **Логирование:** `console.debug('[SongPage] setlist nav <from> → <to> (swipe|button)')`.
  **Тесты:** чистая часть логики жеста (dx/dy/edge → 'left'|'right'|null) — таблично:
  короткий свайп, диагональный, старт у левого края, старт у правого края, нормальный.
  jsdom: `mode='paged'` ⇒ свайп-обработчик не навешен; кнопки `disabled` на границах;
  переход вызывает `replace`, а не `push`; автоскролл встал на паузу.

- [x] **T19. Шторка списка сета.** Зависит от T17.
  - `SetlistPlaybackSheet` на базе `BottomSheet` + кнопка-счётчик «3 / 8» в `PageHeader`.
  - Текущая песня — `aria-current="true"` + галка (не только цветом).
  - Взаимоисключение шторок: добавить флаг в условие показа `SongAutoScroll`
    (сейчас `!isViewSettingsOpen && !isKeyPickerOpen`) и закрывать соседние при открытии.
  **Логирование:** `console.debug('[SetlistPlaybackSheet] open, index=i/N')`.
  **Тесты (jsdom):** счётчик показывает «3 / 8»; тап по строке переходит и закрывает шторку;
  текущая помечена `aria-current`; при открытой шторке FAB автоскролла скрыт.

**COMMIT 4b:** `feat(setlists): setlist playback mode with swipe navigation`

### Фаза 5 — билдер

- [x] **T11. Билдер: выбор (mobile).** Зависит от T3, T8.
  - `src/app/dashboard/setlist-edit/page.tsx` + `SetlistBuilder`, `SelectedChipsRow`,
    `SetlistSongPickRow`; `useSetlistDraft` (черновик в `sessionStorage`, ключ `setlists:draft`,
    устойчивость к битому JSON — паттерн `useSongViewSettings`).
  - Перенести `SearchBar` в `src/shared/components/ui/` и обновить импорт в `songs`
    (единственное разрешённое перемещение).
  - Гард доступа: без `canManageSetlists` — экран показывает «Недостаточно прав» и кнопку назад,
    не редиректит молча.
  - Добавить `/dashboard/setlist-edit` в `APP_SHELL_ROUTES`.
  - Все UX-инварианты из спецификации выше (тач-таргеты, aria, reduced-motion, safe-area, токены).
  **Логирование:** `console.debug('[SetlistBuilder] toggled <songId>, selected=N')`.
  **Тесты (jsdom):** тап по строке добавляет chip и ставит `aria-selected`; ✕ на chip снимает
  галку; FAB `disabled` при N=0; черновик переживает перемонтирование; битый JSON в
  `sessionStorage` не роняет экран.

- [x] **T12. Именование и сохранение.** Зависит от T11, T5.
  - `NameSetlistSheet` на базе `BottomSheet`: visible label, `maxLength`, опциональная дата,
    «Сохранить» с loading + блокировкой повторного нажатия.
  - **Online-only гард:** при `navigator.onLine === false` — не отправлять запрос,
    показать «Нужен интернет, чтобы сохранить сет» (`role="alert"`), кнопка `disabled`.
    Подписаться на `online`/`offline` события, а не читать флаг один раз.
  - Ошибка сети/сервера → сообщение с причиной и **кнопкой повтора**, черновик не теряется.
  - Успех → `router.replace('/dashboard/setlist?id=…')` + toast, очистить черновик.
  - Выход из билдера при непустом выборе → confirm.
  **Логирование:** `console.debug('[NameSetlistSheet] submit title=… songs=N date=…')`,
  `console.error` на неуспехе.
  **Тесты (jsdom):** сабмит вызывает `create` с правильным порядком `songIds`; офлайн блокирует
  сабмит; ошибка показывает retry и не чистит черновик; успех чистит черновик.

- [x] **T13. Редактирование состава и порядка.** Зависит от T12.
  - `/dashboard/setlist-edit?id=<uuid>` предзаполняет выбор/название/дату из детали сета.
  - Переупорядочивание: кнопки «Вверх»/«Вниз» реализованы (обязательная a11y-альтернатива).
    Drag на pointer events НЕ реализован в этом проходе — сознательно остановились на
    кнопках согласно собственной оговорке плана (NEEDS DECISION №2: «кнопки
    самодостаточны»); можно добавить отдельным доп. заданием при необходимости.
  - Удаление песни из сета = снятие выбора.
  **Логирование:** `console.debug('[SetlistBuilder] reorder <from> → <to>')`.
  **Тесты (jsdom):** кнопки «Вверх/Вниз» меняют порядок и границы (первый/последний);
  PATCH получает новый порядок; загрузка существующего сета предзаполняет выбор.

- [x] **T14. Планшетный Master-Detail.** Зависит от T13.
  - `SETLIST_WIDE_LAYOUT_QUERY = '(min-width: 768px)'`; при совпадении — две колонки,
    без FAB и без sheet; поле названия и даты в правой панели; drag-reorder там же.
  - Переключение ширины на лету не должно терять выбор и введённое название.
  **Тесты (jsdom):** мок `matchMedia` — широкий режим не рендерит FAB/sheet и рендерит панель;
  выбор сохраняется при смене режима.

**COMMIT 5:** `feat(setlists): builder with multi-select, naming sheet and tablet master-detail`

### Фаза 6 — верификация и документация

- [x] **T15. Прод-контур офлайна + E2E.** Зависит от всех.
  - Тронут `APP_SHELL_ROUTES` ⇒ обязательно: `yarn build` → **глазами просмотреть
    сгенерированный `out/sw.js`** (новые маршруты в precache-манифесте) → `yarn e2e:offline`.
  - Новый e2e-кейс в `e2e/offline/`: холодный старт офлайн на `/dashboard/setlists`
    и `/dashboard/setlist?id=…` — контент отдаётся **и** консоль чистая (без
    `Failed to fetch RSC payload`).
  - Отдельный e2e-кейс на режим сета офлайн: `/dashboard/song?id=…&setlistId=…` открывается,
    кнопка `›` переводит на следующую песню сета, консоль чистая. Это проверка заявления
    «SW отдаёт `/dashboard/song` для любых search-параметров» на реальной сборке.
  - Playwright в чистом окружении: `npx playwright install --with-deps chromium`.
    Не удалось прогнать — зафиксировать `E2E НЕ ПРОГНАН: <причина>` и этап **не закрывать**.

- [x] **T16. Документация (`/aif-docs`).** Зависит от T15.
  - `CLAUDE.md` — раздел про роли: гейт в BFF, Directus — второй рубеж; и явное
    **исключение из offline-first**: запись сетлистов online-only, с обоснованием.
  - `AGENTS.md` — слайс `features/setlists`, новые маршруты, `useAppRole`.
  - `docs/architecture.md`, `docs/offline-pwa.md`, `docs/authentication.md` — по месту.
  - `.ai-factory/ROADMAP.md` — M2 и M7 в «готово», пересчитать, что разблокировалось
    (M9 частично: роль `musician_editor` уже есть, остаётся M6).

**COMMIT 6:** `docs(setlists): roles, offline exception and slice map`

---

## Вне объёма (не делать, не «улучшать попутно»)

- **M6 — обобщение outbox.** Не трогать `OutboxRecord` и `sync.ts`. Запись сетлистов их не использует.
- **`setlist_items.key` / `capo`.** Поля есть, но тональность сета — отдельная фича поверх M4
  (личная тональность уже живёт в `personalKeyStore`). v1 их не пишет и не читает.
- **`song_user_state`.** Коллекция готова, но её подключение — это M6 (персист через outbox).
- **M9 — редактирование песен.** `canEditSongs` заводится в T1 как задел, но нигде не вызывается.
- **Виртуализация списков.** 97 песен, не нужно.
- **Пункт «Сетлисты» в нижней навигации.** Лимит 5 пунктов; вход с экрана песен и с дашборда.
- **Печать/PDF (M8).** Независимый milestone, отдельный план.

## NEEDS DECISION (не угадывать — спросить Игоря и перейти к следующей задаче)

1. **Конкурентная правка сета.** Сейчас — last-write-wins без предупреждения. Если двое
   музыкантов правят один сет, второй молча затрёт первого. Нужна ли проверка версии
   (`date_updated` в `If-Match`-стиле) — решать, когда музыкантов станет больше одного.
2. **Drag-reorder как зависимость.** Если pointer-events реализация в T13 разрастается —
   остановиться, оставить кнопки «Вверх/Вниз» и вынести выбор библиотеки в решение.
3. **Вход в сетлисты для обычного читателя.** Сейчас — только с дашборда (блок) и с экрана песен.
   Если читателям нужен постоянный вход — это шестой пункт навигации, отдельное решение.
4. **Свайп в режимах `paged`/`sheets` (≥640px).** Сейчас там переход между песнями только
   кнопками `‹ ›`: горизонталь занята листанием страниц одной песни. Альтернатива, если
   понадобится, — двухпальцевый свайп или свайп по шапке, но обе ломают ожидания. Решать,
   когда кто-то реально будет пользоваться `paged` с планшета на репетиции.

---

## Верификация (без этого этап не готов)

1. `yarn test` — зелёный. Baseline на 2026-07-25: **421 тест**; после этапа должно быть больше.
2. `yarn lint` — снять числа **до** работы (унаследованный долг на ветке ~59 errors / 30 warnings).
   Критерий: не выросли, и в тронутых файлах ошибок нет.
3. `npx tsc --noEmit` — чисто.
4. Прод-контур офлайна (обязателен, тронут app-shell): `yarn build` → инспекция реального
   `out/sw.js` → `yarn e2e:offline`. Dev-режим офлайн-баги не воспроизводит.
5. Ручная проверка требует T0 (роли в Directus) — до этого гейт проверяется только тестами.
6. При падении проверки чинить **причину**, а не тест.
7. Проект на **Yarn 1**. `npm install` молча переписывает `yarn.lock` — не использовать.
8. Не выполнять `npm run deploy`. Прод-Directus — ручная работа Игоря.

## Commit Plan

| # | Охват | Сообщение |
| :-- | :--- | :--- |
| 1 | T1–T3 | `feat(auth): app roles (musician/musician_editor) with BFF gate` |
| 2 | T4–T5 | `feat(setlists): BFF CRUD routes with role gate` |
| 3 | T6–T7 | `feat(setlists): offline read-through, archive split, download warm-up` |
| 4 | T8–T10 | `feat(setlists): list, detail and dashboard strip screens` |
| 4b | T17–T19 | `feat(setlists): setlist playback mode with swipe navigation` |
| 5 | T11–T14 | `feat(setlists): builder with multi-select, naming sheet and tablet master-detail` |
| 6 | T15–T16 | `docs(setlists): roles, offline exception and slice map` |

Коммиты — без трейлеров `Co-Authored-By` и упоминаний Claude.
