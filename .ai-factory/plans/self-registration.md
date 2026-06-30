# Самостоятельная регистрация по коду церкви

**Slug:** `self-registration`
**Создан:** 2026-06-30
**Ветка:** не создавалась — в рабочем дереве незакоммиченные изменения лендинга.
Создать `feature/self-registration` **после** коммита лендинга (иначе диффы смешаются).
**Файл плана:** `.ai-factory/plans/self-registration.md`

## Settings

- **Testing:** да — unit (схема, church-code helper) + API-тест register-роута + обновление landing smoke.
- **Logging:** standard — auth security-sensitive. Логируем попытки/исходы регистрации с префиксом `[register]`/`[register-access]`, **без PII** (никогда не логировать пароль и код церкви). DEBUG-детали под `LOG_LEVEL`.
- **Docs:** да — обязательный docs-чекпоинт в конце (обновить auth-доки/README по новой модели).

## Roadmap Linkage

Milestone: "none" — `ROADMAP.md` в проекте отсутствует.

---

## Контекст и решения (подтверждены владельцем)

Возвращаем удалённую при auth-рефакторе self-registration, но в новой форме, совместимой с текущей моделью:

1. **Контроль доступа — «код церкви».** Общий секретный код, который церковь озвучивает на собрании. Регистрация = `login + password + churchCode`. Сохраняет смысл «доступ от церкви» без персональных invite-ссылок и без PII.
2. **Идентификатор — `login + password`, без email** (псевдоним → `{login}@local`, как в текущей invite-модели). ФЗ-152-чистота сохраняется. Минус: нет self-service сброса пароля (остаётся через поддержку/invite).
3. **Invite-модель остаётся параллельно.** `/api/auth/activate` (invite) и reset-токены не трогаем — invite нужен для сброса пароля и admin-provisioning. Self-registration добавляется рядом.

### Что переиспользуем (подтверждено по коду)

- `createLocalUser(login, password, displayName)` + `LoginTakenError` — `src/lib/directus-user.ts` (создание псевдонимного аккаунта, проверка занятости логина).
- `createSession()` — `src/lib/session.ts` (авто-вход после регистрации, как в activate-роуте).
- Примитивы zod — `LoginHandleSchema` / `PasswordSchema` / `DisplayNameSchema` + `firstZodError` (`src/lib/validators/auth.schemas.ts`).
- `checkRateLimit` / `clientIp` — `src/lib/rate-limiter.ts`.
- Паттерн API-роута — зеркалим ветку `kind==='activate'` из `src/app/api/auth/activate/route.ts` (createLocalUser → readUsers(first_name) → createSession).
- Паттерн страницы — `src/app/login/page.tsx` / `activate/page.tsx` (локальные Card + inputClass, `getApiPath`, success → redirect).
- Паттерн теста — `src/app/api/auth/telegram/route.test.ts` (мок lib-зависимостей, import POST, Request → assert status/json).
- Публичный флаг по образцу `isAIEnabled()` — `src/shared/utils/constants.ts`.

### Конфигурация (две переменные)

- **`REGISTER_CHURCH_CODE`** — server-only секрет. Пусто/не задано ⇒ регистрация выключена (роут отвечает 503). Источник истины для проверки кода.
- **`NEXT_PUBLIC_REGISTER_ENABLED`** — клиентский UI-флаг (`'true'`/`'1'`). Управляет показом CTA «Зарегистрироваться» и шагами лендинга. Серверный секрет наружу не светим — поэтому отдельный публичный флаг (как `NEXT_PUBLIC_AI_ENABLE`).

### Безопасность (важно — код общий и брутфорсимый)

- `verifyChurchCode` — `crypto.timingSafeEqual` с guard по длине (разная длина → false без throw), чтобы не утекало по таймингу.
- Rate-limit `register:${ip}` (5 / час) — главный барьер против перебора кода. Никогда не логировать значение кода/пароля.
- Ошибки нейтральные: неверный код → 403 «Неверный код церкви»; занятый логин → 409; выключено → 503.
- `/register` публичен (middleware защищает только `/dashboard` — проверено).
- **Out of scope (заметки на будущее):** CAPTCHA, ротация кода по расписанию, per-code (а не per-ip) лимиты. Сейчас достаточно rate-limit + ручная ротация секрета + возможность выключить флагом.

### Связь с исходным запросом про лендинг

Этот план закрывает исходное «замени CTA на „Зарегистрироваться“»: при включённой регистрации primary-CTA лендинга становится «Зарегистрироваться» → `/register`, а шаги «Как начать» переписываются под код церкви. При выключенной — graceful fallback на текущую invite-копию и «Получить доступ» (поддержка).

---

## Конвенции реализации

- **FSD / basePath = `/app`:** внутренняя навигация только `router.push('/register')` (Next сам подставит basePath); внешние ссылки (поддержка) — `<a href={SUPPORT_CONTACT} target="_blank" rel="noopener noreferrer">`.
- **Кнопки** — стиль из существующих landing-CTA (`cta.tsx`, inverse-pill); `data-*` атрибуты kebab-case по правилу проекта.
- **Auth-роуты** — `NextResponse.json({ error }, { status })`, zod-валидация, rate-limit на входе, structured `[scope]` логи.
- **Никаких новых зависимостей** — всё на текущем стеке (`crypto` — встроенный Node).

## Tasks

