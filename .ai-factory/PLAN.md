# План: переводы Кассиан 2019 и НРТ (NRT) 2019 в self-hosted формате

Branch: feature/pwa-email-auth  
Created: 2026-04-22

## Settings

- Testing: да — автоматическая проверка конвертера на одной короткой книге (ожидаемый JSON + снимок главы), без обязательного подключения Vitest, если не добавляем зависимость.
- Logging: verbose — в CLI и в местах интеграции (`[convert-bible]`, при необходимости API) использовать `DEBUG`-ориентированные сообщения с контекстом (книга, глава, путь к файлу).
- Docs: нет — отдельная пользовательская документация не требуется; краткий комментарий в шапке скрипта и в `bible-translations.ts` о правовом статусе данных.

## Roadmap Linkage

Файл `.ai-factory/ROADMAP.md` отсутствует — секция пропущена.

## Research Context

Источник не оформлен в `RESEARCH.md`. Исходные идентификаторы пакетов: `Bible_Russian_Kassian_2019-05-30`, `Bible_Russian_NRT_2019-05-30` (типичные имена ресурсов Paratext/DBL). Целевой формат приложения уже задан в `src/lib/bible-data.ts`: каталог `data/bible/{translationId}/` с `index.json` (мапа «каноническое русское имя книги» → имя файла) и `books/*.json` с полем `chapters` как `Record<string, string>` (ключ — номер главы строкой). Сейчас в `src/lib/bible-translations.ts` только `rst` имеет `selfHostedAllowed: true`; `cassian` и `nrp` объявлены, но данные не раздаются как self-hosted.

## Контекст кода (кратко)

- Выбор ВЗ/НЗ уже есть: `ReadingSettings.ot_translation` / `nt_translation`, API `/api/bible/...` через `resolveSelfHostedTranslationId` (`src/app/api/bible/[book]/[chapter]/route.ts`).
- Чтобы переводы стали доступны пользователям, нужны: (1) данные в `data/bible/<id>/` в ожидаемом формате; (2) новые или обновлённые `BibleTranslationId` с `selfHostedAllowed: true` и корректным `supports.ot` / `supports.nt`; (3) конвертер из формата исходного пакета.

## Именование id

- Рекомендация: короткие стабильные id каталогов, например `kassian2019` и `nrt2019`, чтобы не путать с уже существующим в коде `nrp` (если НРП ≠ НРТ — это разные сущности). Если продуктово нужно сохранить id `cassian` / переименовать в NRT — зафиксировать одно решение в задаче 5, чтобы не ломать сохранённые настройки пользователей в Directus.

## Право на размещение

Перед `selfHostedAllowed: true` убедиться, что лицензия выбранного текстового набора позволяет хранение и раздачу через ваше API; иначе оставить `false` и не включать в UI (текущая модель безопасности).

## Commit Plan

- **Commit 1** (после задач 1–3): `feat(bible): add USX-to-app bible dataset converter CLI`
- **Commit 2** (после задач 4–5): `feat(bible): register kassian2019 and nrt2019 self-hosted translations`
- **Commit 3** (после задач 6–7): `chore(bible): wire Directus defaults and smoke test for converter`

## Tasks

### Phase 1: Формат и сопоставление книг

- [x] **Task 1: Зафиксировать целевой контракт и маппинг USX → русские имена**  
  **Deliverable:** модуль (например `scripts/bible-import/book-codes.ts` или рядом с конвертером) с таблицей: код книги в USX/метаданных Paratext → точное строковое имя из существующего индекса RST (те же ключи, что в `loadBibleIndexByTranslation('rst')`), чтобы `findBookInIndex` в `bible-data.ts` работал без дублей.  
  **Файлы:** новый каталог под `scripts/bible-import/` (или `tools/bible-import/`).  
  **LOGGING REQUIREMENTS:** при отладочном запуске выводить в stderr для неизвестного кода книги `WARN [bible-import] unknown book code {code} in file {path}`; при успешном маппинге `DEBUG [bible-import] mapped {code} -> {canonicalName}`.  
  **Зависимости:** нет.

### Phase 2: Утилита конвертации

- [x] **Task 2: Парсер USX (минимально достаточный подсет)** — реализован парсер **BibleQuote HTML** (фактический формат модулей в `data/`), USX не использовался.  
  **Deliverable:** функции, которые из одного `.usx` (или эквивалента в пакете) извлекают стихи по главам и собирают HTML/текст главы в том же духе, что у RST (проверить один раз визуально в ридере: теги `<sup>` для номеров стихов, если так в RST). Если в проекте RST недоступен из-за `.cursorignore`, ориентироваться на фрагмент, приложенный вручную к задаче, или временно скопировать одну главу в фикстуру `scripts/bible-import/fixtures/`.  
  **Файлы:** `scripts/bible-import/parse-usx.ts` (или `.mjs` без новых deps — предпочтительно TypeScript + `npx tsx` как dev-инструмент).  
  **LOGGING REQUIREMENTS:** `DEBUG` на каждую главу (число стихов, длина HTML); `WARN` при пропущенных/пустых главах; `ERROR` при невалидном XML.  
  **Зависимости:** Task 1.

