# Invite-слой на Directus-backed `auth_invites` (Вариант A)

**Branch:** `feature/add-pwa-auth` (без новой ветки — расширяет существующую auth-фичу)
**Created:** 2026-06-30
**Type:** Refactor

## Settings

- **Tests:** yes (переписать `invite.test.ts` под DB-lookup с моком Directus)
- **Logging:** verbose (DEBUG в invite-слое)
- **Docs:** обновить ENV_SETUP, docs/authentication.md, ARCHITECTURE.md (входит в A4)

## Roadmap Linkage

- **Milestone:** "none" — ROADMAP.md отсутствует.

---

## Контекст и цель

Сейчас invite — **stateless HMAC-токены** (`src/lib/invite.ts`, `INVITE_SECRET`, коллекция
`auth_used_tokens`, эндпоинт `/api/auth/invite/create`). Генерация возможна только через curl
с admin-секретом — не дружелюбно для админов.

**Цель:** перейти на **stateful токены в коллекции Directus `auth_invites`**, чтобы админы
генерили приглашения прямо из Directus UI (Create item / Manual Flow), а приложение упростилось
(минус `INVITE_SECRET`, минус `auth_used_tokens`).

```
АДМИН (Directus UI)                         НОВЫЙ ПОЛЬЗОВАТЕЛЬ
Create auth_invites:                        открывает invite_url → /activate
  kind=activate, label="Иван"               придумывает логин+пароль
  → Flow: token + expires_at + invite_url   → createLocalUser (аккаунт создаётся)
  → копирует invite_url, шлёт                → Directus: invite.used_at + invite.user
```

- Новый пользователь = **generic activate-invite** (без `user`; аккаунт создаётся при активации,
  затем `user`/`used_at` заполняются обратно).
- `reset` = invite с заполненным `user` (существующий аккаунт).
- Одноразовость и TTL = поля `used_at` / `expires_at` самой записи.

## Коллекция `auth_invites`

| Поле | Тип | Назначение |
|------|-----|-----------|
| `token` | string, unique | секрет ссылки (генерит Flow) |
| `kind` | string (activate\|reset) | тип приглашения |
| `user` | m2o → directus_users, null | reset: цель; activate: заполняется после активации |
| `label` | string, null | «для кого» (новый юзер, аккаунта ещё нет) |
| `expires_at` | timestamp | TTL (Flow: now+7д) |
| `used_at` | timestamp, null | одноразовость |
| `invite_url` | string, null | готовая ссылка (Flow), админ копирует |

**Flow** (event hook `items.create` на `auth_invites`): если `token` пуст → сгенерировать;
`expires_at = now+7д`; `invite_url = {APP_URL}{BASE_PATH}/activate?token={token}&mode={kind}`.

> **Важно (timing):** Flow — non-blocking action-hook, ответ `createItem` вернётся ДО заполнения
> `token`/`invite_url`. Поэтому Flow обслуживает **только admin-UI путь** (админ создал item →
> скопировал `invite_url` из записи). Программный `createInvite` (A2) НЕ полагается на Flow:
> генерит `token`/`expires_at`/`invite_url` сам app-side и вставляет уже заполненную запись
> (Flow видит непустой token → no-op).

---

## Задачи

### A1 — Directus `auth_invites` + Flow + schema interface ✅
**Файлы:** Directus Admin (коллекция + Flow — вручную, задокументировать); `src/lib/directus-schema.ts` (+ интерфейс `auth_invites`, − `auth_used_tokens`).
**Зависимости:** нет.
**Статус:** ✅ Полностью готово. `directus-schema.ts` обновлён (код). Коллекция `auth_invites` **создана в Directus** (`bible.baptistnn.ru/directus`, v11.17.4) через API — все поля + unique на `token` + m2o `user→directus_users` (on delete SET NULL) + `token` special `uuid` (авто-генерация при пустом значении). **Flow `auth_invites: fill token/url`** (action, items.create) собран и проверён end-to-end: ручное создание в Admin UI → авто-token + авто `invite_url` + `expires_at`=now+7д; программный `createInvite` (с готовым `invite_url`) Flow пропускает. Ключевой нюанс Directus 11: опция триггера — `collections` (мн.ч.), `$trigger.key` = новый id.

