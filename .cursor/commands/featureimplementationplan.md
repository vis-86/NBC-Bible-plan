# План реализации: Упрощенная аутентификация для Telegram Mini App

## 1. ARCHITECTURE DECISION

### Proposed Approach: Двухуровневая аутентификация

**Уровень 1: Next.js Session (App-level)**
- Верификация Telegram данных создает сессию в Next.js
- Сессия хранится в HttpOnly cookie (Next.js встроенный механизм)
- Используется для защиты маршрутов приложения

**Уровень 2: Directus API (Data-level)**
- Все запросы к Directus идут через серверные API routes
- Используется admin token для авторизации запросов
- Пользователь идентифицируется через Telegram ID из сессии

**Почему этот подход:**
- ✅ Простота: не нужно создавать сессии в Directus
- ✅ Надежность: Next.js сессии работают из коробки
- ✅ Безопасность: admin token только на сервере
- ✅ Гибкость: легко добавить другие провайдеры

### Alternative Approaches Considered

1. **Directus Cookie Sessions** (текущий, не работает)
   - Проблема: сложность создания сессий через API
   - Проблема: управление cookie между доменами

2. **Lucia-auth**
   - Плюсы: готовое решение
   - Минусы: дополнительная зависимость, избыточно для простого случая

3. **JWT токены**
   - Плюсы: stateless
   - Минусы: нужно хранить секреты, сложнее отзыв

## 2. DATA MODEL

### Существующие коллекции (используем как есть)
- `telegram_user_mapping` - связь Telegram ID с Directus User ID
- `directus_users` - пользователи Directus
- `plan` - план чтения
- `reading` - прогресс чтения

### Новые таблицы НЕ нужны
- Сессии хранятся в Next.js cookie (встроенный механизм)
- Маппинг уже существует

## 3. API DESIGN

### Endpoints

#### `POST /api/auth/telegram`
**Назначение:** Верификация Telegram данных и создание Next.js сессии

**Request:**
```json
{
  "initData": "user=...&auth_date=...&hash=..."
}
```

**Response:**
```json
{
  "success": true,
  "user": {
    "id": 12345678,
    "first_name": "Иван",
    "directus_id": "uuid"
  }
}
```

**Логика:**
1. Верифицировать Telegram initData
2. Найти/создать пользователя в Directus
3. Создать Next.js сессию с Telegram ID и Directus User ID
4. Вернуть данные пользователя

#### `GET /api/auth/session`
**Назначение:** Получить текущую сессию

**Response:**
```json
{
  "user": {
    "telegram_id": 12345678,
    "directus_id": "uuid",
    "first_name": "Иван"
  }
}
```

#### `POST /api/auth/logout`
**Назначение:** Выход из системы

**Response:**
```json
{
  "success": true
}
```

#### `GET /api/user/progress`
**Назначение:** Получить прогресс чтения пользователя

**Логика:**
- Извлекает Telegram ID из сессии
- Находит Directus User ID через маппинг
- Использует admin API для получения данных
- Возвращает прогресс

#### `POST /api/user/progress`
**Назначение:** Обновить прогресс чтения

**Request:**
```json
{
  "day": 1,
  "completed": true
}
```

**Логика:**
- Извлекает Telegram ID из сессии
- Находит Directus User ID через маппинг
- Использует admin API для обновления данных

### Authentication Requirements

**Middleware для защиты маршрутов:**
```typescript
// middleware.ts
export function middleware(request: NextRequest) {
  // Проверка сессии для защищенных маршрутов
  // Редирект на /login если нет сессии
}
```

### Error Handling

**Стандартные коды:**
- `200` - успех
- `401` - не авторизован
- `403` - нет доступа
- `400` - неверный запрос
- `500` - ошибка сервера

**Формат ошибки:**
```json
{
  "error": "Описание ошибки",
  "code": "ERROR_CODE"
}
```

## 4. COMPONENT BREAKDOWN

### Backend Modules/Services

