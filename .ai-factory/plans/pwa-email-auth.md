# PWA + Email Auth + Push Notifications

**Branch:** `feature/pwa-email-auth`
**Created:** 2026-04-17
**Type:** Feature

## Settings

- **Tests:** yes (auth API endpoints, push endpoints)
- **Logging:** verbose (DEBUG-уровень для новых модулей)
- **Docs:** warn-only

---

## Архитектурные решения (Senior Architect Review)

### Контекст

Приложение работает как Telegram Mini App. Задача: сделать его автономным PWA с
email/password авторизацией и push-уведомлениями. Telegram авторизация остаётся
неизменной.

### Ключевые решения

#### 1. Регистрация (фикс критического бага)

**Проблема:** `/register/page.tsx` использует клиентский Directus SDK напрямую:
```ts
await directus.request(registerUser(email, password)); // ← открытый публичный клиент
await directus.login({ email, password }, ...);        // ← не создаёт наш httpOnly cookie
```
После регистрации пользователь НЕ авторизован в нашей системе (middleware его перенаправит на /login).

**Решение:** Создать `POST /api/auth/register` (server-side через admin token).
Паттерн: такой же как `/api/auth/telegram` — findOrCreate → createSession → httpOnly cookie.

#### 2. Сброс пароля (через Directus Flow)

Вместо n8n используем **Directus Flows** — всё хранится в одном месте (Directus Admin).

Flow: тип триггера **Webhook** (или **Event Hook** при создании записи в `password_reset_tokens`).

Архитектура:
1. Клиент → `POST /api/auth/password/request` с email
2. Сервер генерирует `crypto.randomBytes(32).toString('hex')` token
3. Сохраняет в Directus коллекцию `password_reset_tokens` (TTL 1 час)
4. Триггерит Directus Flow через REST API:
   ```ts
   // Directus Flow с Webhook-триггером принимает POST:
   fetch(`${DIRECTUS_URL}/flows/trigger/${DIRECTUS_FLOW_PASSWORD_RESET_ID}`, {
     method: 'POST',
     headers: { 'Content-Type': 'application/json' },
     // Flow с публичным триггером или Bearer admin token для приватного
     body: JSON.stringify({ email, name, resetLink })
   })
   ```
5. Directus Flow отправляет письмо через операцию **Send Email** (нужен SMTP в Directus)
   или через **Request** операцию (вызов Resend/Mailgun/SMTP2GO API — без SMTP в Directus)
6. Пользователь переходит по ссылке → `POST /api/auth/password/reset` с { token, newPassword }
7. Сервер проверяет token, обновляет пароль через admin API, помечает token использованным

**Что нужно создать в Directus Admin → Flows:**
- Триггер: Webhook (POST, публичный или с auth-токеном)
- Операция 1: Read Data → получить данные из payload (`{{$trigger.body}}`)
- Операция 2: Send Email (если SMTP настроен) ИЛИ Request (email provider API)
  ```
  To: {{$trigger.body.email}}
  Subject: Сброс пароля NBC Bible Plan
  Body: HTML-шаблон со ссылкой {{$trigger.body.resetLink}}
  ```

**Безопасность:**
- Token: 256-bit случайный hex (не JWT, нет необходимости в секрете)
- TTL: 1 час, одноразовый (поле `used: boolean`)
- Rate limiting: 3 запроса в час на email (будущее улучшение, помечено TODO)
- В ответе на /request всегда возвращать 200 (не раскрывать существование email)

#### 3. PWA с basePath=/app

**Проблема:** Next.js standalone + basePath=/app создаёт нюансы для SW и manifest.

**Решение:**
- Manifest: использовать Next.js App Router `src/app/manifest.ts` → генерирует
  `{basePath}/manifest.webmanifest` автоматически с правильным путём
- Service Worker: `@ducanh2912/next-pwa` версия 9+ поддерживает standalone + basePath
- SW регистрация: явно указать `{ scope: basePath || '/' }` при navigator.serviceWorker.register
- `start_url` в manifest: `process.env.NEXT_PUBLIC_BASE_PATH + '/dashboard'`

#### 4. Push уведомления

- **Протокол:** Web Push API (VAPID)
- **Хранение подписок:** Directus коллекция `push_subscriptions`
- **Ключи:** VAPID (генерируются один раз, хранятся в env)
- **Отправка:** Next.js API route `POST /api/push/send` (вызывается n8n-ом по расписанию)
- **Контент:** те же данные что в Telegram боте — список глав для чтения сегодня

n8n flow: существующий scheduler → `POST /api/push/send` → web-push → браузер

#### 5. Привязка email для Telegram-пользователей

