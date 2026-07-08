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

## PWA cache headers

nginx **не кеширует** ответы приложения (`proxy_cache` нигде не включён, см.
`deploy/nginx/conf.d/tls.conf`, `location /app`) — заголовки `Cache-Control`
целиком задаёт Next.js, nginx только проксирует. Три требования критичны для
PWA update flow (см. `.ai-factory/plans/feature-offline-stability.md`):

1. **`/app/sw.js` — `public, max-age=0, must-revalidate`.** Задаётся явно в
   `src/app/sw.js/route.ts`. Если бы sw.js кешировался надолго, обновления
   приложения залипали бы до суток — браузер годами не увидел бы новый SW.
2. **`/app/_next/static/**` — `public, max-age=31536000, immutable`.** Имена
   файлов content-hashed (Next.js default), поэтому агрессивный immutable-кеш
   безопасен: новый билд = новые имена файлов, а не новое содержимое старых.
3. **HTML-документы (`/app/dashboard`, `/app/login`, …) — не должны кешироваться
   браузером надолго.** Статически пререндеренные страницы Next.js отдают
   `Cache-Control: s-maxage=31536000` — это **safe**, `s-maxage` действует
   только на shared/edge-кеши (CDN, `proxy_cache`), а не на приватный кеш
   браузера, и здесь нет ни CDN, ни `proxy_cache`. Если бы браузер закешировал
   HTML надолго, после деплоя пользователь получал бы старый HTML со ссылками
   на удалённые `_next/static` чанки → `ChunkLoadError` (закрывается также
   ChunkLoadError-guard'ом, `src/shared/offline/chunkGuard.ts`, но лучше не
   полагаться только на него).

Проверка на проде (после деплоя):

```bash
# sw.js: public, max-age=0, must-revalidate
curl -sI https://bible.baptistnn.ru/app/sw.js | grep -i cache-control

# _next/static чанк: immutable, max-age=31536000 (подставить реальное имя файла)
curl -sI https://bible.baptistnn.ru/app/_next/static/chunks/<файл>.js | grep -i cache-control

# HTML: НЕ должен быть публично закеширован на годы браузером
curl -sI https://bible.baptistnn.ru/app/login | grep -i cache-control
```

## See Also

- [Деплой](deployment.md) — запуск приложения и PM2
- [Конфигурация](configuration.md) — переменная `NEXT_PUBLIC_BASE_PATH`
