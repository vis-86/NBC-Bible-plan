[← Telegram уведомления](TELEGRAM_DAILY_NOTIFICATION_FLOW.md) · [Back to README](../README.md)

# nginx

nginx перед статикой (`out/`, static export) и Hono BFF (`server/`) внутри Docker
Compose. Конфигурация НЕ пишется вручную на хосте — она версионируется в репозитории
(`deploy/nginx/conf.d/`) и монтируется в контейнер `nginx` (см.
[Деплой](deployment.md)); сам образ `nginx` собирается из `deploy/Dockerfile`
(`target: static`) — статика (`out/`) запечена в образ, а не bind-mount.

## Топология

```
Internet → nginx :443
  /directus/*        → proxy directus:8055
  /app/api/*          → proxy bff:3001
  /app/sw.js          → статика (Cache-Control: max-age=0, must-revalidate)
  /app/_next/static/*  → статика (Cache-Control: immutable)
  /app/manifest.webmanifest → статика (Cache-Control: max-age=0, must-revalidate)
  /app/*              → статика, try_files $uri $uri.html $uri/ =404
  /                    → 302 /app
```

## Конфигурация (`deploy/nginx/conf.d/tls.conf`)

```nginx
server {
    listen 443 ssl;
    server_name bible.baptistnn.ru;

    ssl_certificate     /etc/letsencrypt/live/bible.baptistnn.ru/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/bible.baptistnn.ru/privkey.pem;

    location /directus/ {
        rewrite ^/directus/(.*)$ /$1 break;
        proxy_pass http://directus:8055;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Легаси-редиректы (были в middleware.ts до T7 — теперь на nginx).
    location ~ ^/app/dashboard/read/([^/]+)/([^/]+)$ {
        return 301 /app/dashboard/read?book=$1&chapter=$2;
    }
    location ~ ^/app/dashboard/songs/(\d+)$ {
        return 301 /app/dashboard/song?id=$1;
    }

    location /app/api/ {
        proxy_pass http://bff:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location = /app/sw.js {
        root /usr/share/nginx/html;
        add_header Cache-Control "public, max-age=0, must-revalidate";
    }

    location /app/_next/static/ {
        root /usr/share/nginx/html;
        add_header Cache-Control "public, max-age=31536000, immutable";
    }

    location = /app/manifest.webmanifest {
        root /usr/share/nginx/html;
        add_header Cache-Control "public, max-age=0, must-revalidate";
    }

    location /app {
        root /usr/share/nginx/html;
        try_files $uri $uri.html $uri/ =404;
        add_header Cache-Control "no-cache";
    }
}
```

`X-Forwarded-For`/`X-Real-IP` load-bearing на `/app/api/`: `server/src/rate-limiter`
(login/register/telegram-link лимиты) читает клиентский IP из этих заголовков — без
них rate-limiter видел бы только IP nginx.

## Применение изменений

⚠️ Конфиг версионируется в `deploy/nginx/conf.d/`, но **`deploy/deploy.sh` его НЕ
доставляет** — rsync исключает весь каталог `deploy/`, чтобы не затирать серверные
`.env` и сертификаты certbot. Изменения в `tls.conf`/`default.conf` (как и в
`compose.yml`/`Dockerfile`) нужно скопировать на сервер вручную:

```bash
scp deploy/nginx/conf.d/tls.conf root@168.222.202.131:/opt/nbc/bible-plan/deploy/nginx/conf.d/
```

Затем проверить синтаксис и применить:

```bash
docker compose -f deploy/compose.yml exec nginx nginx -t
docker compose -f deploy/compose.yml restart nginx
```

`conf.d/` — bind-mount, поэтому `restart` достаточно; пересборка образа нужна только
когда меняется статика (`out/`), запечённая в `target: static`.

## Проверка статуса

```bash
docker compose -f deploy/compose.yml logs -f nginx
curl -i https://bible.baptistnn.ru/app
curl -i https://bible.baptistnn.ru/app/api/health
```

## PWA cache headers

Три заголовка критичны для update flow (см. [Offline PWA](offline-pwa.md)) и заданы
ПРЯМО В NGINX-КОНФИГЕ (не в приложении — до миграции их отдавал `next start`, теперь
Next.js вообще не участвует в рантайме):

1. **`/app/sw.js` — `public, max-age=0, must-revalidate`.** Если бы sw.js кешировался
   надолго, обновления приложения залипали бы до суток — браузер не увидел бы новый
   precache-манифест.
2. **`/app/_next/static/*` — `public, max-age=31536000, immutable`.** Имена
   файлов content-hashed (Next.js default), поэтому агрессивный immutable-кеш
   безопасен: новый билд = новые имена файлов, а не новое содержимое старых.
3. **HTML-документы (`/app/dashboard`, `/app/login`, …) — `no-cache`.** Браузер
   обязан ревалидировать перед показом. Если бы браузер закешировал HTML надолго,
   после деплоя пользователь получал бы старый HTML со ссылками на удалённые
   `_next/static` чанки → `ChunkLoadError` (страхуется также ChunkLoadError-guard'ом,
   `src/shared/components/ChunkErrorReload.tsx`, но лучше не полагаться только на
   него).

Проверка на проде (после деплоя):

```bash
# sw.js: public, max-age=0, must-revalidate
curl -sI https://bible.baptistnn.ru/app/sw.js | grep -i cache-control

# _next/static чанк: immutable, max-age=31536000 (подставить реальное имя файла)
curl -sI https://bible.baptistnn.ru/app/_next/static/chunks/<файл>.js | grep -i cache-control

# HTML: no-cache
curl -sI https://bible.baptistnn.ru/app/login | grep -i cache-control

# BFF health через прокси
curl -i https://bible.baptistnn.ru/app/api/health
```

## See Also

- [Деплой](deployment.md) — сборка, Docker Compose, `deploy.sh`
- [Offline PWA](offline-pwa.md) — precache-модель SW, update flow
- [Конфигурация](configuration.md) — переменная `NEXT_PUBLIC_BASE_PATH`
