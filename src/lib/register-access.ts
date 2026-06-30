import { timingSafeEqual } from 'crypto';

/**
 * Контроль доступа к самостоятельной регистрации по «коду церкви».
 *
 * Источник истины — server-only секрет `REGISTER_CHURCH_CODE`. Если он не задан —
 * регистрация выключена (роут отвечает 503). Сам код общий и брутфорсимый, поэтому
 * сравнение делается timing-safe, а главный барьер — rate-limit на роуте.
 *
 * ВАЖНО: никогда не логировать значение кода (ни ожидаемого, ни присланного).
 */

const DEBUG = (process.env.LOG_LEVEL ?? 'debug') === 'debug';
function debug(...args: unknown[]) {
  if (DEBUG) console.debug('[register-access]', ...args);
}

/** Регистрация открыта только если задан непустой секрет `REGISTER_CHURCH_CODE`. */
export function isRegistrationOpen(): boolean {
  const code = process.env.REGISTER_CHURCH_CODE;
  const open = typeof code === 'string' && code.length > 0;
  debug('registration open:', open);
  return open;
}

/**
 * Timing-safe сравнение присланного кода церкви с секретом.
 * Guard по длине (разная длина → false без throw), т.к. `timingSafeEqual`
 * бросает на буферах разной длины — это утекало бы по таймингу/исключению.
 * @returns true только если регистрация открыта И код совпадает.
 */
export function verifyChurchCode(provided: string): boolean {
  const expected = process.env.REGISTER_CHURCH_CODE;
  if (!expected || expected.length === 0) {
    debug('verify skipped: registration closed');
    return false;
  }

  const a = Buffer.from(provided, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length) {
    debug('verify failed: length mismatch');
    return false;
  }

  const ok = timingSafeEqual(a, b);
  debug('verify result:', ok);
  return ok;
}
