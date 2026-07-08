# Лендинг v2 + регистрация: витрина фич (план, песни, PWA-установка, оффлайн)

**Slug:** `landing-v2-features`
**Создан:** 2026-07-07
**Ветка:** нет (Full mode без создания ветки — по решению Игоря; текущая грязная `feature/reader-immersive-ui` не трогается, реализация позже на удобной ветке)
**Файл плана:** `.ai-factory/plans/landing-v2-features.md`
**Предшественник:** `.ai-factory/plans/landing-redesign.md` (выполнен полностью) — это **v2-итерация**, канон стиля Sacred Minimal и конвенции оттуда наследуются.
**Реализатор:** Sonnet 5 — задачи написаны максимально explicit (пути, копирайт, fallback-поведение), не оставлять решений «на вкус».

## Settings

- **Testing:** да — smoke-тесты (инфра @testing-library/react + jsdom **уже стоит** после v1: include `src/**/*.test.tsx`, jsdom по-файлово докблоком).
- **Logging:** minimal — страницы презентационные; сохранить существующий `console.debug('[pwa] install click')` в InstallGuide, нового логирования не вводить.
- **Docs:** warn-only (без обязательного docs-чекпоинта).

## Roadmap Linkage

Milestone: "none" — `ROADMAP.md` в проекте отсутствует.

## Research Context

Active Summary в RESEARCH.md — про другую тему (миграция на static export + Hono BFF после offline-PWA v1). Релевантное ограничение отсюда: **не завязывать лендинг/регистрацию на SSR/middleware/API-роуты сверх существующих** — обе страницы остаются `'use client'` и переживут миграцию на `output: 'export'` без правок. Не трогать SW/offline-внутренности.

---

## Контекст и факт-чек (подтверждено по коду 2026-07-07)

1. **Лендинг уже редизайнен (v1, Sacred Minimal)**: FSD-слайс `src/features/landing/` — Header, Hero (faux PhoneMockup), About (3–4 карточки), HowToStart (ветвление invite/register по `isRegisterEnabled()`), InstallGuide (usePWAInstall + useIsStandalone), FinalCta, Footer, Atmosphere, cta.tsx (PrimaryCta/LoginButton/RegisterButton/AccessButton), anim.ts (motion-variants c reduced-motion).
2. **Чего на лендинге НЕТ** (и что просит Игорь): секция **«Песни»** — не упомянута нигде; **«оффлайн»** — не упомянут нигде; реальных **скриншотов** нет (`public/landing/` не существует, hero — CSS-мокап); установка PWA есть, но как скромная утилитарная секция.
3. **Регистрация**: прод с 2026-07-01 — открытая без кода (`REGISTER_OPEN_NO_CODE=true`, см. memory self-registration-prod). UI-флаги build-time: `NEXT_PUBLIC_REGISTER_ENABLED` (форма vs заглушка), `NEXT_PUBLIC_REGISTER_REQUIRE_CODE` (default true → поле кода видно; на проде должен быть false). Хелперы: `isRegisterEnabled()` / `isRegisterCodeRequired()` из `@/shared/utils/constants`. Серверный роут — источник истины (503/403).
4. **`/register` сейчас** — функциональная, но голая серая карточка (`src/app/register/page.tsx`): без Atmosphere, без serif, без show-password, подсказка о пароле только как ошибка после сабмита.
5. **usePWAInstall** (`src/hooks/usePWAInstall.ts`) → `{ canInstall, installed, install }`; `useIsStandalone()` — локальный хелпер в InstallGuide.
6. **Button** (`shared/components/ui/Button.tsx`): variants `primary|secondary|ghost|inverse`, sizes `sm|md|lg`.
7. **Тесты**: `src/app/page.test.tsx` есть (hero, invite-шаги, register-флаг матрица частично, PWA-секция, CTA-ссылки). Теста /register-страницы нет (`register-access.test.ts` — только серверная логика).
8. **Dev для скриншотов**: `npm run dev` → `http://localhost:3000/app` (basePath из .env.local). Локально задан `REGISTER_CHURCH_CODE` → код при регистрации обязателен (взять из .env.local) либо invite через `INVITE_ADMIN_SECRET`.
9. **Дизайн-референс**: YouVersion (youversion.com) — паттерн «чередующиеся feature-секции с большими скриншотами приложения», дружелюбный тон, крупная типографика, понятность всем возрастам. Адаптируем под канон Sacred Minimal (`.ai-factory/design/hero-reference.html`): тёплая бумага, Lora serif, индиго-акцент, чёрные CTA — НЕ копировать фирменные цвета YouVersion.