Telegram-пользователи имеют фейковый email `{tg_id}@telegram.bot`.
В настройках профиля показываем раздел "Учётная запись":
- Если email оканчивается на `@telegram.bot` → показываем форму "Добавить email и пароль"
- После привязки → обновляем email и пароль через Directus admin API
- Пользователь может логиниться и через Telegram, и через email (оба метода работают)

#### 6. Сессионная модель (остаётся без изменений)

Существующий cookie-based session (30 дней) работает отлично для PWA.
При установке как PWA пользователь логинится один раз — сессия сохраняется.
Middleware и SessionData изменений не требуют.

---

## Новые Directus коллекции (только добавление)

### `password_reset_tokens`
| Поле | Тип | Параметры |
|------|-----|-----------|
| id | uuid | PK, auto |
| user_id | string | FK → directus_users.id |
| token | string | unique, indexed |
| expires_at | timestamp | |
| used | boolean | default: false |
| date_created | timestamp | auto |

### `push_subscriptions`
| Поле | Тип | Параметры |
|------|-----|-----------|
| id | uuid | PK, auto |
| user_id | string | FK → directus_users.id |
| endpoint | string | max 2048 |
| p256dh | string | Web Push key |
| auth | string | Web Push auth secret |
| user_agent | string | nullable |
| date_created | timestamp | auto |

---

## Новые переменные окружения

```bash
# Подпись/шифрование сессионного cookie (минимум 32 символа)
# Генерировать: openssl rand -hex 32
SESSION_SECRET=...

# Web Push / VAPID (генерируются один раз: npx tsx scripts/generate-vapid-keys.ts)
VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
VAPID_SUBJECT=mailto:admin@yourdomain.com

# Для forgot-password через Directus Flow
# UUID flow-а из Directus Admin → Flows → выбрать нужный flow → скопировать ID
DIRECTUS_FLOW_PASSWORD_RESET_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx

# Защита /api/push/send (генерировать случайный секрет: openssl rand -hex 32)
PUSH_SEND_SECRET=...

# URL приложения (для reset-ссылки в письме)
NEXT_PUBLIC_APP_URL=https://yourdomain.com
```

> `DIRECTUS_ADMIN_TOKEN` уже есть — используем его для вызова Flow-а на сервере.
> `DIRECTUS_FLOW_PASSWORD_RESET_ID` — UUID конкретного Flow (не секретный, но и публиковать не нужно).
> `SESSION_SECRET` — **обязателен в production**; запуск без него должен завершаться с ошибкой.

---

## Задачи

### Фаза 0: Security Foundation + Dev Infra (prerequisite для всего)

#### Задача 0: Session Signing, Test Infrastructure, Zod, Rate Limiter
**Файлы:**
- `src/lib/session.ts` ← ОБНОВИТЬ (iron-session: шифрование + подпись cookie)
- `src/lib/rate-limiter.ts` ← СОЗДАТЬ
- `src/lib/validators/auth.schemas.ts` ← СОЗДАТЬ (zod-схемы для auth)
- `src/lib/validators/push.schemas.ts` ← СОЗДАТЬ (zod-схемы для push)
- `vitest.config.ts` ← СОЗДАТЬ
- `src/test/setup.ts` ← СОЗДАТЬ (глобальный env-mock для тестов)
- `package.json` ← ОБНОВИТЬ (добавить vitest, @vitest/coverage-v8, iron-session, zod)
- `ENV_SETUP.md` ← добавить `SESSION_SECRET`

**Зависимости:**
```bash
npm install iron-session zod
npm install -D vitest @vitest/coverage-v8
```

---

**1. Session: переход на `iron-session` (encrypted + signed cookie)**

Текущая реализация хранит `JSON.stringify(userData)` в cookie без подписи — сессию можно подделать, `access_token` читается в открытом виде.

`iron-session` использует AES-256-CBC + HMAC-SHA256 под капотом (тот же формат что использует `next-iron-session`).

```ts
// src/lib/session.ts — обновлённая версия
import { sealData, unsealData } from 'iron-session';

export interface SessionData {
  directus_id: string;
  first_name: string;
  last_name?: string;
  username?: string;
  email?: string; // добавляем для link-email
  access_token?: string;
}

// Проверка наличия SESSION_SECRET при старте
if (!process.env.SESSION_SECRET) {
  throw new Error('SESSION_SECRET is not set. Cannot start without session security.');
}

const SESSION_OPTIONS = {
  password: process.env.SESSION_SECRET as string,
  ttl: SESSION_MAX_AGE, // iron-session использует ttl для дополнительной проверки
};

// createSession: теперь async (await sealData)
export async function createSession(userData: SessionData, response?: NextResponse): Promise<NextResponse>

// getSession: теперь async (await unsealData)
export async function getSession(): Promise<SessionData | null>

// getSessionFromRequest (для middleware): async
export async function getSessionFromRequest(request: NextRequest): Promise<SessionData | null>
```

