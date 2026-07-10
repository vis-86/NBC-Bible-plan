import { DEFAULT_NETWORK_TIMEOUT_MS, NetworkTimeoutError, isNetworkTimeout, raceWithTimeout } from './networkTimeout';

/**
 * Circuit breaker для сетевых путей офлайн-слоя.
 *
 * Корень бага «офлайн работает, но всё грузится по 6 секунд на слой»: каждый
 * network-first путь честно ждал свой таймаут, а слои идут последовательно
 * (сессия → данные дашборда) — ~12s до контента, который всё это время лежит в IDB.
 * Общей памяти о состоянии сети не было: каждый экран платил заново.
 *
 * Два дешёвых сигнала закрывают это:
 *   1. `navigator.onLine === false` — врёт только в сторону `true`, поэтому `false`
 *      означает «точно офлайн»: в сеть можно не ходить вовсе;
 *   2. уже случившийся таймаут — «висящая» сеть (мёртвая сота, Wi-Fi без аплинка)
 *      провесит и следующий запрос. Первый таймаут размыкает цепь на TTL, дальше
 *      сетевые чтения мгновенно падают в кеш; успешный ответ замыкает обратно.
 *
 * Breaker живёт ЗДЕСЬ, а не внутри `raceWithTimeout`: тот — чистый generic-комбинатор
 * «промис + дедлайн», и им пользуется `db.ts` для `indexedDB.open()`. Свяжи их — и
 * разомкнутая цепь начнёт мгновенно ронять `getDB()`, то есть IDB-фолбэк умрёт ровно
 * в тот момент, когда он единственный источник данных.
 */

const DEBUG = (process.env.NEXT_PUBLIC_LOG_LEVEL ?? process.env.LOG_LEVEL ?? 'debug') === 'debug';
function debug(...args: unknown[]) {
  if (DEBUG) console.debug('[FIX][networkHealth]', ...args);
}

/** Как долго держим цепь разомкнутой после таймаута, прежде чем пустить пробный запрос. */
const SUSPECT_TTL_MS = 20_000;

/** 0 — цепь замкнута (сеть считается здоровой). */
let suspectUntil = 0;

/**
 * Сеть отсутствует ЗАВЕДОМО. `navigator.onLine` врёт только в сторону `true`, поэтому
 * `false` — надёжный сигнал: ждать ответа бессмысленно, его не будет.
 *
 * Отличать от `isNetworkSuspect`: разомкнутая цепь значит «сеть висит», и запрос всё
 * ещё может доехать — там ожидание оправдано.
 */
export function isDefinitelyOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

/**
 * Кеша нет и сети заведомо нет — ждать нечего. Бросается вместо бесконечного ожидания
 * сети: `message` уходит прямо в UI (страницы песен/чтения рендерят `err.message`).
 */
export class OfflineNoDataError extends Error {
  constructor() {
    super('Нет данных офлайн. Подключитесь к интернету.');
    this.name = 'OfflineNoDataError';
  }
}

export function isOfflineNoData(err: unknown): err is OfflineNoDataError {
  return err instanceof OfflineNoDataError;
}

/**
 * Стоит ли вообще ходить в сеть. `navigator.onLine === false` — жёсткий офлайн;
 * иначе смотрим, не разомкнута ли цепь недавним таймаутом.
 */
export function isNetworkSuspect(now: number = Date.now()): boolean {
  if (isDefinitelyOffline()) return true;
  return now < suspectUntil;
}

/** Размыкает цепь на TTL: следующие сетевые чтения уйдут в кеш, не дожидаясь таймаута. */
export function reportNetworkTimeout(now: number = Date.now()): void {
  suspectUntil = now + SUSPECT_TTL_MS;
  console.debug('[FIX][networkHealth] circuit opened — сеть висит, читаем из кеша', { ttlMs: SUSPECT_TTL_MS });
}

/** Замыкает цепь: сеть ответила, network-first снова работает как обычно. */
export function reportNetworkSuccess(): void {
  if (suspectUntil === 0) return;
  suspectUntil = 0;
  console.debug('[FIX][networkHealth] circuit closed — сеть ответила');
}

/** Модульное состояние переживает тесты внутри файла — сбрасываем в `beforeEach`. */
export function resetNetworkSuspicionForTests(): void {
  suspectUntil = 0;
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => reportNetworkSuccess());
}

/**
 * `raceWithTimeout` для сетевых путей: тот же контракт (`NetworkTimeoutError`, исходный
 * promise не отменяется), плюс circuit breaker. При разомкнутой цепи отклоняется
 * мгновенно — вызывающий уходит в свой кеш-фолбэк без ожидания, а если кеша нет,
 * он по-прежнему может дождаться `promise` (паттерн «нет фолбэка — ждём сеть»).
 */
export async function raceNetwork<T>(promise: Promise<T>, ms: number = DEFAULT_NETWORK_TIMEOUT_MS): Promise<T> {
  // Подписка ДО короткого замыкания: иначе поздний успех уже начатого запроса никто не
  // увидит и цепь замкнётся только по TTL/`online`. Reject глотаем — им заведует caller.
  promise.then(reportNetworkSuccess, () => {});

  if (isNetworkSuspect()) {
    debug('circuit open — мгновенный фолбэк без похода в сеть');
    throw new NetworkTimeoutError(0);
  }

  try {
    return await raceWithTimeout(promise, ms);
  } catch (err) {
    // Только таймаут — признак висящей сети. Reject по другой причине (например,
    // ApiClientError от ответившего сервера) значит, что сеть жива: цепь не трогаем.
    if (isNetworkTimeout(err)) reportNetworkTimeout();
    throw err;
  }
}
