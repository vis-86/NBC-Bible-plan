# UI Improvements: DayNavigationBar + TodayReadingCard

**Дата:** 2026-04-16  
**Режим:** Fast  
**Тесты:** нет  
**Логирование:** стандартное

---

## Настройки

- Testing: no
- Logging: standard
- Docs: no

---

## Контекст

Пять UI-улучшений для главного экрана дашборда (`/dashboard`):

1. Кнопка «Календарь» в `DayNavigationBar` заменяется иконкой на бейдже в `TodayReadingCard`
2. Исправить баг скролла к сегодняшнему дню (неверный data-атрибут в querySelector)
3. Для не-сегодняшнего дня: менять заголовок карточки + «Сегодня» как floating overlay
4. `data-today-reading-card-progress` → годовой прогресс (completedDays / totalDays)
5. Исправить вертикальный скролл всего приложения

**Затрагиваемые файлы:**
- `src/features/plan/components/DayNavigationBar.tsx`
- `src/features/plan/components/TodayReadingCard.tsx`
- `src/features/plan/components/PlanView.tsx`
- `src/shared/components/layout/DashboardLayout.tsx`

---

## Задачи

### Задача 1: Убрать кнопку «Календарь», добавить иконку в badge

**Файлы:** `DayNavigationBar.tsx`, `TodayReadingCard.tsx`

**DayNavigationBar.tsx:**
- Удалить весь блок `data-day-nav-bar-controls` (div с кнопкой «Календарь» и кнопкой «Сегодня», строки 75–98)
- Компонент становится проще: только трек со скроллом + floating overlay для «Сегодня» (задача 4)

**TodayReadingCard.tsx:**
- Добавить prop `onOpenCalendar?: () => void` (или использовать `useRouter` внутри)
- Обернуть `data-today-reading-card-plan-badge` в `<button>` или `<a>` с `onClick` → navigate `/dashboard/calendar`
- Добавить `<Calendar size={12} />` иконку слева внутри badge
- Стили badge: добавить `cursor-pointer hover:bg-app-success/20 transition-colors`
- Импорт `Calendar` из `lucide-react` и `useRouter` из `next/navigation`

**Результат:** нажатие на badge «📅 План 2026» открывает страницу календаря

---

### Задача 2: Исправить скролл к сегодняшнему дню

**Файл:** `DayNavigationBar.tsx`

**Баг:** querySelector ищет `[data-day-navigation-cube="day-${selectedDayId}"]`,  
но элементы имеют атрибут `data-day-nav-cube={day.id}` (строка 119).

**Фикс (строка 51):**
```tsx
// Было:
`[data-day-navigation-cube="day-${selectedDayId}"]`
// Стало:
`[data-day-nav-cube="${selectedDayId}"]`
```

Также убедиться, что атрибут на кубиках передаёт `day.id` как строку (уже так в JSX через `{day.id}`).

**Результат:** при выборе дня / первой загрузке полоса скроллится к нужному кубику.

---

### Задача 3a: Заголовок карточки «Чтение на {dd mmm}» для не-сегодняшнего дня

**Файлы:** `TodayReadingCard.tsx`, `PlanView.tsx`

**TodayReadingCard.tsx — новые props:**
```tsx
interface TodayReadingCardProps {
  // ... существующие
  isToday: boolean;    // true когда selectedDayId === todayDayNumber
}
```

**Логика заголовка (строка 52):**
```tsx
const title = isToday
  ? 'Чтение на сегодня'
  : `Чтение на ${formatDateShort(day.dateStr)}`;  // уже есть в @/shared/utils/bible
```

Импортировать `formatDateShort` из `@/shared/utils/bible`.

**PlanView.tsx — передать prop:**
```tsx
<TodayReadingCard
  ...
  isToday={selectedDayId === todayDayNumber}
/>
```

**Результат:** при выборе дня 5 января заголовок: «Чтение на 05 янв»

---

### Задача 3b: Кнопка «Сегодня» — floating overlay над полосой навигации

**Файл:** `DayNavigationBar.tsx`

Кнопка показывается **только когда** `selectedDayId !== todayDayNumber`.

Разместить поверх `data-day-nav-bar-track` с `position: relative` на обёртке:

```tsx
<div data-day-nav-bar className="flex flex-col gap-2 relative">
  {/* трек со скроллом */}
  <div data-day-nav-bar-track className="relative ...">
    <div ref={scrollContainerRef} ...>
      {/* кубики */}
    </div>

    {/* Floating overlay кнопка */}
    {selectedDayId !== todayDayNumber && (
      <div
        className={cn(
          "absolute top-0 bottom-0 flex items-center pointer-events-none z-10",
          selectedDayId < todayDayNumber
            ? "left-0 bg-gradient-to-r from-app-bg to-transparent pr-2"   // прошлое: слева
            : "right-0 bg-gradient-to-l from-app-bg to-transparent pl-2"  // будущее: справа
        )}
      >
        <button
          data-day-nav-bar-today-btn
          onClick={() => onSelectDay(todayDayNumber)}
          className="pointer-events-auto h-9 px-3 bg-app-text text-app-text-inverse rounded-lg transition-all hover:opacity-90 active:scale-95 flex gap-1.5 items-center text-sm font-semibold shadow-app-md"
          title="Перейти на сегодня"
        >
          {selectedDayId < todayDayNumber ? (
            // Мы в прошлом — навигируем вправо (к сегодня)
            <>
              <span>Сегодня</span>
              <ChevronRight size={16} strokeWidth={2.5} />
            </>
          ) : (
            // Мы в будущем — навигируем влево (к сегодня)
            <>
              <ChevronLeft size={16} strokeWidth={2.5} />
              <span>Сегодня</span>
            </>
          )}
        </button>
      </div>
    )}
  </div>
</div>
```