#### `src/lib/session.ts` (НОВЫЙ)
```typescript
// Управление Next.js сессиями
export function createSession(userData)
export function getSession(request)
export function deleteSession(response)
```

#### `src/lib/telegram-auth.ts` (НОВЫЙ, упрощенный)
```typescript
// Верификация Telegram данных
export function verifyTelegramUser(initData)
// Возвращает: { telegram_id, first_name, ... }
```

#### `src/lib/directus-user.ts` (НОВЫЙ)
```typescript
// Работа с пользователями Directus через admin API
export async function findOrCreateUser(telegramUser)
export async function getUserByTelegramId(telegramId)
```

#### `src/lib/directus-data.ts` (НОВЫЙ)
```typescript
// Получение данных через admin API с фильтрацией по пользователю
export async function getUserProgress(directusUserId)
export async function updateUserProgress(directusUserId, data)
```

#### `src/middleware.ts` (НОВЫЙ)
```typescript
// Защита маршрутов, проверка сессии
```

### Frontend Components

#### `src/components/AuthProvider.tsx` (НОВЫЙ)
```typescript
// Context для управления аутентификацией
// Проверка сессии при загрузке
// Редирект на /login если не авторизован
```

#### `src/hooks/useAuth.ts` (НОВЫЙ)
```typescript
// Хук для доступа к данным пользователя
export function useAuth()
```

### Shared Utilities

#### `src/lib/api-client.ts` (НОВЫЙ)
```typescript
// Обертка над fetch с автоматической обработкой ошибок
// Автоматическое добавление credentials: 'include'
```

## 5. IMPLEMENTATION ORDER

### Phase 1: Базовая сессия (2-3 часа)
1. ✅ Создать `src/lib/session.ts`
   - Функции для создания/чтения/удаления сессии
   - Использовать Next.js cookies API
   - Зависимости: нет

2. ✅ Обновить `src/app/api/auth/telegram/route.ts`
   - Убрать логику создания Directus сессии
   - Добавить создание Next.js сессии
   - Вернуть данные пользователя
   - Зависимости: session.ts

3. ✅ Создать `src/app/api/auth/session/route.ts`
   - GET endpoint для получения текущей сессии
   - Зависимости: session.ts

4. ✅ Создать `src/app/api/auth/logout/route.ts`
   - POST endpoint для выхода
   - Зависимости: session.ts

### Phase 2: Защита маршрутов (1-2 часа)
5. ✅ Создать `src/middleware.ts`
   - Проверка сессии для `/dashboard` и других защищенных маршрутов
   - Редирект на `/login` если нет сессии
   - Зависимости: session.ts

6. ✅ Обновить `src/app/dashboard/page.tsx`
   - Убрать проверку `isAuthenticated()` от Directus
   - Использовать `useAuth()` hook
   - Зависимости: useAuth hook

### Phase 3: API для данных (2-3 часа)
7. ✅ Создать `src/lib/directus-user.ts`
   - `findOrCreateUser()` - найти или создать пользователя
   - `getUserByTelegramId()` - получить пользователя по Telegram ID
   - Использовать admin API
   - Зависимости: getDirectusAdminClient()

8. ✅ Создать `src/lib/directus-data.ts`
   - `getUserProgress()` - получить прогресс пользователя
   - `updateUserProgress()` - обновить прогресс
   - Использовать admin API с фильтрацией по directus_user_id
   - Зависимости: directus-user.ts

9. ✅ Создать `src/app/api/user/progress/route.ts`
   - GET - получить прогресс
   - POST - обновить прогресс
   - Использовать сессию для получения Telegram ID
   - Зависимости: directus-data.ts, session.ts

### Phase 4: Frontend интеграция (2-3 часа)
10. ✅ Создать `src/components/AuthProvider.tsx`
    - Context для хранения данных пользователя
    - Проверка сессии при монтировании
    - Зависимости: useAuth hook