### Фаза 0 — backend-ядро (доступ + создание аккаунта)

- [x] **Задача 1 (#39).** `RegisterSchema` (zod) в `auth.schemas.ts` (login/displayName?/password/churchCode) + тип. Переиспользовать примитивы. Логирование: нет.
- [x] **Задача 2 (#40).** `src/lib/register-access.ts` — `isRegistrationOpen()` + `verifyChurchCode()` (timing-safe, guard по длине). Логи без значения кода. Логирование: standard.
- [x] **Задача 3 (#41).** `POST /api/auth/register` — rate-limit → zod → 503(выключено) → 403(код) → `createLocalUser` (409 на дубль) → `createSession`. `[register]` логи без PII. Runtime: Node.js (нужно для `crypto.timingSafeEqual`; опц. явный `export const runtime = 'nodejs'`). Зависит от #39, #40.

### Фаза 1 — публичный флаг + страница

- [x] **Задача 4 (#42).** `isRegisterEnabled()` в `shared/utils/constants.ts` (по образцу `isAIEnabled`). Логирование: нет.
- [x] **Задача 5 (#43).** `src/app/register/page.tsx` — форма (login, displayName?, password, confirm, churchCode) → `/api/auth/register`, success → `/dashboard`; при `!isRegisterEnabled()` — graceful-заглушка с поддержкой. БЕЗ authed-redirect (консистентно с `/login`). Зависит от #41, #42.
- [x] **Задача 5b (#51).** Перелинковка `/login ↔ /register`: на `/login` ссылка «Нет аккаунта? Зарегистрироваться» (gated `isRegisterEnabled()`, рядом с support-ссылкой), на `/register` — «Уже есть аккаунт? Войти». Зависит от #42, #43.

### Фаза 2 — интеграция с лендингом

- [x] **Задача 6 (#44).** `RegisterButton` в `cta.tsx` (→ `/register`, «Зарегистрироваться», inverse-pill). Логирование: нет.
- [x] **Задача 7 (#45).** Условный primary-CTA (`PrimaryCta`): `isRegisterEnabled()` ? RegisterButton : AccessButton — применить в `Hero.tsx` и `FinalCta.tsx`. Зависит от #42, #44.
- [x] **Задача 8 (#46).** `HowToStart.tsx` — шаги под код церкви при включённой регистрации, invite-fallback при выключенной. Зависит от #42, #44.

### Фаза 3 — конфиг и доки

- [x] **Задача 9 (#47).** `.env.local` (`REGISTER_CHURCH_CODE` — runtime; `NEXT_PUBLIC_REGISTER_ENABLED` — build-time инлайнинг, тоггл ⇒ пересборка образа) + выставить обе в prod-deploy env (docker compose) + `DESCRIPTION.md` (auth) + `AGENTS.md` (роут/endpoint). Логирование: нет.

### Фаза 4 — тесты

- [x] **Задача 10 (#48).** Unit: `auth.schemas.test.ts` (RegisterSchema) + новый `register-access.test.ts` (timing-safe verify, open/closed). Зависит от #39, #40.
- [x] **Задача 11 (#49).** API: `src/app/api/auth/register/route.test.ts` — 200+сессия / 403 / 503 / 409 / 400 / 429. Зависит от #41.
- [x] **Задача 12 (#50).** Обновить `src/app/page.test.tsx` — при `NEXT_PUBLIC_REGISTER_ENABLED=true` CTA «Зарегистрироваться» → /register, шаги по коду церкви. Зависит от #45, #46.

---

## Risks & Considerations

- **Утечка кода церкви** ⇒ открытая регистрация. Митигация: rate-limit, ручная ротация `REGISTER_CHURCH_CODE`, мгновенное отключение через `NEXT_PUBLIC_REGISTER_ENABLED=false` + снятие кода.
- **Нет email ⇒ нет self-service reset.** Сброс пароля остаётся через поддержку/invite (reset-токен). Это осознанный trade-off ради ФЗ-152.
- **Два флага рассинхронизированы** (`REGISTER_CHURCH_CODE` есть, а `NEXT_PUBLIC_REGISTER_ENABLED=false` или наоборот): UI покажет CTA, а роут вернёт 503 — или наоборот. Документировать в `.env.local`, что включать оба вместе. Роут — источник истины (защита есть всегда).
- **In-memory rate-limit** не делится между инстансами (как и сейчас). Для текущего single-server standalone ок.
- **Build-time флаг.** `NEXT_PUBLIC_REGISTER_ENABLED` инлайнится на этапе `next build` → включение/выключение через UI-флаг требует пересборки Docker-образа; `REGISTER_CHURCH_CODE` (runtime) можно менять без пересборки. Прод-переключение делать обоими: пересобрать с нужным публичным флагом + задать/снять секрет. Роут (503 без секрета) — защита, даже если UI-флаг рассинхронен.

## Commit Plan

| Чекпоинт | Задачи | Сообщение |
|---|---|---|
| 1 | 1–3 | `feat(auth): self-registration API via church code (schema, verify, route)` |
| 2 | 4–5, 5b | `feat(auth): /register page + public flag + login↔register cross-links` |
| 3 | 6–8 | `feat(landing): register CTA + church-code steps (conditional on flag)` |
| 4 | 9 | `chore(auth): env vars + docs for self-registration` |
| 5 | 10–12 | `test(auth): register schema/helper/route + landing smoke update` |
