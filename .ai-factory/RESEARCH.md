# Research

Updated: 2026-06-29 23:32
Status: active

## Active Summary (input for /aif-plan)
<!-- aif:active-summary:start -->
Topic: Аутентификация и регистрация для PWA вне Telegram (Telegram заблокирован в РФ).

Goal: Сделать приложение доступным как PWA без Telegram, с простой регистрацией,
псевдонимно (минимум проблем с ФЗ-152). Telegram mini-app остаётся вторичным каналом
для пользователей через VPN — там вход без ввода логина/пароля через привязку tg-аккаунта.

Constraints:
- Закрытый узкий круг (community НБЦ) — все участники известны лично.
- Сервер в РФ → локализация ПД (ФЗ-152 ст.18 ч.5) выполнена.
- Псевдонимная модель (логин/имя + пароль, без email/телефона/ФИО) → обязательства
  оператора ПД почти нулевые. Подсказка в форме «не вводите настоящее имя/телефон».
- Переиспользовать существующий код по максимуму.

Существующий фундамент (в коде уже есть):
- Идентичность = Directus users + коллекция `telegram_user_mapping` (tg_id → directus_user_id).
- Синтетические email уже используются (Telegram-юзеры: `{id}@telegram.bot`).
- `/api/auth/login` — нативный Directus `/auth/login` (email+password) → сессия.
- `/api/auth/telegram` — verify initData → findOrCreateUser → сессия.
- `/login` page + middleware-guard на `/dashboard`.
- Сессия = self-rolled httpOnly cookie `bible-plan-session` = НЕПОДПИСАННЫЙ JSON
  {directus_id, name, [access_token]}. Lucia в deps, но фактически НЕ используется.
- PWA — greenfield (нет manifest/SW). basePath = `/app`.

Decisions (зафиксировано):
- Канонический аккаунт = invite + password на вебе. ЕДИНСТВЕННЫЙ источник создания аккаунтов.
- Telegram mini-app — только ПРИВЯЗКА к существующему аккаунту (не создаёт аккаунты).
- ВАРИАНТ 1 ВЫБРАН: все заводятся через invite на вебе (веб работает без Telegram).
  Мини-апп только привязывает tg_id к существующему directus_user. Дублей нет by design.
- ОТКЛОНЕНО: выдуманный логин (проблема «забыл логин» = мёртвый аккаунт), секретное слово
  (лишнее поле/флоу), публичная self-service регистрация (abuse-surface), Telegram Login
  Widget на вебе (Telegram заблокирован в РФ), полный переход на Lucia (избыточно сейчас).

Целевая модель:
- ВЕБ/PWA (основной): invite-ссылка (подписанный одноразовый токен с TTL) → задать пароль
  (+ отображаемое имя) → вход через существующий /api/auth/login.
  ТА ЖЕ подписанная ссылка = механизм сброса пароля (онбординг и recovery — один флоу).
- TELEGRAM MINI-APP (вторично, VPN): initData → если tg_id есть в mapping → авто-вход без
  логина/пароля; если нет → «Привязать аккаунт»: ввести login+password ОДИН раз → вставить
  строку mapping (tg_id → существующий directus_user) → дальше всегда авто-вход.
- КРИТИЧНО: убрать авто-создание юзера в findOrCreateUser при неизвестном initData
  (иначе дубли: веб-аккаунт A + tg-аккаунт B с раздельным прогрессом).
- Подписать session-cookie HMAC серверным секретом (раз появляются пароли; подделка
  directus_id в неподписанном JSON = захват аккаунта). Убрать Directus access_token из cookie.

Open questions:
- Где живёт `login`: как Directus email `{login}@local` (переиспользует /api/auth/login)
  или как отдельное поле + uuid-email. Решить на этапе плана.
- Генерация invite-ссылок на старте: руками через Directus admin (0 кода) vs кастомная
  кнопка «сгенерировать invite». MVP — можно через Directus admin.
- Удаление аккаунта (право на забвение) — простое при псевдонимной модели, добавить.
- PWA manifest/SW: учесть basePath `/app` в scope/start_url; iOS standalone — server-set
  httpOnly cookie НЕ под 7-дневным лимитом ITP, сессии переживут.

Success signals:
- Регистрация без формы-выдумки: открыл invite-ссылку → задал пароль → работает на всех
  устройствах. 1 действие.
- VPN-юзер в мини-аппе: после однократной привязки входит без логина/пароля.
- Нет дублей аккаунтов. Нет хранения email/телефона/ФИО → ФЗ-152 практически вне игры.
- Session-cookie подписан, подделка directus_id невозможна.

Next step: /aif-plan — спланировать invite+password флоу (set-password по подписанной
ссылке = регистрация и сброс), привязку Telegram в мини-аппе, отключение авто-создания
юзеров, подпись session-cookie.
<!-- aif:active-summary:end -->

## Sessions
<!-- aif:sessions:start -->
### 2026-06-29 23:32 — PWA-аутентификация вне Telegram: invite+password (Вариант 1)
What changed:
- Прошли от «логин+пароль+секретное слово» к простой модели: invite+password как
  единственный источник аккаунтов, Telegram mini-app — только привязка.
- Зафиксирован ВАРИАНТ 1: все аккаунты заводятся через invite на вебе; мини-апп только
  привязывает tg_id к существующему юзеру → дублей нет by design.
- Telegram заблокирован в РФ → на вебе от Telegram уходим полностью; mini-app = вторичный
  канал для VPN-пользователей с авто-входом после привязки.
- Сервер в РФ → локализация ФЗ-152 выполнена; псевдонимная модель (без email/телефона/ФИО)
  → обязательства оператора почти нулевые.

Key notes:
- Переиспользование: `/api/auth/login` (Directus password auth) почти как есть; синтетические
  email уже в ходу; `telegram_user_mapping` остаётся, привязка = вставка строки на сущ. юзера.
- КРИТИЧНО: убрать авто-создание в findOrCreateUser при неизвестном initData (иначе дубли).
- Один механизм set-password по подписанной ссылке = и онбординг, и сброс пароля.
- Подписать session-cookie HMAC; убрать Directus access_token из cookie. Lucia пока не нужна.
- PWA — greenfield, учесть basePath `/app`.

Links (paths):
- src/lib/directus-user.ts (findOrCreateUser, telegram_user_mapping)
- src/lib/session.ts (self-rolled cookie, нужно подписать)
- src/app/api/auth/login/route.ts (Directus password auth — переиспользуем)
- src/app/api/auth/telegram/route.ts (initData verify)
- src/middleware.ts (guard /dashboard), next.config.ts (basePath /app)
<!-- aif:sessions:end -->
