# Лендинг: полный редизайн `src/app/page.tsx`

**Slug:** `landing-redesign`
**Создан:** 2026-06-30
**Ветка:** нет (Full mode, остаёмся на `main`)
**Файл плана:** `.ai-factory/plans/landing-redesign.md`

## Settings

- **Testing:** да — лёгкий smoke-тест (рендер секций + наличие ключевых кнопок). Требует добавления компонентной тест-инфры (см. фактчек ниже).
- **Logging:** minimal — лендинг презентационный. Логируем только взаимодействия PWA-установки (`console.debug('[pwa] …')`, паттерн уже есть в `usePWAInstall`). Без INFO-шума.
- **Docs:** warn-only (нет обязательного docs-чекпоинта).

## Roadmap Linkage

Milestone: "none" — `ROADMAP.md` в проекте отсутствует, линковать не к чему.

---

## Контекст и факт-чек (важно перед реализацией)

Реальная модель, подтверждённая по коду (`src/app/activate/page.tsx`, `src/app/api/auth/activate/route.ts`, `ARCHITECTURE.md`):

1. **Регистрация строго по invite-ссылке.** Self-registration НЕТ.
   - `/activate` без `token` → экран «Ссылка некорректна. Обратитесь в поддержку».
   - API `POST /api/auth/activate` без валидного invite (`findValidInvite`) → 400.
   - Аккаунт создаётся только при `invite.kind === 'activate'` с валидным токеном.
   - ⇒ На лендинге шаг «как зарегистрироваться» = **запросить ссылку в поддержке** → открыть её → задать логин+пароль. Контакт: `https://t.me/nbc_support` (константа `SUPPORT_CONTACT` уже используется в `login`/`activate`).
2. **Telegram-бот (`https://t.me/VisTestPsBot`) — устаревший путь.** Текущая кнопка «Начать» ведёт в бота; в новой invite+password модели Telegram только *привязывает* tg_id, не создаёт аккаунт. **Убираем bot-CTA из лендинга.**
3. **Логин** — страница `/login` (логин+пароль). Кнопка «Войти» ведёт туда.
4. **PWA-установка** — хук `usePWAInstall()` (`src/hooks/usePWAInstall.ts`) уже даёт `{ canInstall, installed, install }`:
   - Android/Chrome — `canInstall=true` ⇒ кнопка «Установить» вызывает `install()`.
   - iOS — события нет ⇒ показываем инструкцию «Поделиться → На экран „Домой"».
   - Уже установлено / запущено как standalone ⇒ секцию установки скрываем.
5. **Стек:** Next.js 16 App Router, React 19 (+ React Compiler), Tailwind v4, `motion` (Framer Motion 12), `lucide-react`, shadcn/ui. FSD: `app → features → shared`.
6. **Существующий редирект WebApp→login** в `page.tsx` (`hasTelegramWebAppObject()` → `/login?redirect=/dashboard`) **сохранить** — это вход из Telegram mini-app.

### ⚠️ Фактчек по тестам (требует решения по зависимостям)

Текущий Vitest: `environment: 'node'`, `include: ['src/**/*.test.ts']` (только `.ts`), **нет** `@testing-library/react` / `jsdom`. Все тесты — чистая логика/API. Чтобы сделать рендер-smoke лендинга, нужно добавить dev-deps и не сломать node-окружение API-тестов:

- dev-deps: `@testing-library/react@^16`, `@testing-library/jest-dom`, `jsdom`.
- vitest config: добавить `'src/**/*.test.tsx'` в `include`; окружение jsdom задавать **по-файлово** докблоком `// @vitest-environment jsdom` в `page.test.tsx`, чтобы не переводить весь прогон на jsdom.

Обоснование зависимостей (правило «no deps без причины»): это минимальный стандартный набор для компонентных тестов под React 19; альтернатива — выносить копирайт в чистый модуль и тестировать строки, что искусственно для презентационной страницы. **Если не хочешь тащить тест-инфру ради лендинга — Задачи 8–9 можно дропнуть, заменив на ручной layout-review (скриншоты).**

---

## Design Reference — ЭТАЛОН (зафиксирован)

**Файл:** `.ai-factory/design/hero-reference.html` — утверждённый образец стиля Hero. Реализация Hero (Задача 2) и дизайн-проход (Задача 7) должны воспроизводить именно его.

