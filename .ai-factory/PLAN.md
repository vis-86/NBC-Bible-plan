# Унификация дизайн-системы: единый источник правды для всех компонентов

**Дата:** 16 апреля 2026  
**Тип:** Refactor / Design System  
**Уровень:** Senior Design + Senior Frontend

---

## Settings

- **Tests:** нет
- **Logging:** standard
- **Docs:** обязательная проверка после завершения

---

## Контекст и анализ

### Текущие проблемы

1. **`globals.css`** содержит только 2 CSS-переменные (`--background`, `--foreground`) — дизайн-токенов нет.
2. Компоненты используют **захардкоженные цвета**: `bg-[#FAFAF9]`, `bg-[#1E293B]`, `rgb(245,245,247)` вместо семантических переменных.
3. **Нет единой палитры**: `DashboardLayout` и `PlanView` — stone/warm, `login`/`register` — zinc/white, `ReadingView` — slate/stone.
4. **Тёмная тема неполная**: `BookPicker`, `ChapterPicker`, `Modal`, `ErrorMessage`, `Toast`, `Button`, `LoadingSpinner`, calendar skeleton — совсем без `dark:`.
5. **`glass-nav`** в тёмной теме отображается белой (нет CSS-варианта для `[data-theme="dark"]`).
6. Два разных акцентных цвета: `indigo` (дашборд/план) и `red` (чтение) — не задокументированы, не семантизированы.

### Эталонный дизайн (главная страница)

Источник правды — `PlanView` + `DashboardLayout` + `TodayReadingCard`:
- **Фон:** `#FAFAF9` (warm off-white) / `stone-900` (dark)
- **Поверхности:** white + glass / stone-800
- **Типографика:** Plus Jakarta Sans (UI) + Lora (Serif/Scripture)
- **Первичный (план):** indigo-600
- **Акцент (чтение):** red-600
- **Успех/прогресс:** emerald-500
- **Навигация:** glass bottom bar

### Дизайн-направление (Frontend Design Skill)

**Aesthetic:** "Sacred Minimal" — органический минимализм с редакционными акцентами  
**Tone:** Organic/Natural + Editorial  
**DFII:** Impact(4) + Fit(5) + Feasibility(5) + Performance(4) − Risk(2) = **16** → Отличный результат

**Дифференциатор:** "Тёплая, дышащая атмосфера духовного чтения — без холодного SaaS-шаблона"

---

## Фазы реализации

---

### Фаза 1: Создание дизайн-токен системы

#### Задача 1.1: Создать файл дизайн-токенов `src/shared/config/design-tokens.ts`

**Файлы:** `src/shared/config/design-tokens.ts` (новый)  
**Описание:** TypeScript-файл с экспортом всех токенов дизайн-системы — цвета, отступы, радиусы, тени, типографика. Служит документацией для разработчиков.

Структура токенов:
```typescript
// Семантические цветовые токены (ссылаются на CSS-переменные)
export const tokens = {
  color: {
    bg: {
      base: 'bg-app-bg',           // --color-app-bg
      surface: 'bg-app-surface',   // --color-app-surface
      elevated: 'bg-app-elevated', // --color-app-elevated
      overlay: 'bg-app-overlay',   // --color-app-overlay (dark hero card)
    },
    text: {
      primary: 'text-app-text',
      secondary: 'text-app-text-secondary',
      muted: 'text-app-text-muted',
      inverse: 'text-app-text-inverse',
    },
    primary: { ... },   // indigo palette
    accent: { ... },    // red palette (reading)
    success: { ... },   // emerald/green palette
    warning: { ... },   // amber palette
    border: { ... },
  },
  radius: { ... },
  shadow: { ... },
}
```

**Logging:** `INFO [design-tokens] токены загружены`

---

#### Задача 1.2: Обновить `globals.css` — полная система CSS-переменных

**Файлы:** `src/app/globals.css`  
**Описание:** Расширить до ~60 CSS-переменных, покрывающих все компоненты. Оба варианта (light + dark).

Добавить в `:root` / `[data-theme="light"]` / `[data-theme="dark"]`:

