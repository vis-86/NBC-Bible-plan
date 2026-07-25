# Implementation Plan: Транспозиция и тональности (M4)

Branch: `chordpro-viewer`
Created: 2026-07-25

Контекст, инварианты и правила верификации — `.ai-factory/plans/feature-song-viewer-editor.md`
(раздел «Правила работы»). Требования — `docs/song-viewer-spec.md`: **§10 целиком**, **§3.1**
(классификация `Chord`/`Bar`/`Note`), **§2** (виды токенов в корпусе), **§12** (приёмка).

## Settings

- **Testing:** yes — вся логика этапа чистая, покрывается юнитами (vitest, окружение `node`;
  компонентным тестам — докблок `// @vitest-environment jsdom`)
- **Logging:** standard — однократные `console.warn` на нераспознанной тональности и на
  недоступном `localStorage`; спам на каждый аккорд запрещён (корпус даёт до 42 аккордовых строк)
- **Docs:** no (warn-only) — публичного API не меняем; `docs/*` правим только если тронем схему

## Roadmap Linkage

Milestone: **M4 — Транспозиция и тональности** (`.ai-factory/ROADMAP.md`).
Rationale: единственный незаблокированный этап с полными требованиями в спеке и максимальной
ценностью для музыкантов.

## Фактура (проверено чтением кода 2026-07-25)

- Разбор строки живёт в двух местах: `lib/lineParser.ts` (`parseLine`, используется для
  `isChordsOnly`) и `components/render/LineRenderer.tsx` (`renderWord` заново режет строку по
  `/(\[.*?\])/g`). Классификации маркеров нет нигде: `[|]` и `[(пауза)]` идут в `ChordRenderer`
  как обычные аккорды.
- `ChordRenderer.tsx` (`tokenizeChord`, 226 строк) — типографика аккорда, трогать нельзя (§3.4).
- Домен: `Song.key` ← `songs.song_key` (`services/songsServer.ts:31`). `default_key` **есть в
  проде и в `src/lib/directus-schema.ts`**, но в `fields` запросов не входит и в домен не попадает.
- BFF по песням — только GET (`server/src/routes/songs.ts`). Записи пользовательских данных нет.
- `@tonaljs`/`tonal` в зависимостях нет (`package.json`).
- Офлайн: песня кладётся в IDB-стор `songs` целиком (`lib/offlineSongs.ts`), read-through уже есть.

## Принятые решения

1. **Точка применения транспозиции — сырая строка ChordPro перед рендером.** Чистая
   `transposeLine(line, semitones, targetKey)` переписывает содержимое `[...]`, дальше идёт
   существующий рендер-путь без изменений. Альтернатива «переписать рендер на токен-модель §3.1
   целиком» — заметно больший объём и риск потерять типографику §3.4; токен-модель нужна этапу
   как **классификация маркеров**, а не как новый DOM.
2. **Библиотека — `tonal`** (MIT, активная, tree-shakeable подпакеты `Note`/`Interval`/`Key`).
   Прямо предписана спекой §10.3. Самописная энгармония по целевой тональности (§10.2) — заметный
   объём и ровно тот класс ошибок, на который жалуются музыканты (`A#` вместо `Bb`).
3. **Личная тональность до M6 — localStorage** (см. «Персист пользовательских данных» в документе
   остатка работ). Слой персиста — один модуль с узким API (`readPersonalKey`/`writePersonalKey`/
   `clearPersonalKey`), чтобы подмена на outbox+Directus в M6 была локальной правкой.
   Синхронизация между устройствами пользователю не заявляется.
4. **Сетлистного уровня (`setlist_items.key`) в этом этапе нет** — сетлистов нет (M7). Резолвер
   пишем с полной цепочкой §10.1 и тестируем все четыре ветки, но аргумент `setlistKey` в UI
   всегда `undefined`. Это не «конфигурируемость на будущее», а требование спеки к резолверу.

## NEEDS DECISION (не блокирует старт, нужно к задаче 6)

- Селектор тональности при `showChords: false` («только текст») — прятать или дизейблить?
  Предлагаю прятать: без аккордов настройка ни на что не влияет.
- Транспонировать ли `{key:}` в шапке песни при смене тональности — да (показываем действующую),
  но нужно подтверждение формулировок UI из §10.1: «Соль (по умолчанию)» / «Ля-бемоль (моя)».

## Commit Plan

- **Commit 1** (задачи 1–3): `feat(songs): chord marker classification and transposition core`
- **Commit 2** (задачи 4–5): `feat(songs): resolve effective song key`
- **Commit 3** (задачи 6–7): `feat(songs): key picker and transposed rendering`
- **Commit 4** (задача 8): `test(songs): transposition regression on corpus extremes`

