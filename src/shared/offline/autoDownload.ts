import { getManifest, downloadPlan, downloadSongs, downloadBibleTranslation } from './downloadManager';
import { readingSettingsApi } from '@/shared/services/api/endpoints';
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
 * Идемпотентно докачивает недостающее по манифест-стору IDB: план, песни, дефолтный
 * перевод. Каждый джоб независим — обрыв одного не должен блокировать остальные, и не
 * бросает наружу (ретрай — на следующем запуске `ensureOfflineData`, идемпотентность
 * делает его бесплатным).
 */
export async function ensureOfflineData(): Promise<void> {
  const manifest = await getManifest();
  const have = new Set(manifest.map((m) => m.key));

  const translationId = await resolveDefaultTranslation();

  const jobs: Array<{ key: string; run: () => Promise<void> }> = [];
  if (!have.has('plan')) jobs.push({ key: 'plan', run: downloadPlan });
  if (!have.has('songs')) jobs.push({ key: 'songs', run: downloadSongs });
  if (!have.has(translationId)) {
    jobs.push({ key: translationId, run: () => downloadBibleTranslation(translationId) });
  }

  if (jobs.length === 0) {
    debug('nothing to auto-download, baseline already present');
    return;
  }

  const context = getDisplayContext();
  info('auto-download starting', { context, keys: jobs.map((j) => j.key) });

  let downloaded = 0;
  for (const job of jobs) {
    try {
      await job.run();
      downloaded++;
    } catch (err) {
      debug('auto-download failed for', job.key, err);
    }
  }

  info('auto-download finished', { context, requested: jobs.length, downloaded });
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
