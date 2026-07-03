[← Offline PWA](offline-pwa.md) · [Back to README](../README.md) · [Настройка Directus →](DIRECTUS_SETUP_GUIDE.md)

# Деплой

Инструкция по сборке и развёртыванию NBC Bible Plan в production.

## Обзор

Приложение собирается в режиме **Standalone** (`output: 'standalone'`) и запускается за nginx reverse proxy по пути `/app`.

```
Internet → nginx (443) → /app → Node.js (3000)
                                   ↕
                               Directus CMS
```

## Сборка

### Локальная сборка через copy-prod.sh

Скрипт `copy-prod.sh` автоматизирует сборку и деплой на сервер:

```bash
# Установите переменные окружения
export NEXT_PUBLIC_DIRECTUS_URL=https://directus.yourdomain.com
export DIRECTUS_ADMIN_TOKEN=your_token
export TELEGRAM_BOT_TOKEN=your_bot_token
export NEXT_PUBLIC_BASE_PATH=/app

# Запустите скрипт
./copy-prod.sh
```

Скрипт:
1. Устанавливает production переменные окружения
2. Запускает сборку (`npm run build`)
3. Создаёт standalone сборку в `pkg/`
4. Упаковывает в `pkg.tar.gz`
5. Отправляет на сервер через `scp`

### Ручная сборка

```bash
# Установите production переменные
export NODE_ENV=production
export NEXT_PUBLIC_BASE_PATH=/app
export NEXT_PUBLIC_DIRECTUS_URL=https://directus.yourdomain.com
# ... остальные переменные из docs/configuration.md

# Соберите приложение
npm run build
```

Артефакт сборки: `.next/standalone/`

---

## Запуск на сервере

### После загрузки pkg.tar.gz

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

### PM2 (рекомендуется для production)

```bash
# Запуск
pm2 start server.js --name bible-plan

# С переменными из .env файла
pm2 start server.js --name bible-plan --env production

# Просмотр логов
pm2 logs bible-plan

# Перезапуск
pm2 restart bible-plan

# Автозапуск при перезагрузке сервера
pm2 startup
pm2 save
```

### Systemd (альтернатива PM2)

```ini
# /etc/systemd/system/bible-plan.service
[Unit]
Description=NBC Bible Plan
After=network.target

[Service]
Type=simple
User=nbc
WorkingDirectory=/home/nbc/workspace/pkg
Environment=NODE_ENV=production
Environment=PORT=3000
Environment=NEXT_PUBLIC_BASE_PATH=/app
ExecStart=/usr/bin/node server.js
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

```bash
systemctl enable bible-plan
systemctl start bible-plan
systemctl status bible-plan
```

---

## nginx

Полная конфигурация nginx — в [nginx](nginx.md).

Минимальная конфигурация для `/app`:

```nginx
location /app {
    proxy_pass http://localhost:3000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_cache_bypass $http_upgrade;
}
```

---

## Проверка деплоя

1. Откройте `https://yourdomain.com/app`
2. Попробуйте войти через Telegram
3. Проверьте отображение плана чтения
4. Проверьте логи: `pm2 logs bible-plan`

---

## Переменные окружения

Полный список переменных — в [Конфигурации](configuration.md).

## See Also

- [Конфигурация](configuration.md) — все переменные окружения
- [nginx](nginx.md) — конфигурация reverse proxy
- [Настройка Directus](DIRECTUS_SETUP_GUIDE.md) — подготовка CMS