- [x] **Task 3: CLI `convert-bible` — сборка `index.json` и файлов книг**  
  **Deliverable:** точка входа, например `scripts/bible-import/cli.ts`, аргументы: `--source <dir>` (корень с USX для одного перевода), `--translationId <kassian2019|nrt2019>`, `--books` (опционально список кодов, например `PHM` или `3JN` для короткой книги), `--out <path>` по умолчанию `data/bible/<translationId>/`. Генерация `index.json` и `books/<slug>.json` с `{ name, chapters }`.  
  **Файлы:** `scripts/bible-import/cli.ts`, при необходимости `package.json` script `bible:convert`. Добавить `tsx` в `devDependencies`, если команда должна быть воспроизводимой.  
  **LOGGING REQUIREMENTS:** старт: `INFO [convert-bible] source=... translationId=... booksFilter=...`; по завершении книги: `INFO [convert-bible] wrote {outPath} chapters={n}`; итог: сводка.  
  **Зависимости:** Task 2.

### Phase 3: Проверка на малой книге

- [x] **Task 4: Прогон на одной короткой книге и smoke-проверка**  
  **Deliverable:** для каждого перевода сгенерировать минимум одну книгу (например Послание к Филимону или 3-е Иоанна), затем локально вызвать `getChapterTextByTranslation` / HTTP `GET /api/bible/...` с `?translation=<id>` (без сессии) и убедиться, что глава отдаётся. Можно добавить маленький `node --import tsx` или `tsx` скрипт `scripts/bible-import/smoke.test.ts`, который импортирует `getChapterTextByTranslation` из `src/lib/bible-data.ts` и сравнивает длину текста > 0.  
  **Файлы:** smoke-скрипт + при необходимости фикстура только для теста (не весь канон).  
  **LOGGING REQUIREMENTS:** smoke выводит `INFO` с именем книги, главой, длиной текста.  
  **Зависимости:** Task 3.

### Phase 4: Доступность в приложении

- [x] **Task 5: Расширить типы и реестр переводов**  
  **Deliverable:** в `src/lib/bible-translations.ts` добавить id (например `kassian2019`, `nrt2019`), человекочитаемые подписи, `supports` по фактическому покрытию датасета (если Кассиан 2019 только НЗ — `ot: false, nt: true`; если НРТ полный — `ot: true, nt: true`), `selfHostedAllowed: true` только после подтверждения лицензии. Обновить `isBibleTranslationId` и при необходимости убрать или пометить устаревшие записи `cassian`/`nrp`, чтобы не дублировать один и тот же перевод под двумя id.  
  **Файлы:** `src/lib/bible-translations.ts`; при смене union-типа — `src/features/reading/types.ts`, `ReadingSettings.tsx` (если жёсткие списки), `directus-data.ts` дефолты.  
  **LOGGING REQUIREMENTS:** не требуется в UI; при сомнительных значениях из Directus уже есть `console.error` в хуке настроек — сохранить стиль.  
  **Зависимости:** Task 4 (чтобы знать покрытие книг).

- [x] **Task 6: Directus / API контракт для сохранённых настроек** — строковые поля; комментарий в `directus-data.ts`. При enum в Directus расширить вручную.  
  **Deliverable:** если в Directus поля `ot_translation` / `nt_translation` ограничены enum — расширить допустимые значения или миграция описана в комментарии к PR. Обновить дефолты в `src/lib/directus-data.ts` только если продукт требует стартового перевода не RST.  
  **Файлы:** `src/lib/directus-data.ts`, при необходимости схема/док вне репозитория.  
  **LOGGING REQUIREMENTS:** при отклонённом значении с бэка — уже существующий fallback в `useReadingSettings`; при добавлении серверной валидации логировать `WARN [reading-settings] unknown translation {id}, fallback rst`.  
  **Зависимости:** Task 5.

### Phase 5: Завершение

- [x] **Task 7: Полный прогон конвертера (вне этого плана по объёму)** — корпус сгенерирован. **Даниил:** в HTML NRT 12 `<h4>`-глав (протестантский канон); `ChapterQty=14` в INI — метаданные модуля; сверка количества глав идёт с `BIBLE_STRUCTURE`, ложный WARN убран (`/aif-fix`). Политика деплоя больших `data/bible/*` / `.gitignore` — по-прежнему на усмотрение команды (см. комментарии в `cli.ts` / `bible-translations.ts`).  
  **Deliverable:** после утверждения формата — сгенерировать все книги для обоих переводов, проверить размер репозитория и политику `.gitignore` для `data/bible/*`; при игноре — описать шаг копирования на сервер в комментарии к `deploy` / внутренней инструкции (без нового markdown-файла, если Docs: no).  
  **LOGGING REQUIREMENTS:** CLI уже из Task 3; при пакетной генерации — итоговая таблица книг / ошибок в stderr.  
  **Зависимости:** задачи 1–6.

---

## Следующие шаги

План сохранён (fast): `.ai-factory/PLAN.md`  

Запуск реализации: `/aif-implement`  

Просмотр задач: встроенный task list Cursor / ручной чеклист по разделу Tasks выше.

Для освобождения контекста при длинной сессии: `/compact` или `/clear`.
