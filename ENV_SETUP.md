# Настройка переменных окружения

## 🔴 Критически важные переменные (обязательны)

### `NEXT_PUBLIC_DIRECTUS_URL`
**Описание:** URL вашего Directus сервера  
**Тип:** URL (с протоколом)  
**Пример:** `https://directus.yourdomain.com` или `http://localhost:8055`  
**Где используется:**
- `src/lib/directus.ts` - для подключения к Directus
- `src/app/api/directus/[...path]/route.ts` - для проксирования запросов
- `src/lib/ai.ts` - для вызова AI потоков

### `DIRECTUS_ADMIN_TOKEN`
**Описание:** Статический токен администратора Directus для создания пользователей  
**Тип:** Строка (токен)  
**Пример:** Создайте в профиле администратора в Directus  
**Где используется:**
- `src/lib/directus-user.ts` - для создания пользователей через API
- `scripts/create-telegram-role.sh` - для создания ролей

### `TELEGRAM_BOT_TOKEN`
**Описание:** Токен вашего Telegram бота  
**Тип:** Строка (токен)  
**Пример:** Получите у @BotFather в Telegram  
**Где используется:**
- `src/app/api/auth/telegram/route.ts` - для верификации данных от Telegram
- `src/lib/telegram-server.ts` - для проверки initData

## 🟡 Важные переменные (рекомендуется задать)

### `NEXT_PUBLIC_AI_ENABLE`
**Описание:** Включает/отключает функциональность ИИ в приложении  
**Тип:** Строка (`'true'` или `'1'` для включения)  
**По умолчанию:** Не установлено (ИИ отключен)  
**Где используется:**
- `src/lib/utils.ts` - функция `isAIEnabled()` для проверки
- `src/app/page.tsx` - скрывает секцию "Чат с пастором" на лендинге
- `src/components/DashboardLayout.tsx` - скрывает кнопки навигации к чату и справочнику
- `src/app/dashboard/page.tsx` - скрывает рендеринг компонентов чата и справочника
- `src/components/ReadingView.tsx` - скрывает функциональность объяснения контекста
- `src/app/api/ai/[...path]/route.ts` - блокирует доступ к AI endpoints

### `NEXT_PUBLIC_DIRECTUS_AI_FLOW_ID`
**Описание:** ID потока (Flow) в Directus для AI сервиса  
**Тип:** Строка  
**По умолчанию:** `"ai-service"`  
**Где используется:**
- `src/lib/ai.ts` - для вызова AI потоков через Directus

### `NEXT_PUBLIC_BASE_PATH`
**Описание:** Базовый путь приложения (если приложение развернуто не в корне домена)  
**Тип:** Строка (путь без trailing slash)  
**По умолчанию:** `/app`  
**Пример:** `/app` или пустая строка `""` для корня  
**Где используется:**
- `next.config.ts` - для basePath и assetPrefix
- Используется Next.js для формирования правильных путей к статическим файлам

## 🟢 Опциональные переменные

### `NODE_ENV`
**Описание:** Окружение выполнения  
**Тип:** `production` | `development` | `test`  
**По умолчанию:** Next.js автоматически устанавливает `production` при сборке  
**Где используется:**
- Множество мест для условной логики разработки/продакшена

### `PORT`
**Описание:** Порт для запуска сервера  
**Тип:** Число  
**По умолчанию:** `3000`  
**Где используется:**
- При запуске `next start` или `node server.js`

### `NEXT_TELEMETRY_DISABLED`
**Описание:** Отключение телеметрии Next.js  
**Тип:** `1` или `0`  
**По умолчанию:** Не установлено (телеметрия включена)  
**Рекомендуется:** Установить в `1` для production

## 📝 Пример конфигурации для разработки (.env.local)

