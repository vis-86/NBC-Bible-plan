[← Конфигурация](configuration.md) · [Back to README](../README.md) · [Деплой →](deployment.md)

# Аутентификация

Псевдонимная модель входа для PWA вне Telegram. Аккаунты не хранят email/телефон/ФИО
(минимум обязательств по ФЗ-152; сервер в РФ покрывает локализацию). Telegram заблокирован
в РФ, поэтому он — вторичный канал для пользователей через VPN.

## Модель

```
ВЕБ / PWA — основной путь
  invite-ссылка → /activate → логин + пароль (+ имя) → сессия
  та же подписанная ссылка (mode=reset) = сброс пароля

TELEGRAM mini-app — вторично (VPN)
  initData → привязан?  ─да→ авто-вход
                        └─нет→ форма привязки (логин+пароль один раз) → дальше авто-вход
```

- **Единственный источник аккаунтов** — invite на вебе. Telegram только **привязывает** `tg_id`
  к существующему аккаунту (не создаёт), поэтому дубли невозможны by design.
- **Логин** — произвольный псевдоним; внутри маппится в синтетический email `{login}@local`.
  Подсказка в форме: не использовать настоящие имя/телефон.

## Эндпоинты

| Метод / путь | Назначение | Защита |
|--------------|-----------|--------|
| `POST /api/auth/invite/create` | Сгенерировать invite/reset-ссылку | `Authorization: Bearer ${INVITE_ADMIN_SECRET}` |
| `POST /api/auth/activate` | Активация (создание аккаунта) или сброс пароля по токену | one-time токен + rate-limit |
| `POST /api/auth/login` | Вход по логину+паролю (`{login}@local` → Directus) | rate-limit |
| `POST /api/auth/telegram` | Mini-app вход. `{ linked: true }` + сессия / `{ linked: false }` | initData (HMAC) |
| `POST /api/auth/telegram/link` | Однократная привязка `tg_id` к аккаунту | initData + логин/пароль + rate-limit |
| `POST /api/auth/logout` | Выход | — |

> **Контракт `/api/auth/telegram`:** клиент должен ветвиться по `data.linked`, а **не** по
> `res.ok`. При `linked: false` сессия не создаётся — редирект на `/dashboard` по `res.ok`
> вызвал бы цикл `/dashboard ↔ /login`.

## Invite / reset токены

Stateful токены в коллекции Directus `auth_invites` (`src/lib/invite.ts`). HMAC/`INVITE_SECRET`
больше не используются — секрет ссылки = поле `token` (unique).

- Запись: `{ token, kind: 'activate' | 'reset', user, label, expires_at, used_at, invite_url }`.
- Одноразовость = поле `used_at`, TTL = поле `expires_at` (по умолчанию 7 дней).
- `findValidInvite(token)` ищет запись с `used_at = null` и `expires_at > now`; `kind`/`user`
  берутся **из записи** (не из URL-параметра `mode`). `consumeInvite(id, userId?)` проставляет
  `used_at` (+`user` для activate).
- Создание: вручную в Directus UI (Flow заполняет `token`/`expires_at`/`invite_url`) **или**
  программно `createInvite()` (`POST /api/auth/invite/create`, защищён `INVITE_ADMIN_SECRET`).

«Забыл логин/пароль» → поддержка создаёт `reset`-приглашение на пользователя в Directus и выдаёт
ссылку (`mode=reset`), которая ведёт на ту же страницу `/activate`.

> **Гонка одноразовости:** проверка `used_at` и его запись не атомарны — теоретически два
> параллельных активейта одной ссылки могут оба пройти. Для закрытого круга (one-time + TTL)
> риск принят осознанно.

## Сессии

`iron-session` — зашифрованный + подписанный httpOnly cookie `bible-plan-session` (30 дней).

- `SESSION_SECRET` валидируется **лениво** (при запросе), не на этапе `next build`.
- Сессия хранит только `directus_id` + имя — **без** Directus access_token.
- Middleware (`src/middleware.ts`, async) гардит `/dashboard/*`.

## Доступ к данным (tokenless)

API-роуты данных (`plan`, `progress`, `app-settings`, `graphql`, `reading-settings`) ходят в
Directus через **admin-клиент** с фильтрацией по `directus_id` из сессии. User access_token
Directus не используется (он короткоживущий ~15 мин без refresh → давал бы логаут).
Trade-off: per-user Directus permissions на API-слое не применяются (сервер доверенный).

## PWA

Установка вне Telegram: `src/app/manifest.ts` (отдаётся на `{basePath}/manifest.webmanifest`) +
service worker `src/app/sw.js/route.ts`. SW намеренно раздаётся **из-под basePath** (`/app/sw.js`),
чтобы его scope совпадал с `/app` за nginx (public/-ассеты лежат в корне и недоступны под `/app`).
Регистрация — `ServiceWorkerRegistrar`; install-prompt — хук `usePWAInstall`.

## Переменные окружения

См. [Конфигурация](configuration.md) и `ENV_SETUP.md`: `SESSION_SECRET`,
`INVITE_ADMIN_SECRET`, `NEXT_PUBLIC_APP_URL`, `TELEGRAM_BOT_TOKEN`, `DIRECTUS_ADMIN_TOKEN`.

## Directus

Коллекции: `telegram_user_mapping` (`directus_user_id`, `telegram_user_id`), `auth_invites`
(`token`, `kind`, `user`, `label`, `expires_at`, `used_at`, `invite_url`). Пользователи создаются
с ролью «Чтец» и синтетическим email `{login}@local`.

## See Also

- [Конфигурация](configuration.md) — переменные окружения и секреты
- [Деплой](deployment.md) — сборка и nginx (basePath `/app`)
- [Настройка Directus](DIRECTUS_SETUP_GUIDE.md) — admin token, роли, коллекции
