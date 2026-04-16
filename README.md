# NBC Bible Plan

> Структурированный план чтения Библии для церковной общины NBC.

Веб-приложение для прихожан Нового Баптистского Собора, которое предоставляет ежедневный план чтения Библии с отслеживанием прогресса, встроенной читалкой и ИИ-ассистентом «Чат с пастором». Авторизация через Telegram Bot, данные хранятся в SQLite, контент управляется через Directus CMS.

## Быстрый старт

```bash
# 1. Установите зависимости
npm install

# 2. Настройте переменные окружения
cp .env.example .env.local
# Обязательно: NEXT_PUBLIC_DIRECTUS_URL, DIRECTUS_ADMIN_TOKEN, TELEGRAM_BOT_TOKEN

# 3. Запустите dev-сервер
npm run dev
```

Приложение откроется на [http://localhost:3000/app](http://localhost:3000/app).

## Ключевые функции

- **План чтения** — ежедневные и недельные задания из Directus CMS
- **Прогресс** — отслеживание по главам и дням в SQLite
- **Читалка** — встроенный просмотр глав с навигацией и настройками шрифта
- **Календарь** — обзор прошедших и предстоящих дней чтения
- **Стих дня** — ежедневный текст из Directus
- **Чат с пастором** — ИИ-ассистент через n8n + Directus Flow (опционально)
- **Telegram Auth** — авторизация через Telegram Bot с проверкой HMAC-SHA256

---

## Документация

| Руководство | Описание |
|-------------|----------|
| [Быстрый старт](docs/getting-started.md) | Установка, настройка, первый запуск |
| [Архитектура](docs/architecture.md) | FSD-структура, паттерны, слои |
| [Конфигурация](docs/configuration.md) | Переменные окружения, настройки |
| [Деплой](docs/deployment.md) | Сборка, nginx, PM2, copy-prod.sh |
| [Настройка Directus](docs/DIRECTUS_SETUP_GUIDE.md) | Коллекции, роли, разрешения |
| [Схема БД](docs/database-schema.md) | Таблицы SQLite и их структура |
| [ИИ-интеграция](docs/AI_INTEGRATION_GUIDE.md) | Настройка n8n + Directus Flow |
| [История чата](docs/CHAT_HISTORY_SETUP.md) | Хранение истории переписки |
| [GraphQL API](docs/GRAPHQL_API.md) | Схема и запросы GraphQL |
| [Telegram уведомления](docs/TELEGRAM_DAILY_NOTIFICATION_FLOW.md) | Ежедневная рассылка |
| [nginx](docs/nginx.md) | Конфигурация reverse proxy |

## Лицензия

Частный проект NBC. Все права защищены.
