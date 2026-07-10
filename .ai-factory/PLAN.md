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

- [ ] **#8** `data-verse`-анкеры в BibleText (всегда, даже при скрытых номерах) + утилита `getTopVisibleVerse`/`scrollToVerse` (учёт sticky-header). + jsdom-тесты.
  - Уточнение по коду (`BibleText.tsx:83-91`, `strong`-рендерер): при `!verse_numbers_visible` сейчас `return null` — элемента нет вообще, вешать `data-verse` не на что; заменить на невидимый маркер (`<span data-verse={verseNum} className={settings.verse_numbers_visible ? '' : 'hidden'} />` вместо номера), НЕ убирать саму ветку скрытия номера.
  - Первый стих в каждом абзаце (`processNode`, ветки :34-42 и :56-64) сейчас НЕ оборачивается в `<span>` (голый `<strong>` или ничего) — в отличие от «не первых» стихов (`inline-block ml-4`, :35, :57). Обернуть первый стих в такой же span с `data-verse`, иначе анкер и `getTopVisibleVerse`/`scrollToVerse` будут работать только для не-первых стихов при видимых номерах.
- [ ] **#9** (после #7, #8) `TranslationBadge` в правом блоке `ReadingHeader`: текущий перевод для testament книги, дропдаун из `getSelfHostedTranslationOptions`, on select: снять якорный стих → `updateSettings` → после загрузки текста `scrollToVerse`. Disabled на время сохранения, ошибка сохранения не меняет UI. + component-тесты.

<!-- Commit checkpoint: "feat(reading): translation badge-dropdown in reader header with verse-anchored scroll" -->

### Phase 3 — настройка «каждый стих с новой строки» (задачи #10, #11)

- [ ] **#10** Поле `verse_per_line: boolean` (default false) сквозь: `ReadingSettings` тип, defaults+коэрция в `useReadingSettings`, `ReadingSettingsResponse`, `saveReadingSettings`/`getReadingSettings` в directus-data.ts, **новое boolean-поле в Directus-коллекции `reading_settings`** (dev сейчас, прод — тем же POST /fields при деплое; admin-токен прода ротируется — брать актуальный). + unit-тест хука.
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

- Directus: поле `verse_per_line` (boolean, default false) в `reading_settings` — создать в dev при реализации #10; на проде — тот же запрос при деплое.
- **Проверить прод-Directus:** в коллекции `reading_settings` существуют поля `ot_translation`/`nt_translation` и updateItem их реально сохраняет — пересборка прода уже теряла части схемы; отсутствующее поле Directus молча отбрасывает, что даёт ровно симптом «смена перевода ничего не меняет». Warn-лог mismatch из #7 — индикатор.
