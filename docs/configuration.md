[← Дизайн-система](design-system.md) · [Back to README](../README.md) · [Аутентификация →](authentication.md)

# Конфигурация

Справочник по переменным окружения и настройкам NBC Bible Plan.

## Обязательные переменные

### `NEXT_PUBLIC_DIRECTUS_URL`

**Описание:** URL вашего Directus сервера  
**Тип:** URL (с протоколом)  
**Пример:** `https://directus.yourdomain.com` или `http://localhost:8055`  
**Где используется:** подключение к Directus, проксирование запросов, вызов AI потоков

---

### `DIRECTUS_ADMIN_TOKEN`

**Описание:** Статический токен администратора Directus  
**Тип:** Строка  
**Как получить:** Profile → Admin User → Token в панели Directus  
**⚠️ Только server-side!** Никогда не добавляйте `NEXT_PUBLIC_` префикс.

---

### `TELEGRAM_BOT_TOKEN`

**Описание:** Токен вашего Telegram бота  
**Тип:** Строка  
**Как получить:** @BotFather в Telegram → `/newbot`  
**Где используется:** верификация `initData` при входе через Telegram

---

## Важные переменные (рекомендуется задать)

### `NEXT_PUBLIC_AI_ENABLE`

**Описание:** Включает/отключает функциональность ИИ («Чат с пастором»)  
**Тип:** `'true'` или `'1'` для включения  
**По умолчанию:** не установлено (ИИ отключён)  
**Где используется:** кнопки навигации к чату, AI endpoints, компоненты чата

---

### `NEXT_PUBLIC_DIRECTUS_AI_FLOW_ID`

**Описание:** ID потока (Flow) в Directus для AI сервиса  
**Тип:** Строка  
**По умолчанию:** `"ai-service"`  
**Где используется:** вызов AI потоков через Directus

---

### `REGISTER_CHURCH_CODE`

**Описание:** Общий «код церкви» для self-registration (`/register`). Пусто/не задано ⇒ регистрация выключена (роут `/api/auth/register` отвечает 503)  
**Тип:** Строка (секрет)  
**Runtime:** да — можно менять/снимать **без пересборки**  
**⚠️ Только server-side!** Никогда не добавляйте `NEXT_PUBLIC_` префикс. Сравнение timing-safe, rate-limit 5/час  
**Где используется:** `src/lib/register-access.ts`, `POST /api/auth/register`

---

### `NEXT_PUBLIC_REGISTER_ENABLED`

**Описание:** Клиентский UI-флаг self-registration: показывает CTA «Зарегистрироваться» и шаги по коду церкви на лендинге  
**Тип:** `'true'` или `'1'` для включения  
**По умолчанию:** не установлено (UI регистрации скрыт, лендинг в invite-модели)  
**Build-time:** да — инлайнится в бандл, тоггл ⇒ **пересборка** образа  
**Где используется:** `isRegisterEnabled()` (`src/shared/utils/constants.ts`), лендинг, `/register`

> **Включать оба вместе.** `REGISTER_CHURCH_CODE` (runtime) — защита и источник истины (503 без секрета);
> `NEXT_PUBLIC_REGISTER_ENABLED` (build-time) — только UI. Рассинхрон ⇒ UI покажет CTA, а роут вернёт 503 (или наоборот).

---

### `NEXT_PUBLIC_BASE_PATH`

**Описание:** Базовый путь приложения при деплое не в корень домена  
**Тип:** Строка (путь без trailing slash)  
**По умолчанию:** `/app`  
**Пример:** `/app` или `""` (пустая строка для корня)  
**Где используется:** `next.config.ts` (basePath + assetPrefix), `getApiPath()`

---

## Опциональные переменные

| Переменная | По умолчанию | Описание |
|-----------|-------------|----------|
| `NODE_ENV` | auto | `production` / `development` / `test` |
| `PORT` | `3000` | Порт для запуска сервера |
| `NEXT_TELEMETRY_DISABLED` | `0` | Установите `1` чтобы отключить телеметрию Next.js |

---

## Примеры конфигурации

### .env.local для разработки

```env
# Обязательные
NEXT_PUBLIC_DIRECTUS_URL=http://localhost:8055
DIRECTUS_ADMIN_TOKEN=your_static_admin_token
TELEGRAM_BOT_TOKEN=your_bot_token

# Опциональные
NEXT_PUBLIC_DIRECTUS_AI_FLOW_ID=ai-service
NEXT_PUBLIC_AI_ENABLE=true
NEXT_PUBLIC_BASE_PATH=/app

# Self-registration по коду церкви (включать оба вместе)
REGISTER_CHURCH_CODE=dev-church-code
NEXT_PUBLIC_REGISTER_ENABLED=true
```

### Production (приложение в поддиректории `/app`)

```bash
NODE_ENV=production
NEXT_TELEMETRY_DISABLED=1
NEXT_PUBLIC_BASE_PATH=/app
NEXT_PUBLIC_DIRECTUS_URL=https://directus.yourdomain.com
DIRECTUS_ADMIN_TOKEN=your_static_admin_token
TELEGRAM_BOT_TOKEN=your_bot_token
NEXT_PUBLIC_DIRECTUS_AI_FLOW_ID=ai-service
NEXT_PUBLIC_AI_ENABLE=true
PORT=3000
```

### Production (приложение в корне домена)

```bash
NODE_ENV=production
NEXT_TELEMETRY_DISABLED=1
NEXT_PUBLIC_BASE_PATH=
NEXT_PUBLIC_DIRECTUS_URL=https://directus.yourdomain.com
DIRECTUS_ADMIN_TOKEN=your_static_admin_token
TELEGRAM_BOT_TOKEN=your_bot_token
PORT=3000
```

---

## Безопасность

1. `DIRECTUS_ADMIN_TOKEN`, `TELEGRAM_BOT_TOKEN`, `REGISTER_CHURCH_CODE` — секреты, **никогда** не коммитьте в git
2. Переменные с префиксом `NEXT_PUBLIC_` доступны в браузере — не храните там секреты
3. Используйте `.env.local` для локальной разработки (файл в `.gitignore`)
4. На сервере используйте системные переменные окружения или файлы конфигурации PM2/systemd

## Важные замечания для Next.js (Standalone режим)

- Проект использует `output: 'standalone'` в `next.config.ts`
- `NEXT_PUBLIC_BASE_PATH` должен совпадать с путём деплоя в nginx/apache
- `assetPrefix` автоматически устанавливается из `NEXT_PUBLIC_BASE_PATH`
- Запросы к Directus с клиента проксируются через `/api/directus`

---

## Проверка конфигурации

После деплоя убедитесь:

1. Логи приложения не содержат предупреждений о пустых переменных
2. `NEXT_PUBLIC_DIRECTUS_URL` доступен с сервера приложения
3. Пути формируются корректно с учётом `NEXT_PUBLIC_BASE_PATH`
4. Telegram авторизация работает (проверьте TELEGRAM_BOT_TOKEN)

## See Also

- [Деплой](deployment.md) — сборка и запуск в production
- [Настройка Directus](DIRECTUS_SETUP_GUIDE.md) — получение admin token
- [ИИ-интеграция](AI_INTEGRATION_GUIDE.md) — настройка AI Flow ID
