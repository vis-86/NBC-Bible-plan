# Пять UX-правок: выход из приложения, дефолтный перевод офлайна, пометки автозагрузки, тост на лендинге, ссылка на лендинг

**Ветка:** feature/static-export-hono-bff (новую не создаём — fast mode)
**Дата:** 2026-07-10
**Тип:** enhancement (мелкие несвязанные UI/UX-правки)
**Исполнитель:** Sonnet 5 → задачи написаны максимально эксплицитно (файлы, строки, критерии проверки)

## Settings

- **Testing:** только где есть логика — unit-тесты задачи 2 (`autoDownload.test.ts`) и новый кейс в задаче 4 (`UpdateToast.test.tsx`, там же обязательный мок `next/navigation`); задачи 1 и 5 без новых тестов; в задаче 3 существующий `OfflineDataSection.test.tsx` должен остаться зелёным (мок `useReadingSettings`)
- **Logging:** без новых логов — все правки презентационные; существующие log-вызовы `autoDownload.ts` не трогать; logout уже логируется на сервере (`server/src/routes/auth.ts:162`)
- **Docs:** warn-only, без обязательного docs-чекпоинта

## Roadmap Linkage

- Milestone: "none"
- Rationale: ROADMAP.md в проекте отсутствует

## Research Context

Активная тема RESEARCH.md (миграция static export + Hono BFF) уже реализована на текущей ветке и к этим правкам не относится. Из ресерча наследуется одно требование: **реализацию делает Sonnet 5 → план эксплицитный, без «по аналогии»**.

## Контекст из разведки (ключевые факты)

- Страницы «профиль» нет — это `src/app/dashboard/settings/page.tsx`; кнопки выхода в UI нет нигде.
- `logout()` уже реализован в `src/components/AuthProvider.tsx:135-147` (POST `/api/auth/logout` → `clearLastKnownUser()` → `router.push('/login')`), доступен через `useAuth()`.
- Дефолтный перевод автозагрузки захардкожен: `src/shared/offline/autoDownload.ts:23` → `DEFAULT_TRANSLATION = 'nrt2019'`, а дефолт настроек чтения нового юзера везде `'rst'` (синодальный) — расхождение.
- `OfflineDataSection` уже читает тот же IDB store `manifest`, куда пишет автозагрузка → автозагруженное отображается; не хватает явной пометки «загружается автоматически».
- `UpdateToast` («Доступна новая версия») смонтирован глобально в `src/app/layout.tsx:137` → рендерится и на лендинге `/`.
- На `/register` уже есть лого-ссылка на лендинг (`src/app/register/page.tsx:242-257`, `router.push('/')`); на `/login` её нет.

## Tasks

### Phase 1 — офлайн-данные (задачи 2 → 3, зависимость)

- [x] **Task 2. Синодальный перевод (`rst`) — автозагружаемый по умолчанию**
  - Файл: `src/shared/offline/autoDownload.ts:23` — `DEFAULT_TRANSLATION: 'nrt2019'` → `'rst'`. Константа используется напрямую и как fallback в `resolveDefaultTranslation()` (:57) — правка одной константы покрывает оба пути. Дополнительно: сделать `export const DEFAULT_TRANSLATION` — нужна задаче 3.
  - Тесты — точечные правки `src/shared/offline/autoDownload.test.ts`: beforeEach :31 мок настроек → `'rst'`; ключ манифеста :49 → `'rst'`; ассерт :67 → `'rst'`; кейс «cassian → фолбэк» :82–92 (ассерт + название) → `'rst'`; кейс «ошибка сети настроек» :94–101 → `'rst'`. Кейс `kassian2019` (:70–80) не трогать — проверяет уважение выбора юзера.
  - Проверка: `npx vitest run src/shared/offline/autoDownload.test.ts` зелёный.

