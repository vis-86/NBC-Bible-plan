[← Offline PWA](offline-pwa.md) · [Back to README](../README.md) · [Настройка Directus →](DIRECTUS_SETUP_GUIDE.md)

# Деплой

Инструкция по сборке и развёртыванию NBC Bible Plan в production.

## Обзор

Приложение — **static export** (`output: 'export'`), API — отдельный **Hono BFF**
(`server/`). Nginx отдаёт статику из `out/` напрямую и проксирует `/app/api/*` на BFF.
Всё живёт в Docker Compose на одном сервере (`/opt/nbc/bible-plan/deploy`).

```
Internet → nginx :443 → /app         → static (out/, try_files)
                       → /app/api/*  → bff:3001 (Hono)
                       → /directus   → directus:8055
```

Раньше (до `.ai-factory/plans/feature-static-export-hono-bff.md`) был единый Next.js
standalone-сервер (`next start`, API-роуты + middleware + SSR) — этот режим полностью
снят: `output: 'standalone'` заменён на `'export'`, `src/app/api/**` и
`src/middleware.ts` удалены, `copy-prod.sh`/PM2/systemd-юнит из старой схемы больше не
применимы.

## Сервисы Docker Compose (`deploy/compose.yml`)

| Сервис     | Образ / build target                | Роль |
|------------|--------------------------------------|------|
| `postgres` | `postgres:16-alpine`                 | БД Directus |
| `directus` | `directus/directus:11`               | CMS/бэкенд-хранилище |
| `bff`      | `deploy/Dockerfile` → `target: bff`  | Hono API (весь бывший `/api/*`), `node:22-slim`, порт 3001 |
| `nginx`    | `deploy/Dockerfile` → `target: static` | nginx + запечённый `out/` под `/usr/share/nginx/html/app`, порты 80/443 |

`deploy/Dockerfile` — три стадии (`build` → `bff` / `static`), без нативных зависимостей
(`better-sqlite3`/`lucia` удалены вместе с миграцией — их не было в реальном
использовании). `build`-стадия: `yarn install --frozen-lockfile` → `yarn build`
(`next build` → `build-manifest.ts` → `build-sw.ts`, итог — `out/` + `out/sw.js`).

## Сборка и деплой

### `deploy/deploy.sh` (текущий способ, заменяет старый `copy-prod.sh`)

Синкает исходники на сервер через `rsync`, затем пересобирает и пересоздаёт
`bff`+`nginx` НА сервере (образ собирается там же, `deploy/compose.yml` — контекст
сборки — корень репозитория):

```bash
deploy/deploy.sh              # rsync + build + recreate + smoke-check
deploy/deploy.sh --dry-run    # только просмотр rsync-diff, ничего не меняет
deploy/deploy.sh --no-build   # только синк, без пересборки/рестарта
```

Переменные для переопределения цели: `SSH_TARGET`, `REMOTE_DIR`, `APP_SERVICE`,
`PUBLIC_URL` (см. заголовок скрипта). `deploy/` и `.env*` НЕ синкаются — конфигурация
и секреты на сервере (`compose.yml` + `.env`) остаются источником истины и не
затираются деплоем.

⚠️ **Следствие:** изменения в `deploy/compose.yml`, `deploy/Dockerfile`,
`deploy/nginx/conf.d/*` на прод сами не приедут. Их нужно скопировать вручную ДО
запуска `deploy.sh` — иначе скрипт попытается собрать сервисы, которых серверный
`compose.yml` не знает, и упадёт:

```bash
scp deploy/compose.yml deploy/Dockerfile root@168.222.202.131:/opt/nbc/bible-plan/deploy/
scp deploy/nginx/conf.d/tls.conf root@168.222.202.131:/opt/nbc/bible-plan/deploy/nginx/conf.d/
```

При переименовании сервиса старый контейнер остаётся orphan (`docker compose up -d`
его не трогает) — убирать явно: `docker rm -f nbc-bible-<old>-1`, при необходимости
`docker volume rm` и `docker rmi`.

**Требования на сервере** (управляются вручную, не этим скриптом):
`/opt/nbc/bible-plan/deploy/.env` со всеми runtime-секретами: `SESSION_SECRET`,
`INVITE_ADMIN_SECRET`, `DIRECTUS_ADMIN_TOKEN`, `NEXT_PUBLIC_APP_URL`,
`NEXT_PUBLIC_BASE_PATH`, `NEXT_PUBLIC_DIRECTUS_URL`, `TELEGRAM_BOT_TOKEN`,
`REGISTER_CHURCH_CODE`/`REGISTER_OPEN_NO_CODE` (runtime), `NEXT_PUBLIC_REGISTER_ENABLED`
(build-time) — полный список см. `ENV_SETUP.md`/[Конфигурация](configuration.md).

### Ручной прогон на сервере (эквивалент того, что делает `deploy.sh --no-build`→build)

```bash
cd /opt/nbc/bible-plan/deploy
docker compose build bff nginx
docker compose up -d bff nginx
```

### Локальная сборка (для проверки перед деплоем, без Docker)

```bash
export NEXT_PUBLIC_BASE_PATH=/app
export NEXT_PUBLIC_DIRECTUS_URL=https://directus.yourdomain.com
# ... остальные NEXT_PUBLIC_* из docs/configuration.md
yarn build   # -> out/ (static) + out/sw.js
```

Артефакт: `out/` (статика для nginx) + `out/sw.js` (build-time Serwist precache, см.
[Offline PWA](offline-pwa.md)). `server/` запускается напрямую через `tsx`
(`yarn bff:start`) — отдельного build-шага для BFF нет (простота сопровождения важнее
типизированного bundle).

⚠️ `NODE_ENV` НЕ должен быть `development` в окружении, где запускается `yarn build`
(`next build` сам форсирует `production`) — не-стандартное значение провоцирует
падение Next.js 16 на пререндере `/_global-error`/`/_not-found`
(`Cannot read properties of null`, см. `.ai-factory/plans/feature-static-export-hono-bff.md`
T13). При локальном тестовом прогоне `unset NODE_ENV` перед `yarn build`, если оно
задано в `.env.local` для dev-режима.

---

## nginx

Полная конфигурация — в [nginx](nginx.md). `location /app` отдаёт статику из `out/`
(`try_files`), `location /app/api/` проксирует на `bff:3001`. Легаси-редиректы
(`/dashboard/read/<book>/<chapter>`, `/dashboard/songs/<id>`), ранее живущие в
`middleware.ts`, теперь в конфиге nginx.

---

## Проверка деплоя

1. `curl -i https://yourdomain.com/app/api/health` → `204`.
2. Откройте `https://yourdomain.com/app` — страница логина.
3. Войдите, проверьте отображение плана чтения.
4. `curl -sI https://yourdomain.com/app/sw.js | grep -i cache-control` →
   `public, max-age=0, must-revalidate` (SW-файл не должен кешироваться браузером).
5. Логи: `docker compose -f deploy/compose.yml logs -f bff nginx`.

---

## Переменные окружения

Полный список переменных — в [Конфигурации](configuration.md).

## See Also

- [Конфигурация](configuration.md) — все переменные окружения
- [nginx](nginx.md) — конфигурация reverse proxy (static + bff, cache headers)
- [Offline PWA](offline-pwa.md) — precache-модель, автозагрузка, приёмка iOS
- [Настройка Directus](DIRECTUS_SETUP_GUIDE.md) — подготовка CMS
