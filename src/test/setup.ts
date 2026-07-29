// jest-dom матчеры (toBeInTheDocument и т.п.) — регистрируются через expect.extend,
// безопасно для node-тестов (DOM нужен только при их использовании, под jsdom).
import '@testing-library/jest-dom/vitest';

// jsdom не реализует ResizeObserver, а измеряющие компоненты (слой пометок, зум листа)
// без него падают на маунте. Заглушка ничего не наблюдает: размеры в jsdom всё равно
// нулевые, а сами вычисления покрыты юнит-тестами геометрии.
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

// Глобальные env-моки для всех тестов.
process.env.SESSION_SECRET ||= 'test-session-secret-minimum-32-characters!!';
process.env.INVITE_ADMIN_SECRET ||= 'test-invite-admin-secret';
process.env.DIRECTUS_ADMIN_TOKEN ||= 'test-admin-token';
process.env.TELEGRAM_BOT_TOKEN ||= 'test-bot-token';
process.env.NEXT_PUBLIC_DIRECTUS_URL ||= 'http://localhost:8055';
process.env.NEXT_PUBLIC_BASE_PATH ||= '/app';
process.env.NEXT_PUBLIC_APP_URL ||= 'http://localhost:3000';
process.env.LOG_LEVEL ||= 'silent';