**Фоны:**
```css
--app-bg: #FAFAF9;              /* Основной фон страницы */
--app-surface: #ffffff;          /* Поверхности карточек */
--app-surface-elevated: #f8f7f5; /* Приподнятые поверхности */
--app-surface-muted: #F5F5F4;    /* Приглушённые поверхности */
--app-overlay: #1E293B;          /* Тёмная overlay-карточка (TodayReadingCard) */
--app-overlay-inner: rgba(15,23,42,0.5); /* Внутренний blur слой overlay */
```

**Текст:**
```css
--app-text: #1c1917;             /* stone-900 */
--app-text-secondary: #57534e;   /* stone-600 */
--app-text-muted: #a8a29e;       /* stone-400 */
--app-text-subtle: #d6d3d1;      /* stone-300 */
--app-text-inverse: #ffffff;
```

**Первичный (план/навигация — Indigo):**
```css
--app-primary: #4f46e5;          /* indigo-600 */
--app-primary-hover: #4338ca;    /* indigo-700 */
--app-primary-light: #eef2ff;    /* indigo-50 */
--app-primary-muted: rgba(79,70,229,0.15);
```

**Акцент (чтение — Red):**
```css
--app-accent: #dc2626;           /* red-600 */
--app-accent-hover: #b91c1c;     /* red-700 */
--app-accent-light: #fef2f2;     /* red-50 */
--app-accent-muted: rgba(220,38,38,0.15);
```

**Успех (прогресс — Emerald):**
```css
--app-success: #10b981;          /* emerald-500 */
--app-success-dark: #059669;     /* emerald-600 */
--app-success-light: #ecfdf5;    /* emerald-50 */
--app-success-muted: rgba(16,185,129,0.15);
```

**Пропущено (Missed — Warm Red):**
```css
--app-missed: #fecaca;           /* red-200 bg */
--app-missed-text: #dc2626;      /* red-600 text */
```

**Границы:**
```css
--app-border: rgba(0,0,0,0.06);
--app-border-subtle: rgba(0,0,0,0.04);
--app-border-strong: rgba(0,0,0,0.12);
```

**Тени:**
```css
--app-shadow-sm: 0 1px 3px rgba(0,0,0,0.06);
--app-shadow-md: 0 4px 16px rgba(0,0,0,0.08);
--app-shadow-card: 0 8px 32px rgba(15,23,42,0.12);
```

**Glass-эффекты с dark-вариантами:**
```css
/* Обновлённые glass-nav / glass-panel включают dark-вариант */
[data-theme="dark"] .glass-nav {
  background: rgba(28,25,23,0.88); /* stone-900 аналог */
  border-color: rgba(255,255,255,0.06);
}
[data-theme="dark"] .glass-panel {
  background: rgba(41,37,36,0.75); /* stone-800 аналог */
  border-color: rgba(255,255,255,0.08);
}
```

**Tailwind `@theme inline`** — добавить маппинг всех новых переменных:
```css
@theme inline {
  --color-app-bg: var(--app-bg);
  --color-app-surface: var(--app-surface);
  ...etc
}
```

---

### Фаза 2: Основной Layout и навигация

#### Задача 2.1: Обновить `DashboardLayout.tsx`

**Файлы:** `src/shared/components/layout/DashboardLayout.tsx`  
**Изменения:**
- `bg-[#FAFAF9]` → `bg-app-bg`
- `dark:bg-stone-900` → `dark:bg-app-bg` (Tailwind v4 не нужен, всё через CSS-переменную)
- Нижний nav: уже использует `glass-nav`, но добавить `data-theme="dark"` стиль через CSS

#### Задача 2.2: Обновить `DashboardHomeSkeleton.tsx`

**Файлы:** `src/shared/components/skeletons/DashboardHomeSkeleton.tsx`  
**Изменения:**
- `bg-[rgb(245,245,247)]` → `bg-app-bg`
- `bg-white/75` → `bg-app-surface/75`
- `stone-200/70` / `stone-800/15` → токены

---

### Фаза 3: Компоненты главного дашборда

#### Задача 3.1: Обновить `PlanView.tsx`