11. ✅ Создать `src/hooks/useAuth.ts`
    - Хук для доступа к данным пользователя
    - Автоматическая загрузка сессии
    - Зависимости: AuthProvider

12. ✅ Обновить `src/app/layout.tsx`
    - Обернуть приложение в AuthProvider
    - Зависимости: AuthProvider

13. ✅ Обновить компоненты dashboard
    - Использовать `useAuth()` вместо прямых запросов
    - Использовать новые API endpoints
    - Зависимости: useAuth, api-client

### Phase 5: Очистка и тестирование (1-2 часа)
14. ✅ Удалить неиспользуемый код
    - Убрать попытки создания Directus сессий
    - Упростить `src/lib/auth.ts` (если нужно)

15. ✅ Тестирование
    - Проверить верификацию Telegram
    - Проверить создание сессии
    - Проверить защиту маршрутов
    - Проверить получение/обновление данных

**Общее время: 8-13 часов**

## 6. TESTING STRATEGY

### Unit Tests

#### `src/lib/session.ts`
- ✅ Создание сессии
- ✅ Чтение сессии
- ✅ Удаление сессии
- ✅ Обработка отсутствующей сессии

#### `src/lib/telegram-auth.ts`
- ✅ Верификация валидных данных
- ✅ Отклонение невалидных данных
- ✅ Обработка истекших данных

#### `src/lib/directus-user.ts`
- ✅ Поиск существующего пользователя
- ✅ Создание нового пользователя
- ✅ Обработка ошибок

### Integration Tests

#### API Endpoints
- ✅ `POST /api/auth/telegram` - создание сессии
- ✅ `GET /api/auth/session` - получение сессии
- ✅ `POST /api/auth/logout` - выход
- ✅ `GET /api/user/progress` - получение данных
- ✅ `POST /api/user/progress` - обновление данных

#### Middleware
- ✅ Редирект неавторизованных пользователей
- ✅ Пропуск авторизованных пользователей

### E2E Test Scenarios

1. **Полный flow Telegram аутентификации**
   - Открытие приложения в Telegram
   - Автоматическая верификация
   - Создание сессии
   - Доступ к dashboard

2. **Работа с данными**
   - Получение плана чтения
   - Отметка прочитанного дня
   - Сохранение прогресса

3. **Защита маршрутов**
   - Попытка доступа без сессии
   - Редирект на /login
   - Восстановление сессии после логина

## 7. ROLLOUT PLAN

### Feature Flags
Не требуются - это базовая функциональность

### Monitoring/Logging

#### Что логировать:
- ✅ Успешные аутентификации Telegram
- ✅ Ошибки верификации Telegram
- ✅ Создание новых пользователей
- ✅ Ошибки при работе с Directus API
- ✅ Попытки доступа к защищенным маршрутам без сессии

#### Где логировать:
- Console для dev
- В production можно добавить внешний сервис (Sentry, LogRocket)

### Rollback Strategy

**Если что-то пойдет не так:**
1. Откатить изменения через git
2. Восстановить предыдущую версию API endpoints
3. Сессии Next.js не требуют миграции БД - просто перестанут работать

**Минимальный риск:**
- Изменения изолированы в новых файлах
- Старый код можно оставить как fallback
- Нет изменений в БД

### Deployment Checklist

- [ ] Проверить переменные окружения (TELEGRAM_BOT_TOKEN, DIRECTUS_ADMIN_TOKEN)
- [ ] Убедиться что middleware правильно настроен
- [ ] Протестировать в dev окружении
- [ ] Проверить работу cookie в production (sameSite, secure)
- [ ] Мониторинг ошибок после деплоя

---

## Ключевые упрощения

1. **Нет создания сессий Directus** - используем только Next.js сессии
2. **Все запросы к Directus через admin API** - на сервере, безопасно
3. **Простая структура** - минимум абстракций, понятный flow
4. **Легко тестировать** - каждый компонент изолирован
5. **Легко откатить** - нет изменений в БД, только код
