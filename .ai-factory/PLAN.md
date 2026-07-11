# Implementation Plan: Настройка размера шрифта в просмотре песни

Branch: main (fast mode, без ветки)
Created: 2026-07-12

## Settings
- Testing: yes
- Logging: minimal (только WARN/ERROR)
- Docs: no  # warn-only, без обязательного docs-чекпоинта

## Контекст (разведка)

- `SongView` **уже принимает** проп `fontSize?: number` и прокидывает его во все рендереры (`SongBlock` → `LineRenderer`/`TableLineRenderer`/`ChordProHtmlColumn`). Страница `src/app/dashboard/song/page.tsx` его просто не передаёт — вся работа сводится к хуку персиста + UI.
- Дефолтный размер лирики задан в `render/songs.css`: `.cproSongBody { font-size: 17px }`; аккорды/метки масштабируются через `em` → слайдер меняет всё пропорционально.
- Эталон UX из ридера: иконка `Settings` (lucide, 20) в шапке → `BottomSheet` → слайдер `range 14–28` (секция font-size в `ReadingSettingsForm.tsx`).
- У `PageHeader` есть слот `right` — ровно под такую кнопку.

## Ключевое решение: localStorage, не Directus

Ридер хранит настройки на сервере (`readingSettingsApi` + `readThrough`). Для песни — **localStorage** (device-scoped):

- Плюсы: ноль сетевых путей → офлайн работает by construction (не нужны timeout/fail-fast/warm-up по правилам skill-context), ноль изменений в Directus-схеме и BFF, минимум кода на сопровождение волонтёрами.
- Минус (trade-off): настройка не синхронизируется между устройствами. Для размера шрифта это норм — он и так device-specific (разные экраны).
- Альтернатива (если позже захочется синк): поле в `reading_settings` Directus + BFF-роут по образцу ридера — осознанно НЕ делаем сейчас.

Офлайн-чеклист skill-context: новых network-first путей нет; маршрут `/dashboard/song` уже в `APP_SHELL_ROUTES`; download/warm-up не затрагивается. Изменений в `sw.ts` нет → production-контур (build + e2e:offline) не обязателен, достаточно `npm run test` + `npm run lint`.

## Tasks

### Phase 1: Логика и UI
- [x] Task 1: Хук `useSongFontSize` (`src/features/songs/hooks/useSongFontSize.ts`) — экспортируемый ключ `SONG_FONT_SIZE_STORAGE_KEY = 'songs:font-size'`, дефолт 17, clamp 14–28, ленивое чтение/запись localStorage, `console.warn` в catch. Тесты `useSongFontSize.test.ts` (`// @vitest-environment jsdom`): дефолт, чтение сохранённого, clamp/невалидное → дефолт, запись под той же константой.
- [x] Task 2: Компонент `SongFontSettings` (`src/features/songs/components/SongFontSettings.tsx`) — `BottomSheet` + слайдер (разметка/классы секции font-size из `ReadingSettingsForm.tsx`), props `isOpen/onClose/fontSize/onFontSizeChange`, якоря `data-song-font-settings`, `data-song-font-settings-slider`. Только размер шрифта, без других настроек.

### Phase 2: Интеграция
- [x] Task 3 (depends on 1, 2): `src/app/dashboard/song/page.tsx` — кнопка `Settings` в слоте `right` PageHeader (`aria-label="Настройки шрифта"`, `data-song-page-font-settings-button`), открытие шита, `fontSize` из хука в `<SongView>`.

## Верификация
- `npm run test` + `npm run lint`.
- Ручная проверка (dev): слайдер меняет размер лирики и аккордов live; значение переживает reload и повторное открытие другой песни.

## Commit
Один коммит в конце (< 5 задач): `feat(songs): font size setting in song view`