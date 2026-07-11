---
alwaysApply: true
---
# NBC Bible Plan — правила разработки

Источники истины (не дублировать сюда — читать оттуда):

- **AGENTS.md** (корень) — карта проекта: структура, стек, ключевые файлы, дизайн-токены, правила для агентов.
- **CLAUDE.md** (корень) — операционные инварианты: static export без серверного рантайма, Hono BFF, offline-first, auth/Directus, команды и верификация.
- **.ai-factory/rules/base.md** — конвенции кода (нейминг, FSD, data-атрибуты, offline read-path parity).

Критический минимум:

- `output: 'export'` — НИКАКИХ `src/app/api/**`, `middleware.ts`, Server Actions, динамических `[slug]`-сегментов. Весь API — Hono-роуты в `server/src/routes/*`.
- FSD: импорты только вниз `app → features → shared`; между фичами не импортировать.
- **Offline-first по умолчанию**: всё новое обязано работать офлайн (read-through + IDB, записи через outbox, новые маршруты в `APP_SHELL_ROUTES`).
- Клиентские URL — только через `getApiPath()`; Directus с клиента — только через прокси `{basePath}/api/directus/*`; `DIRECTUS_ADMIN_TOKEN` — server-only.
- UI — только токены `bg-app-*`/`text-app-*`/`border-app-*`/`shadow-app-*`, без хардкод-шейдов и `dark:`-вариантов.
