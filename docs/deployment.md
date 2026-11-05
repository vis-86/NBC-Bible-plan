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

## Команды и витрина для других церквей (выкатка)

Схема команд накатывается скриптом `scripts/add-teams.ts`. Каждый шаг запускается с
`--confirm-host=<хост Directus>` (несовпадение с `NEXT_PUBLIC_DIRECTUS_URL` → выход без
запросов) и сначала с `--dry-run`. Токен — актуальный админ-токен прода из окружения сервера.

1. **Бэкап БД** (`deploy/backup.sh`).
2. **`apply`** — до деплоя кода. Добавляет `teams`, `team_members`, поля `team` у песен, сетов
   и инвайтов, `songs.origin_song`, `auth_invites.role`, роль `team_admin`; создаёт команду
   `nbc`, проставляет её всем песням, сетам и activate-инвайтам и добавляет в неё пользователей
   ролей «Чтец»/`musician`/`musician_editor`. Совместим со старым кодом. В выводе dry-run сверить
   число пользователей «other roles». Backfill поднимает `date_updated` песен и сетов —
   устройства один раз перекачают их.
3. **Деплой кода** (`deploy.sh`) + вручную `deploy/` (compose с `WORSHIP_APP_URL`, Dockerfile
   со стадией `build-worship`): `deploy.sh` исключает `deploy/` из rsync.
4. **`apply` повторно** — подхватывает аккаунты, созданные между шагами 2 и 3. Шаги фазы 1
   (backfill, членство в `nbc`) выполняются, только пока в `teams` одна команда `nbc`.
5. **`finalize`** — `team` у песен и сетов становится NOT NULL (отказывает, пока есть строки
   без команды). После него откат кода на версию без команд ломает создание песен и сетов.
6. **`strip-user-permissions`** — снимает с пользовательских политик права на `setlists`,
   `setlist_items`, `reading`, `telegram_user_mapping`. Удаляемые строки печатаются целиком —
   сохраните вывод для отката.
7. Smoke: полный критический путь NBC (вход, песни, сеты, пометки, офлайн) — см. CLAUDE.md.

Витрина для музыкальных команд (`NEXT_PUBLIC_APP_MODE=worship`, свой домен):

1. DNS: A-запись `song.apps7.ru` → `168.222.202.131` (DNS `apps7.ru` — Timeweb).
2. HTTP-блок витрины: `scp deploy/nginx/conf.d/worship-http.conf` в `conf.d` на сервере,
   `docker compose exec nginx nginx -t` и `docker compose exec nginx nginx -s reload`. Блоку
   сертификат не нужен; точное `server_name` забирает `song.apps7.ru` у блока по умолчанию.
   ⚠️ В `conf.d` на сервере есть блоки, которых нет в репозитории (книжный уголок,
   `books.baptistnn.ru`) — копировать файлы по одному, каталог целиком не перезаписывать.
3. Сертификат: webroot `/var/www/certbot` (на хосте `deploy/nginx/certbot/www`), тем же способом
   и в тот же каталог `deploy/nginx/certbot/conf`, что у `bible.baptistnn.ru`; продление — тем
   же механизмом (см. `certbot/conf/renewal/`).
4. В `deploy/.env` сервера: `WORSHIP_APP_URL=https://song.apps7.ru`, при желании
   `WORSHIP_APP_NAME` / `WORSHIP_APP_SHORT_NAME` (бренд витрины, по умолчанию «Аккорды»).
5. После деплоя образа со второй сборкой (`docker compose up -d --build nginx bff`):
   `worship-tls.conf.disabled` → `worship-tls.conf` на сервере, `nginx -t`, `nginx -s reload`.
6. Новая церковь: `npx tsx scripts/create-team.ts --name="…" --slug=… --confirm-host=<хост>` —
   печатает одноразовую ссылку для её администратора (`team_admin`); повтор с тем же slug и
   именем перевыпускает ссылку (так же добавляется второй администратор — в приложении роль
   `team_admin` не выдаётся). Скрипт отказывает, пока не выполнен `strip-user-permissions`, и
   нужен `WORSHIP_APP_URL` в окружении запуска. Дальше участников приглашает администратор
   команды в приложении.

---

## Переменные окружения

Полный список переменных — в [Конфигурации](configuration.md).

## See Also

- [Конфигурация](configuration.md) — все переменные окружения
- [nginx](nginx.md) — конфигурация reverse proxy (static + bff, cache headers)
- [Offline PWA](offline-pwa.md) — precache-модель, автозагрузка, приёмка iOS
- [Настройка Directus](DIRECTUS_SETUP_GUIDE.md) — подготовка CMS
