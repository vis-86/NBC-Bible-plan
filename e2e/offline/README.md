# Offline E2E smoke (Playwright)

Регрессионный прогон офлайн-стабильности (`.ai-factory/plans/feature-offline-stability.md`, T9).
Проверяет реальный SW/кеш/outbox на локальном прод-билде — не заменяет unit-тесты
(`npm test`), а страхует поведение браузера, которое vitest+jsdom не воспроизводит.

## Предусловия

1. **Локальный прод-билд + static+bff топология** (dev-режим `next dev` не даёт
   стабильный SW; после T12 нет единого `next start` — static export и BFF это
   два отдельных процесса, как в проде nginx+bff, см. `deploy/Dockerfile`):
   ```bash
   npm run build                 # out/ + out/sw.js
   npm run bff:start &           # BFF на :3001 (нужны DIRECTUS_URL/DIRECTUS_ADMIN_TOKEN/SESSION_SECRET и т.д. — см. server/src/env.ts; для локального прогона источник — .env.local, экспортировать в shell перед запуском)
   npm run static:serve &        # отдаёт out/ + проксирует /app/api → :3001, см. scripts/static-serve.ts
   ```
   По умолчанию `static:serve` поднимается на `http://localhost:8080`, приложение —
   под basePath `/app` (`NEXT_PUBLIC_BASE_PATH`, см. `next.config.ts`).

2. **Тестовый аккаунт** — НЕ прод-креды приложения. Для прогона против прод-Directus
   используйте выделенный тестовый аккаунт (см. memory `prod-test-account` про
   `claude-offline-test` — создан специально для e2e/офлайн-проверок); для
   локального контура подойдёт любой рабочий аккаунт вашего dev-Directus.

3. **`.env.test`** в корне проекта (гитигнорится, `.env*` в `.gitignore`):
   ```
   E2E_TEST_LOGIN=<логин тестового аккаунта>
   E2E_TEST_PASSWORD=<пароль тестового аккаунта>
   # опционально, если сервер поднят не на дефолтном порту/хосте
   E2E_BASE_URL=http://localhost:8080
   ```

4. **Браузер Playwright** (один раз):
   ```bash
   npx playwright install chromium
   ```

## Запуск

```bash
npm run e2e:offline
```

Отдельный контур от `npm test` (vitest подхватывает только `src/**`, Playwright —
только `e2e/**`) — `npm run e2e:offline` никогда не запускается вместе с `npm test`.

## Автоматизированные сценарии

- `cold-offline-start.spec.ts` — визит офлайн посещённого маршрута (`/dashboard`)
  рендерит контент из кеша (`TodayReadingCard`), не offline-fallback и не белый экран.
- `offline-navigation.spec.ts` — офлайн-навигация между dashboard/read/songs через
  bottom nav, каждый раздел рендерит контент.
- `outbox-sync.spec.ts` — офлайн-переключение пункта чтения (`TodayReadingCard`
  checkbox) → optimistic UI → онлайн → health-gated replay outbox → после reload
  отметка подтверждена сервером. Гоняется на реальном аккаунте — восстанавливает
  исходное состояние пункта в конце теста.
- `cold-start-any-route.spec.ts` (T13) — killer-фича build-time precache: логин →
  дождаться SW ready + автозагрузки данных (T11) → офлайн → прямой `goto` на
  РАНЕЕ НЕ ПОСЕЩЁННЫЙ маршрут (`/dashboard/calendar`) → контент рендерится. При
  runtime-кеше (до T8) это не работало — маршрут появлялся в кеше только после
  первого онлайн-визита.
- `update-flow.spec.ts` (T13) — симулирует передеплой (дописывает байт в конец
  собранного `out/sw.js`, восстанавливает в конце теста) → `reg.update()` →
  тост «Доступна новая версия» (`[data-update-toast]`) → клик «Обновить» → reload →
  новая версия активна, старый precache-кеш удалён (ровно один `app-shell-precache-*`
  в `caches.keys()` после апдейта).

## Ручной чек-лист: деплой при открытой вкладке

Не автоматизируется (требует реального передеплоя между шагами). Прогонять перед
релизом, если менялся SW update flow (T1–T3):

1. Открыть приложение в браузере, дождаться `navigator.serviceWorker.ready`
   (SW взял страницу под контроль — Network/Application tab в DevTools).
2. Не закрывая вкладку, задеплоить новую версию (пересобрать образ/перезапустить
   контейнер так, чтобы изменился `NEXT_PUBLIC_APP_BUILD_TIME`, т.е. байты `sw.js`).
3. Вернуть вкладке фокус (переключиться на неё) или подождать до часа —
   `ServiceWorkerRegistrar` дергает `registration.update()` на `visibilitychange`
   и раз в час.
4. Убедиться: появляется тост «Доступна новая версия» с кнопкой «Обновить».
5. Нажать «Обновить» → приложение перезагружается на новой версии.
6. Проверить: **нет** белого экрана, **нет** reload-цикла (повторных перезагрузок
   подряд), приложение функционально после перезагрузки.