## Tasks

### Phase 1: Чистое ядро (без React, без DOM)

- [ ] **Task 1 — Классификация маркеров**
  **Файл:** `src/features/songs/lib/markers.ts` (новый)
  - Типы по §3.1: `type Marker = { kind: 'chord'; text } | { kind: 'bar' } | { kind: 'note'; text }`.
  - `classifyMarker(raw: string): Marker` — `|` → `bar`; `^\(.*\)$` → `note`; иначе `chord`.
    Не валидирует аккорд: `[C#mсть.]` остаётся `chord` и рендерится как есть (§2).
  - Логирование: нет (вызывается на каждый токен, любой лог здесь = спам).
  - **Тесты** `markers.test.ts`: все пять видов из таблицы §2 (`[G]`, `[C/G]`, `[F#sus4]`, `[|]`,
    `[E-B/D#-E/D]`, `[(пауза)]`, `[C#mсть.]`).

- [ ] **Task 2 — Зависимость `tonal` + транспозиция аккорда**
  **Файлы:** `package.json` (`yarn add tonal` — **только yarn**), `src/features/songs/lib/transpose.ts` (новый)
  - `transposeChord(text: string, semitones: number, targetKey: string): string`:
    цепочка через `-` → сплит, транспозиция каждого, сборка обратно; бас после `/` — отдельно;
    нераспознанное — возврат **как есть** (§10.3, не падать).
  - Спеллинг диез/бемоль берётся из целевой тональности (`Key.majorKey`/`Key.minorKey`),
    не из направления сдвига (§10.2).
  - `transposeLine(line, semitones, targetKey)` — переписывает только маркеры `kind: 'chord'`;
    `bar`/`note` проходят насквозь. При `semitones === 0` возвращает исходную строку без работы.
  - Ошибки: непарсящийся аккорд — тихий возврат исходного текста (это данные корпуса, не сбой).
  - **Тесты** `transpose.test.ts`: цепочки, бас-ноты, битые токены, `[|]`/`[(пауза)]` неизменны,
    выбор диезов/бемолей (`Eb` даёт `Ab`/`Bb`, `D` даёт `F#`/`C#`), `semitones === 0` — identity.

- [ ] **Task 3 — Разрешение действующей тональности**
  **Файл:** `src/features/songs/lib/songKey.ts` (новый)
  - `resolveEffectiveKey({ personalKey, setlistKey, defaultKey, originalKey })` — первое непустое
    (§10.1); пустой `defaultKey` ⇒ `originalKey`.
  - `semitonesBetween(originalKey, effectiveKey)` через `Interval.distance`; нераспознанная
    тональность ⇒ `0` + **однократный** `console.warn('[songKey] unknown key', { originalKey, effectiveKey })`.
  - `keyOptions(originalKey)` — список тональностей для селектора **в том же ладу**, что исходная
    (`Em` + «Соль» = `Gm`, §10.3).
  - **Тесты** `songKey.test.ts`: все четыре ветки резолвера + пустой `defaultKey`; сохранение лада;
    неизвестная тональность → 0 полутонов и один warn.

### Phase 2: Данные

- [ ] **Task 4 — `default_key` в домене**
  **Файлы:** `src/features/songs/services/songsServer.ts`, `src/features/songs/types.ts`
  - Добавить `default_key` в `fields` детали (`getSongById`); в списке **не** запрашивать —
    списку тональность не нужна, лишние поля утяжеляют `songs:list`.
  - `Song.defaultKey?: string` рядом с существующим `key` (= `song_key`, исходная). Комментарии
    в типе должны различать три уровня §10.1 — их путают в первую очередь.
  - **Офлайн (обязательная проверка, не сетевой путь):** поле аддитивное, новых fetch-путей и
    маршрутов нет ⇒ `DB_VERSION` не поднимаем, `APP_SHELL_ROUTES` не трогаем. Но песни, уже
    лежащие в IDB, придут **без** `defaultKey` ⇒ резолвер обязан отработать `undefined` →
    `originalKey`. Тест на это — в `songKey.test.ts` (ветка «пустой defaultKey») и в
    `offlineSongs.test.ts` (кэш старой формы читается без ошибки).
  - **Тесты:** дополнить `songsServer.test.ts` — `default_key` присутствует в `fields` детали
    и маппится в `defaultKey`.