> **Важно:** `createSession` становится `async`. Все вызывающие маршруты (T2, T3, login) обновляются с `await`.
> Существующий код Telegram auth также нужно обновить (добавить `await createSession(...)`).

---

**2. Rate Limiter (in-memory, подходит для single-server standalone)**

```ts
// src/lib/rate-limiter.ts
interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();

/**
 * Проверяет лимит.
 * @returns true — запрос разрешён, false — лимит превышен
 */
export function checkRateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || now > entry.resetAt) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }

  if (entry.count >= limit) return false;

  entry.count++;
  return true;
}

/** Возвращает заголовки X-RateLimit-* для ответа */
export function rateLimitHeaders(key: string, limit: number): Record<string, string> {
  const entry = store.get(key);
  const remaining = entry ? Math.max(0, limit - entry.count) : limit;
  const reset = entry ? Math.ceil(entry.resetAt / 1000) : 0;
  return {
    'X-RateLimit-Limit': String(limit),
    'X-RateLimit-Remaining': String(remaining),
    'X-RateLimit-Reset': String(reset),
  };
}
```

Применяется в:
- `POST /api/auth/register` — 5 запросов / час / IP
- `POST /api/auth/password/request` — 3 запроса / час / email + IP
- `POST /api/auth/login` (если существует) — 10 запросов / 15 мин / IP

Пример использования в route handler:
```ts
const ip = request.headers.get('x-forwarded-for') ?? 'unknown';
const allowed = checkRateLimit(`register:${ip}`, 5, 60 * 60 * 1000);
if (!allowed) {
  return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
}
```

---

**3. Zod-схемы для валидации API**

```ts
// src/lib/validators/auth.schemas.ts
import { z } from 'zod';

export const RegisterSchema = z.object({
  email: z.string().email('Некорректный email').max(255),
  password: z.string().min(8, 'Минимум 8 символов').max(128, 'Максимум 128 символов'),
});

export const PasswordRequestSchema = z.object({
  email: z.string().email('Некорректный email').max(255),
});

export const PasswordResetSchema = z.object({
  token: z.string().length(64, 'Некорректный токен'),
  newPassword: z.string().min(8, 'Минимум 8 символов').max(128, 'Максимум 128 символов'),
});

export const LinkEmailSchema = z.object({
  email: z.string().email('Некорректный email').max(255),
  password: z.string().min(8, 'Минимум 8 символов').max(128, 'Максимум 128 символов'),
  confirmPassword: z.string(),
}).refine(data => data.password === data.confirmPassword, {
  message: 'Пароли не совпадают',
  path: ['confirmPassword'],
});
```

```ts
// src/lib/validators/push.schemas.ts
import { z } from 'zod';

export const PushSubscribeSchema = z.object({
  endpoint: z.string().url().max(2048),
  p256dh: z.string().min(1).max(512),
  auth: z.string().min(1).max(256),
});

export const PushSendSchema = z.object({
  title: z.string().min(1).max(100),
  body: z.string().min(1).max(300),
  url: z.string().max(512).optional(),
  targetUserId: z.string().uuid().optional(),
});
```

Паттерн использования в route handler:
```ts
const body = await request.json();
const parsed = RegisterSchema.safeParse(body);
if (!parsed.success) {
  return NextResponse.json(
    { error: parsed.error.errors[0].message },
    { status: 400 }
  );
}
const { email, password } = parsed.data;
```

---

**4. Vitest: инфраструктура для тестов**

```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      include: ['src/app/api/**', 'src/lib/**'],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
```

```ts
// src/test/setup.ts
// Мок-переменные для всех тестов
process.env.SESSION_SECRET = 'test-secret-minimum-32-characters-exactly!!';
process.env.DIRECTUS_ADMIN_TOKEN = 'test-admin-token';
process.env.NEXT_PUBLIC_DIRECTUS_URL = 'http://localhost:8055';
process.env.NEXT_PUBLIC_BASE_PATH = '/app';
process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000';
process.env.DIRECTUS_FLOW_PASSWORD_RESET_ID = 'test-flow-uuid';
process.env.PUSH_SEND_SECRET = 'test-push-secret';
process.env.VAPID_PUBLIC_KEY = 'test-vapid-public';
process.env.VAPID_PRIVATE_KEY = 'test-vapid-private';
process.env.VAPID_SUBJECT = 'mailto:test@test.com';
```

`package.json` скрипты:
```json
"test": "vitest run",
"test:watch": "vitest",
"test:coverage": "vitest run --coverage"
```

---

**Тесты (T0 сам по себе):**
- `src/lib/rate-limiter.test.ts` — разрешает N запросов, блокирует N+1, сбрасывает окно
- `src/lib/validators/auth.schemas.test.ts` — валидные и невалидные данные для каждой схемы

