// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('next/script', () => ({
  default: ({ src, id }: { src?: string; id?: string }) => <script data-mock-script={src ?? id} />,
}));

import { TelegramScripts } from './TelegramScripts';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('TelegramScripts', () => {
  it('church: SDK и скрипт защиты подключены', () => {
    const { container } = render(<TelegramScripts />);
    expect(container.querySelector('[data-mock-script="https://telegram.org/js/telegram-web-app.js"]')).not.toBeNull();
    expect(container.querySelector('[data-mock-script="telegram-app-protection"]')).not.toBeNull();
  });

  it('worship: Telegram-скриптов нет', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_MODE', 'worship');
    const { container } = render(<TelegramScripts />);
    expect(container.querySelector('script')).toBeNull();
  });
});
