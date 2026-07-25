# Implementation Plan: Автоскролл (M5)

Ветка: `chordpro-viewer` (уже создана, новую не заводить). Дата: 2026-07-25.
Требования: `docs/song-viewer-spec.md` §8 (автоскролл), §4.5 (только в `scroll`), §11 (доступность / reduced-motion), §12 (приёмка).
Контекст и инварианты этапа: `.ai-factory/plans/feature-song-viewer-editor.md`. Порядок и статус: `.ai-factory/ROADMAP.md`.
Детальный план M4 (образец): `.ai-factory/plans/feature-song-transpose.md`.

## Settings

- **Testing:** yes — unit (чистая математика + persist) и e2e (`e2e/layout`), по §12.
- **Logging:** verbose-но-конфигурируемый по конвенции проекта (`process.env.NODE_ENV !== 'production'`-гварды, как в `SongView`); прод-бандл молчит.
- **Docs:** no (warn-only). Спека §8 — источник истины по поведению; отдельная дока не заводится, как и в M4.

## Roadmap Linkage

- **Milestone:** "M5 — Автоскролл"
- **Rationale:** следующий незаблокированный этап по `ROADMAP.md` (порядок M5 → M8); требования есть в спеке.

## Roadmap Linkage → отметить `[x]` при закрытии

M5 в `.ai-factory/ROADMAP.md` сейчас `▶ следующий` — по завершении перевести в `✅ готово (план feature-song-autoscroll.md)`.

## Фактура (проверено чтением кода 2026-07-25)

- **Скролл-контейнер** — `contentRef` в `src/app/dashboard/song/page.tsx:103` (`div.min-h-0.flex-1.overflow-y-auto`). Автоскролл гонит его `scrollTop`. Прокинут в `SongView` как `viewportRef`.
- **`useAutoHideOnScroll`** (`page.tsx:32`) отдаёт `ignoreNextScroll()` с контрактом «вызвать перед программным изменением `scrollTop`» (обёртка над `useScrollDirection`). Автоскролл обязан звать его перед каждым программным сдвигом — иначе шапка дёргается на каждый кадр. Сейчас деструктурируется только `hidden` — добавить `ignoreNextScroll`.
- **`useMediaQuery`** (`src/shared/hooks/useMediaQuery.ts`) — канонический хук media-query (`useSyncExternalStore`, SSR-снимок `false`). Reduced-motion резолвить им, не голым `matchMedia`.
- **`mode`** резолвится там же (`page.tsx:44`): `isWideLayout ? viewSettings.mode : 'scroll'`. Автоскролл активен только при `mode === 'scroll'`. Гейт узкого экрана — `SONG_WIDE_LAYOUT_QUERY` (≥640px), та же константа, что прячет постраничные контролы.
- **`--line-height`** (`components/render/songs.css`) — безразмерный множитель: `1.5` comfortable, `1.2` compact. Реальная высота строки в px = `множитель × fontSize`. Элемент потока — `[data-song-view-flow]` (`.cproColumn`) внутри контейнера; `getComputedStyle(...).lineHeight` резолвится браузером в px.
- **Персист-образец** — `src/features/songs/lib/personalKeyStore.ts`: узкий API, единственный литерал ключа, `useSyncExternalStore` через `subscribe*`, устойчивость к недоступному/битому localStorage (warn один раз, наружу не бросать), device-local до M6.
- **E2E-образец** — `e2e/layout/song-layout.spec.ts`: прод-контур (build+bff+static:serve), `login`/`appPath` из `e2e/offline/helpers`, настройки просмотра кладутся в localStorage до `goto` песни. Один логин на спек (прод rate-limit 10/15мин на IP).
- **Существующие тап-кнопки** — `h-11 w-11` (44px), фокус-ринги, `active:scale-95` — переиспользовать стиль.

## Принятые решения

1. **Скорость — свойство песни** (§8), но до M6 (обобщение outbox) персистится **устройство-локально** через узкий модуль (см. «Персист пользовательских данных» в `feature-song-viewer-editor.md`). Синхронизация между устройствами пользователю не заявляется. Подмена на outbox+Directus в M6 — правка только `autoScrollSpeedStore.ts`.
2. **5 фиксированных ступеней + запоминание последней** (§8): per-song карта `songId→stepIndex` + глобальная «последняя ступень» как дефолт для песни без своей записи.
3. **Только нативный `scrollTop`** (§8) — никаких `transform`/CSS-анимаций, чтобы палец в любой момент перехватывал скролл.
4. **FAB внизу справа**, виден только при `mode === 'scroll'` (в `sheets`/`paged` отсутствует в DOM — §4.5). Работает и в режиме «только текст» (на `showChords` не гейтить).
5. **Сетевого пути этап НЕ добавляет** — персист device-local (localStorage), нового маршрута/SW/кэша нет. ⇒ прод-офлайн-контур (`yarn build` → `out/sw.js` → `yarn e2e:offline`) **не требуется** (как в M4). Если реализация всё же тронет офлайн/роутинг/SW — контур становится обязательным.

