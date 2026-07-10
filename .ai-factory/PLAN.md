# Смена перевода: мгновенное применение, беджик в шапке чтения, «стих с новой строки»

**Ветка:** feature/static-export-hono-bff (новую не создаём — fast mode)
**Дата:** 2026-07-10
**Тип:** fix + feature

## Settings

- **Testing:** yes — unit/component-тесты для серверного роута, кеш-ключевания, дропдауна, тумблера и рендера
- **Logging:** verbose (DEBUG-логи в hot-точках смены перевода и restore скролла)
- **Docs:** no (warn-only)

## Архитектурное решение (зафиксировано с Игорем)

**Единственный источник истины перевода — серверные reading-settings** (сессия → Directus `reading_settings`). Клиент НЕ передаёт translation в запросе главы: `bibleApi.getText` и `server/src/routes/bible.ts` не меняются. Клиентский `translationId` в `useBibleText` — только ключ кеша и «ожидание», а не команда серверу. Существующий query-параметр `?translation=` остаётся как есть — fallback для запросов без сессии.

## Диагноз бага (по разведке кода)

**Отравление in-memory кеша.** `useBibleText.ts:66` кладёт ответ в module-level Map под КЛИЕНТСКИМ `translationId`, даже если сервер вернул другой перевод (`response.translation`). Ранний return из `getCachedText` (строки 25–31) затем навсегда отдаёт чужой текст под новым ключом до перезагрузки страницы. IDB-слой (`persistText`) уже ключуется правильно — по `response.translation`.

Последовательность «POST настроек → setSettings → рефетч» в `useReadingSettings`/`useBibleText` корректна (await до setState, `translationId` в deps эффекта). Постоянный mismatch `response.translation` vs запрошенного — сигнал, что поле перевода не сохраняется в Directus (warn-лог из задачи #7 это выявит; чек-лист прод-полей — во «Внешних шагах»).

Инфраструктура для остального готова: `useBibleText` уже рефетчит по `translationId` в deps эффекта; переводы и опции — `src/lib/bible-translations.ts` (`getSelfHostedTranslationOptions`); настройки — единый `ReadingSettings` (types.ts) через `useReadingSettings` → POST `/api/user/reading-settings` → Directus `reading_settings`.

## Tasks

### Phase 1 — фикс смены перевода (задача #7)

- [x] **#7** Доверять `response.translation`: `setCachedText` ключевать по переводу из ответа сервера; при mismatch показать текст, но не кешировать под запрошенным ключом + warn-лог (диагностика рассинхрона клиент/Directus). Сервер и API-клиент не трогаем. + тесты на рефетч при смене translationId и на отсутствие отравления.

<!-- Commit checkpoint: "fix(reading): key bible text cache by server-resolved translation" -->

### Phase 2 — беджик-дропдаун перевода в шапке (задачи #8, #9)

- [x] **#8** `data-verse`-анкеры в BibleText (всегда, даже при скрытых номерах) + утилита `getTopVisibleVerse`/`scrollToVerse`.
  - По факту (проверено рендер-пробой в jsdom): `processNode`/`isFirst`-логика в `p`-компоненте (обёртка `inline-block ml-4`) — мёртвый код, никогда не срабатывает (react-markdown уже конвертирует `**N**` в `<strong>`-элемент до попадания в `children`, и `node.type` там — ссылка на компонент-функцию, не строка `'strong'`). И первый, и последующие стихи реально рендерятся ОДИНАКОВО голым `<strong>` из `strong`-оверрайда — обёртки нет ни у одного. Правка сведена к одному месту: `strong`-рендерер (:83-91) — `data-verse` ставится всегда; при `!verse_numbers_visible` вместо `return null` теперь `<strong data-verse={verseNum} className="hidden">` (без визуального следа, но с якорем).
- [x] ~~**#9** `TranslationBadge` в правом блоке `ReadingHeader`~~ — **откачено** (2026-07-10): беджик-дропдаун перевода прямо в шапке чтения — плохой UX, убран из `ReadingHeader`/`ReadingView`; компонент `TranslationBadge` удалён. Перевод меняется только через настройки (`ReadingSettingsForm`). Verse-anchor инфраструктура (#8, `data-verse`/`getTopVisibleVerse`/`scrollToVerse`) сохранена как есть.

<!-- Commit checkpoint: "feat(reading): translation badge-dropdown in reader header with verse-anchored scroll" -->

### Phase 3 — настройка «каждый стих с новой строки» (задачи #10, #11)

- [x] **#10** Поле `verse_per_line: boolean` (default false) сквозь: `ReadingSettings` тип, defaults+коэрция в `useReadingSettings`, `ReadingSettingsResponse`, `saveReadingSettings`/`getReadingSettings` в directus-data.ts, новое boolean-поле в Directus-коллекции `reading_settings`. + unit-тест хука.
  - Поле создано idempotent-скриптом `scripts/add-verse-per-line-field.ts` (`npx tsx scripts/add-verse-per-line-field.ts`) — применён в dev; на проде запустить тот же скрипт с прод-`DIRECTUS_ADMIN_TOKEN` при деплое.
- [ ] **#11** (после #10) Рендер: при `verse_per_line` каждый стих — блок с маленьким отступом (`block mt-1` вместо `inline-block ml-4`), комбинации с `verse_numbers_visible`/`text_align`; тумблер `data-section="verse-per-line"` в `ReadingSettingsForm` по паттерну verse-numbers (строки 234–254) — появится и в настройках, и в шите чтения. + тесты рендера и тумблера.

<!-- Commit checkpoint: "feat(reading): verse-per-line display setting" -->

## Commit Plan

- **Commit 1** (после #7): `fix(reading): key bible text cache by server-resolved translation`
- **Commit 2** (после #8–#9): `feat(reading): translation badge in reader header, keep scroll on verse`
- **Commit 3** (после #10–#11): `feat(reading): verse-per-line setting`

## Верификация (обязательна перед завершением)

- `npm run lint` и `npx vitest run` зелёные.
- Ручная проверка в браузере: смена перевода из шита настроек и из беджика меняет текст сразу; скролл остаётся на том же стихе; тумблер «стих с новой строки» меняет вёрстку и переживает перезагрузку (persist в Directus).

## Внешние шаги (не забыть)

- Directus: поле `verse_per_line` (boolean, default false) в `reading_settings` — создано в dev скриптом `add-verse-per-line-field.ts`; на проде — тот же скрипт при деплое.
- **Подтверждено (2026-07-10):** полей `ot_translation`/`nt_translation` НЕ было в схеме `reading_settings` вообще (проверено `readFieldsByCollection` — только `verse_numbers_visible`, без переводов). Это и была причина «смена перевода ничего не меняет»: Directus молча отбрасывает неизвестные поля при `updateItem`, сервер всегда резолвил дефолт `'rst'`. Поля созданы idempotent-скриптом `scripts/add-translation-fields.ts` (string, default `'rst'`) — применено в текущем окружении (.env.local указывает на тот же Directus, что и прод, см. [[directus-instance]]). Если разворачивается отдельный прод-Directus/пересборка — прогнать тот же скрипт там.
