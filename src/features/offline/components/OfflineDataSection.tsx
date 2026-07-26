'use client';

import { useState } from 'react';
import { useOfflineData, type OfflineDownloadKey } from '../hooks/useOfflineData';
import { BIBLE_TRANSLATIONS, resolveSelfHostedTranslationId, type BibleTranslationId } from '@/lib/bible-translations';
import { getAppBuildTime } from '@/shared/config/appVersion';
import { useReadingSettings } from '@/features/reading/hooks/useReadingSettings';
import { DEFAULT_TRANSLATION } from '@/shared/offline/autoDownload';

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

/** Тонкий прогресс-бар для активной загрузки (0..1). */
function ProgressBar({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-app-border" aria-hidden>
      <div
        className="h-full rounded-full bg-app-primary transition-[width] duration-300 ease-out"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

/** Пометка элемента, докачиваемого автоматически после логина (см. `autoDownload.ts`). */
function AutoDownloadBadge() {
  return (
    <span className="rounded-full bg-app-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-app-primary">
      авто
    </span>
  );
}

/** Текст кнопки скачивания одного элемента: %/«Загрузка…» → «Обновить»/«Скачать». */
function downloadLabel(loading: boolean, progress: number | null, hasEntry: boolean): string {
  if (loading) return progress !== null ? `${Math.round(progress * 100)}%` : 'Загрузка…';
  return hasEntry ? 'Обновить' : 'Скачать';
}

export function OfflineDataSection() {
  const {
    manifest,
    pendingOutboxCount,
    getItemState,
    bulk,
    downloadableTranslationIds,
    downloadTranslation,
    downloadSongsAction,
    downloadPlanAction,
    downloadSetlistsAction,
    downloadAll,
    clear,
  } = useOfflineData();
  const [confirmingClear, setConfirmingClear] = useState(false);
  const [clearError, setClearError] = useState<string | null>(null);

  const { settings: readingSettings, isLoading: readingSettingsLoading } = useReadingSettings();
  const autoDownloadTranslationId = readingSettingsLoading
    ? null
    : resolveSelfHostedTranslationId(readingSettings.nt_translation, 'nt', DEFAULT_TRANSLATION);

  const songsManifest = manifest.find((m) => m.key === 'songs');
  const planManifest = manifest.find((m) => m.key === 'plan');
  const setlistsManifest = manifest.find((m) => m.key === 'setlists');

  const songsState = getItemState('songs');
  const planState = getItemState('plan');
  const setlistsState = getItemState('setlists');

  // Всё ли скачано? (все переводы + песни + план + сетлисты) — влияет на подпись кнопки «скачать всё».
  const allKeys: OfflineDownloadKey[] = [...downloadableTranslationIds, 'songs', 'plan', 'setlists'];
  const allDownloaded = allKeys.every((k) => manifest.some((m) => m.key === k));

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
        {/* Скачать всё одним действием */}
        <div className="space-y-2">
          <button
            type="button"
            data-offline-download-all
            disabled={bulk.loading}
            onClick={() => downloadAll()}
            className="w-full rounded-lg bg-app-primary px-3 py-2.5 text-sm font-semibold text-app-text-inverse transition-all disabled:cursor-not-allowed disabled:opacity-60"
          >
            {bulk.loading
              ? `Загрузка… ${bulk.done}/${bulk.total}`
              : allDownloaded
                ? 'Обновить всё'
                : 'Скачать всё для офлайна'}
          </button>
          {bulk.loading && <ProgressBar value={bulk.total ? bulk.done / bulk.total : 0} />}
          {!bulk.loading && bulk.failed > 0 && (
            <p className="text-xs text-app-missed-text" role="alert">
              Не удалось загрузить {bulk.failed} из {bulk.total}. Проверьте соединение и попробуйте снова.
            </p>
          )}
          <p className="text-xs text-app-text-muted">
            Скачивает Писание, песни и план — приложение будет работать без интернета.
          </p>
          <p className="text-xs text-app-text-muted">
            Базовые данные (план, песни, один перевод Писания) скачиваются автоматически после входа.
          </p>
        </div>

        {/* Писание */}
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-app-text-secondary">Писание</h3>
          <div className="flex flex-col gap-2">
            {DOWNLOADABLE_TRANSLATIONS.map((t) => {
              const entry = manifest.find((m) => m.key === t.id);
              // Состояние КОНКРЕТНОГО перевода, а не общее для всех Писаний.
              const state = getItemState(t.id as BibleTranslationId);
              return (
                <div key={t.id} className="space-y-1.5">
                  <div className="flex items-center justify-between rounded-lg border border-app-border px-3 py-2">
                    <div className="min-w-0">
                      <p className="flex items-center gap-1.5 text-sm text-app-text-secondary">
                        {t.label}
                        {t.id === autoDownloadTranslationId && <AutoDownloadBadge />}
                      </p>
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
                      disabled={state.loading || bulk.loading}
                      onClick={() => downloadTranslation(t.id as BibleTranslationId)}
                      className="shrink-0 rounded-lg border-2 border-app-primary px-3 py-1.5 text-sm font-medium text-app-primary transition-all disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {downloadLabel(state.loading, state.progress, !!entry)}
                    </button>
                  </div>
                  {state.loading && state.progress !== null && <ProgressBar value={state.progress} />}
                  {state.error && (
                    <p className="text-xs text-app-missed-text" role="alert">{state.error}</p>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Песни */}
        <div className="space-y-2">
          <h3 className="flex items-center gap-1.5 text-sm font-medium text-app-text-secondary">
            Песни
            <AutoDownloadBadge />
          </h3>
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
              disabled={songsState.loading || bulk.loading}
              onClick={() => downloadSongsAction()}
              className="shrink-0 rounded-lg border-2 border-app-primary px-3 py-1.5 text-sm font-medium text-app-primary transition-all disabled:cursor-not-allowed disabled:opacity-50"
            >
              {downloadLabel(songsState.loading, songsState.progress, !!songsManifest)}
            </button>
          </div>
          {songsState.loading && songsState.progress !== null && <ProgressBar value={songsState.progress} />}
          {songsState.error && (
            <p className="text-xs text-app-missed-text" role="alert">{songsState.error}</p>
          )}
        </div>

        {/* План */}
        <div className="space-y-2">
          <h3 className="flex items-center gap-1.5 text-sm font-medium text-app-text-secondary">
            План чтения
            <AutoDownloadBadge />
          </h3>
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
              disabled={planState.loading || bulk.loading}
              onClick={() => downloadPlanAction()}
              className="shrink-0 rounded-lg border-2 border-app-primary px-3 py-1.5 text-sm font-medium text-app-primary transition-all disabled:cursor-not-allowed disabled:opacity-50"
            >
              {planState.loading ? 'Загрузка…' : planManifest ? 'Обновить' : 'Скачать'}
            </button>
          </div>
          {planState.error && (
            <p className="text-xs text-app-missed-text" role="alert">{planState.error}</p>
          )}
        </div>

        {/* Сетлисты */}
        <div className="space-y-2">
          <h3 className="flex items-center gap-1.5 text-sm font-medium text-app-text-secondary">
            Сетлисты
            <AutoDownloadBadge />
          </h3>
          <div className="flex items-center justify-between rounded-lg border border-app-border px-3 py-2">
            <div className="min-w-0">
              {setlistsManifest ? (
                <p className="text-xs text-app-text-muted">
                  Скачано {formatDate(setlistsManifest.downloadedAt)}
                  {typeof setlistsManifest.itemCount === 'number' ? ` · ${setlistsManifest.itemCount} шт.` : ''}
                </p>
              ) : (
                <p className="text-xs text-app-text-muted">Не скачано</p>
              )}
            </div>
            <button
              type="button"
              disabled={setlistsState.loading || bulk.loading}
              onClick={() => downloadSetlistsAction()}
              className="shrink-0 rounded-lg border-2 border-app-primary px-3 py-1.5 text-sm font-medium text-app-primary transition-all disabled:cursor-not-allowed disabled:opacity-50"
            >
              {downloadLabel(setlistsState.loading, setlistsState.progress, !!setlistsManifest)}
            </button>
          </div>
          {setlistsState.error && (
            <p className="text-xs text-app-missed-text" role="alert">{setlistsState.error}</p>
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
