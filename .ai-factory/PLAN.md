# Plan: Refactor Bottom Navigation Bar

**Дата:** 2026-04-16  
**Режим:** Fast  
**Тесты:** нет  
**Логирование:** стандартное  

---

## Контекст и задачи

Рефакторинг нижней навигационной панели как Senior Frontend Developer:

1. **Вынести в отдельную компоненту** — `BottomNavBar`
2. **Убрать "Закладки"** — показывать только 3 пункта (Главная, Библия, Профиль) когда AI отключён
3. **Индикатор снизу под названием** вместо точки сверху над иконкой
4. **Починить навигацию с любого экрана** — перевести на URL-based подход через `usePathname`/`router.push`, убрать зависимость от `onChangeView` пропа

### Root Cause бага навигации

На страницах `/dashboard/settings` и `/dashboard/read/*` в `DashboardLayout` передаётся `onChangeView={() => {}}`. Клик по "Библия" вызывает `onChangeView(AppView.READER)`, которая ничего не делает. Переход на читалку не происходит.

**Решение:** Весь нижний navbar переводим на `router.push()` + `usePathname()` для определения активного пункта. `onChangeView` нужен только для CHAT (переключение вью внутри `/dashboard`).

---

## Задачи

### Phase 1 — Компонент BottomNavBar

#### Task 1: Создать `BottomNavBar` component

**Файл:** `src/shared/components/layout/BottomNavBar.tsx`

**Что делает:**
- Принимает пропы: `onChangeView?: (view: AppView) => void` (для CHAT/REFERENCE переключения внутри dashboard)
- Определяет активный пункт через `usePathname()` и `useSearchParams()`:
  - pathname === `/dashboard` или `/app/dashboard` → HOME активен
  - pathname начинается с `/dashboard/read` → READER активен (но nav скрыт на этой странице)
  - pathname === `/dashboard/settings` → SETTINGS активен
  - searchParams.get('view') === 'chat' → CHAT активен
- Навигация через `router.push()` для всех пунктов:
  - HOME → `router.push('/dashboard')`
  - READER → `router.push('/dashboard/read/Бытие/1')`
  - CHAT → `router.push('/dashboard?view=chat')` ИЛИ `onChangeView(AppView.CHAT)` если уже на `/dashboard`
  - SETTINGS → `router.push('/dashboard/settings')`
- Показывает только активные пункты (без "Закладок" когда AI выключен):
  - AI включён: Главная, Библия, Пастырь, Профиль
  - AI выключен: Главная, Библия, Профиль
- Индикатор активного пункта — точка **под** label-ом (`absolute -bottom-1.5`)
- Стилизация точно как в оригинале (glass-nav, rounded-[24px], etc.)

```tsx
// Структура nav item
interface NavItem {
  id: string;
  icon: React.ComponentType<{ className?: string; size?: number }>;
  label: string;
  href?: string;             // для router.push
  view?: AppView;            // для onChangeView (только CHAT)
  isFilled?: boolean;
}
```

**Логирование:**
```
console.debug('[BottomNavBar] navigate', { to: href, from: pathname })
```

---

#### Task 2: Обновить `DashboardLayout` — использовать `BottomNavBar`

**Файл:** `src/shared/components/layout/DashboardLayout.tsx`

**Изменения:**
- Импортировать `BottomNavBar`
- Убрать весь inline nav код (navItems, handleNav, блок `<nav>`)
- Условие показа nav переключить на URL-based: если pathname содержит `/read/` — скрываем nav. Иначе показываем.
- Оставить пропы `currentView` и `onChangeView` для обратной совместимости, но передавать `onChangeView` в `BottomNavBar`
- `hideBottomNav` проп оставить как запасной вариант

```tsx
// В DashboardLayout вместо inline nav:
const pathname = usePathname();
const isReaderPage = pathname.includes('/read/');

{!isReaderPage && !hideBottomNav && (
  <BottomNavBar onChangeView={onChangeView} />
)}
```

---

### Phase 2 — Dashboard page: поддержка ?view= param

#### Task 3: Читать `?view=` параметр в `DashboardPage`

**Файл:** `src/app/dashboard/page.tsx`

**Изменения:**
- Добавить `useSearchParams()` (обернуть компонент в Suspense или использовать existing Suspense boundary)
- При монтировании читать `searchParams.get('view')` и инициализировать `currentView`:
  ```ts
  const viewParam = searchParams.get('view');
  const initialView = viewParam === 'chat' ? AppView.CHAT : AppView.PLAN;
  const [currentView, setCurrentView] = useState<AppView>(initialView);
  ```
- При изменении `currentView` (через `onChangeView`) обновлять URL без перезагрузки через `router.replace`:
  ```ts
  // В handleChangeView:
  if (view === AppView.CHAT) router.replace('/dashboard?view=chat', { scroll: false });
  else if (view === AppView.PLAN) router.replace('/dashboard', { scroll: false });
  ```
- Это обеспечит: перейдя на `/dashboard/settings` и кликнув "Пастырь" в nav → попадёт на `/dashboard?view=chat`

**Логирование:**
```
console.debug('[DashboardPage] view from URL param', { viewParam, initialView })
```

---

### Phase 3 — Cleanup

#### Task 4: Удалить `BookMarked` из импортов `DashboardLayout`

**Файл:** `src/shared/components/layout/DashboardLayout.tsx`

- Убрать импорт `BookMarked` из `lucide-react` (больше не используется)
- Убрать импорт `AppView` если не используется в layout (перенесено в BottomNavBar)
- Убрать тип `navItems` и `handleNav` функцию
- Проверить что пропы интерфейса `DashboardLayoutProps` всё ещё корректны

---

## Итого файлы

| Действие | Файл |
|----------|------|
| CREATE | `src/shared/components/layout/BottomNavBar.tsx` |
| MODIFY | `src/shared/components/layout/DashboardLayout.tsx` |
| MODIFY | `src/app/dashboard/page.tsx` |

---

## Архитектурные решения

- **URL-first навигация**: активный пункт определяется из `usePathname()`, а не из проп `currentView`. Это делает nav независимым от состояния страницы.
- **CHAT как исключение**: единственный пункт, который не имеет отдельного route — управляется через `?view=chat` query param и `onChangeView`. Это сохраняет текущую архитектуру без лишних новых страниц.
- **Обратная совместимость**: `DashboardLayout` сохраняет все пропы (`currentView`, `onChangeView`, `hideBottomNav`) — Read и Settings страницы не требуют изменений.
- **Без Suspense overhead**: `useSearchParams` в DashboardPage уже клиентский компонент (`'use client'`), Next.js требует обернуть в Suspense — добавим `<Suspense>` на уровне export.
