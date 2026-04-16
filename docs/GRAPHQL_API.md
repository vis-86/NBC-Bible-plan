[← История чата](CHAT_HISTORY_SETUP.md) · [Back to README](../README.md) · [Telegram уведомления →](TELEGRAM_DAILY_NOTIFICATION_FLOW.md)

# GraphQL API для обновления прогресса

## Обзор

Мы используем GraphQL API для точечных обновлений прогресса чтения без полной перезагрузки страницы. Это обеспечивает плавные и интерактивные обновления интерфейса.

## Архитектура

### 1. GraphQL Endpoint
- **Путь**: `/api/graphql`
- **Метод**: POST
- **Аутентификация**: Через сессию (cookie)

### 2. Клиент GraphQL
- **Файл**: `src/shared/services/api/graphql.ts`
- Предоставляет методы `mutate()` и `query()`
- Поддерживает переменные GraphQL

### 3. React Hooks
- **useProgress**: Использует GraphQL мутации для обновления прогресса
- Использует `useTransition` для плавных обновлений UI
- Оптимистичные обновления состояния

## Использование

### Обновление прогресса дня

```typescript
import { graphqlClient, progressMutations } from '@/shared/services/api/graphql';

// Обновить прогресс дня через GraphQL
const mutation = progressMutations.updateProgress(dayId, count);
await graphqlClient.mutate(mutation);
```

### В компонентах

```typescript
import { useProgress } from '@/features/plan/hooks/useProgress';

const { toggleComplete, toggleItem, isPending } = useProgress({
  plan,
  setPlan,
  setReadChapters
});

// Обновление происходит оптимистично через setPlan
// Не нужно вызывать fetchPlan() после обновления
await toggleComplete(dayId);
```

## Преимущества

1. **Плавные обновления**: Использование `useTransition` предотвращает блокировку UI
2. **Оптимистичные обновления**: Состояние обновляется мгновенно, до получения ответа от сервера
3. **Точечные запросы**: Обновляется только необходимый день, без перезагрузки всего плана
4. **Обработка ошибок**: Автоматический откат при ошибке

## Структура мутаций

### updateProgress

```graphql
mutation UpdateProgress($day: Int!, $count: Int) {
  updateProgress(day: $day, count: $count) {
    day
    count
    success
  }
}
```

**Параметры**:
- `day`: Номер дня (обязательный)
- `count`: Количество прочитанных глав или `null` для полного завершения дня

## Интеграция с Directus

GraphQL endpoint использует Directus SDK для обновления данных в коллекции `reading`:
- Создание новой записи при первом обновлении
- Обновление существующей записи
- Удаление записи при сбросе прогресса (`count: 0`)

## See Also

- [Схема БД](database-schema.md) — структура таблицы `reading`
- [Настройка Directus](DIRECTUS_SETUP_GUIDE.md) — коллекции и разрешения
- [Архитектура](architecture.md) — паттерн Typed API Client