## Commit Plan

- **Commit A** (Tasks 1–2): `feat(songs): autoscroll speed core and per-song persist`
- **Commit B** (Tasks 3–4): `feat(songs): autoscroll rAF engine and FAB control`
- **Commit C** (Task 5): `test(songs): autoscroll e2e regression`

## Tasks

### Phase 1: Чистое ядро (без React, без DOM)

- [x] **Task 1 — Ступени скорости и математика px**
  - Файлы: `src/features/songs/lib/autoScroll.ts` (new) + `autoScroll.test.ts`.
  - Экспорт: `AUTOSCROLL_STEPS` (5 ступеней в строках/мин, старт `[3,5,8,12,18]`, тюнить на корпусе), `DEFAULT_STEP_INDEX = 2`, `pixelsPerSecond(rowsPerMin, lineHeightPx) = rowsPerMin/60 * lineHeightPx`, `clampStepIndex(i) → [0..4]`.
  - Функция принимает уже посчитанный `lineHeightPx` (множитель × fontSize резолвит хук), не множитель.
  - Unit (§12): каждая ступень → ожидаемый px/сек при известной высоте строки; монотонность px/сек по ступеням; границы clamp (`-1→0`, `5→4`).
  - Логирование: нет (чистая либа).

- [x] **Task 2 — Персист скорости на песню** (depends on 1)
  - Файлы: `src/features/songs/lib/autoScrollSpeedStore.ts` (new) + test. Зеркалит `personalKeyStore.ts`.
  - Литералы ключей (единственный источник): `SONG_AUTOSCROLL_SPEED_STORAGE_KEY = 'songs:autoscroll-speed'` (карта `songId→stepIndex`), `SONG_AUTOSCROLL_LAST_STORAGE_KEY = 'songs:autoscroll-last'` (глобальная последняя ступень).
  - API: `readSpeedStep(songId): number` (per-song ?? last ?? `DEFAULT_STEP_INDEX`), `writeSpeedStep(songId, step)` (пишет per-song **и** обновляет last), `subscribeAutoScrollSpeed(listener): () => void`, `resetAutoScrollSpeedWarnings()` (тесты).
  - Валидация: целое `[0..4]` (фильтр как в `personalKeyStore`); недоступный/битый storage → дефолт, warn один раз, наружу не бросать.
  - Комментарий про M6 (device-local до обобщения outbox).
  - Тесты: read без записи → last → default; write обновляет и песню, и last; битый JSON → default; недоступный storage не роняет; подписка вызывается после write (в т.ч. неудачного).

### Phase 2: Движок

- [x] **Task 3 — Хук rAF-движка автоскролла** (depends on 1, 2)
  - Файл: `src/features/songs/hooks/useAutoScroll.ts` (new).
  - Сигнатура: `useAutoScroll({ containerRef, songId, enabled, onBeforeProgrammaticScroll? })`, `enabled = mode==='scroll' && песня загружена`. Возврат: `{ playing, step, canScroll, toggle, play, pause, setStep }`.
  - Механика (§8): `requestAnimationFrame`-цикл, аккумулировать дробные px, `container.scrollTop += delta` (только нативный `scrollTop`, без transform/CSS-анимаций). **Перед каждым программным `scrollTop` звать `onBeforeProgrammaticScroll?.()`** — страница передаёт сюда `ignoreNextScroll`, иначе `useScrollDirection` примет программный скролл за пользовательский. `px/сек = pixelsPerSecond(AUTOSCROLL_STEPS[step], lineHeightPx)`; `lineHeightPx` через `getComputedStyle([data-song-view-flow]).lineHeight` (px), fallback `fontSizePx*1.5`.
  - Прерывание (§8): passive-слушатели `touchstart` и `wheel` на контейнере → `pause`. Возобновление — только кнопкой. FAB живёт **вне** контейнера (Task 4) — тап по нему до этих слушателей не долетает, `stopPropagation` не нужен.
  - Стоп у низа (§8): `scrollTop+clientHeight >= scrollHeight-1` → `pause`, не зацикливать.
  - `canScroll = scrollHeight > clientHeight`; `play()` при `!canScroll` — no-op; отдаётся наружу, чтобы Task 4 дизейблил/прятал FAB на короткой песне.
  - reduced-motion (§11): канонический `useMediaQuery('(prefers-reduced-motion: reduce)')` (не голый `matchMedia`) → старт сразу на целевой скорости; иначе ease-in разгон ~800мс.
  - Скорость: начальная `step` из `readSpeedStep(songId)`; `setStep` → `writeSpeedStep`. Смена `songId` сбрасывает `playing` и подтягивает свою ступень.
  - Очистка: `cancelAnimationFrame` + снять слушатели при unmount / `enabled=false` / смене `songId`.
  - Логирование: dev-`console.debug` на play/pause/низ. Null-гварды на container/flow; провал `getComputedStyle` → fallback.
  - Юнит-теста нет (rAF/DOM — jsdom не воспроизводит; математика в Task 1, поведение в Task 5).

