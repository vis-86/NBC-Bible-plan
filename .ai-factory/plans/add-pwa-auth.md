# PWA Auth вне Telegram — invite + password (псевдонимная модель)

**Branch:** `feature/add-pwa-auth`
**Created:** 2026-06-29
**Type:** Feature

## Settings

- **Tests:** yes (vitest на API/lib: invite/activate, login, telegram-link, подпись сессии, rate-limiter)
- **Logging:** verbose (DEBUG-уровень для всех новых auth-модулей)
- **Docs:** mandatory — обязательный чекпоинт через /aif-docs в конце (ENV_SETUP, ARCHITECTURE, README)

## Roadmap Linkage

- **Milestone:** "none"
- **Rationale:** Skipped — ROADMAP.md в проекте отсутствует.

---

## Research Context (Active Summary)

> Источник: `.ai-factory/RESEARCH.md` (сессия 2026-06-29).

- **Topic:** Аутентификация/регистрация для PWA вне Telegram. Telegram заблокирован в РФ → больше не основной вход.
- **Goal:** Доступность как PWA без Telegram, простая регистрация, псевдонимно (минимум ФЗ-152). Telegram mini-app остаётся вторичным каналом для VPN — там вход без логина/пароля через привязку tg-аккаунта.
- **Constraints:** Закрытый круг (все известны лично). Сервер в РФ → локализация ПД (ФЗ-152 ст.18 ч.5) выполнена. Псевдонимная модель (логин/имя + пароль, без email/телефона/ФИО) → обязательства оператора ПД почти нулевые. Максимум переиспользования кода.
- **Decisions:**
  - Канонический аккаунт = invite + password на вебе. **Единственный источник создания аккаунтов.**
  - **ВАРИАНТ 1:** все заводятся через invite на вебе; mini-app только привязывает tg_id к существующему юзеру → дублей нет by design.
  - Telegram mini-app не создаёт аккаунты — только привязка.
  - Один механизм set-password по подписанной ссылке = и активация, и сброс пароля.
  - Подписать session-cookie (раз появились пароли); убрать Directus access_token из открытого вида.
  - **Отклонено:** выдуманный логин как единственный якорь (риск «забыл логин»→мёртвый аккаунт — закрывается тем, что поддержка выдаёт reset по юзеру из Directus), секретное слово, публичная self-service регистрация, Telegram Login Widget на вебе (TG заблокирован), полный переход на Lucia (избыточно — берём iron-session).
- **КРИТИЧНО:** убрать авто-создание юзера в `findOrCreateUser` при неизвестном `initData`.
- **Success signals:** регистрация без формы-выдумки (открыл invite → задал пароль → работает везде); VPN-юзер в mini-app входит без логина/пароля после однократной привязки; нет дублей; нет хранения email/телефона/ФИО; session-cookie подписан.

> **Прим.:** старый план `.ai-factory/plans/pwa-email-auth.md` (email-регистрация + email-сброс через SMTP + push) **этим планом отменяется** в части auth-модели. Из него переиспользуются находки: сломанная `/register` (клиентский Directus SDK), iron-session, PWA/basePath-детали, rate-limiter/zod-инфра. **Push-уведомления — вне scope** (в RESEARCH не обсуждались; при необходимости — отдельный план).

---

## Архитектурная модель

```
ВЕБ / PWA — основной путь, без Telegram
  invite-ссылка (подписанный одноразовый токен) → /activate
    → задать login + password (+ display name) → /api/auth/activate
    → createLocalUser (email={login}@local) → сессия → /dashboard
  ТА ЖЕ подписанная ссылка (reset-payload) = сброс пароля (выдаёт поддержка).
  Вход: /login (поле «Логин») → /api/auth/login (login → {login}@local → Directus).

TELEGRAM MINI-APP — вторично, для VPN
  open → initData → /api/auth/telegram
     ├─ tg_id в mapping?  ─ДА→ сессия, вход без логина/пароля ✓
     └─ НЕТ → НЕ создавать. { linked:false } → форма «Привязать аккаунт»
              → login+password ОДИН раз → /api/auth/telegram/link
              → insert telegram_user_mapping → дальше всегда авто-вход.
```