Канон стиля **«Sacred Minimal»** (НЕ возвращаться к космо-фиолетовому градиенту):
- **Фон:** тёплая бумага `--app-bg` (#FAFAF9) + мягкие радиальные свечения (тёплое золото `#c79a4b` + индиго) + тонкое зерно. Атмосфера, не плоский цвет.
- **Типографика:** заголовок — **Lora** (serif), акцент-строка курсивом цветом `--app-primary`; UI/текст — **Plus Jakarta Sans**. Оба шрифта уже в `layout.tsx`.
- **Кнопки:** первичная — чёрная (`bg-app-text`, белый текст, стрелка→); вторичная «Войти» — призрачная (border + blur). Никаких неоновых градиентных CTA.
- **Визуал:** мокап телефона с экраном приложения (стих дня + дни недели с emerald-галочками «выполнено» и индиго-кружком «Сегодня») + плавающий бейдж «День отмечен». В проде заменить faux-экран на реальный скрин PlanView (`public/landing/hero-app.png`).
- **Копирайт:** value-prop в одну фразу; честная сноска «Доступ — по приглашению от церкви».
- **Движение:** staggered-появление + лёгкий float телефона; обязательно `prefers-reduced-motion`.
- **Маппинг в код:** цвета → `app-*` токены (`bg-app-bg`, `text-app-text`, `text-app-primary`); анимации → `motion` (не CSS keyframes).

## Структура страницы (секции, копирайт по «Пиши, сокращай»)

Принципы текста: убрать воду и канцелярит, глаголы вместо отглагольных существительных, короткие фразы, забота вместо давления, «вы» по-человечески. Сохранить дружелюбный тон текущего лендинга («без чувства вины»), но плотнее.

1. **Header (sticky, лёгкий):** иконка-лого (`/icons/icon-192.png`) + название «План чтения Библии» + кнопка **«Войти»** → `/login`.
2. **Hero:** заголовок + одно-фразовый value-prop + две кнопки: первичная **«Получить доступ»** (→ поддержка) и вторичная **«Войти»**. Справа/снизу — скриншот приложения (мокап на телефоне).
3. **«Что это»:** 3–4 карточки фич — *Удобный план*, *Прогресс без вины*, *Читалка с справочником*, *Чат с пастором*. Короче текущих формулировок.
4. **«Как начать» (3 шага, invite-модель):**
   - Шаг 1 — «Напишите нам — пришлём личную ссылку». CTA → `https://t.me/nbc_support`.
   - Шаг 2 — «Откройте ссылку с телефона».
   - Шаг 3 — «Придумайте логин и пароль — и вы внутри».
5. **«Установите на телефон» (PWA):**
   - Android: кнопка «Установить» (если `canInstall`) → `install()`.
   - iOS: шаги «Поделиться → На экран „Домой"».
   - Скрыть всю секцию, если `installed` или запущено в standalone.
6. **Финальный CTA + footer:** мягкий призыв + «Получить доступ» / «Войти». Footer: «Сделано с любовью для Нижегородской Библейской Церкви».

### Список картинок для добавления (положить в `public/landing/`)

| Файл | Назначение | Примечание |
|---|---|---|
| `public/landing/hero-app.png` | Мокап приложения на телефоне в hero | главный визуал; скрин PlanView в рамке телефона |
| `public/landing/screen-plan.png` | Скрин «Удобный план» (PlanView) | для карточки фичи |
| `public/landing/screen-progress.png` | Скрин прогресса/календаря | для карточки фичи |
| `public/landing/screen-reader.png` | Скрин читалки (ReadingView) | для карточки фичи |
| `public/landing/screen-chat.png` | Скрин «Чат с пастором» | опционально (фича за флагом `NEXT_PUBLIC_AI_ENABLE`) |
| `public/landing/pwa-ios.png` | Иллюстрация «Поделиться → На экран „Домой"» | опц., можно заменить иконками Lucide |
| `public/landing/pwa-android.png` | Иллюстрация установки на Android | опц., можно заменить иконками Lucide |

Уже есть и переиспользуем: `public/bg.png` (фон hero), `public/icons/icon-192.png` (лого). Картинки опциональны — секции должны выглядеть корректно с плейсхолдерами, пока файлов нет (graceful fallback на иконку/градиент).

---

## Конвенции реализации (подтверждены кодом)

- **basePath = `/app`** (`next.config.ts`). Внутренняя навигация — только `router.push('/login')` (Next сам подставит basePath). ❗ НЕ сырой `<a href="/login">` (404 под basePath) и НЕ ручной `getBasePath()+'/login'` с router (двойной префикс).
- **Внешние ссылки** (поддержка) — `<a href={SUPPORT_CONTACT} target="_blank" rel="noopener noreferrer">`.
- **`SUPPORT_CONTACT`** — общая константа из `src/lib/constants.ts` (Задача 0), не локальные дубли.
- **Кнопки** — `shared/components/ui/Button.tsx` (variant primary/secondary/ghost). Эталонная чёрная первичная = новый вариант `inverse` (`bg-app-text`) либо className-override.
- **Шрифты** — классы `font-serif` (Lora) для заголовков, `font-sans` (Plus Jakarta) по умолчанию; уже замаплены в `globals.css`. Без inline font-family.
- **Иконки** — `lucide-react`, не inline SVG. **Картинки** — сырой `<img>` с basePath (конвенция проекта), не `next/image`.

## Tasks

### Фаза 0 — общая константа

- [x] **Задача 0 (#38).** Вынести `SUPPORT_CONTACT` в `src/lib/constants.ts`; отрефакторить `login/page.tsx` и `activate/page.tsx` на импорт (убрать дубли). Блокирует задачи 2/4/6. Логирование: нет.

### Фаза 1 — каркас и слайс

- [x] **Задача 1 (#29).** Создать FSD-слайс `src/features/landing/` и тонкий `src/app/page.tsx`-оркестратор. Page рендерит секции-компоненты, сохраняет существующий `useEffect` редиректа WebApp→`/login?redirect=/dashboard` и `useAuth`-гейт. Логирование: нет.

### Фаза 2 — секции

- [x] **Задача 2 (#30).** `Header` + `Hero` по ЭТАЛОНУ (`hero-reference.html`). Заголовок `font-serif` + индиго курсив-акцент; кнопки через `Button` (вариант `inverse` для чёрной первичной); «Войти» → `router.push('/login')`, «Получить доступ» → `<a href={SUPPORT_CONTACT} …>`; иконки lucide; Hero-визуал `/landing/hero-app.png` с fallback. Анимации motion + reduced-motion. Логирование: нет.
- [x] **Задача 3 (#31).** `About` — карточки фич, плотный копирайт по «Пиши, сокращай». Логирование: нет.
- [x] **Задача 4 (#32).** `HowToStart` — 3 шага invite-регистрации + CTA в поддержку (`SUPPORT_CONTACT`). Чётко: доступ строго по ссылке, self-registration нет. Логирование: нет.
- [x] **Задача 5 (#33).** `InstallGuide` — PWA: `usePWAInstall()`, Android-кнопка `install()` (reuse Button), iOS-инструкция, скрытие при `installed`/standalone (`matchMedia('(display-mode: standalone)')` / `navigator.standalone`; опц. вынести `isStandalone` в хук). Иконки lucide (Share/SquarePlus/Download). Логирование: `console.debug('[pwa] install click')`.
- [x] **Задача 6 (#34).** `FinalCta` + `Footer`. Удалить `telegramBotUrl` + `window.open(telegramBotUrl)`. CTA «Получить доступ» → `<a href={SUPPORT_CONTACT} …>`, «Войти» → `router.push('/login')`, кнопки через Button. Логирование: нет.

### Фаза 3 — дизайн и качество

- [x] **Задача 7.** Дизайн-проход: применить skill **frontend-design** для визуала; согласовать с дизайн-токенами приложения (`app-*` CSS-переменные из `globals.css`) ради единого стиля с дашбордом; адаптив (mobile-first), доступность (семантика, контраст, `aria`/focus-ring), `prefers-reduced-motion` для `motion`-анимаций. Прогон через skill **layout-review** (скриншоты) для проверки вёрстки. Логирование: нет.

### Фаза 4 — тесты (опционально, требует deps)

- [x] **Задача 8.** Настроить инфраструктуру компонентных тестов: dev-deps `@testing-library/react@^16` + `@testing-library/jest-dom` + `jsdom`; в `vitest.config.ts` добавить `'src/**/*.test.tsx'` в `include`; подключить `@testing-library/jest-dom` в `src/test/setup.ts` (под jsdom). Не менять глобальное `environment: 'node'` — jsdom задаём по-файлово докблоком. Логирование: нет.
- [x] **Задача 9.** Smoke-тест `src/app/page.test.tsx` (докблок `// @vitest-environment jsdom`): рендер страницы, проверка наличия hero-заголовка, 3 шагов регистрации, кнопок «Войти» и «Получить доступ», секции установки. Замокать `usePWAInstall` и `useAuth`. Логирование: нет.

---

## Commit Plan

| Чекпоинт | Задачи | Сообщение |
|---|---|---|
| 1 | 0–2 | `refactor(landing): shared SUPPORT_CONTACT + FSD slice + header/hero, drop bot CTA` |
| 2 | 3–6 | `feat(landing): about, invite steps, PWA install, final CTA sections` |
| 3 | 7 | `style(landing): design pass, a11y, responsive, reduced-motion` |
| 4 | 8–9 | `test(landing): component test infra + page smoke test` |

(Чекпоинт 4 пропустить, если тест-инфра не нужна.)