## Конвенции реализации (наследуются из v1-плана, подтверждены)

- **basePath `/app`**: навигация — `router.push('/...')`; картинки — сырой `<img src={getBasePath() + '/landing/...'}>` (НЕ next/image); внешние ссылки — `<a target="_blank" rel="noopener noreferrer">`.
- **Шрифты**: `font-serif` (Lora) заголовки, `font-sans` (Plus Jakarta) текст. **Цвета**: только `app-*` токены.
- **Анимации**: только `motion` + variants из `features/landing/components/anim.ts` (reveal*, уважают reduced-motion). Никаких локальных CSS keyframes.
- **Иконки**: lucide-react. **data-атрибуты**: kebab-case по правилу из `.ai-factory/rules/base.md` (`data-feature-showcase`, `data-register-form`, …).
- **FSD**: `app/register` может импортировать из `features/landing` (app→features разрешено); `features/landing` не импортирует другие фичи.
- **Копирайт**: «Пиши, сокращай» — коротко, тепло, без канцелярита и англицизмов; понятно и подростку, и бабушке. Тон v1 («без чувства вины») сохранить.
- **Graceful fallback картинок**: каждая секция обязана выглядеть корректно без PNG (onError → скрыть/плейсхолдер) — скриншоты могут пересниматься.

## Скриншоты (кладутся в `public/landing/`, снимаются Задачей 1)

| Файл | Экран | Использование |
|---|---|---|
| `hero-app.png` | /dashboard (PlanView, стих дня, прогресс) | Hero (внутри PhoneMockup), fetchpriority="high" |
| `screen-plan.png` | /dashboard | FeatureShowcase «План» |
| `screen-reader.png` | /dashboard/read (открытая глава) | резерв/About |
| `screen-songs.png` | /dashboard/songs (список) | резерв |
| `screen-song-view.png` | открытая песня с аккордами | FeatureShowcase «Песни» |
| `screen-offline.png` | /dashboard/settings, секция «Оффлайн-данные» | FeatureShowcase «Оффлайн» |

Viewport 390×844 @2x. Данные оживить (отметить прогресс) перед съёмкой.

## Структура лендинга после v2

1. Header (без изменений)
2. **Hero** — реальный скриншот в рамке телефона + копирайт под открытую регистрацию (Задача 2)
3. **About** — 5–6 карточек: план, прогресс, читалка, **песни (new)**, **оффлайн (new)**, чат-за-флагом (Задача 3)
4. **FeatureShowcase (new)** — 3 зигзаг-секции со скриншотами: План / Песни / Оффлайн (Задача 4)
5. **HowToStart** — шаги без кода при `!isRegisterCodeRequired()` + якорь на установку (Задача 6)
6. **InstallGuide** — полноценная секция «Установите как приложение», Android/iOS, связка с оффлайн (Задача 5)
7. FinalCta + Footer (без изменений)

`/register` — редизайн в стиль лендинга + UX (show-password, живые подсказки) — Задача 7.

`/login` и `/register` — компактная PWA-подсказка **InstallAppHint** под формами (Задача 10): пользователи, приходящие по прямой ссылке мимо лендинга, — основной путь; сейчас они установку не видят вообще. Скрыта в standalone/installed и в Telegram WebApp; Android — маленькая кнопка «Установить», iOS — свёрнутая details-инструкция (Share → «На экран „Домой“»). Дом компонента — `src/shared/components/pwa/` (не landing-слайс: нужен auth-страницам), с выносом `useIsStandalone()` из InstallGuide в `src/shared/hooks/`.

## Tasks

