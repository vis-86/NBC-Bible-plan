# Landing Hero — редизайн «рука дизайнера»

**Ветка:** feature/reader-immersive-ui (новую не создаём — fast mode)
**Дата:** 2026-07-08
**Тип:** enhancement (UI/дизайн лендинга)

## Settings

- **Testing:** нет (визуальный слой, тестами не покрываем)
- **Logging:** не требуется — все правки в презентационных client-компонентах, runtime-логики нет
- **Docs:** warn-only (мандаторного docs-чекпоинта нет)

## Roadmap Linkage

- Milestone: "none"
- Rationale: точечный дизайн-полиш лендинга, вне трекинга roadmap

## Контекст / вводные

Референс — лендинг **cookn**: full-width хедер, крупный serif-заголовок, органический
цветной блоб под наклонённым телефоном, плавающие карточки/аватары. Переносим идею, но
**в палитру дашборда** (indigo `--app-primary #4f46e5`, warm gold `--warm #c79a4b`,
emerald `--app-success #10b981`, stone-текст) и **без фото людей** — вместо аватаров
плавающие мини-карточки (решение пользователя).

Затрагиваемые файлы:

- `src/app/page.tsx` — вынести Header из контейнера max-w-[1200px]
- `src/features/landing/components/Header.tsx` — full-width плашка + внутренний wrapper
- `src/features/landing/components/PhoneMockup.tsx` — обрезка скриншота (780×1688)
- `src/features/landing/components/Hero.tsx` — блоб, фигуры, плавающие карточки, полиш
- (опц.) `src/features/landing/components/cta.tsx` — только если понадобится согласовать кнопки

Токены — из `src/app/globals.css` (theme-aware, светлая/тёмная).

## Tasks

### Фаза 1 — структура и фиксы

- [x] **#11 Full-bleed хедер во всю ширину.** Header выносим из `max-w-[1200px]` в
  `page.tsx`; сама плашка (border-bottom + bg/blur) — full-width sticky, содержимое —
  внутренний `mx-auto max-w-[1200px] px-5 sm:px-7`. Убрать хак `-mx-5/-mx-7`.
- [x] **#12 Починить обрезку скриншота в PhoneMockup.** Привести ratio внутреннего экрана к
  ratio скриншота (780/1688 ≈ 0.462) или сместить `object-position` в центр, чтобы верх
  (шапка) и низ не резались. Не сломать faux-fallback (`screenshotFailed`).

### Фаза 2 — акцентная композиция

- [x] **#13 Акцентный блоб + мелкие фигуры под телефоном.** Крупная органическая заливка
  (indigo→gold, blur, низкая насыщенность) под слегка наклонённым телефоном + кольцо и
  dot-grid. `aria-hidden`, без горизонтального скролла. Наклон — на обёртке, не ломая
  float/reduced-motion.
- [x] **#14 Плавающие мини-карточки вокруг телефона.** (blocked by #13) К существующему
  бейджу «День отмечен» добавить 1-2 карточки (стрик «7 дней подряд» / прогресс «68% плана»)
  в стиле токенов, у каждой свой float delay, `aria-hidden`, скрытие на узких экранах.

### Фаза 3 — полиш

- [x] **#15 Финальный полиш: типографика, ритм, палитра.** (blocked by #11–#14) Заголовок,
  eyebrow, вертикальный ритм (4/8), баланс колонок, единые тени/радиусы через
  `--app-shadow-*`. Проверка: светлая/тёмная тема, reduced-motion, mobile-first.

## Commit Plan

5 задач → 2 чекпоинта:

1. `feat(landing): full-bleed header + fix hero screenshot crop` — после #11, #12
2. `feat(landing): accent blob, floating cards & hero polish` — после #13, #14, #15

## Проверка результата

Ручная (тестов нет): dev-сервер / `/run`, визуальный прогон Hero на десктопе и мобиле,
светлая и тёмная тема, `prefers-reduced-motion`, отсутствие горизонтального скролла.

---

Запустить реализацию: `/aif-implement`
Посмотреть задачи: `/tasks`
