import { timingSafeEqual } from 'crypto';

/**
 * Контроль доступа к самостоятельной регистрации.
 *
 * Два независимых понятия (расцеплены сознательно):
 *  1. «Открыта ли регистрация вообще» — {@link isRegistrationOpen}.
 *  2. «Требуется ли код церкви» — {@link isChurchCodeRequired}.
 *
 * Модель (tri-state, backward-compat):
 *  - `REGISTER_CHURCH_CODE` задан (непустой) → открыто, код ОБЯЗАТЕЛЕН (историческое поведение).
 *  - секрет пуст + `REGISTER_OPEN_NO_CODE`=true/1 → открыто, БЕЗ кода.
 *  - секрет пуст + флага нет → закрыто (роут отвечает 503).
 * Приоритет за секретом: если он задан — код требуется, `REGISTER_OPEN_NO_CODE` игнорируется.
 *
 * Код общий и брутфорсимый → сравнение timing-safe, главный барьер — rate-limit на роуте.
 * ВАЖНО: никогда не логировать значение кода (ни ожидаемого, ни присланного).
 */

const DEBUG = (process.env.LOG_LEVEL ?? 'debug') === 'debug';
function debug(...args: unknown[]) {
  if (DEBUG) console.debug('[register-access]', ...args);
}

/** Требуется ли код церкви — да, только если задан непустой секрет `REGISTER_CHURCH_CODE`. */
export function isChurchCodeRequired(): boolean {
  const code = process.env.REGISTER_CHURCH_CODE;
  return typeof code === 'string' && code.length > 0;
}

/** Открытая регистрация без кода — явный opt-in `REGISTER_OPEN_NO_CODE` (true/1). */
function isOpenNoCode(): boolean {
  const flag = process.env.REGISTER_OPEN_NO_CODE;
  return flag === 'true' || flag === '1';
}

/**
 * Регистрация открыта, если требуется код (секрет задан) ЛИБО включён режим без кода.
 * Закрыта только когда секрета нет и `REGISTER_OPEN_NO_CODE` не выставлен → 503.
 */
export function isRegistrationOpen(): boolean {
  const codeRequired = isChurchCodeRequired();
  const openNoCode = isOpenNoCode();
  const open = codeRequired || openNoCode;
  debug('registration open:', open, '(codeRequired:', codeRequired, 'openNoCode:', openNoCode, ')');
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
