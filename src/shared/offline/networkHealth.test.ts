import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  OfflineNoDataError,
  isDefinitelyOffline,
  isNetworkSuspect,
  isOfflineNoData,
  raceNetwork,
  reportNetworkSuccess,
  reportNetworkTimeout,
  resetNetworkSuspicionForTests,
} from './networkHealth';
import { NetworkTimeoutError, raceWithTimeout } from './networkTimeout';

/** Промис, который никогда не сеттлится — модель «висящей» сети (не падающей, а зависшей). */
const hang = () => new Promise<never>(() => {});

/** Даёт отработать подписке `promise.then(reportNetworkSuccess)` — она живёт в микротасках. */
const flushMicrotasks = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

describe('networkHealth circuit breaker', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetNetworkSuspicionForTests();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  describe('замкнутая цепь — ведёт себя как raceWithTimeout', () => {
    it('возвращает результат promise, успевшего раньше таймаута', async () => {
      await expect(raceNetwork(Promise.resolve(42), 1000)).resolves.toBe(42);
    });

    it('зависший promise отклоняется NetworkTimeoutError по истечении таймаута', async () => {
      // Обработчик вешаем ДО продвижения таймеров, иначе reject всплывает как unhandled.
      const assertion = expect(raceNetwork(hang(), 6000)).rejects.toBeInstanceOf(NetworkTimeoutError);
      await vi.advanceTimersByTimeAsync(6000);
      await assertion;
    });
  });

  describe('разомкнутая цепь — мгновенный фолбэк', () => {
    it('после reportNetworkTimeout следующий вызов отклоняется, не дожидаясь таймаута', async () => {
      reportNetworkTimeout();

      // Таймеры не двигаем: если бы вызов реально ждал 6s, тест бы завис.
      await expect(raceNetwork(hang(), 6000)).rejects.toBeInstanceOf(NetworkTimeoutError);
    });

    it('исходный promise не отменяется — его по-прежнему можно дождаться при пустом кеше', async () => {
      reportNetworkTimeout();
      const network = Promise.resolve('поздние данные');

      await expect(raceNetwork(network, 6000)).rejects.toBeInstanceOf(NetworkTimeoutError);
      await expect(network).resolves.toBe('поздние данные');
    });

    it('таймаут одного вызова размыкает цепь — следующий уходит в кеш мгновенно', async () => {
      // Сценарий «auth заплатил 6s — данные дашборда не платят».
      const first = expect(raceNetwork(hang(), 6000)).rejects.toBeInstanceOf(NetworkTimeoutError);
      await vi.advanceTimersByTimeAsync(6000);
      await first;

      await expect(raceNetwork(hang(), 6000)).rejects.toBeInstanceOf(NetworkTimeoutError);
    });
  });

  describe('замыкание цепи', () => {
    it('поздний успех уже начатого запроса замыкает цепь', async () => {
      reportNetworkTimeout();
      let resolveNetwork!: (value: string) => void;
      const network = new Promise<string>((resolve) => {
        resolveNetwork = resolve;
      });

      await expect(raceNetwork(network, 6000)).rejects.toBeInstanceOf(NetworkTimeoutError);
      expect(isNetworkSuspect()).toBe(true);

      resolveNetwork('ok');
      await flushMicrotasks();

      expect(isNetworkSuspect()).toBe(false);
    });

    it('reject по НЕ-таймауту цепь не размыкает: сервер ответил — сеть жива', async () => {
      const apiError = new Error('ApiClientError: 500');

      await expect(raceNetwork(Promise.reject(apiError), 6000)).rejects.toBe(apiError);

      expect(isNetworkSuspect()).toBe(false);
    });

    it('reportNetworkSuccess замыкает цепь', () => {
      reportNetworkTimeout();
      expect(isNetworkSuspect()).toBe(true);

      reportNetworkSuccess();
      expect(isNetworkSuspect()).toBe(false);
    });

    it('по истечении TTL цепь переходит в half-open: вызов снова реально ждёт сеть', async () => {
      reportNetworkTimeout();
      await vi.advanceTimersByTimeAsync(20_000);
      expect(isNetworkSuspect()).toBe(false);

      const probe = raceNetwork(hang(), 6000);
      let settled = false;
      probe.catch(() => {
        settled = true;
      });
      await flushMicrotasks();
      expect(settled).toBe(false); // half-open проба ждёт, а не отклоняется мгновенно

      await vi.advanceTimersByTimeAsync(6000);
      await expect(probe).rejects.toBeInstanceOf(NetworkTimeoutError);
    });
  });

  describe('navigator.onLine', () => {
    it('onLine === false → мгновенное отклонение даже при замкнутой цепи', async () => {
      vi.stubGlobal('navigator', { onLine: false });

      expect(isNetworkSuspect()).toBe(true);
      await expect(raceNetwork(hang(), 6000)).rejects.toBeInstanceOf(NetworkTimeoutError);
    });

    it('onLine === true не размыкает цепь сам по себе (API врёт только в сторону true)', async () => {
      vi.stubGlobal('navigator', { onLine: true });

      expect(isNetworkSuspect()).toBe(false);
      await expect(raceNetwork(Promise.resolve(1), 6000)).resolves.toBe(1);
    });

    it('isDefinitelyOffline отличает жёсткий офлайн от разомкнутой цепи', () => {
      // Цепь разомкнута таймаутом — сеть «висит», но она есть: ждать имеет смысл.
      reportNetworkTimeout();
      expect(isNetworkSuspect()).toBe(true);
      expect(isDefinitelyOffline()).toBe(false);

      vi.stubGlobal('navigator', { onLine: false });
      expect(isDefinitelyOffline()).toBe(true);
    });

    it('navigator отсутствует (SSR) → не падает, работает только TTL-логика', async () => {
      vi.stubGlobal('navigator', undefined);

      expect(isNetworkSuspect()).toBe(false);
      reportNetworkTimeout();
      expect(isNetworkSuspect()).toBe(true);
    });
  });

  describe('OfflineNoDataError', () => {
    it('isOfflineNoData отличает его от прочих ошибок и несёт текст для UI', () => {
      const err = new OfflineNoDataError();
      expect(isOfflineNoData(err)).toBe(true);
      expect(isOfflineNoData(new NetworkTimeoutError(0))).toBe(false);
      expect(err.message).toContain('офлайн');
    });
  });

  describe('инвариант: breaker не видит IDB', () => {
    it('разомкнутая цепь не влияет на raceWithTimeout — IDB-фолбэк жив в офлайне', async () => {
      // Регрессия: если бы breaker сидел внутри raceWithTimeout, `getDB()` из db.ts
      // мгновенно падал бы ровно тогда, когда IDB — единственный источник данных.
      reportNetworkTimeout();

      await expect(raceWithTimeout(Promise.resolve('из IDB'), 1000)).resolves.toBe('из IDB');
    });
  });
});