**Файлы:** `src/features/plan/components/PlanView.tsx`  
**Изменения:**
- `bg-[#FAFAF9]` → `bg-app-bg`
- `dark:bg-stone-900` → убрать дубль (уже в переменной)
- Карточка "Недельное чтение": `bg-white dark:bg-stone-800` → `bg-app-surface dark:bg-app-surface`
- `border-stone-100 dark:border-stone-700` → `border-app-border`
- Текстовые классы: унифицировать на `text-app-text` / `text-app-text-secondary`
- `text-indigo-600 dark:text-indigo-400` → `text-app-primary`

#### Задача 3.2: Обновить `TodayReadingCard.tsx`

**Файлы:** `src/features/plan/components/TodayReadingCard.tsx`  
**Изменения (сохранить dark hero aesthetic, но через токены):**
- Внешний div `bg-[#1E293B]` → `bg-app-overlay`
- Внутренний `bg-slate-800/50` → `bg-app-overlay-inner`
- `border-white/5` → `border-[rgba(255,255,255,0.05)]` (или токен `--app-border-overlay`)
- Чекбокс `checked:bg-emerald-500` → `checked:bg-app-success`
- Прогресс SVG `text-emerald-400` → `text-[color:var(--app-success)]`
- Строки чтения `bg-slate-700/30` → `bg-white/5` (universal over overlay)
- Badge `bg-emerald-500/10 border-emerald-500/20 text-emerald-400` → CSS-переменные успеха
- **Shadow:** `shadow-slate-200` → `shadow-app-card`
- Тёмная тема дашборда: в `[data-theme="dark"]` overlay-карточка должна светлеть слегка (`bg-slate-700/50`)

#### Задача 3.3: Обновить `DayNavigationBar.tsx`

**Файлы:** `src/features/plan/components/DayNavigationBar.tsx`  
**Изменения:**
- `bg-green-500 dark:bg-green-600` (completed) → `bg-app-success`
- `text-white` на completed → `text-app-text-inverse`
- `bg-red-100 dark:bg-red-900/40` (missed) → `bg-app-missed`
- `text-red-700 dark:text-red-300` → `text-app-missed-text`
- `text-stone-700 dark:text-stone-200` (future) → `text-app-text`
- Calendar-кнопки: `hover:bg-blue-50 dark:hover:bg-blue-900/30 border-stone-200 dark:border-stone-600` → `hover:bg-app-primary-light border-app-border`
- "Сегодня"-кнопка: `bg-stone-900 dark:bg-stone-700` → `bg-app-text text-app-text-inverse`

#### Задача 3.4: Обновить `VerseOfTheDay.tsx`

**Файлы:** `src/features/plan/components/VerseOfTheDay.tsx`  
**Изменения:**
- `bg-[#F5F5F4] dark:bg-stone-800` → `bg-app-surface-muted`
- `border-stone-200/50 dark:border-stone-700` → `border-app-border`
- `text-stone-700 dark:text-stone-300` → `text-app-text-secondary`
- `bg-stone-200/50 dark:bg-stone-700` (reference badge) → `bg-app-surface-elevated`

---

### Фаза 4: Shared UI Components — закрыть dark-mode gap

#### Задача 4.1: Обновить `Modal.tsx`

**Файлы:** `src/shared/components/ui/Modal.tsx`  
**Изменения:**
- Панель `bg-white` → `bg-app-surface dark:[data-theme=dark]:bg-app-surface`  
- Заголовок `text-stone-900` → `text-app-text`
- Добавить `dark:` варианты для границ и теней

#### Задача 4.2: Обновить `Button.tsx`

**Файлы:** `src/shared/components/ui/Button.tsx`  
**Изменения:**
- `primary`: `red-600` → сохранить `red` (`app-accent`) для reading-контекста; добавить `dark:` hover states
- `secondary`: `stone-100 dark:stone-700` варианты
- Все варианты — добавить dark mode

#### Задача 4.3: Обновить `ErrorMessage.tsx`, `Toast.tsx`, `LoadingSpinner.tsx`

**Файлы:** `src/shared/components/ui/ErrorMessage.tsx`, `Toast.tsx`, `LoadingSpinner.tsx`  
**Изменения:**
- Добавить `dark:` варианты
- Ошибки: `bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400`
- Toast: сохранить зелёный, добавить dark
- Spinner: `text-app-accent`

#### Задача 4.4: Обновить `BottomSheet.tsx`

