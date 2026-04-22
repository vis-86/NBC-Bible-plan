'use client';

import { useEffect, useRef } from 'react';
import { useReadingSettings } from '../hooks/useReadingSettings';
import { ReadingSettingsForm } from './ReadingSettingsForm';
import type { ReadingSettings } from '../types';

export function DashboardReadingSettingsSection() {
  const { settings, updateSettings, loading, isLoading, loadError } = useReadingSettings();
  const loadStartedAt = useRef<number | null>(null);

  useEffect(() => {
    if (isLoading) {
      loadStartedAt.current = performance.now();
    }
  }, [isLoading]);

  useEffect(() => {
    if (isLoading) return;
    if (loadError) {
      console.warn('[settings/reading] load failed', { message: loadError });
      return;
    }
    const ms =
      loadStartedAt.current !== null
        ? Math.round(performance.now() - loadStartedAt.current)
        : undefined;
    console.info(
      `[settings/reading] settings loaded ok${ms !== undefined ? ` (${ms}ms)` : ''}`
    );
    loadStartedAt.current = null;
  }, [isLoading, loadError]);

  const handleSettingsChange = async (next: ReadingSettings) => {
    const keys = (Object.keys(next) as (keyof ReadingSettings)[]).filter(
      (k) => settings[k] !== next[k]
    );
    console.debug('[settings/reading] updateSettings', { keys });
    try {
      await updateSettings(next);
    } catch (e) {
      console.warn('[settings/reading] update failed', e);
    }
  };

  return (
    <details
      data-dashboard-reading-settings-section
      className="group mt-8 rounded-xl border border-app-border bg-app-surface/40"
    >
      <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium text-app-text-secondary [&::-webkit-details-marker]:hidden flex items-center justify-between gap-2">
        <span>Настройки чтения</span>
        <span className="text-app-text-muted transition-transform group-open:rotate-180" aria-hidden>
          ▼
        </span>
      </summary>
      <div className="border-t border-app-border px-4 py-4">
        {isLoading && (
          <p className="text-sm text-app-text-muted py-4">Загрузка настроек чтения…</p>
        )}
        {loadError && !isLoading && (
          <p className="py-2 text-sm text-app-missed-text" role="alert">
            {loadError}
          </p>
        )}
        {!isLoading && !loadError && (
          <ReadingSettingsForm
            settings={settings}
            onSettingsChange={handleSettingsChange}
            disabled={loading}
          />
        )}
      </div>
    </details>
  );
}