---

### Фаза 1: Инфраструктура (prerequisite)

#### Задача 1: Directus Schema + VAPID Setup
**Файлы:**
- `scripts/generate-vapid-keys.ts` (или документация)
- `ENV_SETUP.md` — добавить новые переменные
- Создать коллекции в Directus Admin UI (задокументировать шаги)
- `src/lib/push-service.ts` — skeleton с web-push init

**Детали:**
1. Задокументировать создание `password_reset_tokens` коллекции в Directus Admin
2. Задокументировать создание `push_subscriptions` коллекции в Directus Admin
3. Создать скрипт `scripts/generate-vapid-keys.ts`:
   ```ts
   // npx tsx scripts/generate-vapid-keys.ts
   import webpush from 'web-push';
   const vapidKeys = webpush.generateVAPIDKeys();
   console.log('VAPID_PUBLIC_KEY=', vapidKeys.publicKey);
   console.log('VAPID_PRIVATE_KEY=', vapidKeys.privateKey);
   ```
4. Добавить в `ENV_SETUP.md` описание всех новых env vars
5. Создать `src/lib/push-service.ts` с инициализацией web-push из env
6. Добавить `web-push` в зависимости: `npm install web-push @types/web-push`

**Logging:** DEBUG при инициализации web-push (наличие VAPID ключей)

---

### Фаза 2: Auth Backend Fixes

#### Задача 2: Исправить Регистрацию (Server-side API)
**Файлы:**
- `src/app/api/auth/register/route.ts` ← СОЗДАТЬ
- `src/app/register/page.tsx` ← ПЕРЕПИСАТЬ
- `src/lib/directus-user.ts` ← добавить `createEmailUser()`
- `src/app/api/auth/register/route.test.ts` ← СОЗДАТЬ (тесты)

**Детали API:**
```
POST /api/auth/register
Body: { email, password }
Response: { success: true, user: { directus_id, first_name, ... } }
```

В начале route handler — rate limiting и zod:
```ts
// 1. Rate limiting
const ip = request.headers.get('x-forwarded-for') ?? 'unknown';
if (!checkRateLimit(`register:${ip}`, 5, 60 * 60 * 1000)) {
  return NextResponse.json({ error: 'Слишком много попыток. Подождите час.' }, { status: 429 });
}

// 2. Zod validation
const body = await request.json();
const parsed = RegisterSchema.safeParse(body);
if (!parsed.success) {
  return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
}
const { email, password } = parsed.data;
```

Логика `createEmailUser()` в `directus-user.ts`:
1. Проверить: email не оканчивается на `@telegram.bot` (400)
2. Через admin API проверить уникальность email (readUsers с filter)
3. Если email занят → 409 Conflict
4. Создать пользователя в Directus через admin API:
   ```ts
   createUser({
     email,
     password,
     role: readerRoleId,  // та же роль "Чтец"
     first_name: '',      // пустое — пользователь заполнит в профиле
     status: 'active',
   })
   ```
5. Вернуть directus_id

После createUser → вызвать Directus `/auth/login` для получения access_token
→ `await createSession(...)` (теперь async из-за iron-session)

**Fix register/page.tsx:**
- Убрать весь клиентский Directus SDK код
- Использовать `fetch(getApiPath('/api/auth/register'), { method: 'POST', ... })`
- После успешной регистрации → fetch `/api/auth/session` → проверить → router.push('/dashboard')

**Тесты (Jest или Vitest):**
- Успешная регистрация нового пользователя
- Конфликт: email уже занят → 409
- Невалидный email → 400
- Короткий пароль → 400
- Mock Directus admin client

**Logging (DEBUG):**
- `[register] Attempting to create user for email: ${email.split('@')[0]}***`
- `[register] User created in Directus: ${directusId}`
- `[register] Session created, redirecting to dashboard`

---

#### Задача 3: Forgot Password Backend (Directus Flow)
**Файлы:**
- `src/app/api/auth/password/request/route.ts` ← СОЗДАТЬ
- `src/app/api/auth/password/reset/route.ts` ← СОЗДАТЬ
- `src/lib/password-reset.ts` ← СОЗДАТЬ (token generation, validation)
- `src/app/api/auth/password/request/route.test.ts`
- `src/app/api/auth/password/reset/route.test.ts`

**`src/lib/password-reset.ts`:**
```ts
// Генерация токена
export function generateResetToken(): string {
  return crypto.randomBytes(32).toString('hex'); // 256-bit
}

// Создание записи в Directus (createItem)
export async function createPasswordResetToken(userId: string, token: string): Promise<void>

// Проверка токена (readItems по token)
// Возвращает userId или null (если не найден/использован/истёк)
export async function validatePasswordResetToken(token: string): Promise<string | null>

// Пометить токен использованным
export async function invalidateResetToken(token: string): Promise<void>
```

