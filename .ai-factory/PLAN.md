# План: единый компонент заголовка страниц (PageHeader)

**Режим:** fast
**Дата:** 2026-07-02
**Область:** `src/shared/components/layout/PageHeader.tsx`, `src/app/dashboard/settings/page.tsx`, `src/app/dashboard/songs/page.tsx`, `src/shared/components/layout/PageHeader.test.tsx`

## Settings

- **Testing:** да — расширяем существующий `PageHeader.test.tsx` (новый variant без onBack + below-слот), старые кейсы остаются зелёными
- **Logging:** minimal — существующий `console.debug('[PageHeader] render', ...)` не расширяем сверх добавления поля `variant`; новых логов не вводим (чистый UI)
- **Docs:** warn-only, отдельного docs-чекпоинта не нужно

## Roadmap Linkage

Milestone: "none" — Rationale: ROADMAP.md отсутствует в проекте.

## Контекст и диагностика

В приложении два вида шапок:

1. **View/detail** (стрелка «назад» + заголовок) — уже унифицированы через `PageHeader`:
   - Календарь — `CalendarView` (`title="Календарь"` + right-слот «Все по плану»)
   - Song detail — `songs/[id]/page.tsx` (`title={song.title}`)
2. **Top-level tab** (без «назад») — самодельные и рассогласованные:
   - Настройки — `<h1 text-xl font-semibold>Настройки</h1>`
   - Список песен — `<header><h1 text-2xl font-bold>Песни</h1><SearchBar/></header>`

Корень проблемы: текущий `PageHeader` **требует** `onBack`, поэтому top-level табы не могут его использовать и живут своей вёрсткой с разным размером шрифта (text-xl vs text-2xl).

**Решение:** сделать `onBack` опциональным и добавить `variant: 'view' | 'page'` + below-слот (`children`) для строки поиска. После этого все «плоские» заголовки (Настройки, Песни) переезжают на общий `PageHeader`, а Календарь и Song detail остаются на нём же без изменений.

### Вне области (осознанно)

- **`PlanView` greeting** (`text-2xl font-serif` приветствие на главной) — это персональное приветствие, а не заголовок страницы; сохраняет индивидуальный serif-стиль.
- **`ReadingHeader`** (ридер Библии) — спец-шапка с пикером глав/книг и настройками шрифта, остаётся отдельной.
- **`SongView` внутренний content-header** (`song-view-header`: title/subtitle/meta внутри `<article>`) — это заголовок контента песни, не шапка страницы; на detail-экране title в него не прокидывается (его показывает PageHeader).
- **`ReferenceTool`** (`src/components/ReferenceTool.tsx:27` — `<h1 text-2xl font-serif text-center>Библейский Справочник</h1>`) и **`PastorChat`** (`PastorChat.tsx:264` — `<h2 text-xl>Наставники</h2>`) — под-вью внутри роута `/dashboard`, а не отдельные tab-страницы; используют захардкоженные `text-stone-*` вместо app-токенов. Перевод на PageHeader — отдельная задача с темизацией, вне текущей области.

## Целевой API PageHeader

```ts
interface PageHeaderProps {
  title: string;
  onBack?: () => void;              // теперь опционально — кнопка рендерится только при наличии
  backAriaLabel?: string;
  right?: React.ReactNode;
  children?: React.ReactNode;       // below-слот под строкой заголовка (напр. SearchBar)
  variant?: 'view' | 'page';        // default 'view'
  sticky?: boolean;
}
```

- `variant='view'` — сегодняшний рендер 1-в-1: `text-lg font-bold`, `border-b`, `shadow-app-sm`, `sticky`, back-стрелка при `onBack`. **Регрессий у Календаря/Song detail быть не должно.**
- `variant='page'` — top-level таб: `text-2xl font-bold`, `pt-6 pb-3`, без `border-b`/`shadow`, back-стрелка обычно отсутствует, `children` рендерятся ниже с `mt-4`.
- Горизонтальный `px-4` общий; ширину колонки задаёт `DashboardLayout` (`mx-auto max-w-md`, DashboardLayout.tsx:31) — страницам собственный `max-w-md` не нужен.

### Единообразие поведения при скролле

Помимо шрифта, унифицируем и раскладку: header у tab-страниц — **фиксированный сосед над скролл-контейнером** (как уже сделано на «Песни»), а не внутри `overflow-y-auto`. Сейчас «Настройки» держат `<h1>` внутри скролла (заголовок уезжает) — приводим к паттерну «Песен».

## Tasks

### Фаза 1 — компонент

- [x] **#11** Расширить `PageHeader`: `variant` + опциональный `onBack` + below-слот (`children`), обновить JSDoc (скорректировать раздел «КОГДА НЕ ИСПОЛЬЗОВАТЬ»).

### Фаза 2 — миграция страниц (блокируются #11)

- [x] **#12** Перевести «Настройки» на `<PageHeader variant="page" title="Настройки" />`; вынести header из `overflow-y-auto` (фиксирован над скроллом, как «Песни»), убрать избыточный вложенный `mx-auto max-w-md`.
- [x] **#13** Перевести список «Песни» на `<PageHeader variant="page" title="Песни">{SearchBar}</PageHeader>`.
- [x] **#14** Обновить `PageHeader.test.tsx`: кейсы для `variant='page'` без back-кнопки и для below-слота; старые кейсы остаются.

### Фаза 3 — проверка (блокируется #12, #13, #14)

- [x] **#15** Регресс-проверка view-шапок (Календарь, Song detail) + `npx tsc --noEmit` / `npm run lint` / `npm test` (скрипта `typecheck` в проекте нет). Результат: 84/84 тестов зелёные, tsc и eslint чисто.

## Commit Plan

- **Commit 1** (после #11–#14): `refactor(page-header): unify tab-page headers under PageHeader (variant + optional back)`
  — включает расширение компонента, миграцию Настроек и Песен, обновление тестов.
- **Commit 2** (после #15, при необходимости правок): `test(page-header): cover page variant and below-slot` — если правки тестов/фиксы выделяются отдельно; иначе всё в Commit 1.

_Коммитить только по явной просьбе пользователя._
