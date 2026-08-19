'use client';

import { RefreshCw } from 'lucide-react';

export interface SongFreshBannerProps {
  /** Обработчик применения свежей версии песни. */
  onApply: () => void;
}

/**
 * Ненавязчивая плашка «Песня обновлена». Свежая версия НЕ подменяет открытый лист сама:
 * на служении текст не должен уезжать под руками, а ink-пометки привязаны к строкам
 * показанной версии. Живёт в левом нижнем углу — правый край занят `SongToolStack`,
 * центр — `SetlistPagerDock`.
 */
export function SongFreshBanner({ onApply }: SongFreshBannerProps) {
  return (
    <div data-song-fresh-banner className="pointer-events-none absolute bottom-4 left-4 z-30 pb-safe">
      <button
        type="button"
        onClick={onApply}
        data-song-fresh-banner-apply
        className="pointer-events-auto flex items-center gap-2 rounded-full border border-app-border bg-app-surface-elevated px-3.5 py-2 text-sm font-medium text-app-text shadow-app-md transition-transform duration-150 active:scale-95"
      >
        <RefreshCw className="h-4 w-4 text-app-primary" aria-hidden />
        Песня обновлена — обновить
      </button>
    </div>
  );
}
