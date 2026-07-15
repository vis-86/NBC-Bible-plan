# PLAN: Убрать «прыжок» шрифта при входе в ридер

**Дата:** 2026-07-12
**Режим:** fast (ветка не создаётся, работаем на `main`)

## Settings

- **Testing:** yes — юнит-тесты для зеркала настроек в `useReadingSettings`
- **Logging:** verbose (`console.debug` / однократный `console.warn` в новом слое персиста)
- **Docs:** no (warn-only) — публичного API/архитектуры не меняем

## Причина (root cause)

`useReadingSettings` (`src/features/reading/hooks/useReadingSettings.ts:29`) инициализирует состояние `defaultSettings` (`font_size: 20`, `line_height: 1.6`, `text_align: 'left'`, `ot/nt_translation: 'rst'`, …) и только потом асинхронно тянет настройки через `readThrough('reading:settings', …)`. `readThrough` — **network-first**: даже при наличии IDB-кэша он сначала ждёт сеть (до `DEFAULT_NETWORK_TIMEOUT_MS`), т.е. настройки приезжают через сетевой round-trip **на каждом входе** в ридер.

Текст главы при этом приходит быстрее (кэш `bible-text-cache`), поэтому первый кадр `BibleText` рисуется дефолтным `font_size: 20` / `line_height: 1.6`, а затем перерисовывается пользовательскими значениями → визуальный «прыжок» шрифта.

Побочный эффект той же причины: `ReadingView.tsx:59-62` вычисляет `bibleTextTranslationId` из `settings.ot_translation/nt_translation`, т.е. до загрузки настроек глава грузится переводом `rst` по умолчанию, а после загрузки перезапрашивается нужным (лишний фетч + подмена текста). Зеркало чинит и это.

## Решение

localStorage-зеркало последних известных настроек чтения (device-scoped кэш серверных настроек, по образцу `useSongFontSize`):

1. `useState` инициализируется **синхронно** из localStorage → первый кадр уже с правильным размером/интерлиньяжем/переводом.
2. Успешный `readThrough` (сеть или IDB-фолбэк) и `updateSettings` пишут зеркало.
3. Первое в жизни устройства открытие (зеркала ещё нет) — гейт на спиннере, чтобы не показать дефолт и не дёрнуть перевод `rst` зря.

Ключ зеркала — **один экспортируемый константный источник**, импортируемый и писателем, и читателем (инвариант проекта: разъехавшиеся ключи уже давали офлайн-баги).

## Tasks

### Task 1 — Слой персиста настроек чтения в localStorage
**Файл:** `src/features/reading/hooks/readingSettingsMirror.ts` (новый)

- Экспортировать `READING_SETTINGS_MIRROR_KEY = 'reading:settings:mirror'` — единственный источник ключа.
- `readReadingSettingsMirror(): ReadingSettings | null` — гард `typeof window === 'undefined'` (static export пререндерит модуль); парсит JSON и **валидирует каждое поле теми же гардами**, что и `useReadingSettings` (`isTextAlign`, `isTheme`, `isBibleTranslationId`, числа/булевы); битые поля → соответствующий дефолт, полностью нечитаемое зеркало → `null`.
- `writeReadingSettingsMirror(settings: ReadingSettings): void`.
- Ошибки: `localStorage` бросает (Safari private mode, quota) → `try/catch` + однократный `console.warn('[readingSettingsMirror] localStorage unavailable', err)`, как в `useSongFontSize.ts:17`. Наружу не бросать.
- Чтобы валидация не раздвоилась, вынести `defaultSettings` и предикаты из `useReadingSettings.ts` в общий модуль и импортировать в обоих местах — одна копия гардов на оба пути.

### Task 2 — Подключить зеркало в `useReadingSettings`
**Файл:** `src/features/reading/hooks/useReadingSettings.ts`

- `useState<ReadingSettings>(() => readReadingSettingsMirror() ?? defaultSettings)`.
- Вернуть из хука `hasCachedSettings: boolean` (было ли зеркало на первом рендере) — нужен для Task 3.
- После успешного `readThrough` — `writeReadingSettingsMirror(normalized)` (тем же нормализованным объектом, что уходит в `setSettings`, не сырым ответом); в `updateSettings` после успешного API-вызова — тоже.
- `console.debug('[useReadingSettings] mirror hydrate', { hasMirror })` при инициализации.
- Зеркало — кэш, источник истины остаётся серверный ответ: любое успешное чтение/запись перезаписывают зеркало целиком.

### Task 3 — Гейт первого открытия в `ReadingView`
**Файл:** `src/features/reading/components/ReadingView.tsx`

- Пока `settingsLoading && !hasCachedSettings` — показывать в области контента тот же спиннер, что при загрузке текста: `loading={loading || (settingsLoading && !hasCachedSettings)}` в `ReadingContent`.
- В этом же случае не стартовать загрузку текста дефолтным переводом: вызывать `useBibleText(null, …)`, пока настройки не готовы (иначе лишний фетч `rst` + подмена текста). При готовом зеркале поведение не меняется — фетч стартует сразу, как сейчас.
- Новых сетевых путей/таймаутов не добавляем: ограничение по времени уже даёт `readThrough` (таймаут → IDB-фолбэк → `OfflineNoDataError` при заведомом офлайне).
- Офлайн + нет зеркала + нет IDB-кэша → `loadError`, `isLoading: false` → рендерим дефолты; вечного спиннера быть не должно.

### Task 4 — Тесты
**Файлы:** `src/features/reading/hooks/useReadingSettings.test.ts` (дополнить), при необходимости новый `readingSettingsMirror.test.ts` (jsdom)

1. Зеркало есть → **первый же** результат `renderHook` содержит настройки из зеркала (до резолва fetcher'а), `hasCachedSettings === true`.
2. Успешный ответ API → в localStorage под `READING_SETTINGS_MIRROR_KEY` лежат нормализованные настройки (ассерт тем же экспортируемым ключом, что использует прод-код).
3. `updateSettings` → зеркало обновлено.
4. Битое зеркало (`'{{'`, обрезанный JSON, `font_size: 'abc'`, `theme: 'neon'`) → без падения, дефолты/валидные поля.
5. `localStorage.getItem` бросает → хук работает на дефолтах, один `console.warn`.
6. Офлайн-путь: fetcher rejects, IDB-кэш есть → настройки из IDB + зеркало перезаписано (существующий контракт `readThrough` не ломается).

## Верификация

1. `npm run test` + `npm run lint`.
2. Ручная проверка (dev): вход в ридер из плана и по прямой ссылке `/dashboard/read?book=&chapter=` — размер шрифта не меняется после первого кадра; в консоли нет hydration-предупреждений.
3. Смена настроек в шторке → выход → повторный вход: сразу новый размер (зеркало обновлено).
4. Офлайн (реальный, `npm run build` + `npm run static:serve`, не DevTools-пресет): ридер отдаёт текст правильным шрифтом без прыжка.

## Commit Plan

Задач < 5 → один коммит в конце: `fix(reading): mirror reading settings to localStorage to avoid font-size flash`.