```env
# URL вашего Directus
NEXT_PUBLIC_DIRECTUS_URL=http://localhost:8055

# Статический токен администратора для создания пользователей
DIRECTUS_ADMIN_TOKEN=your_static_admin_token

# Токен вашего телеграм бота
TELEGRAM_BOT_TOKEN=your_bot_token

# ID потока AI (опционально)
NEXT_PUBLIC_DIRECTUS_AI_FLOW_ID=ai-service

# Включить функциональность ИИ (опционально, по умолчанию отключено)
NEXT_PUBLIC_AI_ENABLE=true

# Base path (опционально, по умолчанию /app)
NEXT_PUBLIC_BASE_PATH=/app
```

## 📝 Пример конфигурации для продакшена

### Если приложение в поддиректории `/app`:
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

### Если приложение в корне домена:
```bash
NODE_ENV=production
NEXT_TELEMETRY_DISABLED=1
NEXT_PUBLIC_BASE_PATH=
NEXT_PUBLIC_DIRECTUS_URL=https://directus.yourdomain.com
DIRECTUS_ADMIN_TOKEN=your_static_admin_token
TELEGRAM_BOT_TOKEN=your_bot_token
NEXT_PUBLIC_DIRECTUS_AI_FLOW_ID=ai-service
NEXT_PUBLIC_AI_ENABLE=true
PORT=3000
```

## 🚀 Развертывание

### Использование скрипта copy-prod.sh

Скрипт `copy-prod.sh` автоматически устанавливает переменные окружения и создает production сборку:

```bash
# Убедитесь, что переменные окружения установлены в системе или .env.local
export NEXT_PUBLIC_DIRECTUS_URL=https://directus.yourdomain.com
export DIRECTUS_ADMIN_TOKEN=your_token
export TELEGRAM_BOT_TOKEN=your_bot_token

# Запустите скрипт
./copy-prod.sh
```

Скрипт:
1. Устанавливает переменные окружения для production
2. Запускает сборку (`yarn build` или `npm run build`)
3. Создает standalone сборку в директории `pkg/`
4. Упаковывает в архив `pkg.tar.gz`
5. Отправляет на сервер через `scp`

### На сервере после деплоя

```bash
cd /home/nbc/workspace
tar -xzf pkg.tar.gz
cd pkg

# Установите переменные окружения
export NODE_ENV=production
export NEXT_PUBLIC_DIRECTUS_URL=https://directus.yourdomain.com
export DIRECTUS_ADMIN_TOKEN=your_token
export TELEGRAM_BOT_TOKEN=your_bot_token
export NEXT_PUBLIC_BASE_PATH=/app
export PORT=3000

# Запустите приложение
node server.js
```

### PM2 / Systemd

Для постоянного запуска используйте PM2 или systemd:

```bash
# PM2
pm2 start server.js --name bible-plan

# Или с переменными окружения из файла
pm2 start server.js --name bible-plan --env production
```

## 🔒 Безопасность

1. **DIRECTUS_ADMIN_TOKEN** и **TELEGRAM_BOT_TOKEN** - это секретные данные, никогда не коммитьте их в git
2. Все переменные с `NEXT_PUBLIC_` префиксом доступны на клиенте - не храните там секреты
3. Используйте `.env.local` для локальной разработки (файл уже в `.gitignore`)
4. На сервере используйте системные переменные окружения или файлы конфигурации PM2/systemd

## ⚠️ Важные замечания для Next.js 16

1. **Standalone режим:** Проект использует `output: 'standalone'` в `next.config.ts`, что означает, что при сборке создается оптимизированная версия для продакшена
2. **Base Path:** Если используете `NEXT_PUBLIC_BASE_PATH`, убедитесь, что он совпадает с путем развертывания в nginx/apache
3. **Asset Prefix:** Автоматически устанавливается из `NEXT_PUBLIC_BASE_PATH` в `next.config.ts`
4. **Проксирование Directus:** На клиенте запросы к Directus проксируются через `/api/directus` для работы с cookies

## 🔍 Проверка конфигурации

После развертывания проверьте:
1. Логи приложения на наличие предупреждений о пустых переменных
2. Что `NEXT_PUBLIC_DIRECTUS_URL` доступен с сервера приложения
3. Что все пути формируются корректно с учетом `NEXT_PUBLIC_BASE_PATH`
4. Что Telegram авторизация работает корректно