### A2 — Rewrite `src/lib/invite.ts` на DB-токены  *(blocked by A1)* ✅
- Убрать HMAC/`INVITE_SECRET`. `findValidInvite(token)` → lookup (token + used_at null + expires_at>now) → `{ id, kind, user }` | null. `consumeInvite(id, createdUserId?)` → `used_at=now` (+`user` для activate). Опц. `createInvite({kind,userId?,label?})`.
- `createInvite` генерит `token`(`crypto.randomUUID()`)/`expires_at`(now+7д)/`invite_url`(`{APP_URL}{BASE_PATH}/activate?token=…&mode={kind}`) **app-side** и вставляет заполненную запись (не полагается на Flow — см. timing-заметку выше), возвращает `{ url }`.
- **Гонка одноразовости:** `consumeInvite` через `updateItem(used_at)` теряет guard от unique-`jti` старой модели — два параллельных активейта могут пройти `findValidInvite` и оба создать аккаунт. Для закрытого круга риск низкий; либо conditional update (`filter: used_at null` в самом update), либо принять осознанно. Зафиксировать в коде комментом.
- DEBUG-логи на found/consumed/отказ.

### A3 — Update routes  *(blocked by A2)* ✅
- `src/app/api/auth/activate/route.ts` → `findValidInvite`/`consumeInvite`; kind/userId из записи (`invite.kind`/`invite.user`, НЕ из URL `mode`); activate → `consumeInvite(id, newUserId)`. Маппинг старых полей: `payload.userId`→`invite.user`, `payload.jti`→`invite.id`, `payload.kind`→`invite.kind`.
- `src/app/api/auth/invite/create/route.ts` → `createInvite(...)` → `{ url }` (url строит `createInvite`, не сам роут; защита Bearer `INVITE_ADMIN_SECRET` сохраняется как программный путь).
- Вычистить ссылки на `INVITE_SECRET`/`auth_used_tokens` (вкл. `src/test/setup.ts`). Импортёры старых экспортов `signInviteToken`/`verifyInviteToken`/`consumeToken`: activate-route, invite/create-route, `invite.test.ts`.

### A4 — Tests + docs  *(blocked by A3)* ✅
- `src/lib/invite.test.ts` переписать под DB-lookup: мок Directus добавляет `updateItem` (для `consumeInvite`) и новую форму фильтра (`token`+`used_at` null+`expires_at`>now); кейсы: валид/used/expired/not-found/consume + `createInvite` (генерит token/url).
- `src/test/setup.ts` (− INVITE_SECRET), `ENV_SETUP.md` (− INVITE_SECRET, + `auth_invites`/Flow), `docs/authentication.md`, `.ai-factory/ARCHITECTURE.md` (`auth_used_tokens` → `auth_invites`).
- **Rules/описание (active context — иначе будущие агенты введены в заблуждение):** `.ai-factory/rules/base.md:77` (HMAC+`auth_used_tokens` → DB `auth_invites`); `.ai-factory/DESCRIPTION.md:62` (− `INVITE_SECRET` из обязательных env; `INVITE_ADMIN_SECRET` остаётся).

---

## Порядок выполнения

```
A1 (Directus collection+Flow, schema) → A2 (invite.ts DB) → A3 (routes) → A4 (tests+docs)
```

Линейная цепочка, 4 задачи — один коммит в конце (`refactor(auth): DB-backed invites via Directus auth_invites`), либо по задаче.

## Prerequisites
- Доступ к Directus Admin (создать `auth_invites` + Flow) до A2/A3-тестирования вживую.
- После A3: `INVITE_SECRET` можно удалить из `.env.local`/прода; `auth_used_tokens` — удалить из Directus (опц.).

## Заметки
- Безопасность: activate-ссылка = «кто угодно с ссылкой создаст аккаунт» — приемлемо для закрытого круга (one-time + TTL).
- `@ts-nocheck` в `invite.ts` сохраняется (как в `directus-user.ts` — Directus custom-schema typing).