Идентичность остаётся на Directus users + коллекции `telegram_user_mapping`. Привязка = вставка строки на **существующего** пароль-юзера (не нового).

### Новые Directus-сущности
- `auth_used_tokens`: `jti` (unique), `used_at` — одноразовость invite/reset токенов. Хранится только `jti`, не сам токен. Добавить интерфейс в `src/lib/directus-schema.ts` (схема в проекте typed-only, миграций в репо нет); коллекция создаётся вручную в Directus Admin (задокументировать).

### Заметка про Directus access_token (важно)
`session.access_token` сейчас читают `plan`, `plan/weekly`, `progress`, `app-settings`, `graphql` (с `isTokenExpiredError → deleteSession`). Directus user-токен короткоживущий (~15 мин), refresh не хранится → на пароль-пути (основной) это логаут каждые ~15 мин. **Option B (T6):** отказаться от user-токена, перейти на admin-client + `directus_id` (паттерн уже есть в `reading-settings`; Telegram-юзеры уже tokenless). Поэтому T0 access_token НЕ удаляет — это делает T6 вместе с рефактором роутов.

### Новые env
```bash
SESSION_SECRET=...        # iron-session, >=32 симв.  openssl rand -hex 32. ОБЯЗАТЕЛЕН в prod.
INVITE_SECRET=...         # HMAC-подпись invite/reset токенов. openssl rand -hex 32.
INVITE_ADMIN_SECRET=...   # защита /api/auth/invite/create (если делаем эндпоинт).
```
`DIRECTUS_ADMIN_TOKEN` уже есть.

---

## Задачи

### Фаза 0: Security Foundation (prerequisite)

#### T0 — Подпись сессии, zod, rate-limiter, vitest ✅
**Файлы:** `src/lib/session.ts` (iron-session sealData/unsealData; async createSession/getSession/getSessionFromRequest; **access_token НЕ удалять** — он шифруется внутри payload, убирает его T6; **SESSION_SECRET валидировать лениво/при запросе, НЕ throw на импорте** — иначе падает `next build`), `src/middleware.ts` (**async** + await; iron-session работает на Edge через Web Crypto), `src/app/api/auth/{telegram,login}/route.ts` (await createSession), `src/lib/rate-limiter.ts` (СОЗДАТЬ, in-memory), `src/lib/validators/auth.schemas.ts` (СОЗДАТЬ: Activate/Login/TelegramLink/SetPassword), `vitest.config.ts` + `src/test/setup.ts` (СОЗДАТЬ), `package.json` (iron-session, zod, -D vitest @vitest/coverage-v8 + scripts), `ENV_SETUP.md`/`.env.local` (SESSION_SECRET, INVITE_SECRET).
**Тесты:** rate-limiter (N ok / N+1 block / reset окна), auth.schemas (валид/невалид), session seal/unseal round-trip.
**Logging:** DEBUG ленивой инициализации секрета; фатальная ошибка при отсутствии SESSION_SECRET во время запроса.
**Зависимости:** нет.

### Фаза 1: Auth Backend

#### T1 — Invite + activation/set-password backend  *(blocked by T0)* ✅
**Файлы:** `src/lib/invite.ts` (СОЗДАТЬ: signInviteToken/verifyInviteToken/consumeToken; payload kind=activate|reset, jti, exp, [userId]), `src/lib/directus-schema.ts` (ДОБАВИТЬ интерфейс `auth_used_tokens`), `src/lib/directus-user.ts` (ДОПОЛНИТЬ: createLocalUser(login,password,displayName) — email `{login}@local`, роль «Чтец» (lookup как в findOrCreateUser), uniqueness-check→409; setUserPassword(userId,password)), `src/app/api/auth/activate/route.ts` (СОЗДАТЬ: activate→createLocalUser→consume; reset→setUserPassword→consume; затем createSession→200; **access_token из Directus login — только если T6 ещё не выполнен**; zod+rate-limit), `src/app/api/auth/invite/create/route.ts` (СОЗДАТЬ, опц.: admin-secret защита, выдаёт signed URL). Directus: коллекция `auth_used_tokens` (вручную в Admin).
**Тесты:** verifyInviteToken (валид/просрочен/поддельная подпись/повторное использование); activate (новый юзер; занятый login→409; reset существующему).
**Logging:** DEBUG token issued/consumed, user created/updated.