- [x] **Task 3. Пометить автозагружаемый набор в секции «Оффлайн-данные»** *(blocked by Task 2)*
  - Сначала эмпирически убедиться: dev-запуск → логин → автозагрузка (idle ~5s) → `/dashboard/settings` показывает «Скачано …» у плана, песен и перевода.
  - Файл: `src/features/offline/components/OfflineDataSection.tsx` — бейдж/подпись «загружается автоматически» у строк: план, песни и ОДИН перевод. Помечаемый перевод НЕ статично `rst`: автозагрузка качает `nt_translation` юзера, если он self-hosted (`autoDownload.ts:54-62`). Вычислять тем же правилом: `useReadingSettings` (хук уже используется на этой странице, кэшируется через readThrough) + `resolveSelfHostedTranslationId(settings.nt_translation, 'nt', DEFAULT_TRANSLATION)`; `DEFAULT_TRANSLATION` импортировать из `autoDownload.ts` (строку `'rst'` не дублировать). Пока настройки грузятся — бейдж на переводах не показывать; план/песни помечать всегда. Существующую сноску (:120) оставить.
  - Тесты: `OfflineDataSection.test.tsx` существует — добавление `useReadingSettings` потребует замокать его там (по образцу других моков файла); прогнать, должен остаться зелёным. Новых тестов на бейдж не нужно.

### Phase 2 — независимые UI-правки (задачи 1, 4, 5 — в любом порядке)

- [x] **Task 1. Кнопка «Выйти из приложения» в настройках**
  - Файл: `src/app/dashboard/settings/page.tsx` — добавить `logout` в деструктуризацию `useAuth()` (~строка 21); после `<OfflineDataSection />` — секция с destructive-кнопкой «Выйти из приложения» → `logout()`; disabled на время выполнения (useState). Логику `logout()` не менять.
  - Проверка: клик → редирект `/login`; `/dashboard/settings` после выхода требует входа.

- [x] **Task 4. Скрыть UpdateToast на лендинге**
  - Файл: `src/shared/components/ui/UpdateToast.tsx` — `const pathname = usePathname()` рядом с хуками (:17-20), расширить существующий ранний return (:22): `if (!updateReady || dismissed || pathname === '/') return null`. Скрывать ТОЛЬКО `/`; на `/login`, `/register`, `/dashboard/*` тост остаётся. `usePathname` при basePath `/app` возвращает путь БЕЗ basePath (задокументировано в `src/components/DashboardAuthGate.tsx:12`) → лендинг = `'/'`. `layout.tsx` не трогать.
  - Тесты (обязательно — иначе упадут существующие): `UpdateToast.test.tsx` НЕ мокает `next/navigation` → все 4 кейса сломаются. Добавить мок по образцу `BottomNavBar.test.tsx:11` (`let mockPathname = '/dashboard'; vi.mock('next/navigation', () => ({ usePathname: () => mockPathname }))`) + новый кейс «на `/` тост не рендерится при updateReady». `npx vitest run src/shared/components/ui/UpdateToast.test.tsx` зелёный.

- [x] **Task 5. Ссылка на лендинг со страницы логина**
  - Файл: `src/app/login/page.tsx` (LoginForm) — скопировать лого-блок с `/register` (`src/app/register/page.tsx:242-257`): `<button type="button" onClick={() => router.push('/')}>` + `<img src={`${basePath}/icons/icon-192.png`}>` (с eslint-disable no-img-element, как в оригинале) + «План чтения Библии».
  - Важно: `getBasePath` — из `@/lib/utils`, УЖЕ импортирован в `login/page.tsx:6` (НЕ из `src/shared/utils/api.ts`); у LoginForm 4 render-ветки — блок вставлять ТОЛЬКО в основную форму (return ~:161, внутри `<div className="w-full max-w-md">` над карточкой), не в ветки telegramLoading/tgLink/tg-fail; навигация через `router.push`, не `<a href>`; Atmosphere-фон не копировать; общий компонент НЕ выносить. `/register` не трогать.
  - Тесты: `login/page.test.tsx` уже мокает `useRouter` — прогнать, должен остаться зелёным; новых не нужно.
  - Проверка: клик по лого с `/login` и `/register` → лендинг `/`.

## Commit Plan

1. `feat(offline): make Synodal (rst) the default auto-downloaded translation` — Task 2 + Task 3
2. `feat(ui): logout button in settings, landing link on login, no update toast on landing` — Tasks 1, 4, 5

## Финальная проверка (перед завершением)

- `npx vitest run` — все тесты зелёные
- `npm run lint` (или lint-команда проекта) — чисто
- `npm run build` — static export собирается