### Phase 3: UI

- [x] **Task 4 — FAB автоскролла + интеграция** (depends on 3)
  - Файлы: `src/features/songs/components/SongAutoScroll.tsx` (new) + правка `src/app/dashboard/song/page.tsx`.
  - **Размещение — вне скролл-контейнера:** FAB рендерить сиблингом `overflow-y-auto`-контейнера (`contentRef`, `page.tsx:103`) внутри обёртки `data-song-page` (дать ей `relative`), `absolute` bottom-right над областью. Причины: (1) слушатель паузы висит на контейнере — `touchstart` по FAB внутри него всплыл бы и вызвал `pause` на тапе play; (2) внутри контейнера FAB уехал бы со скроллом. Вне — обе проблемы снимаются без `stopPropagation`.
  - Кнопка play/pause (lucide `Play`/`Pause`), тап-таргет ≥44px (`h-11 w-11`, §11), `active:scale-95`, фокус-ринг. Тап → `onToggle`. При `!canScroll` — FAB скрыт/`disabled`.
  - Скорость: вторичная кнопка/чип → компактный popover из 5 сегментов (текущая подсвечена) → `onSetStep`. Только семантические токены (`bg-app-*`/`text-app-*`/`shadow-app-*`), без хардкод-шейдов и `dark:`.
  - DOM-якоря (kebab): `data-song-autoscroll`, `data-song-autoscroll-toggle`, `data-song-autoscroll-speed`, `data-song-autoscroll-speed-step`.
  - Рендерить **только** при `mode === 'scroll' && song` (в `sheets`/`paged` нет в DOM). На `showChords` не гейтить.
  - Интеграция: `const autoscroll = useAutoScroll({ containerRef: contentRef, songId: song?.id ?? '', enabled: mode==='scroll' && !!song, onBeforeProgrammaticScroll: ignoreNextScroll });` — `ignoreNextScroll` добавить в деструктуризацию `useAutoHideOnScroll` (`page.tsx:32`). Рендер `<SongAutoScroll playing step canScroll onToggle onSetStep />` сиблингом скролл-контейнера внутри `data-song-page`. Пропсы плоские (`SongAutoScrollProps` в том же файле), `'use client'`, named export.
  - Логирование: минимальное.

### Phase 4: Приёмка

- [x] **Task 5 — E2E-регрессия автоскролла** (depends on 1–4)
  - Файл: `e2e/layout/song-autoscroll.spec.ts` (new). `login`/`appPath` из `e2e/offline/helpers`, один логин на спек. Прод-контур (build+bff+static:serve).
  - Сценарии (§12): (1) scroll — FAB виден, тап play → `scrollTop` растёт (poll) → доезжает до низа и стоп (`playing` off, `scrollTop+clientHeight ≈ scrollHeight`, без отката/зацикливания); (2) прерывание — `wheel`/`touchstart` по контейнеру во время проигрывания → пауза, `scrollTop` перестаёт расти; (3) FAB отсутствует в DOM в `sheets` и `paged` (mode через localStorage-хелпер song-layout, вьюпорт 1024px).
  - Настройки — тем же приёмом, что `DEFAULT_SETTINGS` в `song-layout.spec.ts`. Чистое окружение: `npx playwright install --with-deps chromium`; не прогнал → зафиксировать `E2E НЕ ПРОГНАН: <причина>` и этап не закрывать.

## Верификация этапа

1. `yarn test` — baseline **493 теста** (число должно вырасти, не упасть), `npx tsc --noEmit` чисто.
2. `yarn lint` — baseline снять **до** работы (ожидается 59 errors / 30 warnings); в тронутых файлах ошибок быть не должно.
3. Ручная проверка в браузере (dev): старт/пауза FAB, тач прерывает, стоп у низа без зацикливания, персист ступени между перезагрузками и между песнями (у медленной свой темп), FAB отсутствует в `sheets`/`paged`, работа в режиме «только текст», `prefers-reduced-motion` → без разгона.
4. E2E `e2e/layout/song-autoscroll.spec.ts` на прод-контуре (build+bff+static:serve).
5. Прод-офлайн-контур (`out/sw.js` → `yarn e2e:offline`) **не требуется**: офлайн/SW/роутинг не тронуты (решение 5). Если этап добавит сетевой путь — контур обязателен.