- [ ] **Task 5 — Персист личной тональности**
  **Файл:** `src/features/songs/lib/personalKeyStore.ts` (новый)
  - Один экспортируемый константный ключ `SONG_PERSONAL_KEYS_KEY = 'songs:keys'`, один JSON-объект
    `{ [songId: string]: string }` — по инварианту «один источник ключа для писателя и читателя».
  - API: `readPersonalKey(songId)`, `writePersonalKey(songId, key)`, `clearPersonalKey(songId)`.
  - Ошибки: `localStorage` недоступен/битый JSON (Safari private mode, quota) → `try/catch`,
    **однократный** `console.warn('[personalKeyStore] localStorage unavailable', err)`, наружу
    не бросать, читатель получает `undefined` (как `useSongViewSettings`).
  - Комментарий в шапке модуля: временное устройство-локальное хранилище, в M6 заменяется на
    outbox + `song_user_state` (§7).
  - **Тесты** `personalKeyStore.test.ts` (jsdom): запись/чтение/сброс, битый JSON → пусто,
    недоступный `localStorage` → не бросает и warn ровно один раз.

### Phase 3: UI

- [ ] **Task 6 — Селектор тональности в шапке песни** (depends on 3, 5)
  **Файлы:** `src/features/songs/components/SongKeyPicker.tsx` (новый),
  `src/features/songs/components/SongView.tsx`, `src/features/songs/hooks/useSongKey.ts` (новый)
  - `useSongKey(song)` связывает резолвер и персист: отдаёт `{ effectiveKey, source, semitones,
    setKey, resetKey }`, где `source: 'personal' | 'default' | 'original'`.
  - `SongKeyPicker` — выбор из `keyOptions(originalKey)`, подпись источника по §10.1
    («Соль (по умолчанию)» / «Ля-бемоль (моя)»), кнопка «сбросить» видна только при `personal`.
    Тап-таргеты ≥44px (§11). Только семантические токены `bg-app-*`/`text-app-*`/`border-app-*`.
  - DOM-якоря — kebab-case: `data-song-key-picker`, `data-song-key-picker-value`.
  - Место — шапка песни (§3.5, рядом с темпом/размером). При `showChords: false` не рендерится
    (см. NEEDS DECISION — подтвердить у Игоря перед реализацией).
  - **Тесты** `SongKeyPicker.test.tsx` (jsdom): подпись источника для трёх веток, «сбросить»
    только при личной тональности, выбор пишет в стор.

- [ ] **Task 7 — Применение транспозиции в рендере** (depends on 2, 6)
  **Файл:** `src/features/songs/components/SongView.tsx`
  - Секции прогоняются через `transposeLine` в `useMemo` по `[sections, semitones, effectiveKey]`;
    при `semitones === 0` — исходные строки без копирования.
  - Раскладку (`useSheets`/`usePagedFlow`) **не трогать**, но смена тональности меняет ширину
    аккордов ⇒ проверить, что листы пересобираются: `useSheets` перестраивается на смену
    типографики — убедиться, что транспозиция входит в его триггеры, иначе после смены
    тональности возможен пустой/обрезанный лист.
  - **Тесты:** дополнить `SongView.test.tsx` — при ненулевом сдвиге в DOM аккорд транспонирован,
    `[|]` и `[(пауза)]` не изменились.

### Phase 4: Приёмка

- [ ] **Task 8 — Регрессия на экстремумах корпуса** (depends on 1–7)
  **Файлы:** `src/features/songs/lib/__fixtures__/` (дополнить), `transpose.test.ts`
  - Прогон транспозиции на песнях из таблицы §12: `1-аллилуйя-наш-спаситель` (аккорды внутри
    слова, `[|]`), `45-святая-ночь` (110 симв., 7 токенов), `66-на-кресте-совершилось-всё`
    (42 аккордовые строки), плюс песня с `[(пауза)]`, `[E-B/D#-E/D]`, `[C#mсть.]`.
  - Ассерты: число маркеров до и после совпадает; ни один `bar`/`note` не изменился; ни одно
    исключение не выброшено; транспозиция на +12 полутонов возвращает исходные аккорды.
  - E2E не требуется: маршруты, SW, офлайн-пути и раскладка не меняются (§12 относит
    транспозицию к unit-уровню). Если Task 7 всё же тронет `useSheets` — прогнать
    `yarn playwright test e2e/layout` дополнительно.

## Верификация этапа

1. `yarn test` (baseline 421 — число должно вырасти, не упасть), `npx tsc --noEmit`.
2. `yarn lint` — baseline снять **до** работы (ожидается 59 errors / 30 warnings); в тронутых
   файлах ошибок быть не должно.
3. Ручная проверка в браузере: смена тональности на песне с `[|]` и `[(пауза)]`, персист между
   перезагрузками, сброс к «по умолчанию», режим «только текст».
4. Прод-контур (`yarn build` → `out/sw.js` → `yarn e2e:offline`) **не требуется**: офлайн,
   SW и роутинг не тронуты. Если этап всё же добавит сетевой путь — контур становится обязательным.