**`POST /api/auth/password/request`:**
```
Body: { email }
Response: 200 ВСЕГДА (не раскрываем существование email)
```
В начале handler — rate limiting и zod:
```ts
// Rate limit: 3 запроса / час на email + IP (двойной ключ)
const body = await request.json();
const parsed = PasswordRequestSchema.safeParse(body);
if (!parsed.success) {
  return NextResponse.json({}, { status: 200 }); // silent — не раскрываем даже ошибку
}
const { email } = parsed.data;
const ip = request.headers.get('x-forwarded-for') ?? 'unknown';
// Проверяем оба ключа — по email И по IP
if (!checkRateLimit(`pwd-request:email:${email}`, 3, 60 * 60 * 1000) ||
    !checkRateLimit(`pwd-request:ip:${ip}`, 10, 60 * 60 * 1000)) {
  return NextResponse.json({}, { status: 200 }); // silent — не раскрываем лимит
}
```

1. Найти пользователя по email через admin API
2. Если не найден → return 200 (silent fail)
3. Если email оканчивается на `@telegram.bot` → return 200 (нет реального email)
4. generateResetToken() + createPasswordResetToken()
5. Триггернуть Directus Flow:
   ```ts
   const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '/app';
   const resetLink = `${process.env.NEXT_PUBLIC_APP_URL}${basePath}/reset-password?token=${token}`;
   
   await fetch(
     `${process.env.NEXT_PUBLIC_DIRECTUS_URL}/flows/trigger/${process.env.DIRECTUS_FLOW_PASSWORD_RESET_ID}`,
     {
       method: 'POST',
       headers: {
         'Content-Type': 'application/json',
         // Если Flow приватный — передать admin token
         'Authorization': `Bearer ${process.env.DIRECTUS_ADMIN_TOKEN}`,
       },
       body: JSON.stringify({
         email: user.email,
         name: user.first_name || user.email.split('@')[0],
         resetLink,
       }),
     }
   );
   ```
6. Logging DEBUG: `[password-reset] Reset token created for user ${userId}, Directus Flow triggered`

**`POST /api/auth/password/reset`:**
```
Body: { token, newPassword }
Response: { success: true } или { error }
```
1. Zod: `PasswordResetSchema.safeParse(body)` — token.length === 64, password 8–128 символов
2. validatePasswordResetToken(token) → userId или null
3. Если null → 400 "Ссылка недействительна или истекла"
4. Обновить пароль через admin API: `updateUser(userId, { password: newPassword })`
5. invalidateResetToken(token)
6. Logging DEBUG: `[password-reset] Password updated for user ${userId}`

**Тесты:**
- /request: email существует → Directus Flow вызван (mock fetch), 200
- /request: email не существует → 200 (silent, Flow НЕ вызван)
- /request: `@telegram.bot` email → 200 (silent)
- /reset: валидный token → пароль обновлён, token инвалидирован
- /reset: истёкший token → 400
- /reset: уже использованный token → 400
- /reset: слабый пароль → 400

---

### Фаза 3: PWA

#### Задача 4: PWA Setup (Manifest + Service Worker)
**Файлы:**
- `src/app/manifest.ts` ← СОЗДАТЬ (Next.js App Router built-in)
- `public/icons/` ← СОЗДАТЬ иконки (192x192, 512x512, apple-touch-icon 180x180)
- `next.config.ts` ← ОБНОВИТЬ (подключить @ducanh2912/next-pwa)
- `src/app/layout.tsx` ← ОБНОВИТЬ (PWA meta tags)
- `src/hooks/usePWAInstall.ts` ← СОЗДАТЬ (install prompt)
- `public/sw.js` ← создаётся автоматически next-pwa

**Установка:**
```bash
npm install @ducanh2912/next-pwa
```

**`src/app/manifest.ts`:**
```ts
import type { MetadataRoute } from 'next'
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '/app'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'NBC Bible Plan',
    short_name: 'Bible Plan',
    description: 'Структурированный план чтения Библии',
    start_url: `${basePath}/dashboard`,
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#your-primary-color',
    orientation: 'portrait-primary',
    icons: [
      { src: `${basePath}/icons/icon-192.png`, sizes: '192x192', type: 'image/png' },
      { src: `${basePath}/icons/icon-512.png`, sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
    ],
  }
}
```

**`next.config.ts` с PWA:**
```ts
import withPWAInit from '@ducanh2912/next-pwa'

const withPWA = withPWAInit({
  dest: 'public',
  scope: process.env.NEXT_PUBLIC_BASE_PATH || '/app',
  sw: 'sw.js',
  disable: process.env.NODE_ENV === 'development',
  cacheOnFrontEndNav: true,
  aggressiveFrontEndNavCaching: true,
})

export default withPWA(nextConfig)
```

