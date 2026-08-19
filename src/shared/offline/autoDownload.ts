import {
  getManifest,
  downloadPlan,
  downloadSongs,
  downloadSetlists,
  downloadBibleTranslation,
  syncSongsDelta,
  syncSetlistsDelta,
} from './downloadManager';
import { readingSettingsApi, syncApi } from '@/shared/services/api/endpoints';
import { isDefinitelyOffline } from './networkHealth';
import { getSyncEtag, getSyncVersions, saveSyncEtag, saveSyncVersions } from './syncVersions';
import { resolveSelfHostedTranslationId, type BibleTranslationId } from '@/lib/bible-translations';

/**
 * Гибридная автозагрузка (Task T11, `.ai-factory/plans/feature-static-export-hono-bff.md`):
 * iOS партиционирует storage (Safari ≠ installed PWA) — ручной opt-in «Скачать» в Safari
 * кладёт данные не в ту партицию, которую видит установленное приложение. Решение — базовые
 * офлайн-данные докачиваются САМИ, в любом контексте (browser tab / installed PWA), сразу
 * после подтверждения сессии сервером. Ручной opt-in на остальные переводы (settings) не
 * трогаем — там продолжает работать как раньше.
 */

const DEBUG = (process.env.NEXT_PUBLIC_LOG_LEVEL ?? process.env.LOG_LEVEL ?? 'debug') === 'debug';
function debug(...args: unknown[]) {
  if (DEBUG) console.debug('[offline/autoDownload]', ...args);
}
function info(...args: unknown[]) {
  console.info('[offline/autoDownload]', ...args);
}

/** Перевод, докачиваемый автоматически, если у пользователя нет валидного nt_translation в настройках. */
export const DEFAULT_TRANSLATION: BibleTranslationId = 'rst';

/** Не форсировать автозагрузку сразу после логина — даём стартовой загрузке дашборда отработать первой. */
const IDLE_DELAY_MS = 5000;

let inFlight = false;

/** Только для тестов: сбросить in-flight гард между прогонами. */
export function __resetAutoDownloadGuard(): void {
  inFlight = false;
}

type StandaloneNavigator = Navigator & { standalone?: boolean };

/** Контекст запуска для телеметрии — не влияет на логику докачки. */
function getDisplayContext(): 'standalone' | 'browser-tab' {
  if (typeof window === 'undefined') return 'browser-tab';
  try {
    if (window.matchMedia?.('(display-mode: standalone)').matches) return 'standalone';
    if ((window.navigator as StandaloneNavigator).standalone === true) return 'standalone';
  } catch {
    /* matchMedia недоступен в некоторых тестовых окружениях — не критично */
  }
  return 'browser-tab';
}

/**
 * `nt_translation` пользователя, если он разрешён для self-host и поддерживает НЗ —
 * иначе `DEFAULT_TRANSLATION`. Сетевой сбой чтения настроек тоже даёт дефолт (докачка
 * не должна падать из-за недоступности одного эндпоинта).
 */
async function resolveDefaultTranslation(): Promise<BibleTranslationId> {
  try {
    const { settings } = await readingSettingsApi.getSettings();
    return resolveSelfHostedTranslationId(settings.nt_translation, 'nt', DEFAULT_TRANSLATION);
  } catch (err) {
    debug('reading-settings unavailable, falling back to default translation', err);
    return DEFAULT_TRANSLATION;
  }
}

/**
 * Догружает базовый офлайн-набор и приводит уже скачанное к состоянию сервера.
 *
 * Раньше здесь стоял гард `if (!have.has('songs'))` — он качал ресурс РАЗ ЗА ЖИЗНЬ
 * установки: сет, собранный в четверг, не приезжал к воскресенью. Теперь на КАЖДОМ
 * запуске сверяется sync-манифест и качается только дельта.
 *
 * Каждый джоб независим и наружу не бросает: ретрай — следующий запуск, идемпотентность
 * делает его бесплатным.
 */
export async function ensureOfflineData(): Promise<void> {
  // Заведомый офлайн — ждать нечего by construction, сеть не трогаем вовсе.
  if (isDefinitelyOffline()) {
    debug('offline — авто-загрузка и дельта-синк пропущены');
    return;
  }

  const context = getDisplayContext();
  info('auto-download starting', { context });

  const freshlyDownloaded = await ensureBaseline();
  await runDeltaSync(context, freshlyDownloaded);

  // Терминальный маркер «офлайн-данные готовы»: на него завязан e2e
  // (`cold-start-any-route.spec.ts` ждёт его перед уходом в офлайн). Переименование
  // этой строки ломает прод-контур молча — менять только вместе со спеком.
  info('auto-download finished', { context });
}

