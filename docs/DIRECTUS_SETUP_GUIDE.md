# Инструкция по настройке Directus для Bible Plan

Для правильной работы Mini App необходимо выполнить следующие шаги в панели управления Directus.

## 1. Настройка Коллекций

Убедитесь, что Directus видит существующие таблицы SQLite. Если нет, создайте их через интерфейс или убедитесь, что путь к БД верный.

### Коллекция `telegram_user_mapping`
Эта коллекция используется для связи Telegram ID и Directus User ID.
- `id`: Integer (PK, Auto-increment)
- `directus_user_id`: String (UUID)
- `telegram_user_id`: Integer (Unique)

## 2. Настройка Ролей и Связей

Перейдите в **Settings -> Roles & Permissions**.

### Настройка связи в коллекции `reading`
Чтобы в админке было видно, кто именно прочитал день (по имени, а не ID), настройте связь:
1. Зайдите в **Settings -> Data Model -> reading**.
2. Выберите поле `directus_user_id`.
3. Установите тип интерфейса: **Many-to-One**.
4. Свяжите с коллекцией: **Directus Users**.
5. В параметрах отображения выберите `First Name` или `Email`.

### Роль: "Чтец" (Reader)
1. Создайте роль с названием **Чтец**.
2. **Permissions (Разрешения):**
   - **`plan`**: Доступ на чтение (All Fields).
   - **`reading`**: 
     - Create: Разрешить.
     - Read: Разрешить (только свои записи, фильтр: `user_id == $CURRENT_USER.external_identifier` или по логике маппинга).
     - Update/Delete: По необходимости.
   - **`users`**: Доступ на чтение своего профиля.
   - **`weeks`**: Доступ на чтение.

### Роль: "Администратор"
- Используйте стандартную роль Administrator или создайте свою с полным доступом ко всем коллекциям (`plan`, `weeks`, `users`, `reading`, `reminder`).

## 3. Переменные окружения (.env)

Добавьте следующие переменные в ваш `.env` файл (или в настройки Vercel/сервера):

```env
# URL вашего Directus
NEXT_PUBLIC_DIRECTUS_URL=http://your-directus-url:8055

# Статический токен администратора для создания пользователей
# Создайте его в профиле администратора в Directus
DIRECTUS_ADMIN_TOKEN=your_static_admin_token

# Токен вашего телеграм бота
TELEGRAM_BOT_TOKEN=your_bot_token
```

## 4. Особенности авторизации

В текущей реализации API `/api/auth/telegram` проверяет данные от Telegram и автоматически регистрирует пользователя в Directus. 
Для полноценной работы сессий на стороне клиента (Mini App) рекомендуется настроить Directus на использование того же домена или использовать прокси (уже реализовано в `src/lib/directus.ts`).

