# План: новый логотип приложения + компактный нижний нав-бар

- **Ветка:** feature/offline-pwa (текущая, без создания новой — мелкие штрихи к offline-PWA)
- **Дата:** 2026-07-06
- **Режим:** fast

## Settings

- **Testing:** нет — чисто визуальные правки (ассеты + CSS), логики нет
- **Logging:** не требуется (статические файлы и классы; существующий `console.debug` в BottomNavBar сохраняется)
- **Docs:** warn-only

## Roadmap Linkage

- Milestone: "none"
- Rationale: ROADMAP.md отсутствует в проекте

## Контекст (разведка)

**Логотип.** Источник — `public/bible-year.jpg` (640×640, «Библия за год»). Все ссылки на иконки уже централизованы и код менять не нужно:

- `src/app/layout.tsx:46-47` → `icons/icon-192.png`, `icons/apple-touch-icon.png`
- `src/app/manifest.ts:24-26` → `icons/icon-192.png`, `icons/icon-512.png` (any + maskable)
- `src/features/landing/components/Header.tsx:21` → `icons/icon-192.png`
- `src/app/favicon.ico` — файловая конвенция App Router

Достаточно перегенерировать файлы. ImageMagick не установлен; `sips` (macOS, встроен) умеет resize и запись `.ico` (`com.microsoft.ico` — Writable, проверено через `sips --formats`). Maskable использует тот же icon-512: композиция центрирована (текст и крест в центре, виньетка по краям) — circle-crop безопасен.

**Нижний бар.** Пустота под иконками складывается из:

- `.dock-nav-safe-b` = `max(0.5rem, env(safe-area-inset-bottom))` — ~34px на iPhone с home indicator (`globals.css:366`)
- `min-h-[64px]` + `pt-2` у `<nav>` (`BottomNavBar.tsx:79`) — литерал дублирует `--dock-nav-h: 64px` (`globals.css:362`)
- `p-2` у кнопок (`BottomNavBar.tsx:91`)

`--dock-nav-h` — single source of truth: `.pb-nav` (клиренс контента в `DashboardLayout.tsx:38`) считается от неё, так что уменьшение переменной автоматически подтянет и клиренс.

## Tasks

### Phase 1 — правки (задачи независимы, порядок любой)

- [x] **Task 5. Заменить иконки приложения на bible-year.jpg**
  - `sips -z 512 512 -s format png public/bible-year.jpg --out public/icons/icon-512.png`
  - `sips -z 192 192 -s format png public/bible-year.jpg --out public/icons/icon-192.png`
  - `sips -z 180 180 -s format png public/bible-year.jpg --out public/icons/apple-touch-icon.png`
  - `sips -z 32 32 -s format ico public/bible-year.jpg --out src/app/favicon.ico`
  - Код не трогать; проверить размеры результата `sips -g pixelWidth -g pixelHeight`

- [x] **Task 6. Сделать нижний нав-бар компактнее**
  - `globals.css`: `--dock-nav-h: 64px → 56px`; `.dock-nav-safe-b`: `max(0.5rem, env(safe-area-inset-bottom))` → `max(0.375rem, calc(env(safe-area-inset-bottom) - 0.375rem))` — срезаем ~6px на устройствах с home indicator (бар слегка заходит в safe area, иконки остаются выше индикатора), 6px вместо 8px на остальных
  - `BottomNavBar.tsx`: `min-h-[64px]` → `min-h-[var(--dock-nav-h)]` (убрать дублирование), `pt-2 → pt-1.5`, у кнопок `p-2 → p-1.5`; `gap-1` и `text-[10px]` не трогать (читаемость)

### Phase 2 — верификация (блокируется Task 5, 6)

- [x] **Task 7. Проверить сборку и визуально сверить**
  - `npm run lint`, `npx tsc --noEmit`
  - Dev-сервер: бар компактнее, активная точка-индикатор не обрезается, контент не прячется за баром, favicon и landing header обновились
  - PWA-иконки в установленном приложении обновятся после переустановки; в браузере проверить, что manifest и `/icons/*.png` отдают новые файлы

## Commit Plan

Задач меньше 5 — один коммит в конце:

```
feat(ui): app icon from bible-year artwork, more compact bottom nav
```

## Trade-offs / заметки

- Срез safe-area на 6px — компромисс: полное `env(safe-area-inset-bottom)` каноничен по HIG, но именно он создаёт «большое пространство». 6px визуально ужимают бар, не подводя иконки под home indicator. Если на живом устройстве покажется тесно — откатить только правку `.dock-nav-safe-b`.
- `bible-year.jpg` (87KB) остаётся в `public/` как источник; иконки — производные. Апскейла нет: 640 ≥ 512.
- favicon 32×32 через sips: один размер в .ico (без мультирезолюции) — для web-фавикона достаточно, тем более `layout.tsx` уже отдаёт `icon-192.png` как основной icon link.
