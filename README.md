# NBC Bible Plan

> Структурированный план чтения Библии для церковной общины NBC.

Веб-приложение для прихожан Нового Баптистского Собора, которое предоставляет ежедневный план чтения Библии с отслеживанием прогресса, встроенной читалкой и ИИ-ассистентом «Чат с пастором». Доступно как устанавливаемое PWA вне Telegram: псевдонимный вход по логину+паролю (через invite-ссылку), Telegram mini-app — вторичный канал с привязкой аккаунта. Контент управляется через Directus CMS.

## Быстрый старт

```bash
# 1. Установите зависимости
npm install

# 2. Настройте переменные окружения
cp .env.example .env.local
# Обязательно: NEXT_PUBLIC_DIRECTUS_URL, DIRECTUS_ADMIN_TOKEN, TELEGRAM_BOT_TOKEN,
#              SESSION_SECRET, INVITE_SECRET (см. ENV_SETUP.md)

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
- **Вход по логину+паролю** — псевдонимный (без email/телефона); аккаунты через invite-ссылку или код церкви
- **Регистрация по коду церкви** — опциональная self-registration на `/register` (флаг + общий секрет)
- **Telegram-привязка** — mini-app для VPN; авто-вход после однократной привязки (без авто-создания)
- **PWA** — установка вне Telegram (manifest + service worker, basePath-aware)
- **Offline-режим** — Писание/песни/план читаются без сети (IndexedDB), прогресс отмечается офлайн и синкается при восстановлении сети; опциональная загрузка «на устройство» в настройках

---

## Документация

| Руководство | Описание |
|-------------|----------|
| [Быстрый старт](docs/getting-started.md) | Установка, настройка, первый запуск |
| [Архитектура](docs/architecture.md) | FSD-структура, паттерны, слои |
| [Конфигурация](docs/configuration.md) | Переменные окружения, настройки |
| [Аутентификация](docs/authentication.md) | Invite+пароль, код церкви, Telegram-привязка, сессии, PWA |
| [Offline PWA](docs/offline-pwa.md) | Service worker, IndexedDB, write-ahead outbox, sync, offline-загрузка |
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
