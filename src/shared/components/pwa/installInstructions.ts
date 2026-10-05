import {
  CheckCircle2,
  Compass,
  Download,
  Ellipsis,
  Menu,
  MoreVertical,
  Share,
  SquarePlus,
  ToggleRight,
  type LucideIcon,
} from 'lucide-react';
import type { InstallBrowser } from './installEnv';

export interface InstallStep {
  icon: LucideIcon;
  title: string;
  text: string;
}

export interface InstallInstructions {
  steps: InstallStep[];
  /** Короткая оговорка под шагами (например, «в Chrome надёжнее»). */
  note?: string;
}

const OPEN_FROM_ICON = 'Готово: на экране появится иконка. Открывайте приложение с неё, а не из браузера.';

function iosShareStep(browser: InstallBrowser): InstallStep {
  if (browser === 'safari' || browser === 'other') {
    // iOS 26 (компактная панель по умолчанию) прячет «Поделиться» за «•••».
    return {
      icon: Share,
      title: 'Нажмите «Поделиться»',
      text: 'Квадрат со стрелкой вверх внизу экрана. Не видите его? Сначала нажмите «•••» внизу справа.',
    };
  }
  return {
    icon: Share,
    title: 'Нажмите «Поделиться»',
    text:
      browser === 'firefox'
        ? 'Откройте меню (три полоски) и выберите «Поделиться».'
        : 'Квадрат со стрелкой вверх — справа в строке с адресом сайта.',
  };
}

function iosInstructions(browser: InstallBrowser): InstallInstructions {
  return {
    steps: [
      iosShareStep(browser),
      {
        icon: SquarePlus,
        title: 'Выберите «На экран „Домой“»',
        text: 'Пролистайте список вниз — пункт с плюсом в квадрате. Если его нет, нажмите «Ещё».',
      },
      {
        icon: ToggleRight,
        title: 'Оставьте включённым «Открыть как веб-приложение»',
        text: 'Этот переключатель есть на новых iPhone. Если его нет — просто переходите дальше.',
      },
      { icon: CheckCircle2, title: 'Нажмите «Добавить»', text: OPEN_FROM_ICON },
    ],
  };
}

function androidInstructions(browser: InstallBrowser): InstallInstructions {
  if (browser === 'yandex') {
    return {
      steps: [
        { icon: MoreVertical, title: 'Откройте меню', text: 'Три точки внизу экрана справа.' },
        { icon: Download, title: 'Выберите «Добавить на гл. экран»', text: 'Пункт с иконкой телефона.' },
        { icon: CheckCircle2, title: 'Подтвердите', text: OPEN_FROM_ICON },
      ],
      note: 'Совет: откройте сайт в Chrome — там приложение надёжнее работает без интернета.',
    };
  }
  return {
    steps: [
      {
        icon: browser === 'samsung' ? Menu : MoreVertical,
        title: 'Откройте меню браузера',
        text:
          browser === 'samsung'
            ? 'Три полоски внизу экрана справа.'
            : 'Три точки в правом верхнем углу.',
      },
      {
        icon: Download,
        title: 'Выберите «Установить приложение»',
        text: 'На некоторых телефонах пункт называется «Добавить на главный экран».',
      },
      { icon: CheckCircle2, title: 'Нажмите «Установить»', text: OPEN_FROM_ICON },
    ],
  };
}

export function getInstallInstructions(
  platform: 'ios' | 'android',
  browser: InstallBrowser,
): InstallInstructions {
  return platform === 'ios' ? iosInstructions(browser) : androidInstructions(browser);
}

/** Сайт открыт внутри мессенджера: сначала — в настоящий браузер. */
export function getOpenInBrowserInstructions(platform: 'ios' | 'android' | 'other'): InstallInstructions {
  const browserName = platform === 'ios' ? 'Safari' : platform === 'android' ? 'Chrome' : 'браузере';
  return {
    steps: [
      {
        icon: Ellipsis,
        title: 'Нажмите на меню в углу экрана',
        text: 'Обычно это «•••» или «⋮» сверху справа. В Telegram на iPhone — значок компаса внизу.',
      },
      {
        icon: Compass,
        title: 'Выберите «Открыть в браузере»',
        text: platform === 'other'
          ? 'Пункт может называться «Открыть в Safari» или «Открыть в Chrome».'
          : `Пункт может называться «Открыть в ${browserName}».`,
      },
      {
        icon: CheckCircle2,
        title: 'Установите по инструкции',
        text: 'Сайт откроется в браузере — там вы увидите, как установить приложение.',
      },
    ],
  };
}
