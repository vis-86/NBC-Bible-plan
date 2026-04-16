[Back to README](../README.md) · [Архитектура →](architecture.md)

# Быстрый старт

Руководство по установке и запуску NBC Bible Plan для разработки и production.

## Пререквизиты

| Инструмент | Версия | Описание |
|-----------|--------|----------|
| Node.js | 20+ LTS | JavaScript runtime |
| npm / yarn / pnpm | последняя | Package manager |
| Directus | 10+ | CMS и API сервер |
| Telegram Bot | — | Токен от @BotFather |

## Установка

### 1. Клонирование репозитория

```bash
git clone <repo-url>
cd bible-plan
```

### 2. Установка зависимостей

```bash
npm install
```

### 3. Настройка переменных окружения

```bash
cp .env.example .env.local
```

Минимальная конфигурация для запуска:

```env
# URL вашего Directus
NEXT_PUBLIC_DIRECTUS_URL=http://localhost:8055

# Статический токен администратора Directus
DIRECTUS_ADMIN_TOKEN=your_static_admin_token

# Токен Telegram бота
TELEGRAM_BOT_TOKEN=your_bot_token
```

> Полный список переменных — в [Конфигурации](configuration.md).

### 4. Настройка Directus

Перед первым запуском необходимо настроить коллекции и роли в Directus. Следуйте шагам в [Настройка Directus](DIRECTUS_SETUP_GUIDE.md).

### 5. Запуск dev-сервера

```bash
npm run dev
```

Приложение откроется на [http://localhost:3000/app](http://localhost:3000/app).

## Первый вход

1. Перейдите по адресу приложения
2. Нажмите «Войти через Telegram»
3. Telegram WebApp автоматически передаст данные авторизации

## Структура проекта (обзор)

```
bible-plan/
├── src/
│   ├── app/            # Next.js App Router — страницы, API routes
│   ├── features/
│   │   ├── plan/       # Фича: план чтения (UI, хуки, контекст)
│   │   └── reading/    # Фича: читалка (UI, хуки, кэш)
│   └── shared/         # Общие компоненты, хуки, сервисы, утилиты
├── docs/               # Документация
├── scripts/            # Вспомогательные скрипты
└── next.config.ts      # Конфигурация Next.js
```

> Подробнее об архитектуре — в [Архитектуре](architecture.md).

## Полезные команды

```bash
npm run dev      # Запуск dev-сервера
npm run build    # Сборка для production
npm run lint     # Проверка кода
```

## See Also

- [Конфигурация](configuration.md) — все переменные окружения
- [Настройка Directus](DIRECTUS_SETUP_GUIDE.md) — CMS setup
- [Деплой](deployment.md) — production deployment
