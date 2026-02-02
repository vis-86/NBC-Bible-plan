---
alwaysApply: true
---
# Cursor Rules for Next.js Development

При генерации или редактировании кода строго следуй этим правилам, учитывая текущую конфигурацию проекта.

## Принципы разработки

- **KISS**: Простота прежде всего. Избегай избыточной абстракции.
- **SOLID**: Особенно SRP (одна ответственность на модуль) и DIP (зависимости через интерфейсы/пропсы).
- **DRY**: Устраняй дубли, но не в ущерб ясности.
- Код должен быть понятен коллеге за 10 секунд.

## Структура проекта

Проект использует **feature-based** архитектуру:

```
src/
├── app/                    # Next.js App Router (только роутинг и композиция)
├── features/               # Feature-based модули
│   ├── reading/           # Функциональность чтения
│   ├── plan/              # Функциональность плана чтения
│   ├── chat/              # Функциональность чата
│   └── reference/         # Функциональность поиска
│       ├── components/    # Компоненты фичи
│       ├── hooks/         # Хуки фичи
│       ├── services/      # Сервисы фичи
│       └── types.ts       # Типы фичи
├── shared/                # Общие компоненты и утилиты
│   ├── components/        # Переиспользуемые UI компоненты
│   │   ├── ui/           # Базовые UI (Modal, Button, etc.)
│   │   ├── layout/       # Layout компоненты
│   │   └── bible/        # Компоненты для Библии
│   ├── hooks/            # Общие хуки
│   ├── services/         # Общие сервисы
│   │   └── api/         # API клиент и endpoints
│   ├── utils/           # Утилиты
│   └── types/           # Общие типы
└── lib/                  # Внешние интеграции (directus, ai, telegram)
```

## Правила размещения кода

### Компоненты
- **Feature компоненты** → `src/features/{feature}/components/`
- **Переиспользуемые UI** → `src/shared/components/ui/`
- **Layout компоненты** → `src/shared/components/layout/`
- **Специализированные компоненты** → `src/shared/components/{category}/`

### Хуки
- **Feature хуки** → `src/features/{feature}/hooks/`
- **Общие хуки** → `src/shared/hooks/`
- Хуки должны быть маленькими и сфокусированными (одна ответственность)

### Сервисы и API
- **API клиент** → `src/shared/services/api/client.ts`
- **API endpoints** → `src/shared/services/api/endpoints.ts`
- **Feature сервисы** → `src/features/{feature}/services/`
- Все API вызовы должны идти через централизованный клиент

### Утилиты
- **Утилиты для Библии** → `src/shared/utils/bible.ts`
- **API утилиты** → `src/shared/utils/api.ts`
- **Константы** → `src/shared/utils/constants.ts`
- Старый `src/lib/utils.ts` реэкспортирует для обратной совместимости

## Правила работы с компонентами

1. **Размер компонентов**: Компонент не должен превышать 200-300 строк. Если больше - разбивай на подкомпоненты.

2. **Разделение ответственности**:
   - UI компоненты только отображают данные
   - Бизнес-логика в хуках
   - API вызовы в сервисах

3. **Использование хуков**:
   - `useReadingSettings` - настройки чтения
   - `useBibleText` - загрузка текста Библии
   - `useChapterNavigation` - навигация между главами
   - `usePlan` - загрузка плана
   - `useProgress` - управление прогрессом

4. **Переиспользуемые компоненты**:
   - Используй `Modal`, `BottomSheet`, `Button`, `LoadingSpinner` из `shared/components/ui/`
   - Не создавай дубликаты этих компонентов

## Правила работы с API

1. **Всегда используй централизованный клиент**:
   ```typescript
   import { planApi, progressApi, readingSettingsApi, bibleApi } from '@/shared/services/api/endpoints';
   ```

2. **Не используй прямые fetch вызовы** в компонентах - только через API клиент или хуки.

3. **Типизация**: Все API endpoints должны быть типизированы в `endpoints.ts`

## Правила импортов

1. **Абсолютные пути**: Используй `@/` для импортов из `src/`
2. **Порядок импортов**:
   - React и Next.js
   - Сторонние библиотеки
   - Типы
   - Компоненты
   - Хуки
   - Утилиты
   - Константы

3. **Примеры правильных импортов**:
   ```typescript
   import { ReadingView } from '@/features/reading/components/ReadingView';
   import { usePlan } from '@/features/plan/hooks/usePlan';
   import { Modal } from '@/shared/components/ui/Modal';
   import { parseReadingItem } from '@/shared/utils/bible';
   import { getApiPath } from '@/shared/utils/api';
   ```

## Next.js специфичные правила

- Используй App Router (`app/`)
- Страницы должны быть минимальными - только роутинг и композиция
- Бизнес-логика в хуках и сервисах, не в страницах
- Используй Server Components где возможно, Client Components только когда нужно

## Типизация

- Всегда используй TypeScript
- Типы фичи → `src/features/{feature}/types.ts`
- Общие типы → `src/shared/types/` или `src/types/`
- Избегай `any`, используй конкретные типы или `unknown`

## Тестирование (будущее)

- Компоненты → `__tests__/` рядом с компонентом
- Хуки → `__tests__/` рядом с хуком
- Сервисы → `__tests__/` рядом с сервисом