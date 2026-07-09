/**
 * Логгер BFF с уровнями и гейтом по LOG_LEVEL (default info, в dev debug,
 * в тестах silent). Формат: `[bff] <level> <msg>`.
 */
import { logLevel } from './env';

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40, silent: 99 } as const;
export type LogLevel = keyof typeof LEVELS;

function threshold(): number {
  const configured = logLevel();
  return LEVELS[(configured in LEVELS ? configured : 'info') as LogLevel];
}

function emit(level: Exclude<LogLevel, 'silent'>, msg: string, ...args: unknown[]): void {
  if (LEVELS[level] < threshold()) return;
  const fn = level === 'debug' ? console.debug : console[level];
  fn(`[bff] ${level} ${msg}`, ...args);
}

export const logger = {
  debug: (msg: string, ...args: unknown[]) => emit('debug', msg, ...args),
  info: (msg: string, ...args: unknown[]) => emit('info', msg, ...args),
  warn: (msg: string, ...args: unknown[]) => emit('warn', msg, ...args),
  error: (msg: string, ...args: unknown[]) => emit('error', msg, ...args),
};
