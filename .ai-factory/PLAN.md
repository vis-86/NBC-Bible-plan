# Plan: CalendarView — унификация цветовых кубиков дат с data-day-nav-cube

**Дата:** 2026-04-22  
**Режим:** Fast  
**Тесты:** нет  
**Логирование:** verbose  
**Документация:** warn-only

---

## Контекст

Нужно привести визуал и логику кубиков дат в `src/features/plan/components/CalendarView.tsx` к тем же правилам, что используются в `data-day-nav-cube` из `src/features/plan/components/DayNavigationBar.tsx`.

Целевое поведение по статусам:

- `completed` (прочитано)
- `missed` (пропущено)
- `future` / непрочитано (не прочитано и не пропущено)

---

## Settings

- **Testing:** no (по запросу пользователя)
- **Logging:** verbose (DEBUG-уровень в ключевых вычислениях статуса и массовых действиях)
- **Docs:** no (warn-only)

---

## Задачи

### Phase 1 — Единая модель статуса и стилей для кубиков

#### [x] Task 1: Вынести и унифицировать статус дня в `CalendarView`

**Файл:** `src/features/plan/components/CalendarView.tsx`

**Deliverable:**

- Добавить локальный тип статуса дня, совместимый с `DayNavigationBar`: `completed | missed | future`.
- Создать функцию `getCalendarDayStatus(...)`, которая вычисляет статус по той же логике:
  - `completed`, если день отмечен как прочитанный;
  - `missed`, если день меньше `todayDayNumber` и не прочитан;
  - `future`, если не попадает в первые два случая.
- Исключить дублирующие разрозненные проверки (`isCompleted`, `isMissed`) из JSX, оставив единый источник истины через `status`.

**Логирование (обязательно):**

- `console.debug('[CalendarView] day status computed', { dayId, status, completed, todayDayNumber })` при формировании данных календаря.

**Dependency notes:** базовая задача для всех последующих задач по UI.

---

### Phase 2 — Синхронизация цветов и data-атрибутов с DayNavigationBar

#### [x] Task 2: Применить цветовую схему data-day-nav-cube в ячейках календаря

**Файл:** `src/features/plan/components/CalendarView.tsx`

**Deliverable:**

- Выстроить className-ветвление по статусу, зеркально `DayNavigationBar`:
  - `completed`: `bg-app-success` + контрастный текст (`text-app-text-inverse`);
  - `missed`: `text-app-missed-text` (+ `bg-app-missed`, если нужен фон для читаемости);
  - `future`: `text-app-text`.
- Сохранить иерархию выделения выбранного дня (`isSelected`) так, чтобы selected-стили не ломали статусную индикацию.
- Проверить, что иконка `Check` визуально согласована с `data-day-nav-cube` (позиция/контраст/размер).

**Логирование (обязательно):**

- `console.debug('[CalendarView] day cube classes resolved', { dayId, status, isSelected, className })`.

**Dependency notes:** зависит от Task 1 (единый `status`).

---

#### [x] Task 3: Добавить статусные data-атрибуты в календарные кубики

**Файл:** `src/features/plan/components/CalendarView.tsx`

**Deliverable:**

- Добавить атрибуты для консистентности и будущей автопроверки UI:
  - `data-day-nav-cube`
  - `data-day-nav-cube-status` (`completed | missed | future`)
  - `data-day-nav-cube-selected` (`true/false`).
- Гарантировать соответствие атрибутов итоговому отображению (цвет/иконка/статус).

**Логирование (обязательно):**

- `console.debug('[CalendarView] day cube attrs set', { dayId, status, selected: isSelected })`.

**Dependency notes:** зависит от Task 1 и Task 2.

---

### Phase 3 — Валидация поведения и cleanup

#### [x] Task 4: Проверить сценарии состояний и убрать лишнюю логику

**Файл:** `src/features/plan/components/CalendarView.tsx`

**Deliverable:**

- Пройти ключевые сценарии в коде компонента:
  - прошлый непрочитанный день -> `missed`;
  - прочитанный день -> `completed`;
  - текущий/будущий непрочитанный -> `future`.
- Удалить или упростить устаревшие условные ветки и классы, которые дублируют новую status-модель.
- Убедиться, что массовые действия (`mark selected`, `mark missed`) не конфликтуют с новой визуальной моделью.

**Логирование (обязательно):**

- `console.debug('[CalendarView] bulk action executed', { action, selectedDays, affectedStatuses })`.
- `console.warn('[CalendarView] status mismatch detected', { dayId, status, visualState })` при выявлении несоответствия.

**Dependency notes:** зависит от Task 1-3.

---

## Итого файлы

- MODIFY: `src/features/plan/components/CalendarView.tsx`

---

## Примечания по реализации

- Ориентиром для логики и цвета является `src/features/plan/components/DayNavigationBar.tsx`.
- Архитектурно изменение локально для feature `plan` и не нарушает границы FSD (`features -> shared`).
- Тестовые задачи исключены по явному выбору пользователя.

