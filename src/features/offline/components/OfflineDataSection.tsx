'use client';

import { useState } from 'react';
import { useOfflineData } from '../hooks/useOfflineData';
import { BIBLE_TRANSLATIONS, type BibleTranslationId } from '@/lib/bible-translations';
import { getAppBuildTime } from '@/shared/config/appVersion';

const DOWNLOADABLE_TRANSLATIONS = Object.values(BIBLE_TRANSLATIONS).filter((t) => t.selfHostedAllowed);

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`;
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) return `${mb.toFixed(1)} МБ`;
  return `${(bytes / 1024).toFixed(0)} КБ`;
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleString('ru-RU', { dateStyle: 'medium', timeStyle: 'short' });
}

export function OfflineDataSection() {
  const { manifest, pendingOutboxCount, categoryState, downloadTranslation, downloadSongsAction, downloadPlanAction, clear } =
    useOfflineData();
  const [confirmingClear, setConfirmingClear] = useState(false);
  const [clearError, setClearError] = useState<string | null>(null);

  const songsManifest = manifest.find((m) => m.key === 'songs');
  const planManifest = manifest.find((m) => m.key === 'plan');

  const handleClear = async (force: boolean) => {
    setClearError(null);
    console.debug('[settings/offline] clear requested', { force });
    const result = await clear({ force });
    if (!result.cleared) {
      setClearError(
        `Есть ${result.pendingOutboxCount} несинхронизированных изменений прогресса. Подключитесь к сети, чтобы синхронизировать, либо очистите принудительно.`
      );
      return;
    }
    console.info('[settings/offline] cleared', result);
    setConfirmingClear(false);
  };

  const buildTime = getAppBuildTime();

  return (
    <details
      data-offline-data-section
      className="group mt-8 rounded-xl border border-app-border bg-app-surface/40"
    >
      <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium text-app-text-secondary [&::-webkit-details-marker]:hidden flex items-center justify-between gap-2">
        <span>Оффлайн-данные</span>
        <span className="text-app-text-muted transition-transform group-open:rotate-180" aria-hidden>
          ▼
        </span>
      </summary>

      <div className="space-y-5 border-t border-app-border px-4 py-4">
        {/* Писание */}
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-app-text-secondary">Писание</h3>
          <div className="flex flex-col gap-2">
            {DOWNLOADABLE_TRANSLATIONS.map((t) => {
              const entry = manifest.find((m) => m.key === t.id);
              const isLoading = categoryState.bible.loading;
              return (
                <div
                  key={t.id}
                  className="flex items-center justify-between rounded-lg border border-app-border px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="text-sm text-app-text-secondary">{t.label}</p>
                    {entry ? (
                      <p className="text-xs text-app-text-muted">
                        Скачано {formatDate(entry.downloadedAt)}
                        {typeof entry.sizeBytes === 'number' ? ` · ${formatBytes(entry.sizeBytes)}` : ''}
                      </p>
                    ) : (
                      <p className="text-xs text-app-text-muted">Не скачано</p>
                    )}
                  </div>
                  <button
                    type="button"
                    disabled={isLoading}
                    onClick={() => downloadTranslation(t.id as BibleTranslationId)}
                    className="shrink-0 rounded-lg border-2 border-app-primary px-3 py-1.5 text-sm font-medium text-app-primary transition-all disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isLoading
                      ? categoryState.bible.progress !== null
                        ? `${Math.round(categoryState.bible.progress * 100)}%`
                        : 'Загрузка…'
                      : entry
                        ? 'Обновить'
                        : 'Скачать'}
                  </button>
                </div>
              );
            })}
          </div>
          {categoryState.bible.error && (
            <p className="text-xs text-app-missed-text" role="alert">{categoryState.bible.error}</p>
          )}
        </div>

        {/* Песни */}
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-app-text-secondary">Песни</h3>
          <div className="flex items-center justify-between rounded-lg border border-app-border px-3 py-2">
            <div className="min-w-0">
              {songsManifest ? (
                <p className="text-xs text-app-text-muted">
                  Скачано {formatDate(songsManifest.downloadedAt)}
                  {typeof songsManifest.itemCount === 'number' ? ` · ${songsManifest.itemCount} шт.` : ''}
                </p>
              ) : (
                <p className="text-xs text-app-text-muted">Не скачано</p>
              )}
            </div>
            <button
              type="button"
              disabled={categoryState.songs.loading}
              onClick={() => downloadSongsAction()}
              className="shrink-0 rounded-lg border-2 border-app-primary px-3 py-1.5 text-sm font-medium text-app-primary transition-all disabled:cursor-not-allowed disabled:opacity-50"
            >
              {categoryState.songs.loading
                ? categoryState.songs.progress !== null
                  ? `${Math.round(categoryState.songs.progress * 100)}%`
                  : 'Загрузка…'
                : songsManifest
                  ? 'Обновить'
                  : 'Скачать'}
            </button>
          </div>
          {categoryState.songs.error && (
            <p className="text-xs text-app-missed-text" role="alert">{categoryState.songs.error}</p>
          )}
        </div>

        {/* План */}
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-app-text-secondary">План чтения</h3>
          <div className="flex items-center justify-between rounded-lg border border-app-border px-3 py-2">
            <div className="min-w-0">
              {planManifest ? (
                <p className="text-xs text-app-text-muted">Обновлено {formatDate(planManifest.downloadedAt)}</p>
              ) : (
                <p className="text-xs text-app-text-muted">Не скачано</p>
              )}
            </div>
            <button
              type="button"
              disabled={categoryState.plan.loading}
              onClick={() => downloadPlanAction()}
              className="shrink-0 rounded-lg border-2 border-app-primary px-3 py-1.5 text-sm font-medium text-app-primary transition-all disabled:cursor-not-allowed disabled:opacity-50"
            >
              {categoryState.plan.loading ? 'Загрузка…' : planManifest ? 'Обновить' : 'Скачать'}
            </button>
          </div>
          {categoryState.plan.error && (
            <p className="text-xs text-app-missed-text" role="alert">{categoryState.plan.error}</p>
          )}
        </div>

        {/* Очистка */}
        <div className="space-y-2 border-t border-app-border pt-4">
          {!confirmingClear ? (
            <button
              type="button"
              onClick={() => setConfirmingClear(true)}
              className="w-full rounded-lg border-2 border-app-border px-3 py-2 text-sm font-medium text-app-text-secondary transition-all hover:border-app-border-strong"
            >
              Очистить оффлайн-данные
            </button>
          ) : (
            <div className="space-y-2 rounded-lg border border-app-border p-3">
              <p className="text-sm text-app-text-secondary">
                Удалить скачанные Писание, песни и план с этого устройства?
                {pendingOutboxCount > 0 && ' Есть несинхронизированный прогресс — сначала попробуем его отправить.'}
              </p>
              {clearError && (
                <div className="space-y-2">
                  <p className="text-xs text-app-missed-text" role="alert">{clearError}</p>
                  <button
                    type="button"
                    onClick={() => handleClear(true)}
                    className="w-full rounded-lg border-2 border-app-missed-text px-3 py-1.5 text-sm font-medium text-app-missed-text transition-all"
                  >
                    Всё равно очистить
                  </button>
                </div>
              )}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => handleClear(false)}
                  className="flex-1 rounded-lg border-2 border-app-primary px-3 py-1.5 text-sm font-medium text-app-primary transition-all"
                >
                  Да, очистить
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setConfirmingClear(false);
                    setClearError(null);
                  }}
                  className="flex-1 rounded-lg border-2 border-app-border px-3 py-1.5 text-sm font-medium text-app-text-secondary transition-all"
                >
                  Отмена
                </button>
              </div>
            </div>
          )}
        </div>

        {buildTime && (
          <p className="pt-2 text-center text-xs text-app-text-muted">
            Версия приложения от {formatDate(new Date(buildTime).getTime())}
          </p>
        )}
      </div>
    </details>
  );
}
