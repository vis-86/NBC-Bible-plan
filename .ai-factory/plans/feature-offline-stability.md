# Offline Stability (вариант A+): SW update flow, guards, health-gated sync

Branch: `feature/offline-stability`
Created: 2026-07-08
Base: `main` (a6a2641)

## Settings

- Testing: **yes** — Vitest на новую логику; существующий сьют обязан оставаться зелёным
- Logging: **verbose** — console.debug с префиксами `[SW]`, `[ChunkGuard]`, `[offline/sync]`, `[UpdateToast]`, `[api]`
- Docs: **yes** — обязательный docs-чекпоинт (nginx headers и update flow меняют деплой-процедуру)
- Executor: **Sonnet 5** — таски написаны максимально эксплицитно (файлы, команды, критерии); не отступать от описаний, не расширять скоуп

## Scope decision

Игорь выбрал **вариант A+ (стабилизация без Hono)**: закрыть чек-лист production-практик на ТЕКУЩЕЙ архитектуре (standalone Next, кастомный SW). Миграция на static export + Hono BFF (вариант B) — отдельная будущая итерация; весь код этого плана (update flow, guards, health-gate) переживает её без изменений.

Уже сделано в v1 (НЕ переделывать): lie-fi race (`NAV_TIMEOUT_MS=4s` в SW, `raceWithTimeout` 6s в read-through/auth), last-known-user fallback (`AuthProvider`), 401-vs-network в `client.ts` (T6 — только аудит + регрессионные тесты).

## Research Context (из .ai-factory/RESEARCH.md, Active Summary)

- Боль: белые экраны от случайных загрузок — (а) деплой при открытой вкладке → старый HTML просит исчезнувшие чанки (ChunkLoadError); (б) skipWaiting-на-install → mid-session захват SW; (в) lie-fi → зависшие фетчи; (г) сваливание network error в 401 → logout в метро.
- Update flow паттерн: новый SW ждёт → `registration.waiting` → toast «Доступна новая версия — Обновить» → `postMessage('SKIP_WAITING')` → `controllerchange` → reload. `registration.update()` на visibilitychange уже есть.
- Триггер синка outbox = `online` + успешный ping `/api/health`, не голое событие `online`.
- ChunkLoadError-guard: auto-reload-once с cooldown (п.7 чек-листа, добавлен 2026-07-08).
- Опора: Jake Archibald «The Offline Cookbook»; грабли `.toString()`-сериализации SW задокументированы в src/sw/sw-source.ts — тела функций SW не должны ссылаться на внешние замыкания.

## Ключевые файлы

| Область | Файлы |
|---|---|
| SW | `src/sw/sw-source.ts` (+tests), `src/app/sw.js/route.ts` |
| Регистрация/обновление | `src/components/ServiceWorkerRegistrar.tsx`, новый `src/shared/hooks/useSwUpdate.ts`, новый `src/shared/components/ui/UpdateToast.tsx`, `src/app/layout.tsx` |
| Guard | новые `src/shared/offline/chunkGuard.ts`, `src/components/ChunkGuard.tsx` |
| Sync | `src/shared/offline/sync.ts` (+tests), новый `src/app/api/health/route.ts` |
| API-клиент | `src/shared/services/api/client.ts` (+tests), `graphql.ts`, `src/components/AuthProvider.tsx` |
| Инфра/доки | `deploy/nginx/conf.d/tls.conf` (только при проблеме), `docs/nginx.md` |
| E2E | новые `e2e/offline/*`, `playwright.config.ts`, `package.json` |

Версия билда: `NEXT_PUBLIC_APP_BUILD_TIME` уже задаётся в `next.config.ts` (build-time ISO) — использовать как SW_BUILD, ничего нового не вводить.

## Tasks

Полные описания — в task-листе сессии (TaskList); ниже фазы и зависимости.

### Phase 1 — SW update flow (ядро)
- [x] **T1** SW lifecycle: убрать `skipWaiting()` из install; message-handler `SKIP_WAITING`; константа `SW_BUILD` из `NEXT_PUBLIC_APP_BUILD_TIME` (байты sw.js меняются на каждый билд → браузер видит updatefound)
- [x] **T2** (после T1) ServiceWorkerRegistrar: детект `registration.waiting` + `updatefound→installed при живом controller`; состояние `{updateReady, applyUpdate}` наружу; `controllerchange → reload` с once-guard и first-install-guard (`hadController` до подписки — clients.claim() даёт controllerchange и при первой установке)
- [x] **T3** (после T2) UpdateToast: «Доступна новая версия» + «Обновить»/«Позже», тема var(--app-*), safe-area, монтаж в root layout

### Phase 2 — Guards
- [ ] **T4** ChunkLoadError-guard: `chunkGuard.ts` (isChunkLoadFailure / shouldReload с cooldown 60s в sessionStorage) + подписки на `error`/`unhandledrejection` (извлекать `event.error ?? event.message` / `event.reason`); НЕ reload в офлайне
- [ ] **T5** `/api/health` (204, no-store, без auth) + гейт `online`-триггера синка через `isServerReachable()` (raceWithTimeout 4s; пинговать `getApiPath('/api/health')`, НЕ `'/health'` — иначе путь не /api/* и SW может ответить из кеша); visibilitychange/app-start не гейтить
- [ ] **T6** Аудит 401 vs network error: регрессионные тесты на client.ts (fetch-reject ≠ session-expired), проверка graphql.ts и AuthProvider; правки только при найденных дырах

### Phase 3 — Гигиена и инфраструктура
- [ ] **T7** (после T1) Cache housekeeping: `pruneUnknownCaches` на activate; known = STATIC_CACHE_NAME + HTML_CACHE_NAME (данные — в IDB, не в Cache API; перед реализацией grep `caches.open`)
- [ ] **T8** Верификация headers на прод-билде (sw.js must-revalidate; `_next/static` immutable; HTML не кешируется) + раздел «PWA cache headers» в docs/nginx.md; правка tls.conf только при нарушении

### Phase 4 — Регрессия
- [ ] **T9** (после T3, T4, T5) Offline E2E smoke (Playwright, локальный прод-билд): cold offline start; офлайн-навигация dashboard/read/songs; outbox sync после реконнекта; сценарий «деплой при открытой вкладке» — ручной чек-лист в e2e/offline/README.md

## Commit Plan

1. **После T1–T3**: `feat(pwa): sw update flow — waiting worker + update toast, no skipWaiting on install`
2. **После T4–T6**: `feat(pwa): chunk-load guard, health-gated outbox sync, 401-vs-network regression tests`
3. **После T7–T8**: `chore(pwa): sw cache housekeeping, document nginx cache headers`
4. **После T9**: `test(pwa): offline e2e smoke suite (playwright)`

Каждый чекпоинт: `npm test` + `npm run lint` зелёные. Без трейлеров Co-Authored-By.

## Верификация всего плана (definition of done)

1. `npm test`, `npm run lint` — зелёные.
2. Локальный прод-билд: деплой-симуляция (пересобрать → перезапустить при открытой вкладке) → появляется UpdateToast → «Обновить» → приложение на новой версии без белого экрана и без reload-цикла.
3. DevTools offline: cold start посещённого маршрута работает; отметка прогресса офлайн → синк при реконнекте.
4. `npx playwright test` (e2e:offline) зелёный на локальном прод-билде.
5. docs/nginx.md содержит curl-проверки headers для прода.