/**
 * Базовый набор: то, чего в IDB нет вообще. Манифест-стор здесь по-прежнему уместен —
 * это гард «первой загрузки», а не гард свежести (свежесть теперь на дельте).
 */
async function ensureBaseline(): Promise<Set<string>> {
  const manifest = await getManifest();
  const have = new Set(manifest.map((m) => m.key));

  const translationId = await resolveDefaultTranslation();

  const jobs: Array<{ key: string; run: () => Promise<void> }> = [];
  if (!have.has('plan')) jobs.push({ key: 'plan', run: downloadPlan });
  if (!have.has('songs')) jobs.push({ key: 'songs', run: downloadSongs });
  if (!have.has('setlists')) jobs.push({ key: 'setlists', run: downloadSetlists });
  if (!have.has(translationId)) {
    jobs.push({ key: translationId, run: () => downloadBibleTranslation(translationId) });
  }

  if (jobs.length === 0) {
    debug('baseline already present');
    return new Set();
  }

  info('baseline download', { keys: jobs.map((j) => j.key) });
  const downloaded = new Set<string>();
  for (const job of jobs) {
    try {
      await job.run();
      downloaded.add(job.key);
    } catch (err) {
      debug('baseline download failed for', job.key, err);
    }
  }
  info('baseline download finished', { requested: jobs.length, downloaded: downloaded.size });
  return downloaded;
}

/**
 * Дельта-синк: манифест → сравнение версий → докачка изменившегося → чистка удалённого.
 * Версии и ETag фиксируются ТОЛЬКО после успешного применения обеих частей — иначе
 * оборвавшийся посреди дельты запуск записал бы версию недокачанного, и следующий
 * запуск счёл бы всё актуальным.
 */
async function runDeltaSync(
  context: 'standalone' | 'browser-tab',
  freshlyDownloaded: Set<string>
): Promise<void> {
  try {
    const storedEtag = await getSyncEtag();
    const result = await syncApi.getManifest(storedEtag);

    if (result.status === 'not-modified') {
      info('delta sync: 304, ничего делать не нужно', { context });
      return;
    }

    const stored = await getSyncVersions();

    // Ресурс, только что скачанный целиком в `ensureBaseline`, уже соответствует
    // манифесту — иначе первый запуск качал бы весь каталог дважды.
    const songsBase = freshlyDownloaded.has('songs')
      ? Object.fromEntries(result.manifest.songs)
      : stored.songs;
    const setlistsBase = freshlyDownloaded.has('setlists')
      ? Object.fromEntries(result.manifest.setlists)
      : stored.setlists;
    const planBase = freshlyDownloaded.has('plan') ? result.manifest.plan : stored.plan;

    const songs = await syncSongsDelta(result.manifest.songs, songsBase);
    const setlists = await syncSetlistsDelta(result.manifest.setlists, setlistsBase);

    // План версионируется целиком: изменился — перекачиваем прогрев целиком.
    let planUpdated = false;
    if (planBase !== result.manifest.plan) {
      await downloadPlan();
      planUpdated = true;
    }

    await saveSyncVersions({
      songs: songs.versions,
      setlists: setlists.versions,
      plan: result.manifest.plan,
    });
    await saveSyncEtag(result.etag);

    info('delta sync finished', {
      context,
      songs: songs.stats,
      setlists: setlists.stats,
      planUpdated,
    });
  } catch (err) {
    // Наружу не бросаем: ретрай — следующий запуск. Версии не записаны, значит
    // недокачанное будет добрано.
    info('delta sync failed, версии НЕ зафиксированы — добор на следующем запуске', err);
  }
}

/**
 * Планирует `ensureOfflineData()` с idle/5s отложкой (не конкурировать со стартовой
 * загрузкой дашборда) и in-flight гардом (см. `sync.ts` `replayInFlight` — тот же
 * паттерн). Вызывать ТОЛЬКО после server-confirmed логина (не на ветке last-known-user
 * в `AuthProvider`) — иначе офлайн-вход попытается скачивать данные без сети.
 */
export function scheduleEnsureOfflineData(): void {
  if (inFlight) {
    debug('ensureOfflineData already scheduled/running, skipping');
    return;
  }
  inFlight = true;

  const run = () => {
    void ensureOfflineData().finally(() => {
      inFlight = false;
    });
  };

  if (typeof window === 'undefined') {
    inFlight = false;
    return;
  }
  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(run, { timeout: IDLE_DELAY_MS });
  } else {
    window.setTimeout(run, IDLE_DELAY_MS);
  }
}