> Детальные постановки — в задачах Task-листа (#1–#9); здесь — сводка и зависимости.

### Фаза 0 — материалы

- [x] **Задача 1 (#1).** Скриншоты с dev-сервера (Playwright/Chrome DevTools MCP) → `public/landing/`. Регистрация тест-юзера (код из .env.local) или invite; оживить прогресс; 390×844@2x; список файлов — таблица выше. Блокирует: 2, 4.

### Фаза 1 — лендинг

- [x] **Задача 2 (#2).** Hero: реальный `hero-app.png` внутри PhoneMockup c faux-fallback; trust-line без «по приглашению» при открытой регистрации. Логи: нет.
- [x] **Задача 3 (#3).** About: карточки «Песни с аккордами» (Music) и «Работает без интернета» (WifiOff); грид 2×3/md:3. Логи: нет.
- [x] **Задача 4 (#4).** Новый `FeatureShowcase.tsx`: 3 зигзаг-секции (План/Песни/Оффлайн) со скриншотами, lazy, fallback, `data-feature-showcase*`. Вставить в `page.tsx` между About и HowToStart. Логи: нет.
- [x] **Задача 5 (#5).** InstallGuide → секция-ценность «Установите как приложение»: иконка на экране + работает без интернета + «бесплатно, без магазина»; Android-кнопка install() сохранить, iOS-шаги. Логи: сохранить `[pwa] install click`.
- [x] **Задача 6 (#6).** HowToStart: ветка `isRegisterCodeRequired()===false` → шаги «логин+пароль → установите → читайте»; якорь `#install` на InstallGuide. Логи: нет.

### Фаза 2 — регистрация

- [x] **Задача 7 (#7).** `/register`: Atmosphere-фон, лого+название, serif-заголовок, карточка в app-токенах, чёрная inverse-кнопка; show/hide password (Eye/EyeOff), autoComplete, живая подсказка «не менее 8 символов», проверка совпадения на blur, `role="alert"`, trust-строка «Не нужны имя и телефон»; под формой — `<InstallAppHint />` (Задача 10, не в RegisterDisabled). RegisterDisabled перекрасить. ВСЮ логику флагов/fetch сохранить. Логи: нет.
- [x] **Задача 10 (#10).** `InstallAppHint` (`src/shared/components/pwa/`): вынос `useIsStandalone()` из InstallGuide в `src/shared/hooks/useIsStandalone.ts` (+рефакторинг InstallGuide на импорт); скрытие при standalone/installed/`isTelegramWebApp()`; Android — компактная кнопка «Установить» → `install()`, iOS — `<details>` c шагами Share → «На экран „Домой“»; `data-install-app-hint`. Встроить в `/login` (только ветка обычной формы, не telegram-ветки) и `/register` (только форма). Логи: `console.debug('[pwa] install click (auth hint)')`.

### Фаза 3 — качество

- [x] **Задача 8 (#8).** Дизайн-проход: skill **frontend-design** (ритм, иерархия, Sacred Minimal) + skill **layout-review** (/, /register, **/login**; 390/768/1280, зигзаг, гриды при 5/6 карточках, InstallAppHint не конкурирует с формами); a11y (контраст, focus-ring, alt, tab-порядок, details/summary с клавиатуры); hero img `fetchpriority="high"`, остальные `loading="lazy"`. Блокирована: 2–7, 10.
- [x] **Задача 9 (#9).** Тесты: обновить `page.test.tsx` (песни/оффлайн-секции, матрица register×code, новый заголовок InstallGuide); новый `src/app/register/page.test.tsx` (jsdom-докблок): матрица флагов, клиентская валидация без fetch, toggle пароля, `[data-install-app-hint]` под формой и отсутствие в RegisterDisabled; новый `src/app/login/page.test.tsx` — smoke формы логина (замокать `@/lib/telegram`) + hint виден/скрыт (standalone). Состояния InstallAppHint: standalone/telegram → null, canInstall → кнопка, iOS → details. `npm test` зелёный. Блокирована: 8.

## Commit Plan

| Чекпоинт | Задачи | Сообщение |
|---|---|---|
| 1 | 1 | `chore(landing): real app screenshots for landing (plan/reader/songs/offline)` |
| 2 | 2–4 | `feat(landing): real hero screenshot, songs+offline cards, feature showcase sections` |
| 3 | 5–6 | `feat(landing): app-install value section, no-code register steps` |
| 4 | 7, 10 | `feat(auth-ui): register redesign + PWA install hint on login/register` |
| 5 | 8–9 | `style(landing): design pass + tests for landing v2, register and login` |

## Риски / примечания для реализатора

- **Не трогать**: редирект Telegram WebApp в `page.tsx` (useEffect с isTelegramWebApp), серверный register-роут, SW/offline-код, `features/reading` (там параллельная незакоммиченная работа).
- Скриншоты содержат контент тест-юзера — проверить, что на них нет реальных имён пользователей.
- Если dev-Directus недоступен (admin-token протухает — memory directus-instance), Задача 1 деградирует до съёмки с прода под `claude-offline-test` — но НЕ блокирует задачи 3, 5–7 (только 2 и 4).
- PNG держать разумного веса (<500KB каждый; пересжать sips при необходимости, без новых deps).