**Service Worker дополнения (custom SW):**
- Обработка push-событий (phase 4)

> Offline-кеширование API ответов — вне scope этого плана (отдельная задача при необходимости).

**`src/app/layout.tsx` дополнения:**
```tsx
<link rel="manifest" href={`${basePath}/manifest.webmanifest`} />
<meta name="theme-color" content="#your-color" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-status-bar-style" content="default" />
<meta name="apple-mobile-web-app-title" content="Bible Plan" />
<link rel="apple-touch-icon" href={`${basePath}/icons/apple-touch-icon.png`} />
```

**`src/hooks/usePWAInstall.ts`:**
- Хук для `beforeinstallprompt` event
- `canInstall: boolean`, `install: () => void`
- Использовать в шапке/настройках для кнопки "Установить приложение"

**Тестирование в dev:**
- `npm run build && npm start` (SW не работает в dev mode)
- Chrome DevTools → Application → Service Workers

**Logging в SW:**
```js
self.addEventListener('install', () => console.log('[SW] Installing'));
self.addEventListener('activate', () => console.log('[SW] Activated'));
self.addEventListener('fetch', (e) => console.debug('[SW] Fetch:', e.request.url));
```

---

### Фаза 4: Push Notifications Backend

#### Задача 5: Push Notifications API
**Файлы:**
- `src/lib/push-service.ts` ← ДОПОЛНИТЬ (sendPushNotification, sendToUser)
- `src/app/api/push/subscribe/route.ts` ← СОЗДАТЬ
- `src/app/api/push/send/route.ts` ← СОЗДАТЬ (защищённый, для n8n)
- `src/app/api/push/vapid-public-key/route.ts` ← СОЗДАТЬ
- `src/app/api/push/subscribe/route.test.ts`

**`src/lib/push-service.ts`:**
```ts
import webpush from 'web-push';

// Инициализация при старте
webpush.setVapidDetails(
  process.env.VAPID_SUBJECT!,
  process.env.VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!,
);

export interface PushSubscriptionData {
  endpoint: string;
  p256dh: string;
  auth: string;
}

// Сохранить подписку в Directus
export async function saveSubscription(userId: string, sub: PushSubscriptionData, userAgent?: string): Promise<void>

// Удалить подписку (по endpoint)
export async function removeSubscription(userId: string, endpoint: string): Promise<void>

// Отправить push одному пользователю (все его устройства)
export async function sendPushToUser(userId: string, payload: PushPayload): Promise<void>

// Отправить push всем подписчикам (для ежедневных уведомлений)
export async function sendPushToAll(payload: PushPayload): Promise<void>

export interface PushPayload {
  title: string;
  body: string;
  url?: string;  // куда открыть при клике
  icon?: string;
}
```

**`POST /api/push/subscribe`:**
```
Auth: требует сессию (пользователь должен быть залогинен)
Body: { endpoint, p256dh, auth }
Response: { success: true }
```
- Zod: `PushSubscribeSchema.safeParse(body)` — невалидный endpoint → 400
- `getSession()` → userId (если null → 401)
- Upsert логика: при повторной подписке с тем же `user_id` обновлять запись, а не дублировать
- `saveSubscription(userId, { endpoint, p256dh, auth }, userAgent)`
- DEBUG: `[push] Subscription saved for user ${userId}, endpoint: ${endpoint.slice(0, 30)}...`

**`DELETE /api/push/subscribe`:**
```
Body: { endpoint }
Response: { success: true }
```
- removeSubscription(userId, endpoint)

**`GET /api/push/vapid-public-key`:**
```
Response: { publicKey: process.env.VAPID_PUBLIC_KEY }
```
- Публичный эндпоинт (publicKey не секретный)

**`POST /api/push/send`:** (защищённый, вызывается Directus Flow / n8n)
```
Headers: Authorization: Bearer ${PUSH_SEND_SECRET}
Body: { title, body, url?, targetUserId? }
Response: { sent: number, failed: number }
```
- Защита: проверить `Authorization: Bearer` с `PUSH_SEND_SECRET`; несовпадение → 401
- Zod: `PushSendSchema.safeParse(body)` → невалидные данные → 400
- Если `targetUserId` → sendPushToUser
- Если нет → sendPushToAll
- DEBUG: `[push] Sending to ${count} subscriptions`

**Directus Flow интеграция (daily push):**
```
Создать Directus Flow:
  Триггер: Schedule (cron, например каждый день в 8:00)
  Операция: Request
    URL: POST {APP_URL}/api/push/send
    Headers: Authorization: Bearer PUSH_SEND_SECRET
    Body: {
      "title": "Чтение сегодня",
      "body": "Откройте приложение, чтобы увидеть план на сегодня",
      "url": "/dashboard"
    }
```

