# План: Развёртывание NBC Bible Plan на новом prod-сервере (Docker Compose)

**Дата:** 2026-06-29
**Режим:** fast (plan + execute по SSH)
**Сервер:** `root@168.222.202.131` (Ubuntu 24.04.4 LTS, Docker 29.6.1, Compose v5.2.0, 2 vCPU / 3.9 GB RAM / 34 GB free)

## Settings
- **Testing:** smoke-проверки end-to-end (curl/health), без unit-тестов (инфраструктурная задача)
- **Logging:** verbose — подробный вывод на каждом шаге (compose logs, healthchecks)
- **Docs:** обновить `docs/deployment.md` после стабилизации стека (warn-only)
- **Roadmap Linkage:** Milestone "none" — Rationale: инфраструктурная задача восстановления prod

## Контекст / Что случилось
Старый сервер `194.87.252.17` умер, бэкапа нет. На нём в одном хосте жили: nginx(TLS) → Next.js standalone (:3000) + **Directus CMS** (`/directus`) + Postgres/SQLite Directus. Потеряны данные Directus: план чтения, стих дня, профили, прогресс чтения.

**Что НЕ потеряно (реконструируемо из repo):**
- Текст Библии — self-hosted в `data/bible/*` (NRT, Kassian)
- План чтения 2026 — `csv/csv-plan.csv` (полный 365-дневный) + `csv/bible_plan_2026_weekly_final.csv` (недельный/Притчи)
- Схема Directus — описана в `docs/database-schema.md` (snapshot'а нет → пересоздаём через API)

**Что регенерируется само:** аккаунты/сессии пользователей (Lucia SQLite + Directus users) — создаются при входе через Telegram.

## Целевая архитектура (Docker Compose)
```
Internet :80/:443
  └─ nginx (container, TLS Let's Encrypt)
       ├─ /directus → directus:8055
       └─ /app      → app(Next.js standalone):3000
Внутренняя сеть:
  postgres:16 (vol pgdata) ─ directus:11 (vol uploads) ─ app ─ nginx ─ certbot
```
Всё описано в `deploy/` (compose.yml, .env, Dockerfile, nginx/) → воспроизводимо, в git.

## ⚠️ Внешние блокеры (вне SSH, на стороне Игоря)
1. **DNS:** `bible.baptistnn.ru` сейчас → `194.87.252.17` (мёртвый). Нужно сменить A-запись на `168.222.202.131`. Блокирует выпуск TLS (Let's Encrypt HTTP-01). До репойнта поднимаем стек на HTTP/по IP.
2. **Telegram bot token:** в repo два разных токена (`copy-prod.sh`→`5895...`, `.env.local`→`6277...`). Подтвердить, какой бот обслуживает Mini App (влияет на верификацию initData). Если домен остаётся `bible.baptistnn.ru` — со стороны BotFather менять ничего не нужно.

## Tasks

### Phase 0 — Подготовка сервера
1. **Swap + базовая подготовка** — добавить 2 GB swapfile (RAM 3.9 GB маловато для сборки Next.js + Directus), включить, в `/etc/fstab`. Установить `git`, `jq`, `rsync`, `curl`. Лог: вывод `free -h`, `swapon --show`.
2. **Firewall (ufw)** — СНАЧАЛА `ufw allow 22,80,443`, проверить правила, потом `ufw --force enable`. Критично: не потерять SSH. Лог: `ufw status verbose`.
3. **Структура каталогов** — `/opt/nbc/bible-plan` (код+deploy), volume-каталоги. Лог: `tree -L 2 /opt/nbc`.

### Phase 1 — Каркас стека
4. **Перенос проекта на сервер** — `rsync` исходников (без `node_modules`, `.next`, `.git`) + `csv/`, `data/`, `public/`, `scripts/` в `/opt/nbc/bible-plan`. Лог: размер переданного, `du -sh data`.
5. **`deploy/Dockerfile` (Next.js standalone)** — multi-stage (deps→build→runner), `COPY data ./data` (рантайм-чтение Библии), `COPY public`, `.next/static`, `.next/standalone`. Volume для `database/` (SQLite Lucia). ENV из compose. Лог: build args.
6. **`deploy/compose.yml` + `deploy/.env`** — сервисы postgres/directus/app/nginx, сети, volumes, healthchecks, секреты (сгенерировать: PG пароль, Directus KEY/SECRET, admin pass). Лог: `docker compose config`.
7. **`deploy/nginx/`** — conf с `/directus`→directus:8055 и `/app`→app:3000, заготовка под TLS, ACME webroot. Лог: `nginx -t`.

### Phase 2 — Данные-слой
8. **Поднять postgres + directus** — `docker compose up -d postgres directus`, дождаться healthy, проверить инициализацию Directus (`/server/health`). Лог: `compose logs directus`.
9. **Создать статический admin-токен** — залогиниться в Directus, создать static token для admin-пользователя → положить в `deploy/.env` как `DIRECTUS_ADMIN_TOKEN`. Лог: проверка `GET /users/me`.

### Phase 3 — Восстановление data model + данных Directus
10. **Bootstrap data model** — `deploy/directus-bootstrap.mjs`: создать через Directus API коллекции и поля по `docs/database-schema.md`: `plan`(numbers,day,read,item), `reading`(user_id,day,directus_user_id,count,completed_items,year), `weeks`(num_1..num_7), `weekly_plan`, `telegram_user_mapping`(directus_user_id,telegram_user_id). Лог: список созданных коллекций.
11. **chat_history + роль "Чтец"** — выполнить `scripts/mi-001.sh` (chat_history) и `scripts/create-telegram-role.sh` (роль/политика из `telegram-reader-policy.json`) с новым токеном. Лог: ответы API.
12. **Реимпорт плана из CSV** — `scripts/update-plan-from-csv.sh` (CSV_FILE=`csv/csv-plan.csv`, полный 365-дн.) + `scripts/import-weekly-plan-from-csv.mjs` (Притчи/недельный) + `scripts/populate-sort-key.mjs`. Проверить count дней/глав. Лог: статистика импорта.

### Phase 4 — Приложение
13. **Сборка и запуск app** — собрать образ Next.js (build на сервере со swap), `docker compose up -d app`. Env: `NEXT_PUBLIC_DIRECTUS_URL` (внутр. http://directus:8055 для server-side / публичный для клиента через nginx), `DIRECTUS_ADMIN_TOKEN`, `TELEGRAM_BOT_TOKEN`, `JWT_SECRET`, `NEXT_PUBLIC_BASE_PATH=/app`, `NEXT_PUBLIC_AI_ENABLE` выкл. Лог: `compose logs app`, проверка `:3000/app`.

### Phase 5 — Reverse proxy + TLS  *(после DNS-репойнта)*
14. **nginx HTTP up + smoke** — поднять nginx, проверить `http://168.222.202.131/app` и `/directus` (по IP/Host-заголовку). Лог: curl-коды.
15. **TLS (certbot)** — после смены DNS на `168.222.202.131`: выпустить сертификат Let's Encrypt для `bible.baptistnn.ru`, включить 443, redirect 80→443, автопродление. Лог: `certbot certificates`.

### Phase 6 — Финал
16. **End-to-end проверка** — открыть `https://bible.baptistnn.ru/app`, вход через Telegram, план чтения, чтение главы, отметка прочитанного, Directus админка. Подтвердить Telegram bot token. Лог: чек-лист.
17. **Бэкапы** — cron `pg_dump` Directus БД + архив uploads/SQLite в `/opt/nbc/backups` (ежедневно, ротация 7-14 дней). Чтобы «нет бэкапа» больше не повторилось. Лог: тестовый дамп.

## Commit Plan
Файлы деплоя коммитим в repo (новая папка `deploy/`):
- После Phase 1: `chore(deploy): add Docker Compose stack (app+directus+postgres+nginx)`
- После Phase 3: `chore(deploy): add directus data-model bootstrap + reimport scripts`
- После Phase 5: `docs(deploy): document new prod server setup`

## Заметки по реализации
- Next.js standalone читает `data/bible/*` через `process.cwd()/data` — обязательно в образе.
- `database/` (better-sqlite3 Lucia) — на volume, writable.
- Два Telegram-токена в repo — использовать активный из `copy-prod.sh` (`5895...`), подтвердить у Игоря.
- AI («Чат с пастором») — отключён (`NEXT_PUBLIC_AI_ENABLE` не задан), n8n/AI Flow отложены.
- Старый `copy-prod.sh` (scp на мёртвый `194.87.252.17:28043`) заменяется compose-деплоем.