**Файлы:** `src/shared/components/ui/BottomSheet.tsx`  
**Изменения:**
- `bg-white dark:bg-stone-800` → `bg-app-surface`
- `border-stone-100 dark:border-stone-700` → `border-app-border`

---

### Фаза 5: Компоненты чтения

#### Задача 5.1: Добавить тёмную тему в `BookPicker.tsx` и `ChapterPicker.tsx`

**Файлы:** `src/features/reading/components/BookPicker.tsx`, `ChapterPicker.tsx`  
**Описание:** Компоненты полностью без тёмной темы. Добавить `dark:` варианты для фона, поверхностей, границ.

#### Задача 5.2: Унифицировать `ReadingView.tsx` и `ReadingContent.tsx`

**Файлы:** `src/features/reading/components/ReadingView.tsx`, `ReadingContent.tsx`  
**Описание:** 
- Оставить "тему чтения" (light/dark/sepia) как есть — она отдельная
- Унифицировать chrome UI (заголовки, кнопки, панели) на токены

#### Задача 5.3: Обновить `CompletionModal.tsx`

**Файлы:** `src/features/reading/components/CompletionModal.tsx`  
**Изменения:** прогресс-бар → `text-app-accent`, кнопки → `bg-app-text text-app-text-inverse`

---

### Фаза 6: Страницы (Pages)

#### Задача 6.1: Обновить `login/page.tsx` и `register/page.tsx`

**Файлы:** `src/app/login/page.tsx`, `src/app/register/page.tsx`  
**Описание:** Заменить `zinc` → `stone` для унификации с общей палитрой приложения.

#### Задача 6.2: Обновить `dashboard/settings/page.tsx`

**Файлы:** `src/app/dashboard/settings/page.tsx`  
**Изменения:** `stone-50` → `bg-app-bg`, карточки → `bg-app-surface`, убрать случайный `border-red-500` у переключателя темы

#### Задача 6.3: Исправить `calendar/page.tsx` — добавить dark mode

**Файлы:** `src/app/dashboard/calendar/page.tsx`  
**Изменения:** splash-состояние без `dark:` → добавить `dark:bg-app-bg dark:text-app-text`

---

### Фаза 7: Документация

#### Задача 7.1: Обновить `AGENTS.md` — добавить секцию дизайн-системы

**Файлы:** `AGENTS.md`  
**Изменения:** Добавить секцию `## Design System` с описанием токенов, ссылкой на `design-tokens.ts`, правилами использования.

---

## Commit Plan

**Checkpoint 1** (Задачи 1.1–1.2): `feat(design): add design token system and full CSS variables`  
**Checkpoint 2** (Задачи 2.1–3.4): `feat(design): unify dashboard layout and plan components to design system`  
**Checkpoint 3** (Задачи 4.1–4.4): `feat(design): add dark mode to shared UI components`  
**Checkpoint 4** (Задачи 5.1–5.3): `feat(design): unify reading feature components`  
**Checkpoint 5** (Задачи 6.1–6.3): `feat(design): unify pages to design system`  
**Checkpoint 6** (Задача 7.1): `docs: update AGENTS.md with design system documentation`

---

## Критерии готовности

- [x] Все цвета в компонентах ссылаются на CSS-переменные (нет `bg-[#hex]`)
- [x] `globals.css` — единственный источник правды для цветов
- [x] Все компоненты корректно выглядят в light и dark теме
- [x] `glass-nav` работает в тёмной теме
- [x] Нет смешения `zinc` и `stone` палитр в основном UI
- [x] `BookPicker`, `ChapterPicker` имеют dark mode
- [x] Все shared UI компоненты (`Modal`, `Button`, `Toast` и т.д.) поддерживают dark
- [x] Документация обновлена

## Результат

**Статус: ЗАВЕРШЕНО** (16 апреля 2026)

Все 19 задач выполнены. Дизайн-система унифицирована:
- `src/shared/config/design-tokens.ts` — TypeScript-константы токенов
- `src/app/globals.css` — ~60 CSS-переменных (light + dark)
- Все компоненты UI используют семантические классы `bg-app-*`, `text-app-*`, `border-app-*`, `shadow-app-*`
- `CalendarView` и `CalendarDayDetail` переведены на токены
- `AGENTS.md` обновлён с документацией дизайн-системы