> **Примечание:** Если уже есть Directus Flow для Telegram-уведомлений — добавить
> операцию `Request → /api/push/send` как параллельную ветку в существующий Flow.

**Обработка push в Service Worker** (добавить в custom SW):
```js
self.addEventListener('push', (event) => {
  const data = event.data.json();
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/icons/icon-192.png',
      data: { url: data.url },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/dashboard';
  event.waitUntil(clients.openWindow(url));
});
```

**Тесты:**
- subscribe: авторизованный пользователь → подписка сохранена
- subscribe: неавторизованный → 401
- /send: неверный PUSH_SEND_SECRET → 401
- /send: без targetUserId → sendToAll вызван

---

### Фаза 5: Profile & Settings

#### Задача 6: Email Linking API + Profile Settings UI
**Файлы:**
- `src/app/api/user/auth-info/route.ts` ← СОЗДАТЬ
- `src/app/api/user/link-email/route.ts` ← СОЗДАТЬ
- `src/app/dashboard/settings/page.tsx` ← ОБНОВИТЬ
- `src/features/settings/components/AccountSection.tsx` ← СОЗДАТЬ
- `src/features/settings/components/LinkEmailForm.tsx` ← СОЗДАТЬ
- `src/features/settings/components/PushNotificationsToggle.tsx` ← СОЗДАТЬ

**`GET /api/user/auth-info`:**
```
Response: {
  email: string,
  isEmailReal: boolean,  // false если @telegram.bot
  hasTelegramLinked: boolean,
  displayName: string
}
```
- getSession() → userId
- Получить email из Directus (readUser)
- `isEmailReal = !email.endsWith('@telegram.bot')`

**`PATCH /api/user/link-email`:**
```
Body: { email, password, confirmPassword }
Response: { success: true } | { error }
```
1. Zod: `LinkEmailSchema.safeParse(body)` — email format, password 8–128, confirmPassword match
2. getSession() → userId
3. Получить текущий пользователь из Directus
4. Проверить: текущий email оканчивается на `@telegram.bot` (иначе 400 — уже привязан)
5. Проверить уникальность нового email (readUsers с filter email = newEmail, не наш userId)
6. Если занят → 409
7. updateUser(userId, { email, password }) через admin API
8. Обновить сессию через `await createSession({ ...session, email })` — добавить поле `email` в `SessionData` (T0 уже добавляет это поле)
9. DEBUG: `[link-email] Email linked for user ${userId}`

**`src/app/dashboard/settings/page.tsx` обновления:**

Добавить два новых раздела под темой:

**Раздел "Учётная запись"** (через `AccountSection`):
- Показывает email пользователя
- Если `!isEmailReal` → показывает `LinkEmailForm`
- Если `isEmailReal` → показывает "Email: {email}" + "Изменить пароль" (future)

**Раздел "Уведомления"** (через `PushNotificationsToggle`):
- Toggle "Получать уведомления о ежедневном чтении"
- При включении → запрос Permission → subscribe → POST /api/push/subscribe
- При выключении → DELETE /api/push/subscribe
- Показывать только если `'serviceWorker' in navigator && 'PushManager' in window`

**`LinkEmailForm` компонент:**
```tsx
// Форма с полями: email, password, confirm_password
// Валидация на клиенте: email формат, пароль >= 8 символов, совпадение
// После успеха: показать "Email привязан ✓" + обновить UI
// Error states: email занят, серверная ошибка
```

**`PushNotificationsToggle` компонент:**
```tsx
// usePushNotifications hook:
//   - isSubscribed: boolean (проверить существующую подписку)
//   - isSupported: boolean
//   - toggle: () => Promise<void>
//   - permissionState: 'default' | 'granted' | 'denied'
// 
// UI: Switch toggle + статусный текст
// Если permission denied → объяснение как включить в браузере
```

**`src/hooks/usePushNotifications.ts`:**
```ts
// 1. Проверить SW registration
// 2. Получить VAPID public key от /api/push/vapid-public-key
// 3. Подписаться: pushManager.subscribe({ userVisibleOnly: true, applicationServerKey })
// 4. Отправить подписку на сервер: POST /api/push/subscribe
// 5. Хранить состояние: localStorage 'push-subscribed'
```

---

### Фаза 6: Frontend Завершение

#### Задача 7: Forgot Password Pages + PWA Install UX
**Файлы:**
- `src/app/forgot-password/page.tsx` ← СОЗДАТЬ
- `src/app/reset-password/page.tsx` ← СОЗДАТЬ
- `src/app/login/page.tsx` ← ОБНОВИТЬ (добавить ссылку "Забыли пароль?")
- `src/shared/components/layout/InstallPWABanner.tsx` ← СОЗДАТЬ (optional)

