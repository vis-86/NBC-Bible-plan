[← Telegram уведомления](TELEGRAM_DAILY_NOTIFICATION_FLOW.md) · [Back to README](../README.md)

# nginx

Конфигурация nginx как reverse proxy для NBC Bible Plan.

## Окружение сервера

| Параметр | Значение |
|---------|---------|
| Конфигурация | `/etc/nginx/nginx.conf` |
| Сайты | `/etc/nginx/sites-available/` |
| Логи | `/var/log/nginx/` |
| Корень | `/var/www` |
| Пользователь | `nginx` |

## Конфигурация для NBC Bible Plan

Создайте файл `/etc/nginx/sites-available/bible-plan`:

```nginx
server {
    listen 80;
    server_name yourdomain.com;

    # Редирект на HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name yourdomain.com;

    # SSL сертификаты (например, Let's Encrypt)
    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;

    # Приложение NBC Bible Plan по пути /app
    location /app {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

## Подключение конфигурации

```bash
# Создание симлинка
ln -s /etc/nginx/sites-available/bible-plan /etc/nginx/sites-enabled/

# Проверка конфигурации
nginx -t

# Перезагрузка
systemctl reload nginx
```

## Проверка статуса

```bash
curl http://localhost
systemctl status nginx
tail -f /var/log/nginx/access.log
tail -f /var/log/nginx/error.log
```

## See Also

- [Деплой](deployment.md) — запуск приложения и PM2
- [Конфигурация](configuration.md) — переменная `NEXT_PUBLIC_BASE_PATH`
