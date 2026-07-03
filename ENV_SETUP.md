# Environment Variables

Все секреты живут в `.env.local` (gitignored). Ниже — обязательные и опциональные переменные.

## Обязательные

| Переменная | Назначение |
|------------|-----------|
| `NEXT_PUBLIC_DIRECTUS_URL` | URL Directus CMS (публичный) |
| `DIRECTUS_ADMIN_TOKEN` | Admin-токен Directus (server-only, не экспонировать) |
| `TELEGRAM_BOT_TOKEN` | Токен бота для верификации `initData` Telegram mini-app |
| `NEXT_PUBLIC_BASE_PATH` | Base path деплоя (прод: `/app`) |

## Аутентификация (PWA auth, добавлено в add-pwa-auth)

| Переменная | Назначение | Как сгенерировать |
|------------|-----------|-------------------|
| `SESSION_SECRET` | Пароль для iron-session (шифрование+подпись cookie). **Обязателен в prod**, ≥32 символов. | `openssl rand -hex 32` |
| `INVITE_ADMIN_SECRET` | Защита эндпоинта `POST /api/auth/invite/create` (выдача invite-ссылок). | `openssl rand -hex 24` |
| `NEXT_PUBLIC_APP_URL` | Базовый URL приложения для построения invite/reset ссылок. | — |

## Самостоятельная регистрация (`/register`)

Два независимых понятия: «регистрация открыта» и «требуется ли код церкви».

| Переменная | Сторона | Назначение |
|------------|---------|-----------|
| `REGISTER_CHURCH_CODE` | server (runtime) | Секрет кода церкви. Задан (непустой) ⇒ код **обязателен**. Меняется без пересборки. Не логировать. |
| `REGISTER_OPEN_NO_CODE` | server (runtime) | `true`/`1` ⇒ регистрация открыта **без кода**. Учитывается только когда `REGISTER_CHURCH_CODE` пуст. |
| `NEXT_PUBLIC_REGISTER_ENABLED` | client (build-time) | Показывать форму регистрации vs заглушку-инвайт. Тоггл ⇒ пересборка. |
| `NEXT_PUBLIC_REGISTER_REQUIRE_CODE` | client (build-time) | Default `true`. `false`/`0` ⇒ поле «Код церкви» скрыто. Должен зеркалить серверную сторону. |

**Матрица состояний (сервер — источник истины):**

| `REGISTER_CHURCH_CODE` | `REGISTER_OPEN_NO_CODE` | Результат |
|---|---|---|
| задан | любое | открыто, код обязателен |
| пусто | `true`/`1` | открыто, без кода |
| пусто | не задан | закрыто (роут → 503) |

Приоритет за секретом: если он задан — код требуется, `REGISTER_OPEN_NO_CODE` игнорируется.
UI-флаги (`NEXT_PUBLIC_*`) должны совпадать с серверной стороной, иначе форма и роут рассинхронятся.

## Опциональные

| Переменная | Назначение |
|------------|-----------|
| `LOG_LEVEL` | `debug` (по умолчанию) — подробные логи auth-флоу; `silent`/`info` — тише. Server-only, на клиент не попадает |
| `NEXT_PUBLIC_LOG_LEVEL` | Аналог `LOG_LEVEL` для клиентского кода (offline/SW/sync-модули) — server-only переменные не инлайнятся в браузерный бандл. `debug` по умолчанию |
| `NEXT_PUBLIC_AI_ENABLE` | Включение AI-чата «Пастор» |
| `DIRECTUS_AI_FLOW_ID` | UUID Directus Flow для AI |

## Directus коллекции (создать вручную в Admin)

- `telegram_user_mapping` — `directus_user_id`, `telegram_user_id` (уже есть)
- `auth_invites` — stateful invite/reset токены. Поля: `token` (string, unique), `kind` (string: `activate`\|`reset`), `user` (m2o → `directus_users`, nullable), `label` (string, nullable), `expires_at` (timestamp), `used_at` (timestamp, nullable), `invite_url` (string, nullable). Одноразовость = `used_at`, TTL = `expires_at`.
  - **Flow** (event hook `items.create`, non-blocking): если `token` пуст → сгенерировать, `expires_at = now+7д`, `invite_url = {NEXT_PUBLIC_APP_URL}{NEXT_PUBLIC_BASE_PATH}/activate?token={token}&mode={kind}`. Обслуживает ручной admin-UI путь (админ создаёт запись → копирует `invite_url`). Программный `createInvite` заполняет поля сам и на Flow не полагается.

## Замечания

- `SESSION_SECRET` валидируется лениво (при первом запросе), не на этапе `next build` — сборка без секрета не падает, но рантайм без него вернёт ошибку сессии.
- Пользователи веба — псевдонимные: синтетический email `{login}@local`, без реальных ПД (ФЗ-152).