**`/forgot-password/page.tsx`:**
```
- Поле email
- Кнопка "Отправить инструкции"
- POST /api/auth/password/request
- После отправки: "Если email зарегистрирован, инструкции отправлены"
  (не раскрываем существование email)
- Ссылка "Вернуться к входу"
```

**`/reset-password/page.tsx`:**
```
- Получить ?token из searchParams
- Если нет token → redirect /forgot-password
- Поля: новый пароль + подтверждение
- POST /api/auth/password/reset с { token, newPassword }
- Успех → redirect /login с сообщением "Пароль изменён"
- Ошибка (истёкший token) → показать сообщение + ссылку повторить
```

**Обновление `/login/page.tsx`:**
```tsx
// Добавить под формой:
<Link href="/forgot-password" className="text-sm text-app-text-muted hover:underline">
  Забыли пароль?
</Link>
```

**`InstallPWABanner` (опционально):**
```tsx
// Использует usePWAInstall hook
// Показывает banner "Установить приложение" если canInstall && !dismissed
// localStorage 'pwa-install-dismissed' для скрытия
// Размещение: над DashboardLayout или в шапке
```

---

## Commit Plan

| Коммит | Задачи | Сообщение |
|--------|--------|-----------|
| 0 | T0 | `feat: add iron-session signing, zod validation, vitest setup, rate limiter` |
| 1 | T1 | `feat: add push_subscriptions & password_reset_tokens schema, VAPID setup` |
| 2 | T2 | `fix: secure registration via server-side API, fix async session creation` |
| 3 | T3 | `feat: forgot/reset password flow via Directus Flow` |
| 4 | T4 | `feat: PWA manifest, service worker, iOS meta tags` |
| 5 | T5 | `feat: push notifications backend (VAPID, subscribe/send APIs)` |
| 6 | T6 | `feat: email linking for Telegram users, push toggle in settings` |
| 7 | T7 | `feat: forgot-password pages, reset-password page, PWA install UX` |

---

## Порядок выполнения

```
T0 (security foundation: iron-session + zod + vitest + rate limiter)
  ↓
T1 (Directus schema + VAPID setup)
  ↓
T2 (register fix) ←→ T4 (PWA) — можно параллельно
  ↓                    ↓
T3 (forgot pwd)   T5 (push backend)
  ↓                    ↓
            T6 (profile UI) ← зависит от T2, T5
                ↓
            T7 (forgot pages + UX polish)
```

> **T0 обязателен первым:** все последующие задачи используют `RegisterSchema`, `checkRateLimit`, `await createSession(...)` и запускают тесты через vitest.

---

## Зависимости и Prerequisites

Перед T0:
- Сгенерировать `SESSION_SECRET`: `openssl rand -hex 32` → добавить в `.env`

Перед T1:
- Доступ к Directus Admin для создания коллекций
- Настроить SMTP / email-провайдер в Directus (для операции Send Email в Flow)

Перед T4:
- Иконки приложения (192x192, 512x512 PNG) — итоговые иконки, не временные заглушки

Перед T5:
- Выполнить `npx tsx scripts/generate-vapid-keys.ts` и добавить ключи в .env

Перед T6 (продакшн):
- Убедиться, что Directus Flow настроен как **приватный** (требует Authorization-заголовок)
- Протестировать SW в production build (`npm run build && npm start`)

---

## Безопасность (чеклист)

- [x] Регистрация через server-side admin API (не публичный клиент)
- [x] Session cookie: httpOnly + encrypted + signed через iron-session (T0)
- [x] SESSION_SECRET: проверка наличия при старте приложения; запуск без него — ошибка (T0)
- [x] Zod-валидация на всех auth/push API endpoints (T0 + T2 + T3 + T5 + T6)
- [x] Rate limiting: register (5/час/IP), password/request (3/час/email + 10/час/IP) (T0 + T2 + T3)
- [x] Password: минимум 8, максимум 128 символов (защита от bcrypt DoS) (T0 zod schemas)
- [x] Reset token: 256-bit random hex, TTL 1 час, одноразовый
- [x] /password/request: silent fail для несуществующих email; rate limit также silent
- [x] /push/send: защита Bearer token (PUSH_SEND_SECRET)
- [x] Directus Flow для email: настраивается как приватный (требует auth-заголовок)
- [x] Telegram auth: без изменений
- [x] VAPID private key: server-side only (не NEXT_PUBLIC_*)
- [x] Email linking: zod-валидация + проверка уникальности перед обновлением
- [x] first_name при регистрации: пустая строка (не email.split('@')[0])