Импортировать `ChevronLeft`, `ChevronRight` из `lucide-react`.  
Убрать импорт `Calendar` из `DayNavigationBar` (больше не нужен).

**Результат:** кнопка «Сегодня» с направляющей стрелкой, красиво вписанная в общий стиль, не занимает отдельную строку.

---

### Задача 4: Годовой прогресс вместо дневного

**Файлы:** `TodayReadingCard.tsx`, `PlanView.tsx`

**TodayReadingCard.tsx — новый prop:**
```tsx
interface TodayReadingCardProps {
  // ... существующие
  yearProgress: number;  // 0–100, процент завершённых дней за год
}
```

Заменить `progressPercent` (дневной) на `yearProgress` в SVG-круге:

```tsx
// Убрать:
const completedCount = day.items?.filter(...).length ?? 0;
const totalItems = ...;
const progressPercent = ...;
const strokeDashoffset = CIRCLE - (CIRCLE * progressPercent) / 100;

// Добавить расчёт для кольца:
const strokeDashoffset = CIRCLE - (CIRCLE * yearProgress) / 100;
```

Обновить aria-label и текст внутри круга:
```tsx
aria-label={`Годовой прогресс: ${yearProgress}%`}
// текст:
<span ...>{yearProgress}%</span>
```

**PlanView.tsx — вычислить и передать:**
```tsx
const completedDaysCount = filteredPlan.filter((d) => d.completed).length;
// totalDays уже есть через filteredPlan.length
const yearProgressPercent = filteredPlan.length > 0
  ? Math.round((completedDaysCount / filteredPlan.length) * 100)
  : 0;

<TodayReadingCard
  ...
  yearProgress={yearProgressPercent}
/>
```

Переменная `streak` (строка 231) остаётся — она может использоваться в других местах.

**Результат:** кольцо прогресса показывает % прочитанных дней за весь год.

---

### Задача 5: Исправить вертикальный скролл

**Файл:** `src/features/plan/components/PlanView.tsx`

**Причина бага:**  
`PlanView` имеет `min-h-full overflow-y-auto`. С `min-h-full` элемент расширяется под контент и `overflow-y-auto` не создаёт scrollbar — нужна фиксированная высота.

**Фикс в PlanView (строка 244):**
```tsx
// Было:
className="flex flex-col min-h-full bg-app-bg text-app-text overflow-y-auto pb-32"
// Стало:
className="flex flex-col h-full bg-app-bg text-app-text overflow-y-auto pb-32"
```

**Дополнительно проверить цепочку высот:**  
В `DashboardLayout.tsx` (строка 53–54):
- `data-dashboard-layout-main`: `flex-1 overflow-hidden` — ОК, задаёт высоту
- Внутренний div `max-w-md mx-auto h-full` — ОК

В `dashboard/page.tsx` (строка 187):
- Обёртка PlanView: `block h-full` — ОК

С заменой `min-h-full` на `h-full` в PlanView цепочка замкнётся и скролл заработает.

**Результат:** страница скроллится вертикально когда контент выходит за нижнюю границу экрана.

---

## Порядок реализации

```
Задача 2 → Задача 1 → Задача 3a → Задача 3b → Задача 4 → Задача 5
```

(Задача 2 первая — самая изолированная, быстро проверяемая. Задача 5 последняя — затрагивает layout.)

---

## Примечания

- `formatDateShort` уже экспортируется из `@/shared/utils/bible` — использовать без изменений
- `ChevronLeft`/`ChevronRight` уже импортируются в `PlanView.tsx` — добавить в `DayNavigationBar.tsx`
- Утилита `cn` доступна через `@/shared/utils/cn`
- Годовой прогресс в круге — числовое значение 0-100, без анимации пересчёта (просто обновляется при изменении props)

---

## Чеклист выполнения

- [x] Задача 1: Убрать кнопку «Календарь», добавить иконку в badge
- [x] Задача 2: Исправить скролл к сегодняшнему дню
- [x] Задача 3a: Заголовок карточки «Чтение на {dd mmm}» для не-сегодняшнего дня
- [x] Задача 3b: Кнопка «Сегодня» — floating overlay над полосой навигации
- [x] Задача 4: Годовой прогресс вместо дневного
- [x] Задача 5: Исправить вертикальный скролл