#### T2 — Login по логину; удалить публичную регистрацию  *(blocked by T0)* ✅
**Файлы:** `src/app/api/auth/login/route.ts` (ОБНОВИТЬ: принимать `login` (рейнейм `email`→`login`, контракт с T5; форма сейчас шлёт `{email}` на `login/page.tsx:79`); нормализовать `{login}@local` если нет `@`; backward-compat для явного домена/email; zod LoginSchema; rate-limit 10/15мин/IP; await createSession), `src/app/register/page.tsx` (УДАЛИТЬ — сломанный клиентский Directus SDK, противоречит модели), `src/app/login/page.tsx` (убрать ссылку «Регистрация»). Хелпер normalizeLoginToEmail.
**Тесты:** handle→@local; email с доменом→backward-compat; неверный пароль→401; rate-limit→429.
**Logging:** DEBUG attempt/success/fail/rate-limit.

#### T3 — Telegram привязка (без авто-создания)  *(blocked by T0)* ✅
**Файлы:** `src/lib/directus-user.ts` (РЕФАКТОР findOrCreateUser → getUserByTelegramId + linkTelegramToUser; убрать createUser из tg-флоу; tg_id занят→409), `src/app/api/auth/telegram/route.ts` (ОБНОВИТЬ: найден→сессия+200 {linked:true}; не найден→200 {linked:false}, **НЕ создавать**), `src/app/api/auth/telegram/link/route.ts` (СОЗДАТЬ: verify initData + проверка кредов через Directus → linkTelegramToUser → createSession; zod+rate-limit; tg_id занят→409).
**⚠️ Контракт (redirect-loop):** `login/page.tsx` сейчас редиректит по `res.ok`; при `{linked:false}` (200) это даёт цикл /dashboard↔/login. Клиент (T5) ОБЯЗАН ветвиться по `data.linked`, не по `res.ok`.
**Тесты:** unknown tg_id→linked:false и юзер НЕ создан; link верные креды→mapping+сессия; неверные→401; tg_id занят→409.
**Logging:** DEBUG tg_id linked=bool; mapping created.

#### T6 — Token strategy: убрать зависимость от Directus access_token (Option B)  *(blocked by T0)* ✅
**Файлы:** `src/app/api/plan/route.ts`, `src/app/api/plan/weekly/route.ts`, `src/app/api/user/progress/route.ts`, `src/app/api/user/app-settings/route.ts`, `src/app/api/graphql/route.ts` (рефактор на admin-client + `directus_id`, убрать передачу `session.access_token` и ветки `isTokenExpiredError→deleteSession`), `src/lib/directus-data.ts`/`directus-chat.ts` (адаптировать сигнатуры на directus_id), `src/lib/session.ts` (убрать `access_token` из SessionData), `src/app/api/auth/{login,activate,telegram/link}` (больше не получать access_token).
**Почему:** user-токен Directus живёт ~15 мин без refresh → на основном пароль-пути логаут каждые ~15 мин. Паттерн уже есть в `reading-settings`.
**Trade-off:** теряем per-user Directus permission на API-слое — согласуется с ARCHITECTURE (admin token + proxy) и существующим `reading-settings`.
**Тесты:** роуты отдают данные по directus_id без токена; нет 401-логаута при «истёкшем» токене.
**Logging:** DEBUG `[data] admin-client query for user=${directus_id}`.

### Фаза 2: PWA

