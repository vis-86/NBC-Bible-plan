'use client';

import { Suspense, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import DashboardLayout from '@/shared/components/layout/DashboardLayout';
import { PageHeader } from '@/shared/components/layout/PageHeader';
import { useAppRole } from '@/shared/hooks/useAppRole';
import { SongEditor } from '@/features/songs/components/SongEditor';
import { useSongForEdit } from '@/features/songs/hooks/useSongForEdit';
import { EMPTY_SONG_DRAFT, draftFromSong } from '@/features/songs/lib/songEditorDraft';

function EditorMessage({ title, message, onBack, action }: {
  title: string;
  message: string;
  onBack: () => void;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader title={title} onBack={onBack} backAriaLabel="Назад" />
      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-4 text-center">
        <p data-song-edit-message className="text-app-text-secondary">{message}</p>
        {action && (
          <button
            type="button"
            onClick={action.onClick}
            className="rounded-app-md border-2 border-app-primary px-4 py-2.5 text-sm font-medium text-app-primary"
          >
            {action.label}
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Создание (`/dashboard/song-edit`) и правка (`?id=`) песни — M9. Параметр в query, а не
 * в сегменте: static export без динамических маршрутов (см. CLAUDE.md). Маршрут в
 * `APP_SHELL_ROUTES`: офлайн экран обязан открыться и честно сказать «нужен интернет».
 */
function SongEditPageContent() {
  const router = useRouter();
  const id = useSearchParams().get('id') || null;
  const { canEditSongs, loading: roleLoading } = useAppRole();
  const { state, retry } = useSongForEdit(id);

  const fallback = id ? `/dashboard/song?id=${encodeURIComponent(id)}` : '/dashboard/songs';
  // Пришли из приложения — назад по истории (экран песни перечитает свежую версию из
  // кеша, который обновил useSaveSong). Открыли ссылкой — истории нет, уходим явно.
  const leave = () => (window.history.length > 1 ? router.back() : router.replace(fallback));

  const initial = useMemo(
    () => (state.status === 'ready' ? draftFromSong(state.song) : EMPTY_SONG_DRAFT),
    [state]
  );
  const title = id ? 'Правка песни' : 'Новая песня';

  if (roleLoading) return null;
  if (!canEditSongs) return <EditorMessage title={title} message="Недостаточно прав для правки песен." onBack={leave} />;

  if (id) {
    if (state.status === 'offline') {
      return <EditorMessage title={title} message="Редактировать песню можно только с интернетом." onBack={leave} action={{ label: 'Повторить', onClick: retry }} />;
    }
    if (state.status === 'error') {
      return <EditorMessage title={title} message={state.message} onBack={leave} action={{ label: 'Повторить', onClick: retry }} />;
    }
    if (state.status !== 'ready') {
      return <EditorMessage title={title} message="Загружаем песню…" onBack={leave} />;
    }
  }

  return (
    <SongEditor
      key={id ?? 'new'}
      songId={id}
      initial={initial}
      onCancel={leave}
      onSaved={(savedId) =>
        // Новая песня — заменяем редактор её экраном (назад вернёт в список). Правка —
        // назад на экран песни, чтобы в истории не осталось двух одинаковых записей.
        id ? leave() : router.replace(`/dashboard/song?id=${encodeURIComponent(savedId)}`)
      }
    />
  );
}

export default function SongEditPage() {
  // useSearchParams требует Suspense-границу в App Router.
  return (
    <DashboardLayout onChangeView={() => {}} hideBottomNav>
      <div data-song-edit-page className="flex min-h-0 flex-1 flex-col">
        <Suspense fallback={null}>
          <SongEditPageContent />
        </Suspense>
      </div>
    </DashboardLayout>
  );
}