#### T4 — PWA: manifest, SW, iOS-meta, install-prompt  *(независима)* ✅
> Реализовано БЕЗ @ducanh2912/next-pwa (риск совместимости с Next 16/Turbopack): ручной SW
> через route `src/app/sw.js/route.ts` (scope = basePath, важно для деплоя за nginx) +
> ServiceWorkerRegistrar. Manifest — нативный `src/app/manifest.ts`. `next build` зелёный.
**Файлы:** `src/app/manifest.ts` (СОЗДАТЬ: start_url `${basePath}/dashboard`, standalone, иконки с basePath), `public/icons/` (icon-192/512 maskable, apple-touch-180 — итоговые), `next.config.ts` (ОБНОВИТЬ: @ducanh2912/next-pwa, scope=basePath, disable в dev; сохранить reactCompiler/standalone/basePath/assetPrefix), `src/app/layout.tsx` (manifest link + apple-mobile-web-app-* meta), `src/hooks/usePWAInstall.ts` (СОЗДАТЬ), `package.json` (@ducanh2912/next-pwa).
**Заметка iOS:** server-set httpOnly cookie не под 7-дн. лимитом ITP → сессия в standalone переживёт. Offline-кеш API — вне scope.
**Тестирование:** `npm run build && npm start` (SW не в dev).
**Logging:** console в SW (install/activate); DEBUG в usePWAInstall.

### Фаза 3: Frontend

#### T5 — Страницы активации/сброса, Telegram-link, поддержка, чистка login  *(blocked by T1,T2,T3,T6)* ✅
**Файлы:** `src/app/activate/page.tsx` (СОЗДАТЬ: ?token → activate-форма login+password+confirm+display / reset-форма password+confirm; подсказка ФЗ-152 «не вводите настоящие имя/телефон»; ошибка токена → контакт поддержки), `src/app/login/page.tsx` (ОБНОВИТЬ: поле/лейбл «Логин» + тело `{login,password}`; убрать «Регистрация»; **исправить TG-обработчик — ветвиться по `data.linked`, не `res.ok`** (linked:true→редирект, linked:false→форма привязки); блок «Забыли пароль/логин → поддержка <контакт>»; сохранить TG auto-login), `src/features/auth/components/TelegramLinkForm.tsx` (СОЗДАТЬ), `src/shared/components/.../InstallPWABanner.tsx` (опц., usePWAInstall из T4).
**Тесты:** не требуются (покрытие на API); опц. smoke на activate-форму.
**Logging:** DEBUG переходов состояний форм.

---

## Commit Plan

| Коммит | Задачи | Сообщение |
|--------|--------|-----------|
| 0 | T0 | `feat(auth): seal session via iron-session, add zod schemas, rate-limiter, vitest` |
| 1 | T1 | `feat(auth): invite + activation/set-password backend (single account source)` |
| 2 | T2 | `feat(auth): login by handle, remove broken public registration` |
| 3 | T3 | `feat(auth): link Telegram to existing account, stop auto-creating users` |
| 4 | T6 | `refactor(auth): drop Directus access_token, use admin-client + directus_id` |
| 5 | T4 | `feat(pwa): manifest, service worker, iOS meta, install prompt` |
| 6 | T5 | `feat(auth): activation/reset pages, Telegram-link UI, support contact` |

---

## Порядок выполнения

```
T0 (security foundation)
  ├─► T1 (invite/activate) ─┐
  ├─► T2 (login + cleanup) ─┤
  ├─► T3 (telegram link)  ──┼─► T5 (frontend pages)
  └─► T6 (tokenless routes)─┘
T4 (PWA) — параллельно, без зависимостей
```

## Prerequisites
- Сгенерировать `SESSION_SECRET`, `INVITE_SECRET` (`openssl rand -hex 32`) перед T0/T1.
- Доступ к Directus Admin для коллекции `auth_used_tokens` (T1).
- Итоговые иконки PWA (T4).

## Безопасность (чеклист)
- [ ] Session cookie: httpOnly + encrypted + signed (iron-session); SESSION_SECRET валидируется при запросе, не на импорте (T0)
- [ ] Убрана зависимость от Directus user access_token; нет 15-мин логаута (T6)
- [ ] zod-валидация на всех auth endpoints (T0+T1+T2+T3)
- [ ] Rate-limit: activate, login, telegram/link, invite/create (T0+T1+T2+T3)
- [ ] Invite/reset токен: HMAC-подпись, TTL, одноразовость через jti (T1)
- [ ] Публичная self-service регистрация удалена (T2)
- [ ] Telegram: НЕТ авто-создания юзеров → нет дублей (T3)
- [ ] Псевдонимность: не храним email/телефон/ФИО; подсказка в форме (T5)
- [ ] Аккаунты создаются только через invite (Вариант 1)
